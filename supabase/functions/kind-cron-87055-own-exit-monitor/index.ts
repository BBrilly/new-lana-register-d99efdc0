import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SimplePool, finalizeEvent } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FREEZE_REASON = "frozen_own";

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function createSignedEvent(
  kind: number,
  tags: string[][],
  content: string,
  privateKeyHex: string,
): any {
  const privateKeyBytes = new Uint8Array(
    privateKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );
  return finalizeEvent(
    { kind, tags, content, created_at: Math.floor(Date.now() / 1000) },
    privateKeyBytes,
  );
}

async function publishWithTimeout(
  pool: SimplePool,
  relays: string[],
  event: any,
  cid: string,
): Promise<number> {
  const promises = pool.publish(relays, event);
  let accepted = 0;
  const overall = new Promise<void>((resolve) => setTimeout(resolve, 30000));
  await Promise.race([
    Promise.all(
      promises.map((p: Promise<string>) =>
        Promise.race([
          p.then(() => {
            accepted++;
          }).catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]),
      ),
    ),
    overall,
  ]);
  console.log(
    `[${cid}] KIND ${event.kind} ${event.id.substring(0, 12)}: ${accepted}/${relays.length} accepted`,
  );
  return accepted;
}

Deno.serve(async (req) => {
  const cid = crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const steps: string[] = [];
  const log = (m: string) => {
    console.log(`[${cid}] ${m}`);
    steps.push(m);
  };

  try {
    log("▶ Starting KIND 87055 OWN exit/enter monitor");

    // 1. Load relays
    const { data: sysParams } = await supabase
      .from("system_parameters")
      .select("relays")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const relays: string[] =
      (sysParams?.relays as any[])?.map((r: any) =>
        typeof r === "string" ? r : r.url,
      ) || [];

    if (relays.length === 0) {
      log("✗ No relays configured");
      return new Response(
        JSON.stringify({ success: false, error: "No relays", steps }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    log(`✓ Loaded ${relays.length} relays`);

    // 2. Determine since
    const { data: lastEvent } = await supabase
      .from("own_exit_events")
      .select("event_created_at")
      .order("event_created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sinceSec: number;
    if (lastEvent?.event_created_at) {
      sinceSec =
        Math.floor(new Date(lastEvent.event_created_at).getTime() / 1000) - 600;
    } else {
      sinceSec = Math.floor(Date.now() / 1000) - 86400;
    }
    log(`✓ Querying since ${new Date(sinceSec * 1000).toISOString()}`);

    // 3. Fetch events
    const pool = new SimplePool();
    const events = await pool.querySync(relays, {
      kinds: [87055],
      since: sinceSec,
    });
    log(`✓ Fetched ${events.length} candidate events from relays`);

    // 4. Validate + dedupe + insert
    const newRecords: any[] = [];
    const touchedPubkeys = new Set<string>();

    for (const ev of events) {
      try {
        if (!ev.id || !ev.pubkey || ev.pubkey.length !== 64) continue;

        const actionTag = ev.tags.find((t: string[]) => t[0] === "action");
        const action = actionTag?.[1];
        if (action !== "exit" && action !== "enter") continue;

        const eTag = ev.tags.find(
          (t: string[]) => t[0] === "e" && t[1] && t[1].length === 64,
        );
        if (!eTag) continue;
        const processEventId = eTag[1];

        // Dedupe
        const { data: existing } = await supabase
          .from("own_exit_events")
          .select("id")
          .eq("event_id", ev.id)
          .maybeSingle();
        if (existing) continue;

        // Authorize: author must be a registered main wallet
        const { data: mw } = await supabase
          .from("main_wallets")
          .select("id")
          .eq("nostr_hex_id", ev.pubkey)
          .maybeSingle();
        if (!mw) {
          log(`⚠ Skipping ${ev.id.substring(0, 12)}: pubkey not in main_wallets`);
          continue;
        }

        const { error: insErr } = await supabase
          .from("own_exit_events")
          .insert({
            event_id: ev.id,
            pubkey: ev.pubkey,
            process_event_id: processEventId,
            action,
            content: ev.content || null,
            event_created_at: new Date(ev.created_at * 1000).toISOString(),
            applied: false,
          });
        if (insErr) {
          log(`✗ Insert failed for ${ev.id.substring(0, 12)}: ${insErr.message}`);
          continue;
        }
        newRecords.push({ event_id: ev.id, pubkey: ev.pubkey });
        touchedPubkeys.add(ev.pubkey);
        log(`✓ Stored ${action} from ${ev.pubkey.substring(0, 12)}`);
      } catch (e) {
        log(`✗ Event processing error: ${(e as Error).message}`);
      }
    }

    log(`✓ ${newRecords.length} new events, ${touchedPubkeys.size} pubkeys touched`);

    // 5-8. Recompute desired state per pubkey
    const updates: { pubkey: string; shouldBeFrozen: boolean }[] = [];

    for (const pubkey of touchedPubkeys) {
      // Get latest action per process for this pubkey
      const { data: rows } = await supabase
        .from("own_exit_events")
        .select("process_event_id, action, event_created_at")
        .eq("pubkey", pubkey)
        .order("event_created_at", { ascending: false });

      const latestByProcess = new Map<string, string>();
      for (const r of rows || []) {
        if (!latestByProcess.has(r.process_event_id)) {
          latestByProcess.set(r.process_event_id, r.action);
        }
      }
      const hasActiveExit = Array.from(latestByProcess.values()).includes("exit");
      updates.push({ pubkey, shouldBeFrozen: hasActiveExit });
    }

    // Load NSEC + prepare for broadcast
    const { data: nsecSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "nostr_registrar_nsec")
      .maybeSingle();

    const privateKeyHex = nsecSetting?.value
      ? decodeNsec(nsecSetting.value)
      : null;

    const pubkeysChanged: string[] = [];

    for (const u of updates) {
      const { data: mw } = await supabase
        .from("main_wallets")
        .select("id")
        .eq("nostr_hex_id", u.pubkey)
        .maybeSingle();
      if (!mw) continue;

      const { data: wallets } = await supabase
        .from("wallets")
        .select("id, frozen, freeze_reason")
        .eq("main_wallet_id", mw.id);

      let changed = false;

      if (u.shouldBeFrozen) {
        // Freeze wallets that are not already frozen (don't override other reasons)
        const toFreeze = (wallets || []).filter((w: any) => !w.frozen);
        if (toFreeze.length > 0) {
          const { error } = await supabase
            .from("wallets")
            .update({ frozen: true, freeze_reason: FREEZE_REASON })
            .in("id", toFreeze.map((w: any) => w.id));
          if (!error) {
            changed = true;
            log(`❄ Froze ${toFreeze.length} wallets for ${u.pubkey.substring(0, 12)}`);
          }
        }
      } else {
        // Unfreeze ONLY wallets frozen with frozen_own
        const toUnfreeze = (wallets || []).filter(
          (w: any) => w.frozen && w.freeze_reason === FREEZE_REASON,
        );
        if (toUnfreeze.length > 0) {
          const { error } = await supabase
            .from("wallets")
            .update({ frozen: false, freeze_reason: "" })
            .in("id", toUnfreeze.map((w: any) => w.id));
          if (!error) {
            changed = true;
            log(`☀ Unfroze ${toUnfreeze.length} wallets for ${u.pubkey.substring(0, 12)}`);
          }
        }
      }

      if (changed) pubkeysChanged.push(u.pubkey);
    }

    // 9. Broadcast KIND 30889 for each changed pubkey
    if (pubkeysChanged.length > 0 && privateKeyHex) {
      for (const pubkey of pubkeysChanged) {
        try {
          const { data: allWallets } = await supabase
            .from("wallets")
            .select(
              "wallet_id, wallet_type, notes, amount_unregistered_lanoshi, frozen, freeze_reason, main_wallet_id",
            )
            .eq(
              "main_wallet_id",
              (
                await supabase
                  .from("main_wallets")
                  .select("id")
                  .eq("nostr_hex_id", pubkey)
                  .maybeSingle()
              ).data?.id,
            );

          const walletTags = (allWallets || []).map((w: any) => [
            "w",
            w.wallet_id || "",
            w.wallet_type,
            "LANA",
            w.notes || "",
            String(w.amount_unregistered_lanoshi || 0),
            w.frozen ? w.freeze_reason || FREEZE_REASON : "",
          ]);

          const event30889 = createSignedEvent(
            30889,
            [["d", pubkey], ["status", "active"], ...walletTags],
            "",
            privateKeyHex,
          );

          await publishWithTimeout(pool, relays, event30889, cid);
        } catch (e) {
          log(`✗ Broadcast failed for ${pubkey.substring(0, 12)}: ${(e as Error).message}`);
        }
      }
    } else if (pubkeysChanged.length > 0) {
      log("⚠ No NSEC configured, skipping KIND 30889 broadcast");
    }

    // 10. Mark applied
    if (newRecords.length > 0) {
      await supabase
        .from("own_exit_events")
        .update({ applied: true })
        .in("event_id", newRecords.map((r) => r.event_id));
    }

    await new Promise((r) => setTimeout(r, 500));
    pool.close(relays);

    log("✓ Done");
    return new Response(
      JSON.stringify({
        success: true,
        new_events: newRecords.length,
        pubkeys_changed: pubkeysChanged.length,
        steps,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    log(`✗ Fatal: ${(error as Error).message}`);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        steps,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
