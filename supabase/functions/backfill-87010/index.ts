// One-off backfill: publish KIND 87010 (status=frozen) for wallets that are
// already frozen in the database but have no freeze-history record yet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publish87010 } from "../_shared/publish87010.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  const cid = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch { /* no body */ }

    const { data: frozen, error } = await supabase
      .from("wallets")
      .select("id, wallet_id, freeze_reason, updated_at, main_wallet:main_wallets(nostr_hex_id)")
      .eq("frozen", true)
      .limit(10000);

    if (error) throw error;

    const { data: existing } = await supabase
      .from("wallet_freeze_events")
      .select("wallet_uuid")
      .limit(10000);

    const known = new Set((existing || []).map((r: any) => r.wallet_uuid));

    const entries = (frozen || [])
      .filter((w: any) => w.wallet_id && (w.main_wallet as any)?.nostr_hex_id && !known.has(w.id))
      .map((w: any) => ({
        wallet_uuid: w.id,
        wallet_address: w.wallet_id,
        nostr_hex_id: (w.main_wallet as any).nostr_hex_id,
        status: "frozen" as const,
        reason: w.freeze_reason || "frozen_l8w",
        effective_at: new Date(w.updated_at),
        memo: "Backfilled historical freeze record.",
      }));

    if (dryRun) {
      return new Response(
        JSON.stringify({ success: true, dry_run: true, candidates: entries.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const res = await publish87010(supabase, entries, cid);

    return new Response(
      JSON.stringify({
        success: true,
        frozen_wallets: (frozen || []).length,
        backfilled: res.total,
        published: res.published,
        correlation_id: cid,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`[${cid}] backfill-87010 error:`, e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
