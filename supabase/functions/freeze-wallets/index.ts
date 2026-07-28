import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SimplePool, finalizeEvent } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";
import { publish87010, getLastFrozenAt } from "../_shared/publish87010.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array).map(b => b.toString(16).padStart(2, "0")).join("");
}

function createSignedEvent(kind: number, tags: string[][], content: string, privateKeyHex: string): any {
  const privateKeyBytes = new Uint8Array(
    privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const event = {
    kind,
    tags,
    content,
    created_at: Math.floor(Date.now() / 1000),
  };
  return finalizeEvent(event, privateKeyBytes);
}

async function broadcastToRelays(pool: SimplePool, relays: string[], event: any, correlationId: string) {
  try {
    const promises = pool.publish(relays, event);
    const results = await Promise.allSettled(promises);
    let accepted = 0;
    for (const result of results) {
      if (result.status === "fulfilled") accepted++;
    }
    console.log(`[${correlationId}] KIND ${event.kind} (${event.id.substring(0, 12)}): ${accepted}/${relays.length} relays accepted`);
    return { success: accepted > 0, acceptedRelays: accepted };
  } catch (error) {
    console.error(`[${correlationId}] Failed to broadcast KIND ${event.kind}:`, error);
    return { success: false, acceptedRelays: 0 };
  }
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { wallet_ids, freeze, freeze_reason, nostr_hex_id } = body;
    const resolvedFreezeCode = freeze_reason || "frozen_l8w";

    console.log(`[${correlationId}] Freeze request: freeze=${freeze}, wallets=${wallet_ids?.length}, nostr_hex_id=${nostr_hex_id?.substring(0, 12)}`);

    if (!Array.isArray(wallet_ids) || wallet_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "wallet_ids must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof freeze !== "boolean") {
      return new Response(
        JSON.stringify({ success: false, error: "freeze must be a boolean" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!nostr_hex_id || nostr_hex_id.length !== 64) {
      return new Response(
        JSON.stringify({ success: false, error: "nostr_hex_id must be a 64-character hex string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Snapshot state BEFORE the update (needed for 87010 reason / frozen_at)
    const { data: walletsBefore } = await supabase
      .from("wallets")
      .select("id, wallet_id, frozen, freeze_reason, updated_at")
      .in("id", wallet_ids);

    // Update frozen status and freeze_reason in database
    const { error: updateError } = await supabase
      .from("wallets")
      .update({ frozen: freeze, freeze_reason: freeze ? resolvedFreezeCode : "" })
      .in("id", wallet_ids);

    if (updateError) {
      console.error(`[${correlationId}] Error updating wallets:`, updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update wallet freeze status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${correlationId}] Updated ${wallet_ids.length} wallets: frozen=${freeze}`);

    // Publish KIND 87010 (append-only freeze/unfreeze audit trail) — one event per wallet
    try {
      const effectiveAt = new Date();
      const entries = [] as any[];
      for (const w of walletsBefore || []) {
        if (!w.wallet_id) continue;
        // Only announce actual state transitions
        if (!!w.frozen === !!freeze) continue;
        entries.push({
          wallet_uuid: w.id,
          wallet_address: w.wallet_id,
          nostr_hex_id,
          status: freeze ? "frozen" : "unfrozen",
          reason: freeze ? resolvedFreezeCode : (w.freeze_reason || resolvedFreezeCode),
          effective_at: effectiveAt,
          frozen_at: freeze ? null : await getLastFrozenAt(supabase, w.id, w.updated_at),
        });
      }
      if (entries.length > 0) {
        const res = await publish87010(supabase, entries, correlationId);
        console.log(`[${correlationId}] KIND 87010: published ${res.published}/${res.total}`);
      }
    } catch (e) {
      console.error(`[${correlationId}] KIND 87010 error (wallets still updated):`, e);
    }


    // Find main_wallet for this nostr_hex_id
    const { data: mainWallet } = await supabase
      .from("main_wallets")
      .select("id, nostr_hex_id, status")
      .eq("nostr_hex_id", nostr_hex_id)
      .maybeSingle();

    if (!mainWallet) {
      return new Response(
        JSON.stringify({ success: true, message: "Wallets updated but no main_wallet found for KIND 30889 broadcast" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Broadcast updated KIND 30889
    try {
      const { data: nsecSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "nostr_registrar_nsec")
        .maybeSingle();

      if (nsecSetting?.value) {
        const privateKeyHex = decodeNsec(nsecSetting.value);

        const { data: systemParams } = await supabase
          .from("system_parameters")
          .select("relays")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const relays = (systemParams?.relays as any[])?.map((r: any) => r.url || r) || [];

        if (relays.length === 0) {
          console.warn(`[${correlationId}] No relays found, skipping KIND 30889`);
        } else {
          // Get all wallets for this user (with updated frozen status)
          const { data: allWallets } = await supabase
            .from("wallets")
            .select("wallet_id, wallet_type, notes, amount_unregistered_lanoshi, frozen, freeze_reason")
            .eq("main_wallet_id", mainWallet.id);

          // Per-wallet freeze must NEVER change the profile-level status tag
          // Profile-level status ("frozen"/"active") is managed separately and independently
          const profileStatus = "active";

          const walletTags = (allWallets || []).map((w: any) =>
            ["w", w.wallet_id || "", w.wallet_type, "LANA", w.notes || "", String(w.amount_unregistered_lanoshi || 0), w.frozen ? (w.freeze_reason || resolvedFreezeCode) : ""]
          );

          console.log(`[${correlationId}] Creating KIND 30889 with ${walletTags.length} wallet tags, status=${profileStatus}`);

          const pool = new SimplePool();
          const event30889 = createSignedEvent(
            30889,
            [
              ["d", nostr_hex_id],
              ["status", profileStatus],
              ...walletTags,
            ],
            "",
            privateKeyHex
          );

          const result = await broadcastToRelays(pool, relays, event30889, correlationId);
          console.log(`[${correlationId}] KIND 30889 broadcast: ${result.acceptedRelays} relays accepted`);

          await new Promise(resolve => setTimeout(resolve, 1000));
          pool.close(relays);
        }
      } else {
        console.warn(`[${correlationId}] No NSEC configured, skipping KIND 30889`);
      }
    } catch (nostrError) {
      console.error(`[${correlationId}] Nostr broadcast error (wallets still updated):`, nostrError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${wallet_ids.length} wallet(s) ${freeze ? "frozen" : "unfrozen"} and KIND 30889 broadcast`,
        correlation_id: correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${correlationId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
        correlation_id: correlationId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
