import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SimplePool, finalizeEvent } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createSignedEvent(kind: number, tags: string[][], content: string, privateKeyHex: string): any {
  const privateKeyBytes = new Uint8Array(
    privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const event = {
    kind,
    tags,
    content,
    created_at: Math.floor(Date.now() / 1000),
  };
  return finalizeEvent(event, privateKeyBytes);
}

async function broadcastWithTimeout(
  pool: SimplePool,
  relays: string[],
  event: any,
  correlationId: string,
) {
  const PER_RELAY_TIMEOUT_MS = 8000;
  const TOTAL_TIMEOUT_MS = 30000;

  const publishPromises = pool.publish(relays, event).map((p, i) =>
    Promise.race([
      p.then(() => ({ ok: true as const, relay: relays[i] })),
      new Promise<{ ok: false; relay: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, relay: relays[i] }), PER_RELAY_TIMEOUT_MS)
      ),
    ])
  );

  const overall = Promise.allSettled(publishPromises);
  const result = await Promise.race([
    overall,
    new Promise<PromiseSettledResult<any>[]>((resolve) =>
      setTimeout(() => resolve([]), TOTAL_TIMEOUT_MS)
    ),
  ]);

  let accepted = 0;
  for (const r of result) {
    if (r.status === "fulfilled" && r.value?.ok) accepted++;
  }
  console.log(`[${correlationId}] KIND ${event.kind} (${event.id?.substring(0, 12)}): ${accepted}/${relays.length} relays accepted`);
  return { success: accepted > 0, acceptedRelays: accepted };
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { api_key, wallet_uuid, nostr_id_hex, new_wallet_type } = body;

    console.log(`[${correlationId}] update-wallet-type: uuid=${wallet_uuid} new=${new_wallet_type}`);

    if (!wallet_uuid || !nostr_id_hex || !new_wallet_type) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // API key
    const { data: apiKeyRecord } = await supabase
      .from("api_keys")
      .select("id, is_active")
      .eq("api_key", api_key)
      .maybeSingle();

    if (!apiKeyRecord || !apiKeyRecord.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or inactive API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Wallet + ownership
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, wallet_id, wallet_type, main_wallet_id")
      .eq("id", wallet_uuid)
      .maybeSingle();

    if (!wallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Wallet not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: mainWallet } = await supabase
      .from("main_wallets")
      .select("id, nostr_hex_id")
      .eq("id", wallet.main_wallet_id)
      .maybeSingle();

    if (!mainWallet || mainWallet.nostr_hex_id !== nostr_id_hex) {
      return new Response(
        JSON.stringify({ success: false, error: "Wallet does not belong to this user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Strict one-way rule: only Wallet -> Retail
    if (wallet.wallet_type !== "Wallet" || new_wallet_type !== "Retail") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Only conversion from 'Wallet' to 'Retail' is allowed",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateError } = await supabase
      .from("wallets")
      .update({ wallet_type: "Retail" })
      .eq("id", wallet_uuid);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update wallet type: " + updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[${correlationId}] Type updated for ${wallet.wallet_id}. Broadcasting KIND 30889...`);

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

        const relays = (systemParams?.relays as any[])?.map((r: any) => r.url || r) || [
          "wss://relay.lanavault.space",
          "wss://relay.lanacoin-eternity.com",
          "wss://relay.lanaheartvoice.com",
          "wss://relay.lovelana.org",
          "wss://relay.damus.io",
        ];

        const { data: allWallets } = await supabase
          .from("wallets")
          .select("wallet_id, wallet_type, notes, amount_unregistered_lanoshi, frozen")
          .eq("main_wallet_id", wallet.main_wallet_id);

        const walletTags = (allWallets || []).map((w) => [
          "w",
          w.wallet_id || "",
          w.wallet_type,
          "LANA",
          w.notes || "",
          String(w.amount_unregistered_lanoshi || 0),
          w.frozen ? "frozen_l8w" : "",
        ]);

        console.log(`[${correlationId}] KIND 30889 with ${walletTags.length} wallet tags`);

        const pool = new SimplePool();
        const event30889 = createSignedEvent(
          30889,
          [["d", nostr_id_hex], ["status", "active"], ...walletTags],
          "",
          privateKeyHex,
        );

        const result = await broadcastWithTimeout(pool, relays, event30889, correlationId);
        console.log(`[${correlationId}] KIND 30889 broadcast accepted by ${result.acceptedRelays} relays`);

        await new Promise((resolve) => setTimeout(resolve, 500));
        pool.close(relays);
      } else {
        console.warn(`[${correlationId}] No NSEC configured, skipping KIND 30889`);
      }
    } catch (nostrError) {
      console.error(`[${correlationId}] Nostr broadcast error (type already updated):`, nostrError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Wallet type changed to Retail and KIND 30889 broadcast",
        correlation_id: correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`[${correlationId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
        correlation_id: correlationId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
