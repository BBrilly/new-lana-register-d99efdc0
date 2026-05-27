import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SimplePool, finalizeEvent, getPublicKey } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

function createSignedEvent(kind: number, tags: string[][], content: string, privateKeyHex: string): any {
  return finalizeEvent({ kind, tags, content, created_at: Math.floor(Date.now() / 1000) }, hexToBytes(privateKeyHex));
}

async function broadcast(pool: SimplePool, relays: string[], event: any, correlationId: string) {
  try {
    const results = await Promise.allSettled(pool.publish(relays, event));
    const accepted = results.filter((r) => r.status === "fulfilled").length;
    console.log(`[${correlationId}] KIND ${event.kind} (${event.id.substring(0, 12)}): ${accepted}/${relays.length} relays`);
    return accepted;
  } catch (err) {
    console.error(`[${correlationId}] Broadcast error KIND ${event.kind}:`, err);
    return 0;
  }
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Admin privileges required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nostr_hex_id } = await req.json();
    if (!nostr_hex_id || typeof nostr_hex_id !== "string" || !/^[0-9a-f]{64}$/i.test(nostr_hex_id)) {
      return new Response(JSON.stringify({ success: false, error: "Valid nostr_hex_id (64 hex chars) required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const ownerHex = nostr_hex_id.toLowerCase();

    const { data: mainWallet, error: mwErr } = await supabase
      .from("main_wallets")
      .select("*")
      .eq("nostr_hex_id", ownerHex)
      .maybeSingle();

    if (mwErr || !mainWallet) {
      return new Response(JSON.stringify({ success: false, error: "Main wallet not found for this nostr_hex_id" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: relatedWallets, error: wErr } = await supabase
      .from("wallets")
      .select("id, wallet_id, wallet_type, frozen")
      .eq("main_wallet_id", mainWallet.id);
    if (wErr) throw wErr;

    if ((relatedWallets || []).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `User still owns ${relatedWallets!.length} other wallet(s). Delete those first.`,
        wallets: relatedWallets,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load NSEC + relays
    const { data: nsecSetting } = await supabase
      .from("app_settings").select("value").eq("key", "nostr_registrar_nsec").maybeSingle();
    if (!nsecSetting?.value) {
      return new Response(JSON.stringify({ success: false, error: "Registrar NSEC not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const privateKeyHex = decodeNsec(nsecSetting.value);
    const registrarPubkey = getPublicKey(hexToBytes(privateKeyHex));

    const { data: systemParams } = await supabase
      .from("system_parameters").select("relays").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const relays = (systemParams?.relays as any[])?.map((r: any) => r.url || r) || [
      "wss://relay.lanavault.space",
      "wss://relay.lanacoin-eternity.com",
      "wss://relay.lanaheartvoice.com",
      "wss://relay.lovelana.org",
      "wss://relay.damus.io",
    ];

    // Archive
    await supabase.from("deleted_wallets").insert({
      original_wallet_uuid: mainWallet.id,
      wallet_id: mainWallet.wallet_id,
      wallet_type: "main_wallet",
      nostr_hex_id: ownerHex,
      main_wallet_id: mainWallet.id,
      reason: `admin_deleted_main_wallet | admin_user: ${userData.user.id} | name: ${mainWallet.name || ""}`,
    });

    // Delete from main_wallets
    const { error: delMainErr } = await supabase.from("main_wallets").delete().eq("id", mainWallet.id);
    if (delMainErr) {
      return new Response(JSON.stringify({ success: false, error: "Failed to delete main wallet: " + delMainErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[${correlationId}] Main wallet ${mainWallet.id} (${ownerHex.substring(0, 12)}) deleted. Broadcasting KIND 5...`);

    // Publish NIP-09 deletion (KIND 5) targeting the addressable KIND 30889
    const pool = new SimplePool();
    try {
      const aTag = `30889:${registrarPubkey}:${ownerHex}`;
      const deletion = createSignedEvent(
        5,
        [["a", aTag], ["k", "30889"]],
        `Admin deletion of main wallet for ${ownerHex}`,
        privateKeyHex
      );
      await broadcast(pool, relays, deletion, correlationId);

      // Also publish an empty/tombstone KIND 30889 so replacing relays drop the listing
      const tombstone = createSignedEvent(
        30889,
        [["d", ownerHex], ["status", "deleted"]],
        "",
        privateKeyHex
      );
      await broadcast(pool, relays, tombstone, correlationId);

      await new Promise((r) => setTimeout(r, 1000));
    } finally {
      pool.close(relays);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Main wallet for ${ownerHex.substring(0, 12)}… deleted, KIND 30889 retracted`,
      correlation_id: correlationId,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(`[${correlationId}] Unexpected:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
      correlation_id: correlationId,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
