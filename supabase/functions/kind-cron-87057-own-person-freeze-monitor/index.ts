// KIND 87057 — OWN ▲ Person Freeze / Unfreeze monitor
// Reads relays, verifies facilitator authority (fail-closed), stores notices,
// applies wallet freeze/unfreeze and propagates KIND 87010 + KIND 30889.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SimplePool, finalizeEvent } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";
import { publish87010, getLastFrozenAt } from "../_shared/publish87010.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREEZE_REASON = "frozen_own_person";

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function createSignedEvent(kind: number, tags: string[][], content: string, privateKeyHex: string) {
  const bytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  return finalizeEvent({ kind, tags, content, created_at: Math.floor(Date.now() / 1000) }, bytes);
}

async function publishWithTimeout(pool: SimplePool, relays: string[], event: any, cid: string) {
  const promises = pool.publish(relays, event);
  let accepted = 0;
  const overall = new Promise<void>((resolve) => setTimeout(resolve, 30000));
  await Promise.race([
    Promise.all(
      promises.map((p: Promise<string>) =>
        Promise.race([
          p.then(() => { accepted++; }).catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ])
      ),
    ),
    overall,
  ]);
  console.log(`[${cid}] KIND ${event.kind} ${event.id.substring(0, 12)}: ${accepted}/${relays.length} accepted`);
  return accepted;
}

const isHex64 = (s?: string) => !!s && /^[0-9a-f]{64}$/i.test(s);

/** Builds the verified facilitator allow-list for a case root (fail-closed). */
async function resolveFacilitators(
  pool: SimplePool,
  relays: string[],
  caseRoot: string,
  cache: Map<string, Set<string>>,
): Promise<Set<string>> {
  if (cache.has(caseRoot)) return cache.get(caseRoot)!;
  const allow = new Set<string>();
  try {
    // 1. Case start event (KIND 87044) — anchors authority
    const rootEvents = await pool.querySync(relays, { ids: [caseRoot], kinds: [87044] });
    const rootAuthor = rootEvents[0]?.pubkey?.toLowerCase();
    if (!rootAuthor) {
      cache.set(caseRoot, allow);
      return allow;
    }

    // 2. KIND 37044 records at d = own:<case_root>
    const records = await pool.querySync(relays, {
      kinds: [37044],
      "#d": [`own:${caseRoot}`],
    });

    // Only records authored by the case-root author, or by someone the chain
    // of authority already handed over to.
    const authorized = new Set<string>([rootAuthor]);
    const sorted = [...records].sort((a: any, b: any) => a.created_at - b.created_at);
    for (const rec of sorted) {
      if (!authorized.has((rec.pubkey || "").toLowerCase())) continue;
      const facilitators: string[] = [];
      for (const t of rec.tags || []) {
        if (t[0] !== "p" || !isHex64(t[1])) continue;
        const marker = (t[3] || t[2] || "").toLowerCase();
        if (marker === "facilitator") facilitators.push(t[1].toLowerCase());
      }
      if (facilitators.length > 0) {
        allow.clear();
        for (const f of facilitators) {
          allow.add(f);
          authorized.add(f); // handover: successors may publish the next record
        }
      }
    }
  } catch (e) {
    console.error("facilitator resolution failed:", (e as Error).message);
  }
  cache.set(caseRoot, allow);
  return allow;
}

Deno.serve(async (req) => {
  const cid = crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const steps: string[] = [];
  const log = (m: string) => { console.log(`[${cid}] ${m}`); steps.push(m); };

  let pool: SimplePool | null = null;
  let relays: string[] = [];

  try {
    log("▶ Starting KIND 87057 OWN person freeze monitor");

    // 1. Relays + current SPLIT
    const { data: sysParams } = await supabase
      .from("system_parameters")
      .select("relays, split")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    relays = ((sysParams?.relays as any[]) || [])
      .map((r: any) => (typeof r === "string" ? r : r.url))
      .filter(Boolean);

    const currentSplit = parseInt(String(sysParams?.split ?? "0"), 10) || 0;

    if (relays.length === 0) {
      log("✗ No relays configured");
      return new Response(JSON.stringify({ success: false, error: "No relays", steps }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    log(`✓ ${relays.length} relays, current SPLIT = ${currentSplit}`);

    // 2. since
    const { data: lastEvent } = await supabase
      .from("own_person_freeze_events")
      .select("event_created_at")
      .order("event_created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sinceSec = lastEvent?.event_created_at
      ? Math.floor(new Date(lastEvent.event_created_at).getTime() / 1000) - 600
      : Math.floor(Date.now() / 1000) - 86400;
    log(`✓ Querying since ${new Date(sinceSec * 1000).toISOString()}`);

    // 3. Fetch notices
    pool = new SimplePool();
    const events = await pool.querySync(relays, { kinds: [87057], since: sinceSec });
    log(`✓ Fetched ${events.length} candidate events`);

    // 4-6. Validate, verify authority, store
    const facilitatorCache = new Map<string, Set<string>>();
    const touchedPersons = new Set<string>();
    const storedEventIds: string[] = [];

    for (const ev of events) {
      try {
        if (!isHex64(ev.id) || !isHex64(ev.pubkey)) continue;

        const status = ev.tags.find((t: string[]) => t[0] === "status")?.[1];
        if (status !== "frozen" && status !== "live") continue;

        // exactly one frozen-marked p tag
        const frozenTags = (ev.tags as string[][]).filter(
          (t) => t[0] === "p" && isHex64(t[1]) && (t[3] || t[2] || "").toLowerCase() === "frozen",
        );
        if (frozenTags.length !== 1) {
          log(`⚠ ${ev.id.substring(0, 12)}: ${frozenTags.length} frozen p-tags — rejected`);
          continue;
        }
        const person = frozenTags[0][1].toLowerCase();

        // process reference (marker process | root, marker alone must not reject)
        const eTags = (ev.tags as string[][]).filter((t) => t[0] === "e" && isHex64(t[1]));
        if (eTags.length === 0) continue;
        const marked = eTags.find((t) => ["process", "root"].includes((t[3] || "").toLowerCase()));
        const caseRoot = (marked || eTags[0])[1].toLowerCase();

        const effAt = parseInt(ev.tags.find((t: string[]) => t[0] === "effective_at")?.[1] || "", 10);
        if (!Number.isFinite(effAt) || effAt <= 0) {
          log(`⚠ ${ev.id.substring(0, 12)}: missing effective_at — rejected`);
          continue;
        }

        const content = (ev.content || "").trim();
        if (status === "frozen" && content.length === 0) {
          log(`⚠ ${ev.id.substring(0, 12)}: empty content on freeze — rejected`);
          continue;
        }

        // Dedupe
        const { data: existing } = await supabase
          .from("own_person_freeze_events")
          .select("id")
          .eq("event_id", ev.id)
          .maybeSingle();
        if (existing) continue;

        // Authority — fail closed
        const allow = await resolveFacilitators(pool, relays, caseRoot, facilitatorCache);
        if (!allow.has(ev.pubkey.toLowerCase())) {
          log(`⚠ ${ev.id.substring(0, 12)}: author not a verified facilitator — discarded`);
          continue;
        }

        const untilSplitRaw = ev.tags.find((t: string[]) => t[0] === "until_split")?.[1];
        const untilSplit = untilSplitRaw !== undefined ? parseInt(untilSplitRaw, 10) : NaN;
        const frozenAtRaw = ev.tags.find((t: string[]) => t[0] === "frozen_at")?.[1];
        const frozenAt = frozenAtRaw ? parseInt(frozenAtRaw, 10) : NaN;

        const { error: insErr } = await supabase.from("own_person_freeze_events").insert({
          event_id: ev.id,
          facilitator_pubkey: ev.pubkey.toLowerCase(),
          frozen_person_hex: person,
          process_event_id: caseRoot,
          status,
          content: content || null,
          effective_at: new Date(effAt * 1000).toISOString(),
          frozen_at: Number.isFinite(frozenAt) ? new Date(frozenAt * 1000).toISOString() : null,
          until_split: Number.isFinite(untilSplit) ? untilSplit : null,
          split_at_event: currentSplit,
          event_created_at: new Date(ev.created_at * 1000).toISOString(),
          applied: false,
        });
        if (insErr) {
          log(`✗ Insert failed ${ev.id.substring(0, 12)}: ${insErr.message}`);
          continue;
        }
        storedEventIds.push(ev.id);
        touchedPersons.add(person);
        log(`✓ Stored ${status} for ${person.substring(0, 12)} by ${ev.pubkey.substring(0, 12)}`);
      } catch (e) {
        log(`✗ Event error: ${(e as Error).message}`);
      }
    }

    // SPLIT lapse re-check: also revisit anyone currently frozen by this process
    const { data: lapsing } = await supabase
      .from("wallets")
      .select("id, main_wallet_id, freeze_until_split")
      .eq("frozen", true)
      .eq("freeze_reason", FREEZE_REASON)
      .not("freeze_until_split", "is", null)
      .lt("freeze_until_split", currentSplit);

    if (lapsing && lapsing.length > 0) {
      const mainIds = Array.from(new Set(lapsing.map((w: any) => w.main_wallet_id)));
      const { data: mws } = await supabase
        .from("main_wallets")
        .select("nostr_hex_id")
        .in("id", mainIds);
      for (const mw of mws || []) {
        if (mw.nostr_hex_id) touchedPersons.add(mw.nostr_hex_id.toLowerCase());
      }
      log(`⏳ ${lapsing.length} wallet(s) past their until_split — re-evaluating`);
    }

    log(`✓ ${storedEventIds.length} new notices, ${touchedPersons.size} persons touched`);

    // 7. Desired state per person (ANY-OF across current facilitators)
    const personsChanged: string[] = [];

    for (const person of touchedPersons) {
      const { data: rows } = await supabase
        .from("own_person_freeze_events")
        .select("facilitator_pubkey, process_event_id, status, until_split, content, event_created_at")
        .eq("frozen_person_hex", person)
        .order("event_created_at", { ascending: false });

      const latest = new Map<string, any>();
      for (const r of rows || []) {
        const key = `${r.process_event_id}:${r.facilitator_pubkey}`;
        if (!latest.has(key)) latest.set(key, r);
      }

      let shouldBeFrozen = false;
      let activeUntilSplit: number | null = null;
      let activeDetails = "";
      for (const r of latest.values()) {
        if (r.status !== "frozen") continue;
        if (r.until_split !== null && r.until_split !== undefined && r.until_split < currentSplit) {
          continue; // lapsed by SPLIT
        }
        shouldBeFrozen = true;
        if (r.until_split === null || r.until_split === undefined) {
          activeUntilSplit = null;
        } else if (activeUntilSplit !== null) {
          activeUntilSplit = Math.max(activeUntilSplit, r.until_split);
        }
        if (!activeDetails && r.content) activeDetails = r.content;
      }
      // open-ended freeze wins over bounded one
      if (shouldBeFrozen && Array.from(latest.values()).some(
        (r) => r.status === "frozen" && (r.until_split === null || r.until_split === undefined),
      )) {
        activeUntilSplit = null;
      }

      const { data: mw } = await supabase
        .from("main_wallets")
        .select("id")
        .eq("nostr_hex_id", person)
        .maybeSingle();
      if (!mw) {
        log(`⚠ ${person.substring(0, 12)} has no registered main wallet — notice stored only`);
        continue;
      }

      const { data: wallets } = await supabase
        .from("wallets")
        .select("id, wallet_id, frozen, freeze_reason, freeze_until_split, updated_at")
        .eq("main_wallet_id", mw.id);

      let changed = false;
      let transitioned: any[] = [];

      if (shouldBeFrozen) {
        const toFreeze = (wallets || []).filter((w: any) => !w.frozen);
        if (toFreeze.length > 0) {
          const { error } = await supabase
            .from("wallets")
            .update({
              frozen: true,
              freeze_reason: FREEZE_REASON,
              freeze_split: currentSplit,
              freeze_until_split: activeUntilSplit,
              freeze_reason_details: activeDetails || "",
            })
            .in("id", toFreeze.map((w: any) => w.id));
          if (!error) {
            changed = true;
            transitioned = toFreeze;
            log(`❄ Froze ${toFreeze.length} wallets for ${person.substring(0, 12)}`);
          }
        } else {
          // keep SPLIT bounds / details fresh on already-frozen own-person wallets
          const own = (wallets || []).filter((w: any) => w.freeze_reason === FREEZE_REASON);
          if (own.length > 0) {
            await supabase
              .from("wallets")
              .update({
                freeze_until_split: activeUntilSplit,
                freeze_reason_details: activeDetails || "",
              })
              .in("id", own.map((w: any) => w.id));
          }
        }
      } else {
        const toUnfreeze = (wallets || []).filter(
          (w: any) => w.frozen && w.freeze_reason === FREEZE_REASON,
        );
        if (toUnfreeze.length > 0) {
          const { error } = await supabase
            .from("wallets")
            .update({
              frozen: false,
              freeze_reason: "",
              freeze_split: null,
              freeze_until_split: null,
              freeze_reason_details: "",
            })
            .in("id", toUnfreeze.map((w: any) => w.id));
          if (!error) {
            changed = true;
            transitioned = toUnfreeze;
            log(`☀ Unfroze ${toUnfreeze.length} wallets for ${person.substring(0, 12)}`);
          }
        }
      }

      // 9. KIND 87010 — one append-only event per wallet transition
      if (changed && transitioned.length > 0) {
        try {
          const effectiveAt = new Date();
          const entries: any[] = [];
          for (const w of transitioned) {
            if (!w.wallet_id) continue;
            entries.push({
              wallet_uuid: w.id,
              wallet_address: w.wallet_id,
              nostr_hex_id: person,
              status: shouldBeFrozen ? "frozen" : "unfrozen",
              reason: FREEZE_REASON,
              effective_at: effectiveAt,
              frozen_at: shouldBeFrozen
                ? null
                : await getLastFrozenAt(supabase, w.id, w.updated_at),
              split: currentSplit,
              until_split: shouldBeFrozen ? activeUntilSplit : null,
              reason_details: shouldBeFrozen ? activeDetails : "",
              memo: shouldBeFrozen
                ? "OWN person freeze (KIND 87057)."
                : "OWN person freeze lifted (KIND 87057 / SPLIT lapse).",
            });
          }
          if (entries.length > 0) {
            const res = await publish87010(supabase, entries, cid);
            log(`KIND 87010: published ${res.published}/${res.total}`);
          }
        } catch (e) {
          log(`✗ KIND 87010 failed: ${(e as Error).message}`);
        }
      }

      if (changed) personsChanged.push(person);
    }

    // 10. KIND 30889 refresh per changed person
    const { data: nsecSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "nostr_registrar_nsec")
      .maybeSingle();
    const privateKeyHex = nsecSetting?.value ? decodeNsec(nsecSetting.value) : null;

    if (personsChanged.length > 0 && privateKeyHex) {
      for (const person of personsChanged) {
        try {
          const { data: mw } = await supabase
            .from("main_wallets")
            .select("id")
            .eq("nostr_hex_id", person)
            .maybeSingle();
          if (!mw) continue;

          const { data: allWallets } = await supabase
            .from("wallets")
            .select("wallet_id, wallet_type, notes, amount_unregistered_lanoshi, frozen, freeze_reason")
            .eq("main_wallet_id", mw.id);

          const walletTags = (allWallets || []).map((w: any) => [
            "w",
            w.wallet_id || "",
            w.wallet_type,
            "LANA",
            w.notes || "",
            String(w.amount_unregistered_lanoshi || 0),
            w.frozen ? (w.freeze_reason || FREEZE_REASON) : "",
          ]);

          const event30889 = createSignedEvent(
            30889,
            [["d", person], ["status", "active"], ...walletTags],
            "",
            privateKeyHex,
          );
          await publishWithTimeout(pool, relays, event30889, cid);
        } catch (e) {
          log(`✗ 30889 broadcast failed for ${person.substring(0, 12)}: ${(e as Error).message}`);
        }
      }
    } else if (personsChanged.length > 0) {
      log("⚠ No NSEC configured, skipping KIND 30889 broadcast");
    }

    // 11. Mark applied
    if (storedEventIds.length > 0) {
      await supabase
        .from("own_person_freeze_events")
        .update({ applied: true })
        .in("event_id", storedEventIds);
    }

    await new Promise((r) => setTimeout(r, 500));
    pool.close(relays);
    pool = null;

    log("✓ Done");
    return new Response(
      JSON.stringify({
        success: true,
        new_events: storedEventIds.length,
        persons_changed: personsChanged.length,
        current_split: currentSplit,
        steps,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    try { if (pool) pool.close(relays); } catch { /* ignore */ }
    log(`✗ Fatal: ${(error as Error).message}`);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, steps }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
