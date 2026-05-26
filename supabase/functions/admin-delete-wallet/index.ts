import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SimplePool, finalizeEvent } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROTECTED_MAIN_TYPES = ["main", "main wallet"];

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createSignedEvent(kind: number, tags: string[][], content: string, privateKeyHex: string): any {
  const privateKeyBytes = new Uint8Array(
    privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  return finalizeEvent({ kind, tags, content, created_at: Math.floor(Date.now() / 1000) }, privateKeyBytes);
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate admin via user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin", { _user_id: userData.user.id });
    if (adminError || !isAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Admin privileges required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { wallet_uuid } = body;
    if (!wallet_uuid) {
      return new Response(JSON.stringify({ success: false, error: "wallet_uuid required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Load wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("id", wallet_uuid)
      .maybeSingle();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ success: false, error: "Wallet not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only allow deleting frozen wallets
    if (!wallet.frozen) {
      return new Response(JSON.stringify({ success: false, error: "Only frozen wallets can be deleted via this endpoint" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block Main wallet deletion
    const walletTypeLower = (wallet.wallet_type || "").toLowerCase();
    if (PROTECTED_MAIN_TYPES.some((t) => walletTypeLower === t)) {
      return new Response(JSON.stringify({ success: false, error: "Cannot delete Main Wallet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve owner nostr_hex_id
    const { data: mainWallet } = await supabase
      .from("main_wallets")
      .select("id, nostr_hex_id")
      .eq("id", wallet.main_wallet_id)
      .maybeSingle();

    const ownerHex = mainWallet?.nostr_hex_id || null;

    // Fetch balance for archive note (best-effort)
    let balanceAtDeletion = 0;
    try {
      const balanceResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-wallet-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: [wallet.wallet_id] }),
      });
      const balanceData = await balanceResponse.json();
      if (balanceData?.balances?.[wallet.wallet_id] !== undefined) {
        balanceAtDeletion = balanceData.balances[wallet.wallet_id];
      }
    } catch (_err) { /* ignore */ }

    // Archive
    await supabase.from("deleted_wallets").insert({
      original_wallet_uuid: wallet.id,
      wallet_id: wallet.wallet_id,
      wallet_type: wallet.wallet_type,
      nostr_hex_id: ownerHex || "admin_deleted",
      main_wallet_id: wallet.main_wallet_id,
      reason: `admin_deleted_frozen (${wallet.freeze_reason || "frozen"}) | balance: ${balanceAtDeletion} | admin_user: ${userData.user.id}`,
    });

    // Delete
    const { error: deleteError } = await supabase.from("wallets").delete().eq("id", wallet_uuid);
    if (deleteError) {
      return new Response(JSON.stringify({ success: false, error: "Failed to delete: " + deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[${correlationId}] Admin deleted frozen wallet ${wallet.wallet_id}. Broadcasting KIND 30889...`);

    // Broadcast updated KIND 30889 for the owner
    try {
      if (!ownerHex) {
        console.warn(`[${correlationId}] No owner nostr_hex_id; skipping KIND 30889`);
      } else {
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

          const { data: remaining } = await supabase
            .from("wallets")
            .select("wallet_id, wallet_type, notes, frozen")
            .eq("main_wallet_id", wallet.main_wallet_id);

          const walletTags = (remaining || []).map((w) => [
            "w",
            w.wallet_id,
            w.wallet_type,
            "LANA",
            w.notes || "",
            "0",
            w.frozen ? "frozen_l8w" : "",
          ]);

          const pool = new SimplePool();
          const event30889 = createSignedEvent(
            30889,
            [["d", ownerHex], ["status", "active"], ...walletTags],
            "",
            privateKeyHex
          );

          await broadcastToRelays(pool, relays, event30889, correlationId);
          await new Promise((r) => setTimeout(r, 1000));
          pool.close(relays);
        } else {
          console.warn(`[${correlationId}] No NSEC configured, skipping KIND 30889`);
        }
      }
    } catch (nostrError) {
      console.error(`[${correlationId}] Nostr broadcast error (wallet still deleted):`, nostrError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Wallet ${wallet.wallet_id} deleted by admin and KIND 30889 updated`,
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
