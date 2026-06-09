// Public read-only stats endpoint. CORS open so any external website can fetch it.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function fetchAllPaginated<T>(
  query: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Registered wallets count
    const { count: registeredWalletsCount } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true });

    // 1b. People count = number of main_wallets (one per person)
    const { count: peopleCount } = await supabase
      .from('main_wallets')
      .select('*', { count: 'exact', head: true });

    // 2. Total registered LANA = latest balance snapshot (matches Balance history tab)
    const { data: latestSnapshot } = await supabase
      .from('balance_snapshots')
      .select('total_balance_lana')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const totalRegisteredLana = Number(latestSnapshot?.total_balance_lana || 0);

    // 3. Transactions per day for last 30 days (with daily amounts)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const txs = await fetchAllPaginated<{ id: string; created_at: string; amount: number | string; from_wallet_id: string | null; to_wallet_id: string | null; notes: string | null }>((from, to) =>
      supabase
        .from('transactions')
        .select('id, created_at, amount, from_wallet_id, to_wallet_id, notes')
        .gte('created_at', since.toISOString())
        .range(from, to),
    );

    // Group by blockchain TX hash (from notes); rows without hash keyed by id.
    // A TX counts iff at least one row is non-change; amount = sum of non-change rows' amount.
    const TX_HASH_RE = /Blockchain transaction ([a-f0-9]{64})/i;
    type TxGroup = { day: string; nonChangeAmount: number; hasNonChange: boolean };
    const groupRows = (rows: typeof txs) => {
      const map = new Map<string, TxGroup>();
      for (const r of rows) {
        const m = r.notes?.match(TX_HASH_RE);
        const key = m ? `tx:${m[1]}` : `id:${r.id}`;
        const day = r.created_at.slice(0, 10);
        const isChange = !!(r.from_wallet_id && r.to_wallet_id && r.from_wallet_id === r.to_wallet_id);
        const g = map.get(key) || { day, nonChangeAmount: 0, hasNonChange: false };
        if (!isChange) {
          g.hasNonChange = true;
          g.nonChangeAmount += Number(r.amount) || 0;
          g.day = day; // prefer day from a real (non-change) row
        }
        map.set(key, g);
      }
      return map;
    };

    const byDayCount: Record<string, number> = {};
    const byDayAmount: Record<string, number> = {};
    for (let i = 0; i <= 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const k = d.toISOString().slice(0, 10);
      byDayCount[k] = 0;
      byDayAmount[k] = 0;
    }
    const grouped = groupRows(txs);
    for (const g of grouped.values()) {
      if (!g.hasNonChange) continue;
      if (g.day in byDayCount) {
        byDayCount[g.day]++;
        byDayAmount[g.day] += g.nonChangeAmount;
      }
    }
    const transactionsPerDay = Object.keys(byDayCount)
      .sort()
      .map((date) => ({ date, count: byDayCount[date], total_amount_lana: byDayAmount[date] }));

    const transactionsToday = byDayCount[todayStr] || 0;
    const transactionsTodayTotalLana = byDayAmount[todayStr] || 0;
    const transactionsYesterday = byDayCount[yesterdayStr] || 0;
    const transactionsYesterdayTotalLana = byDayAmount[yesterdayStr] || 0;

    // All-time totals: distinct blockchain TX hashes, non-change only.
    const allTxAll = await fetchAllPaginated<{ id: string; created_at: string; amount: number | string; from_wallet_id: string | null; to_wallet_id: string | null; notes: string | null }>((from, to) =>
      supabase.from('transactions').select('id, created_at, amount, from_wallet_id, to_wallet_id, notes').range(from, to),
    );
    const allGrouped = groupRows(allTxAll);
    let allTimeTxCount = 0;
    let allTimeTxTotalLana = 0;
    for (const g of allGrouped.values()) {
      if (!g.hasNonChange) continue;
      allTimeTxCount++;
      allTimeTxTotalLana += g.nonChangeAmount;
    }

    // 4. Lana.Discount wallets
    const lanaDiscountWallets = await fetchAllPaginated<{
      wallet_id: string | null;
      main_wallet: any;
    }>((from, to) =>
      supabase
        .from('wallets')
        .select('wallet_id, main_wallet:main_wallets(name, display_name)')
        .eq('wallet_type', 'Lana.Discount')
        .range(from, to),
    );

    // 5. LanaPays.Us wallets (current split)
    const lanaPaysWallets = await fetchAllPaginated<{
      wallet_id: string | null;
      split_created: number | null;
      main_wallet: any;
    }>((from, to) =>
      supabase
        .from('wallets')
        .select('wallet_id, split_created, main_wallet:main_wallets(name, display_name)')
        .eq('wallet_type', 'LanaPays.Us')
        .range(from, to),
    );

    // 5b. Retail wallets
    const retailWallets = await fetchAllPaginated<{
      wallet_id: string | null;
      main_wallet: any;
    }>((from, to) =>
      supabase
        .from('wallets')
        .select('wallet_id, main_wallet:main_wallets(name, display_name)')
        .eq('wallet_type', 'Retail')
        .range(from, to),
    );

    // 6. Current split + LanaKnight TX from current split
    const { data: sysParams } = await supabase
      .from('system_parameters')
      .select('split')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentSplit = sysParams?.split ? parseInt(sysParams.split, 10) : null;

    let knightsTx: any[] = [];
    if (currentSplit !== null) {
      const events = await fetchAllPaginated<any>((from, to) =>
        supabase
          .from('registered_lana_events')
          .select('id, wallet_id, amount, notes, detected_at, split, block_id, transaction_id')
          .eq('split', currentSplit)
          .range(from, to),
      );
      const walletIds = [...new Set(events.map((e) => e.wallet_id))];
      const { data: wallets } = await supabase
        .from('wallets')
        .select('id, wallet_id, main_wallet:main_wallets(name, display_name)')
        .in('id', walletIds);
      const wmap = new Map((wallets || []).map((w: any) => [w.id, w]));
      knightsTx = events.map((e) => {
        const w: any = wmap.get(e.wallet_id);
        return {
          transaction_id: e.transaction_id,
          block_id: e.block_id,
          amount: Number(e.amount),
          detected_at: e.detected_at,
          split: e.split,
          wallet_address: w?.wallet_id || null,
          wallet_name:
            (w?.main_wallet as any)?.display_name || (w?.main_wallet as any)?.name || null,
        };
      });
      knightsTx.sort((a, b) => (b.detected_at || '').localeCompare(a.detected_at || ''));
    }

    const body = {
      generated_at: new Date().toISOString(),
      source: 'https://www.lanawatch.us',
      registered_wallets_count: registeredWalletsCount || 0,
      people_count: peopleCount || 0,
      total_registered_lana: totalRegisteredLana,
      transactions_today_count: transactionsToday,
      transactions_today_total_lana: transactionsTodayTotalLana,
      transactions_yesterday_count: transactionsYesterday,
      transactions_yesterday_total_lana: transactionsYesterdayTotalLana,
      transactions_all_time_count: allTimeTxCount || 0,
      transactions_all_time_total_lana: allTimeTxTotalLana,
      transactions_per_day_last_30: transactionsPerDay,
      lana_discount_wallets: lanaDiscountWallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: (w.main_wallet as any)?.display_name || (w.main_wallet as any)?.name || null,
      })),
      lanapays_us_wallets: lanaPaysWallets.map((w) => ({
        wallet_id: w.wallet_id,
        split_created: w.split_created,
        name: (w.main_wallet as any)?.display_name || (w.main_wallet as any)?.name || null,
      })),
      retail_wallets: retailWallets.map((w) => ({
        wallet_id: w.wallet_id,
        name: (w.main_wallet as any)?.display_name || (w.main_wallet as any)?.name || null,
      })),
      current_split: currentSplit,
      lanaknight_transactions_current_split: knightsTx,
    };

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('public-stats error', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
