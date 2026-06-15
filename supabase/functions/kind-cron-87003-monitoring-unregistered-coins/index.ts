import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SimplePool, finalizeEvent } from 'https://esm.sh/nostr-tools@2.7.0';
import { decode } from 'https://esm.sh/nostr-tools@2.7.0/nip19';
import { encrypt } from 'https://esm.sh/nostr-tools@2.7.0/nip04';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishResult {
  relay: string;
  success: boolean;
  error?: string;
}

interface UnregisteredLanaEvent {
  id: string;
  wallet_id: string;
  unregistered_amount: number;
  notes: string | null;
  detected_at: string;
  nostr_event_id: string | null;
  nostr_dm_sent: boolean | null;
}

interface WalletInfo {
  id: string;
  wallet_id: string;
  main_wallet_id: string;
  main_wallets: {
    nostr_hex_id: string;
    is_owned: boolean;
  } | null;
}

interface WalletRow {
  id: string;
  wallet_id: string;
  main_wallet_id: string;
  main_wallets: {
    nostr_hex_id: string;
    is_owned: boolean;
  } | { nostr_hex_id: string; is_owned: boolean; }[] | null;
}

// Convert nsec to hex private key
function nsecToHex(nsec: string): string {
  try {
    const decoded = decode(nsec);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format');
    }
    return Array.from(decoded.data as Uint8Array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.error('Error decoding nsec:', error);
    throw new Error('Failed to decode nsec private key');
  }
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return bytes;
}

// Convert LANA amount to Latoshis (1 LANA = 100,000,000 Latoshis)
function lanaToLatoshis(amount: number): string {
  return Math.floor(amount * 100000000).toString();
}

// Build DM message for unregistered LANA notification
function buildDmMessage(walletAddress: string, amount: number): string {
  return `LANA Unregistered Coins Alert

Your wallet ${walletAddress} has received ${amount} LANA from an unregistered source.

These coins need to be regularized through the LANA Registrar. To resolve this:

1. Open the LanaKnight app or visit the Registrar
2. Send the unregistered amount (${amount} LANA) to the designated return address provided by the Registrar
3. The Registrar will process your return and re-issue registered coins

Video tutorial: https://youtu.be/NulmUXSZ4cE

Please regularize these coins as soon as possible to maintain your wallet's compliance status.`;
}

// Publish event to Nostr relays
async function publishEventToNostr(
  signedEvent: any,
  relays: string[]
): Promise<{ eventId: string; results: PublishResult[] }> {
  const pool = new SimplePool();
  const results: PublishResult[] = [];

  try {
    const publishPromises = relays.map(async (relay: string) => {
      console.log(`🔄 Connecting to ${relay}...`);

      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          results.push({ relay, success: false, error: 'Connection timeout (10s)' });
          console.error(`❌ ${relay}: Timeout`);
          resolve();
        }, 10000);

        try {
          const pubs = pool.publish([relay], signedEvent);

          Promise.race([
            Promise.all(pubs),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Publish timeout')), 8000)
            ),
          ])
            .then(() => {
              clearTimeout(timeout);
              results.push({ relay, success: true });
              console.log(`✅ ${relay}: Successfully published`);
              resolve();
            })
            .catch((error) => {
              clearTimeout(timeout);
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              results.push({ relay, success: false, error: errorMsg });
              console.error(`❌ ${relay}: ${errorMsg}`);
              resolve();
            });
        } catch (error) {
          clearTimeout(timeout);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          results.push({ relay, success: false, error: errorMsg });
          console.error(`❌ ${relay}: ${errorMsg}`);
          resolve();
        }
      });
    });

    await Promise.all(publishPromises);

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log('📊 Publishing summary:', {
      eventId: signedEvent.id,
      total: results.length,
      successful: successCount,
      failed: failedCount,
    });

    return { eventId: signedEvent.id, results };
  } finally {
    pool.close(relays);
  }
}

// Send NIP-04 encrypted DM to a user
async function sendEncryptedDM(
  privateKeyHex: string,
  privateKeyBytes: Uint8Array,
  recipientPubkey: string,
  message: string,
  relays: string[]
): Promise<{ success: boolean; eventId: string }> {
  console.log(`💬 Encrypting DM for ${recipientPubkey.substring(0, 12)}...`);

  // Encrypt the message using NIP-04
  const ciphertext = await encrypt(privateKeyHex, recipientPubkey, message);

  // Create Kind 4 event
  const dmEvent = {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]],
    content: ciphertext,
  };

  // Sign and publish
  const signedDm = finalizeEvent(dmEvent, privateKeyBytes);
  console.log(`✍️ DM signed: ${signedDm.id}`);

  const { eventId, results } = await publishEventToNostr(signedDm, relays);
  const success = results.some((r) => r.success);

  if (success) {
    console.log(`✅ DM sent successfully: ${eventId}`);
  } else {
    console.error(`❌ DM failed to publish to any relay`);
  }

  return { success, eventId };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🚀 Kind 87003 - Monitoring for Unregistered Coins Publisher started');

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch NOSTR private key from app_settings
    console.log('🔑 Fetching NOSTR registrar private key...');
    const { data: settingData, error: settingError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nostr_registrar_nsec')
      .single();

    if (settingError || !settingData?.value) {
      console.error('❌ Failed to fetch NOSTR private key:', settingError);
      return new Response(
        JSON.stringify({ success: false, error: 'NOSTR registrar private key not configured in app_settings' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nsecKey = settingData.value.trim();
    if (!nsecKey || !nsecKey.startsWith('nsec1')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid NOSTR private key format. Must be nsec1...' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert nsec to hex
    const privateKeyHex = nsecToHex(nsecKey);
    const privateKeyBytes = hexToBytes(privateKeyHex);
    console.log('✅ Private key loaded successfully');

    // 2. Fetch relay configuration from system_parameters
    console.log('📡 Fetching relay configuration...');
    const { data: sysParams, error: sysError } = await supabase
      .from('system_parameters')
      .select('relays, pubkey, freeze_lana_account_above')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (sysError || !sysParams?.relays) {
      console.error('❌ Failed to fetch system parameters:', sysError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch relay configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const relays = (sysParams.relays as string[]).filter((r: string) => r.startsWith('wss://'));
    console.log(`📡 Using ${relays.length} relays:`, relays);

    const threshold = Number((sysParams as any).freeze_lana_account_above) || 100;
    console.log(`🪙 Unregistered notify threshold: ${threshold} LANA`);

    // 3. Fetch unpublished unregistered_lana_events (also fetch those needing DM retry)
    console.log('📋 Fetching unpublished unregistered_lana_events...');
    const { data: unpublishedEvents, error: eventsError } = await supabase
      .from('unregistered_lana_events')
      .select('id, wallet_id, unregistered_amount, notes, detected_at, nostr_event_id, nostr_dm_sent')
      .or('nostr_87003_published.eq.false,nostr_dm_sent.eq.false')
      .order('detected_at', { ascending: true })
      .limit(50);

    if (eventsError) {
      console.error('❌ Failed to fetch unpublished events:', eventsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch unpublished events' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!unpublishedEvents || unpublishedEvents.length === 0) {
      console.log('✅ No unpublished unregistered events to process');
      return new Response(
        JSON.stringify({ success: true, message: 'No unpublished unregistered events to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${unpublishedEvents.length} events to process`);

    // 4. Fetch wallet info for all events (including main_wallets.is_owned)
    const walletIds = [...new Set(unpublishedEvents.map((e) => e.wallet_id))];
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('id, wallet_id, main_wallet_id, main_wallets(nostr_hex_id, is_owned)')
      .in('id', walletIds);

    if (walletsError) {
      console.error('❌ Failed to fetch wallet info:', walletsError);
    }

    const walletMap = new Map<string, WalletInfo>();
    wallets?.forEach((w) => {
      const row = w as WalletRow;
      const mainWallet = Array.isArray(row.main_wallets)
        ? row.main_wallets[0] || null
        : row.main_wallets;
      walletMap.set(w.id, {
        id: row.id,
        wallet_id: row.wallet_id,
        main_wallet_id: row.main_wallet_id,
        main_wallets: mainWallet,
      });
    });

    // Filter events to only those where is_owned = true
    const ownedEvents = (unpublishedEvents as UnregisteredLanaEvent[]).filter((event) => {
      const wallet = walletMap.get(event.wallet_id);
      const isOwned = wallet?.main_wallets?.is_owned ?? false;
      if (!isOwned) {
        console.log(`⏭️ Skipping event ${event.id} - wallet owner has is_owned = false`);
      }
      return isOwned;
    });

    console.log(`📋 ${ownedEvents.length} events belong to owned wallets (is_owned = true)`);

    // Filter out events below threshold — they remain in queue so future aggregation can trigger
    const aboveThresholdEvents = ownedEvents.filter((event) => {
      const amt = Number(event.unregistered_amount) || 0;
      if (amt < threshold) {
        console.log(`⏭️ Skipping event ${event.id} - amount ${amt} LANA < threshold ${threshold}`);
        return false;
      }
      return true;
    });
    const belowThresholdCount = ownedEvents.length - aboveThresholdEvents.length;
    console.log(`📋 ${aboveThresholdEvents.length} events ≥ threshold; ${belowThresholdCount} below threshold`);

    // 5. Process each owned event
    let successCount = 0;
    let errorCount = 0;
    let dmSentCount = 0;
    let dmFailCount = 0;
    let skippedCount = unpublishedEvents.length - ownedEvents.length;
    const processedEvents: Array<{ id: string; eventId: string; success: boolean; dmSent: boolean }> = [];

    for (const event of aboveThresholdEvents) {
      try {
        const wallet = walletMap.get(event.wallet_id);
        const walletAddress = wallet?.wallet_id || event.wallet_id;
        const userPubkey = wallet?.main_wallets?.nostr_hex_id || '';

        if (!userPubkey) {
          console.warn(`⚠️ No nostr_hex_id found for event ${event.id}, skipping...`);
          skippedCount++;
          continue;
        }

        const amountLatoshis = lanaToLatoshis(event.unregistered_amount);
        let kind87003Published = false;
        let eventId = '';

        // --- KIND 87003 publish (only if not yet published) ---
        // Check if already published by looking at existing data
        const { data: currentEvent } = await supabase
          .from('unregistered_lana_events')
          .select('nostr_87003_published')
          .eq('id', event.id)
          .single();

        const alreadyPublished87003 = currentEvent?.nostr_87003_published === true;

        if (!alreadyPublished87003) {
          const eventTemplate = {
            kind: 87003,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ['p', userPubkey],
              ['WalletID', walletAddress],
              ['Linked_event', event.nostr_event_id || ''],
              ['UnregisteredAmountLatoshis', amountLatoshis],
            ],
            content: 'Unregistered coins detected requiring regularization',
          };

          const signedEvent = finalizeEvent(eventTemplate, privateKeyBytes);
          console.log(`✍️ Event signed for wallet ${walletAddress}: ${signedEvent.id}`);

          const publishResult = await publishEventToNostr(signedEvent, relays);
          eventId = publishResult.eventId;
          kind87003Published = publishResult.results.some((r) => r.success);

          if (kind87003Published) {
            await supabase
              .from('unregistered_lana_events')
              .update({
                nostr_87003_published: true,
                nostr_87003_event_id: eventId,
                nostr_87003_published_at: new Date().toISOString(),
              })
              .eq('id', event.id);

            console.log(`✅ KIND 87003 published for event ${event.id}`);
            successCount++;
          } else {
            console.error(`❌ Failed to publish KIND 87003 for event ${event.id}`);
            errorCount++;
          }
        } else {
          kind87003Published = true;
          console.log(`⏭️ KIND 87003 already published for event ${event.id}`);
        }

        // --- NIP-04 DM (only if 87003 succeeded and DM not yet sent) ---
        let dmSent = false;
        if (kind87003Published && !event.nostr_dm_sent) {
          try {
            const dmMessage = buildDmMessage(walletAddress, event.unregistered_amount);
            const dmResult = await sendEncryptedDM(
              privateKeyHex,
              privateKeyBytes,
              userPubkey,
              dmMessage,
              relays
            );

            if (dmResult.success) {
              await supabase
                .from('unregistered_lana_events')
                .update({
                  nostr_dm_sent: true,
                  nostr_dm_event_id: dmResult.eventId,
                })
                .eq('id', event.id);

              console.log(`✅ DM sent for event ${event.id}`);
              dmSentCount++;
              dmSent = true;
            } else {
              console.error(`❌ DM failed for event ${event.id}`);
              dmFailCount++;
            }
          } catch (dmError) {
            console.error(`❌ DM error for event ${event.id}:`, dmError);
            dmFailCount++;
          }
        }

        processedEvents.push({ id: event.id, eventId, success: kind87003Published, dmSent });
      } catch (eventError) {
        console.error(`❌ Error processing event ${event.id}:`, eventError);
        errorCount++;
        processedEvents.push({ id: event.id, eventId: '', success: false, dmSent: false });
      }
    }

    console.log('📊 Final summary:', {
      total: unpublishedEvents.length,
      ownedEvents: ownedEvents.length,
      skipped: skippedCount,
      kind87003_success: successCount,
      kind87003_errors: errorCount,
      dm_sent: dmSentCount,
      dm_failed: dmFailCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${ownedEvents.length} events (${skippedCount} skipped)`,
        total: unpublishedEvents.length,
        processed: ownedEvents.length,
        skipped: skippedCount,
        kind87003: { successful: successCount, failed: errorCount },
        dm: { sent: dmSentCount, failed: dmFailCount },
        events: processedEvents,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
