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

    const txs = await fetchAllPaginated<{ created_at: string; amount: number | string }>((from, to) =>
      supabase
        .from('transactions')
        .select('created_at, amount')
        .gte('created_at', since.toISOString())
        .range(from, to),
    );

    const byDayCount: Record<string, number> = {};
    const byDayAmount: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const k = d.toISOString().slice(0, 10);
      byDayCount[k] = 0;
      byDayAmount[k] = 0;
    }
    for (const tx of txs) {
      const day = tx.created_at.slice(0, 10);
      if (day in byDayCount) {
        byDayCount[day]++;
        byDayAmount[day] += Number(tx.amount) || 0;
      }
    }
    const transactionsPerDay = Object.keys(byDayCount)
      .sort()
      .map((date) => ({ date, count: byDayCount[date], total_amount_lana: byDayAmount[date] }));

    const transactionsToday = byDayCount[todayStr] || 0;
    const transactionsTodayTotalLana = byDayAmount[todayStr] || 0;

    // All-time totals (count + sum)
    const { count: allTimeTxCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    const allTxAmounts = await fetchAllPaginated<{ amount: number | string }>((from, to) =>
      supabase.from('transactions').select('amount').range(from, to),
    );
    const allTimeTxTotalLana = allTxAmounts.reduce((s, t) => s + (Number(t.amount) || 0), 0);

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
      total_registered_lana: totalRegisteredLana,
      transactions_today_count: transactionsToday,
      transactions_today_total_lana: transactionsTodayTotalLana,
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
