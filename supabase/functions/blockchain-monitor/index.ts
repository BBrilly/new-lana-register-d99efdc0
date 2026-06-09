import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Configuration constants
const MAX_BLOCKS_PER_RUN = 10;
const MAX_RPC_RETRIES = 3;
const RPC_RETRY_DELAY = 500;
const RPC_TIMEOUT = 10000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting enhanced blockchain monitoring with gap detection...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get RPC node configuration from database
    const { data: rpcNodes, error: rpcError } = await supabase
      .from('rpc_nodes')
      .select('*')
      .limit(1)
      .single();

    if (rpcError || !rpcNodes) {
      throw new Error(`No RPC node configured: ${rpcError?.message}`);
    }

    const rpcUser = rpcNodes.username;
    const rpcPassword = rpcNodes.password;
    const RPC_HOST = rpcNodes.host;
    const RPC_PORT = rpcNodes.port;

    if (!rpcUser || !rpcPassword) {
      throw new Error('RPC credentials not configured');
    }

    const rpcUrl = `http://${RPC_HOST}:${RPC_PORT}/`;
    console.log(`Using RPC node: ${rpcNodes.name} (${RPC_HOST}:${RPC_PORT})`);

    // Get current split value and freeze threshold from system_parameters
    const { data: systemParams } = await supabase
      .from('system_parameters')
      .select('split, freeze_lana_account_above')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentSplit = systemParams?.split ? parseInt(systemParams.split, 10) : 0;
    console.log(`Current split value: ${currentSplit}`);

    const autoFreezeThreshold = systemParams?.freeze_lana_account_above ? parseFloat(systemParams.freeze_lana_account_above) : null;
    console.log(`Auto-freeze threshold (from KIND 38888): ${autoFreezeThreshold !== null ? autoFreezeThreshold + ' LANA' : 'not set'}`);

    // Enhanced RPC call function with retry logic
    async function rpcCall(method: string, params: any[] = [], retryCount = 0): Promise<any> {
      const payload = {
        jsonrpc: '1.0',
        id: 'supabase',
        method: method,
        params: params
      };

      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${btoa(`${rpcUser}:${rpcPassword}`)}`
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(RPC_TIMEOUT)
        });

        if (!response.ok) {
          throw new Error(`RPC call failed: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.error) {
          throw new Error(`RPC error: ${JSON.stringify(result.error)}`);
        }

        return result.result;
      } catch (error) {
        if (retryCount < MAX_RPC_RETRIES) {
          console.log(`RPC call failed, retrying in ${RPC_RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RPC_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, RPC_RETRY_DELAY));
          return rpcCall(method, params, retryCount + 1);
        }
        throw error;
      }
    }

    // Batched JSON-RPC call: sends an array of requests in a single HTTP call.
    // Returns results in the same order as input (null on per-call error).
    async function rpcBatch(
      calls: { method: string; params: any[] }[],
      chunkSize = 100
    ): Promise<any[]> {
      const out: any[] = new Array(calls.length).fill(null);
      for (let start = 0; start < calls.length; start += chunkSize) {
        const slice = calls.slice(start, start + chunkSize);
        const payload = slice.map((c, i) => ({
          jsonrpc: '1.0',
          id: start + i,
          method: c.method,
          params: c.params,
        }));

        let attempt = 0;
        while (true) {
          try {
            const response = await fetch(rpcUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(`${rpcUser}:${rpcPassword}`)}`,
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(RPC_TIMEOUT * 3),
            });
            if (!response.ok) throw new Error(`Batch RPC failed: ${response.statusText}`);
            const results = await response.json();
            if (!Array.isArray(results)) throw new Error('Batch RPC: non-array response');
            for (const r of results) {
              if (typeof r.id === 'number') {
                out[r.id] = r.error ? null : r.result;
              }
            }
            break;
          } catch (e) {
            attempt++;
            if (attempt > MAX_RPC_RETRIES) {
              console.log(`Batch RPC failed permanently after ${attempt} attempts: ${e}`);
              break;
            }
            await new Promise(r => setTimeout(r, RPC_RETRY_DELAY));
          }
        }
      }
      return out;
    }

    // Get current blockchain height
    const currentHeight = await rpcCall('getblockcount');
    console.log(`Current blockchain height: ${currentHeight}`);

    // Get last processed block from our database
    const { data: lastBlock } = await supabase
      .from('block_tx')
      .select('block_id')
      .order('block_id', { ascending: false })
      .limit(1)
      .single();

    // If no records exist, start from last 1000 blocks (approximately last week)
    const lastProcessedHeight = lastBlock?.block_id || Math.max(0, currentHeight - 1000);
    console.log(`Last processed height: ${lastProcessedHeight}`);

    // Calculate missing blocks
    const blocksToProcess = [];
    for (let height = lastProcessedHeight + 1; height <= currentHeight; height++) {
      blocksToProcess.push(height);
    }

    // ── Helper: Hourly balance snapshot ──
    async function tryBalanceSnapshot() {
      try {
        const { data: lastSnapshot } = await supabase
          .from('balance_snapshots')
          .select('recorded_at')
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const now = Date.now();
        const lastTime = lastSnapshot?.recorded_at ? new Date(lastSnapshot.recorded_at).getTime() : 0;
        const fiftyFiveMin = 55 * 60 * 1000;

        if (now - lastTime <= fiftyFiveMin) return;

        console.log('📊 Taking hourly balance snapshot...');

        const allWalletAddresses: string[] = [];
        let snapOffset = 0;
        const SNAP_PAGE = 1000;
        let snapMore = true;
        while (snapMore) {
          const { data: wRows } = await supabase
            .from('wallets')
            .select('wallet_id')
            .range(snapOffset, snapOffset + SNAP_PAGE - 1);
          if (!wRows || wRows.length === 0) { snapMore = false; }
          else {
            wRows.forEach((w: any) => { if (w.wallet_id) allWalletAddresses.push(w.wallet_id); });
            snapMore = wRows.length === SNAP_PAGE;
            snapOffset += SNAP_PAGE;
          }
        }

        if (allWalletAddresses.length === 0) return;

        const { data: snapSysParams } = await supabase
          .from('system_parameters')
          .select('electrum')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const electrumServers = snapSysParams?.electrum
          ? (snapSysParams.electrum as any[]).map((s: any) => ({ host: s.host, port: parseInt(s.port, 10) }))
          : [];

        if (electrumServers.length === 0) { console.error('❌ No Electrum servers for snapshot'); return; }

        const { data: balanceData, error: balFnErr } = await supabase.functions.invoke(
          'fetch-wallet-balance',
          { body: { wallet_addresses: allWalletAddresses, electrum_servers: electrumServers } }
        );

        if (balFnErr) { console.error('❌ Balance fetch error for snapshot:', balFnErr.message); return; }
        if (!balanceData?.success || !balanceData.wallets) { console.error('❌ Balance fetch returned no data for snapshot'); return; }

        const totalBalance = balanceData.wallets.reduce((s: number, w: any) => s + (w.balance || 0), 0);

        const { error: snapErr } = await supabase
          .from('balance_snapshots')
          .insert({ total_balance_lana: totalBalance, wallet_count: allWalletAddresses.length });

        if (snapErr) console.error('❌ Balance snapshot insert error:', snapErr.message);
        else console.log(`📊 Balance snapshot saved: ${totalBalance} LANA across ${allWalletAddresses.length} wallets`);
      } catch (snapError) {
        console.error('❌ Balance snapshot error:', snapError);
      }
    }

    if (blocksToProcess.length === 0) {
      console.log('No new blocks to process');
      await tryBalanceSnapshot();
      return new Response(JSON.stringify({
        message: 'No new blocks to process',
        currentHeight,
        lastProcessedHeight
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log gap detection results
    if (blocksToProcess.length > 1) {
      console.log(`Gap detected! Found ${blocksToProcess.length} missing blocks: ${blocksToProcess[0]} to ${blocksToProcess[blocksToProcess.length - 1]}`);
    }

    // Process up to MAX_BLOCKS_PER_RUN blocks to prevent timeouts
    const blocksThisRun = blocksToProcess.slice(0, MAX_BLOCKS_PER_RUN);
    console.log(`Processing ${blocksThisRun.length} blocks this run: [${blocksThisRun.join(', ')}]`);

    // Robustna funkcija za pobiranje VSEH registriranih denarnic s paginacijo
    async function fetchAllRegisteredWallets(): Promise<{
      walletAddresses: Set<string>;
      walletMap: Map<string, { id: string; wallet_type: string }>;
    }> {
      const walletAddresses = new Set<string>();
      const walletMap = new Map<string, { id: string; wallet_type: string }>();
      
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      console.log('Fetching all registered wallets with pagination...');
      
      while (hasMore) {
        const { data: wallets, error } = await supabase
          .from('wallets')
          .select('wallet_id, id, wallet_type')
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) {
          console.error(`Error fetching wallets at offset ${offset}:`, error);
          throw error;
        }
        
        if (!wallets || wallets.length === 0) {
          hasMore = false;
          console.log(`Pagination complete. No more wallets at offset ${offset}`);
        } else {
          // Dodaj najdene denarnice v Set in Map
          for (const w of wallets) {
            if (w.wallet_id) {
              walletAddresses.add(w.wallet_id);
              walletMap.set(w.wallet_id, {
                id: w.id,
                wallet_type: w.wallet_type
              });
            }
          }
          
          console.log(`Fetched ${wallets.length} wallets (offset: ${offset}, total so far: ${walletAddresses.size})`);
          
          // Če smo dobili manj kot PAGE_SIZE, smo na koncu
          if (wallets.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            offset += PAGE_SIZE;
          }
        }
      }
      
      console.log(`✅ Total registered wallets loaded: ${walletAddresses.size}`);
      return { walletAddresses, walletMap };
    }

    // Get all registered wallet addresses with wallet_type using robust pagination
    const { walletAddresses, walletMap } = await fetchAllRegisteredWallets();

    let totalTransactionsProcessed = 0;
    let totalRegisteredTransactions = 0;
    let totalKnightsTransactions = 0;
    let successfulBlocks = 0;
    let failedBlocks: number[] = [];

    // Process each block in the batch
    for (const blockHeight of blocksThisRun) {
      try {
        console.log(`Processing block ${blockHeight}...`);
        // Collect wallets to auto-freeze after all transactions in this block
        const walletsToAutoFreeze = new Map<string, { walletUuid: string; mainWalletId: string; address: string; amount: number }>();

        // Get block hash and block info (without verbosity parameter)
        const blockHash = await rpcCall('getblockhash', [blockHeight]);
        const blockInfo = await rpcCall('getblock', [blockHash]);

        console.log(`Block ${blockHeight} contains ${blockInfo.tx.length} transactions`);
        totalTransactionsProcessed += blockInfo.tx.length;

        let transactionsWithRegisteredWallets = 0;

        // Process each transaction in the block
        for (const txid of blockInfo.tx) {
          try {
            const tx = await rpcCall('getrawtransaction', [txid, 1]);

            // Collect sender addresses
            const senders = new Set<string>();
            if (tx.vin) {
              for (const vin of tx.vin) {
                if (vin.coinbase) {
                  senders.add('[COINBASE/STAKE]');
                } else if (vin.txid && vin.vout !== undefined) {
                  try {
                    const prevTx = await rpcCall('getrawtransaction', [vin.txid, 1]);
                    if (prevTx.vout && prevTx.vout[vin.vout]) {
                      const addr = prevTx.vout[vin.vout].scriptPubKey?.addresses?.[0];
                      if (addr) senders.add(addr);
                    }
                  } catch (e) {
                    console.log(`Error getting previous transaction ${vin.txid}: ${e}`);
                  }
                }
              }
            }

            // Collect receiver addresses and amounts
            const receivers: Array<{ address: string; amount: number }> = [];
            if (tx.vout) {
              for (const vout of tx.vout) {
                const addr = vout.scriptPubKey?.addresses?.[0];
                const amount = vout.value || 0;
                if (addr) {
                  receivers.push({ address: addr, amount });
                }
              }
            }

            // Check if any sender or receiver is a registered wallet
            const involvedWallets = new Set([
              ...senders,
              ...receivers.map(r => r.address)
            ]);
            const registeredInvolved = Array.from(involvedWallets).filter(addr => 
              walletAddresses.has(addr)
            );

            if (registeredInvolved.length > 0) {
              transactionsWithRegisteredWallets++;

              // Insert transaction records for each registered wallet involved
              for (const senderAddr of senders) {
                if (walletAddresses.has(senderAddr)) {
                  for (const receiver of receivers) {
                    if (walletAddresses.has(receiver.address)) {
                      // Both sender and receiver are registered
                      const senderWallet = walletMap.get(senderAddr);
                      const receiverWallet = walletMap.get(receiver.address);
                      
                      await supabase.from('transactions').insert({
                        from_wallet_id: senderWallet?.id,
                        to_wallet_id: receiverWallet?.id,
                        amount: receiver.amount,
                        block_id: blockHeight,
                        notes: `Blockchain transaction ${txid}`
                      });

                      // Oba sta registrirana - normalna interna transakcija
                      // NE zapisuj v registered_lana_events (samo neregistrirane transakcije gredo tja)
                    } else {
                      // Only sender is registered
                      const senderWallet = walletMap.get(senderAddr);
                      
                      await supabase.from('transactions').insert({
                        from_wallet_id: senderWallet?.id,
                        to_wallet_id: null,
                        amount: receiver.amount,
                        block_id: blockHeight,
                        notes: `Outgoing blockchain transaction ${txid} to ${receiver.address}`
                      });
                    }
                  }
                } else {
                  // Check if any receiver is registered
                  for (const receiver of receivers) {
                    if (walletAddresses.has(receiver.address)) {
                      const receiverWallet = walletMap.get(receiver.address);
                      
                      await supabase.from('transactions').insert({
                        from_wallet_id: null,
                        to_wallet_id: receiverWallet?.id,
                        amount: receiver.amount,
                        block_id: blockHeight,
                        notes: `Incoming blockchain transaction ${txid} from ${Array.from(senders).join(', ')}`
                      });

                      // Pošiljatelj je NEREGISTRIRAN - preveri če je prejemnik Knights wallet
                      if (receiverWallet?.wallet_type === 'Knights') {
                        // Insert UNREGISTERED LANA to registered_lana_events for Knights wallet
                        await supabase.from('registered_lana_events').insert({
                          wallet_id: receiverWallet.id,
                          amount: receiver.amount,
                          notes: `UNREGISTERED LANA to Knights wallet from ${Array.from(senders).join(', ')} (TX: ${txid})`,
                          split: currentSplit,
                          block_id: blockHeight,
                          transaction_id: txid
                        });
                        totalKnightsTransactions++;
                        console.log(`🏰 Knights wallet received ${receiver.amount} UNREGISTERED LANA from unregistered sender`);
                      }

                      // Auto-freeze: if unregistered LANA amount exceeds threshold
                      if (autoFreezeThreshold !== null && receiver.amount >= autoFreezeThreshold && receiverWallet?.wallet_type !== 'Knights') {
                        const recvWallet = walletMap.get(receiver.address);
                        if (recvWallet) {
                          walletsToAutoFreeze.set(recvWallet.id, {
                            walletUuid: recvWallet.id,
                            mainWalletId: '', // will be looked up later
                            address: receiver.address,
                            amount: receiver.amount
                          });
                          console.log(`🧊 Queued auto-freeze for ${receiver.address} — received ${receiver.amount} LANA from unregistered sender (threshold: ${autoFreezeThreshold})`);
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (txError) {
            console.log(`Error processing transaction ${txid} in block ${blockHeight}: ${txError}`);
          }
        }

        // Process auto-freeze batch via freeze-wallets edge function (includes KIND 30889 broadcast)
        if (walletsToAutoFreeze.size > 0) {
          console.log(`🧊 Processing ${walletsToAutoFreeze.size} wallets for auto-freeze in block ${blockHeight}...`);
          
          // Group wallets by owner (nostr_hex_id) for batch processing
          const walletsByOwner = new Map<string, string[]>();
          
          for (const [, freezeInfo] of walletsToAutoFreeze) {
            // Look up the owner's nostr_hex_id via main_wallet_id
            const { data: walletData } = await supabase
              .from('wallets')
              .select('main_wallet_id')
              .eq('id', freezeInfo.walletUuid)
              .single();
            
            if (!walletData) {
              console.error(`❌ Could not find wallet ${freezeInfo.walletUuid} for freeze lookup`);
              continue;
            }
            
            const { data: mainWallet } = await supabase
              .from('main_wallets')
              .select('nostr_hex_id')
              .eq('id', walletData.main_wallet_id)
              .single();
            
            if (!mainWallet) {
              console.error(`❌ Could not find main_wallet for wallet ${freezeInfo.walletUuid}`);
              continue;
            }
            
            const hexId = mainWallet.nostr_hex_id;
            if (!walletsByOwner.has(hexId)) {
              walletsByOwner.set(hexId, []);
            }
            walletsByOwner.get(hexId)!.push(freezeInfo.walletUuid);
          }
          
          // Call freeze-wallets for each owner group
          for (const [nostrHexId, walletUuids] of walletsByOwner) {
            try {
              const freezeResponse = await fetch(
                `${supabaseUrl}/functions/v1/freeze-wallets`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({
                    wallet_ids: walletUuids,
                    freeze: true,
                    freeze_reason: 'frozen_unreg_Lanas',
                    nostr_hex_id: nostrHexId
                  })
                }
              );
              
              const freezeResult = await freezeResponse.json();
              if (freezeResult.success) {
                console.log(`🧊✅ Auto-frozen ${walletUuids.length} wallet(s) for owner ${nostrHexId.substring(0, 12)}... with KIND 30889 broadcast`);
              } else {
                console.error(`❌ freeze-wallets failed for owner ${nostrHexId.substring(0, 12)}...:`, freezeResult.error);
              }
            } catch (freezeCallError) {
              console.error(`❌ Failed to call freeze-wallets for owner ${nostrHexId.substring(0, 12)}...:`, freezeCallError);
            }
          }
        }


        const timeStaked = new Date(blockInfo.time * 1000);
        const { error: blockInsertError } = await supabase.from('block_tx').insert({
          block_id: blockHeight,
          time_staked: timeStaked.toISOString(),
          all_block_transactions: blockInfo.tx.length,
          transaction_including_registered_wallets: transactionsWithRegisteredWallets
        });

        if (blockInsertError) {
          throw new Error(`Failed to insert block record: ${blockInsertError.message}`);
        }

        totalRegisteredTransactions += transactionsWithRegisteredWallets;
        successfulBlocks++;
        console.log(`✅ Successfully processed block ${blockHeight}: ${blockInfo.tx.length} total transactions, ${transactionsWithRegisteredWallets} involving registered wallets`);

      } catch (blockError) {
        console.error(`❌ Failed to process block ${blockHeight}:`, blockError);
        failedBlocks.push(blockHeight);
        // Continue processing other blocks instead of failing completely
      }
    }

    // Prepare response with detailed statistics
    const remainingBlocks = blocksToProcess.length - blocksThisRun.length;
    const response = {
      success: true,
      processedBlocks: blocksThisRun.length,
      successfulBlocks,
      failedBlocks,
      totalTransactionsProcessed,
      totalRegisteredTransactions,
      totalKnightsTransactions,
      currentHeight,
      lastProcessedHeight,
      remainingBlocks,
      nextBlocksToProcess: remainingBlocks > 0 ? blocksToProcess.slice(MAX_BLOCKS_PER_RUN, MAX_BLOCKS_PER_RUN + 5) : [],
      gapDetected: blocksToProcess.length > 1,
      blocksProcessedThisRun: blocksThisRun,
      currentSplit
    };

    console.log(`🎯 Batch completed: ${successfulBlocks}/${blocksThisRun.length} blocks processed successfully`);
    
    if (totalKnightsTransactions > 0) {
      console.log(`🏰 Knights transactions recorded: ${totalKnightsTransactions}`);
    }
    
    if (remainingBlocks > 0) {
      console.log(`⏳ ${remainingBlocks} blocks remaining for next run`);
    }
    
    if (failedBlocks.length > 0) {
      console.log(`⚠️ Failed blocks: [${failedBlocks.join(', ')}]`);
    }

    // ── Hourly balance snapshot ──
    await tryBalanceSnapshot();

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Critical blockchain monitoring error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
