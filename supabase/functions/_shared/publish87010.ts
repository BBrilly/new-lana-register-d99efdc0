// Shared helper: publish KIND 87010 (Frozen Wallets – freeze/unfreeze announcement)
// Spec: https://lananostr.site/registrar  (append-only audit trail, one event per wallet)
import { SimplePool, finalizeEvent, getPublicKey } from "https://esm.sh/nostr-tools@2.7.0";
import { decode as nip19decode } from "https://esm.sh/nostr-tools@2.7.0/nip19";

export type FreezeStatus = "frozen" | "unfrozen";

// Spec vocabulary: frozen_l8w | frozen_max_cap | frozen_too_wild
export function mapReasonToSpec(reason?: string | null): string {
  const r = (reason || "").trim();
  switch (r) {
    case "frozen_l8w":
    case "frozen_max_cap":
    case "frozen_too_wild":
      return r;
    case "frozen_unreg_Lanas":
    case "frozen_own":
    case "frozen_own_threatening":
    case "frozen_own_public_attack":
    case "frozen_own_no_responsibility":
      return "frozen_too_wild";
    default:
      return r === "" ? "frozen_l8w" : "frozen_l8w";
  }
}

function decodeNsec(nsec: string): string {
  const { type, data } = nip19decode(nsec);
  if (type !== "nsec") throw new Error("Expected nsec key");
  return Array.from(data as Uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sign(kind: number, tags: string[][], content: string, privateKeyHex: string) {
  const bytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  return finalizeEvent({ kind, tags, content, created_at: Math.floor(Date.now() / 1000) }, bytes);
}

async function publishWithTimeout(pool: SimplePool, relays: string[], event: any, cid: string) {
  let accepted = 0;
  const promises = pool.publish(relays, event);
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
  console.log(`[${cid}] KIND 87010 ${event.id.substring(0, 12)}: ${accepted}/${relays.length} accepted`);
  return accepted;
}

export interface Publish87010Entry {
  wallet_uuid?: string | null;
  wallet_address: string;
  nostr_hex_id: string;
  status: FreezeStatus;
  reason: string; // raw DB reason (mapped to spec inside)
  amount_lanoshis?: number; // resolved automatically when omitted
  effective_at?: Date;
  frozen_at?: Date | null; // only for unfrozen
  memo?: string;
  split?: number | null; // SPLIT round in which the freeze happened
  until_split?: number | null; // SPLIT round through which the freeze holds
  reason_details?: string | null; // free-text explanation
}

/** Fetch balances (in LANA) for a list of addresses via the fetch-wallet-balance edge function. */
export async function fetchBalancesLana(
  supabase: any,
  addresses: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (addresses.length === 0) return map;
  try {
    const { data: sysParams } = await supabase
      .from("system_parameters")
      .select("electrum")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const electrumServers = ((sysParams?.electrum as any[]) || []).map((s: any) => ({
      host: s.host,
      port: parseInt(s.port, 10),
    }));
    if (electrumServers.length === 0) return map;

    const CHUNK = 200;
    for (let i = 0; i < addresses.length; i += CHUNK) {
      const chunk = addresses.slice(i, i + CHUNK);
      const { data, error } = await supabase.functions.invoke("fetch-wallet-balance", {
        body: { wallet_addresses: chunk, electrum_servers: electrumServers },
      });
      if (error) {
        console.error("87010 balance fetch error:", error);
        continue;
      }
      for (const w of data?.wallets || []) {
        map.set(w.wallet_id, w.balance || 0);
      }
    }
  } catch (e) {
    console.error("87010 balance fetch exception:", (e as Error).message);
  }
  return map;
}

/**
 * Publishes one KIND 87010 event per entry and records each in wallet_freeze_events.
 * Never throws — failures are logged so the freeze/unfreeze itself is unaffected.
 */
export async function publish87010(
  supabase: any,
  entries: Publish87010Entry[],
  cid: string,
): Promise<{ published: number; total: number }> {
  const valid = entries.filter((e) => e.wallet_address && e.nostr_hex_id);
  if (valid.length === 0) return { published: 0, total: 0 };

  let pool: SimplePool | null = null;
  let relays: string[] = [];
  let privateKeyHex: string | null = null;
  let registrarPubkey = "";

  try {
    const { data: nsecSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "nostr_registrar_nsec")
      .maybeSingle();

    if (nsecSetting?.value) {
      privateKeyHex = decodeNsec(nsecSetting.value);
      registrarPubkey = getPublicKey(
        new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))),
      );
    }

    const { data: sysParams } = await supabase
      .from("system_parameters")
      .select("relays")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    relays = ((sysParams?.relays as any[]) || []).map((r: any) => (typeof r === "string" ? r : r.url)).filter(Boolean);

    if (privateKeyHex && relays.length > 0) pool = new SimplePool();
  } catch (e) {
    console.error(`[${cid}] 87010 setup error:`, (e as Error).message);
  }

  // Resolve missing balances
  const needBalance = valid.filter((e) => e.amount_lanoshis === undefined).map((e) => e.wallet_address);
  const balances = await fetchBalancesLana(supabase, Array.from(new Set(needBalance)));

  let published = 0;
  const rows: any[] = [];

  for (const e of valid) {
    const specReason = mapReasonToSpec(e.reason);
    const effectiveAt = e.effective_at || new Date();
    const lanoshis =
      e.amount_lanoshis !== undefined
        ? Math.max(0, Math.round(e.amount_lanoshis))
        : Math.max(0, Math.round((balances.get(e.wallet_address) || 0) * 1e8));

    let eventId: string | null = null;

    if (pool && privateKeyHex) {
      try {
        const tags: string[][] = [
          ["wallet", e.wallet_address],
          ["p", e.nostr_hex_id],
          ["status", e.status],
          ["reason", specReason],
          ["amount_lanoshis", String(lanoshis)],
          ["effective_at", String(Math.floor(effectiveAt.getTime() / 1000))],
        ];
        if (e.status === "unfrozen" && e.frozen_at) {
          tags.push(["frozen_at", String(Math.floor(e.frozen_at.getTime() / 1000))]);
        }
        if (registrarPubkey) {
          tags.push(["a", `30889:${registrarPubkey}:${e.nostr_hex_id}`]);
        }
        if (e.split !== undefined && e.split !== null) tags.push(["split", String(e.split)]);
        if (e.until_split !== undefined && e.until_split !== null) {
          tags.push(["until_split", String(e.until_split)]);
        }
        if (e.memo) tags.push(["memo", e.memo]);

        const details = (e.reason_details || "").trim();
        const content =
          e.status === "frozen"
            ? `Wallet frozen: ${specReason}.${details ? ` ${details}` : ""}`
            : `Wallet unfrozen: ${specReason} lifted.${details ? ` ${details}` : ""}`;

        const event = sign(87010, tags, content, privateKeyHex);
        const accepted = await publishWithTimeout(pool, relays, event, cid);
        if (accepted > 0) {
          eventId = event.id;
          published++;
        }
      } catch (err) {
        console.error(`[${cid}] 87010 publish failed for ${e.wallet_address}:`, (err as Error).message);
      }
    }

    rows.push({
      wallet_uuid: e.wallet_uuid || null,
      wallet_address: e.wallet_address,
      nostr_hex_id: e.nostr_hex_id,
      status: e.status,
      reason: e.reason || "",
      amount_lanoshis: lanoshis,
      effective_at: effectiveAt.toISOString(),
      frozen_at: e.status === "unfrozen" && e.frozen_at ? e.frozen_at.toISOString() : null,
      nostr_event_id: eventId,
      published_at: eventId ? new Date().toISOString() : null,
      split: e.split ?? null,
      until_split: e.until_split ?? null,
      reason_details: e.reason_details || "",
    });
  }

  try {
    if (rows.length > 0) {
      const { error } = await supabase.from("wallet_freeze_events").insert(rows);
      if (error) console.error(`[${cid}] 87010 history insert error:`, error.message);
    }
  } catch (e) {
    console.error(`[${cid}] 87010 history insert exception:`, (e as Error).message);
  }

  try {
    if (pool) {
      await new Promise((r) => setTimeout(r, 500));
      pool.close(relays);
    }
  } catch { /* ignore */ }

  return { published, total: valid.length };
}

/** Looks up the most recent recorded freeze timestamp for a wallet (for frozen_at on unfreeze). */
export async function getLastFrozenAt(
  supabase: any,
  walletUuid: string,
  fallback?: string | null,
): Promise<Date | null> {
  try {
    const { data } = await supabase
      .from("wallet_freeze_events")
      .select("effective_at")
      .eq("wallet_uuid", walletUuid)
      .eq("status", "frozen")
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.effective_at) return new Date(data.effective_at);
  } catch { /* ignore */ }
  return fallback ? new Date(fallback) : null;
}
