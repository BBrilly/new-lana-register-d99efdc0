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

/** Publish event to every relay; resolves to {ok:string[], failed:{url,err}[]} */
async function publishAll(pool: SimplePool, relays: string[], event: any, perRelayTimeoutMs = 8000) {
  const pubs = pool.publish(relays, event);
  const ok: string[] = [];
  const failed: { url: string; err: string }[] = [];
  await Promise.all(
    pubs.map((p, i) =>
      Promise.race([
        p.then(() => ok.push(relays[i])),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), perRelayTimeoutMs)),
      ]).catch((e: any) => failed.push({ url: relays[i], err: e?.message || String(e) }))
    )
  );
  return { ok, failed };
}

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const steps: string[] = [];
  const log = (s: string) => { console.log(`[${correlationId}] ${s}`); steps.push(s); };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization header", steps }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid auth", steps }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Admin privileges required", steps }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nostr_hex_id } = await req.json();
    if (!nostr_hex_id || typeof nostr_hex_id !== "string" || !/^[0-9a-f]{64}$/i.test(nostr_hex_id)) {
      return new Response(JSON.stringify({ success: false, error: "Valid nostr_hex_id (64 hex chars) required", steps }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const ownerHex = nostr_hex_id.toLowerCase();
    log(`▶ Start admin-delete-main-wallet for ${ownerHex.substring(0, 12)}…`);

    const { data: mainWallet, error: mwErr } = await supabase
      .from("main_wallets").select("*").eq("nostr_hex_id", ownerHex).maybeSingle();
    if (mwErr || !mainWallet) {
      return new Response(JSON.stringify({ success: false, error: "Main wallet not found", steps }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log(`✓ Main wallet found: ${mainWallet.id}`);

    const { data: relatedWallets, error: wErr } = await supabase
      .from("wallets").select("id, wallet_id, wallet_type, frozen").eq("main_wallet_id", mainWallet.id);
    if (wErr) throw wErr;

    const MAIN_TYPES = ["main", "main wallet"];
    const isMainEntry = (w: any) =>
      MAIN_TYPES.includes((w.wallet_type || "").toLowerCase()) ||
      (mainWallet.wallet_id && w.wallet_id === mainWallet.wallet_id);

    const mainEntries = (relatedWallets || []).filter(isMainEntry);
    const otherWallets = (relatedWallets || []).filter((w) => !isMainEntry(w));
    log(`✓ Related wallets: ${relatedWallets?.length || 0} (main entries: ${mainEntries.length}, others: ${otherWallets.length})`);

    if (otherWallets.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `User still owns ${otherWallets.length} other wallet(s). Delete those first.`,
        wallets: otherWallets, steps,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load NSEC + relays
    const { data: nsecSetting } = await supabase
      .from("app_settings").select("value").eq("key", "nostr_registrar_nsec").maybeSingle();
    if (!nsecSetting?.value) {
      return new Response(JSON.stringify({ success: false, error: "Registrar NSEC not configured", steps }), {
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
    log(`✓ Loaded ${relays.length} relays`);

    // ─────────────────────────────────────────────────────────
    // STEP 1: Publish to ALL relays FIRST. Only if every relay
    // accepts BOTH events do we proceed with local deletion.
    // ─────────────────────────────────────────────────────────
    const pool = new SimplePool();
    let pubResult: { kind5: any; tomb: any };
    try {
      const aTag = `30889:${registrarPubkey}:${ownerHex}`;
      const deletion = createSignedEvent(
        5,
        [["a", aTag], ["k", "30889"]],
        `Admin deletion of main wallet for ${ownerHex}`,
        privateKeyHex
      );
      log(`▶ Publishing KIND 5 deletion (${deletion.id.substring(0, 12)}…) to ${relays.length} relays`);
      const r1 = await publishAll(pool, relays, deletion);
      log(`  → KIND 5: ok=${r1.ok.length}/${relays.length}${r1.failed.length ? `, failed: ${r1.failed.map(f => f.url).join(", ")}` : ""}`);

      const tombstone = createSignedEvent(
        30889,
        [["d", ownerHex], ["status", "deleted"]],
        "",
        privateKeyHex
      );
      log(`▶ Publishing tombstone KIND 30889 (${tombstone.id.substring(0, 12)}…)`);
      const r2 = await publishAll(pool, relays, tombstone);
      log(`  → KIND 30889 tombstone: ok=${r2.ok.length}/${relays.length}${r2.failed.length ? `, failed: ${r2.failed.map(f => f.url).join(", ")}` : ""}`);

      pubResult = { kind5: r1, tomb: r2 };

      if (r1.ok.length < relays.length || r2.ok.length < relays.length) {
        const failedRelays = Array.from(new Set([
          ...r1.failed.map((f) => f.url),
          ...r2.failed.map((f) => f.url),
        ]));
        log(`✗ Aborting: not all relays accepted. Failed: ${failedRelays.join(", ")}`);
        return new Response(JSON.stringify({
          success: false,
          error: `Deletion aborted — relays did not all confirm. Failed: ${failedRelays.join(", ")}. Local data unchanged.`,
          steps,
        }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      log(`✓ All ${relays.length} relays acknowledged both events`);
    } finally {
      try { pool.close(relays); } catch { /* ignore */ }
    }

    // ─────────────────────────────────────────────────────────
    // STEP 2: All relays accepted — now safe to delete locally
    // ─────────────────────────────────────────────────────────
    const { error: archErr } = await supabase.from("deleted_wallets").insert({
      original_wallet_uuid: mainWallet.id,
      wallet_id: mainWallet.wallet_id,
      wallet_type: "main_wallet",
      nostr_hex_id: ownerHex,
      main_wallet_id: mainWallet.id,
      reason: `admin_deleted_main_wallet | admin_user: ${userData.user.id} | name: ${mainWallet.name || ""}`,
    });
    if (archErr) {
      log(`✗ Archive failed: ${archErr.message}`);
      return new Response(JSON.stringify({ success: false, error: "Archive failed after relay publish: " + archErr.message, steps }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log(`✓ Archived to deleted_wallets`);

    if (mainEntries.length > 0) {
      const ids = mainEntries.map((w: any) => w.id);
      const { error: delWErr } = await supabase.from("wallets").delete().in("id", ids);
      if (delWErr) {
        log(`⚠ Failed to delete wallets rows: ${delWErr.message}`);
      } else {
        log(`✓ Deleted ${ids.length} wallets row(s)`);
      }
    }

    const { error: delMainErr } = await supabase.from("main_wallets").delete().eq("id", mainWallet.id);
    if (delMainErr) {
      log(`✗ main_wallets delete failed: ${delMainErr.message}`);
      return new Response(JSON.stringify({ success: false, error: "Failed to delete main wallet: " + delMainErr.message, steps }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log(`✓ Deleted from main_wallets`);
    log(`✅ DONE`);

    return new Response(JSON.stringify({
      success: true,
      message: `Main wallet for ${ownerHex.substring(0, 12)}… deleted; KIND 30889 retracted on all ${relays.length} relays`,
      relays_count: relays.length,
      steps,
      correlation_id: correlationId,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(`[${correlationId}] Unexpected:`, error);
    steps.push(`✗ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
      steps,
      correlation_id: correlationId,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
