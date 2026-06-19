import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UnregisteredLanaRow {
  id: string;
  wallet_id: string | null;
  unregistered_amount: number;
  detected_at: string;
  notes: string | null;
  nostr_87003_event_id: string | null;
  nostr_87003_published: boolean;
  wallet_address: string | null;
  wallet_type: string | null;
  frozen: boolean;
  freeze_reason: string | null;
}

export type SortField = "detected_at" | "unregistered_amount";

interface Options {
  requireOverLimit?: boolean;
}

export const useUnregisteredLanaEvents = (published: boolean, options: Options = {}) => {
  const { requireOverLimit = false } = options;
  const [rows, setRows] = useState<UnregisteredLanaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [limit, setLimit] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("detected_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        // Load freeze limit from system_parameters
        const { data: sp } = await supabase
          .from("system_parameters")
          .select("freeze_lana_account_above")
          .limit(1)
          .maybeSingle();
        const parsedLimit = sp?.freeze_lana_account_above != null
          ? parseFloat(String(sp.freeze_lana_account_above))
          : null;
        if (!cancelled) setLimit(Number.isFinite(parsedLimit as number) ? (parsedLimit as number) : null);

        const all: any[] = [];
        const PAGE = 1000;
        let offset = 0;
        let more = true;
        while (more) {
          const { data, error } = await supabase
            .from("unregistered_lana_events")
            .select(
              `id, wallet_id, unregistered_amount, detected_at, notes, nostr_87003_event_id, nostr_87003_published,
               wallet:wallets(wallet_id, wallet_type, frozen, freeze_reason)`
            )
            .eq("nostr_87003_published", published)
            .order("detected_at", { ascending: false })
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) { more = false; break; }
          all.push(...data);
          more = data.length === PAGE;
          offset += PAGE;
        }
        if (cancelled) return;
        setRows(
          all.map((r: any) => ({
            id: r.id,
            wallet_id: r.wallet_id,
            unregistered_amount: Number(r.unregistered_amount) || 0,
            detected_at: r.detected_at,
            notes: r.notes,
            nostr_87003_event_id: r.nostr_87003_event_id,
            nostr_87003_published: r.nostr_87003_published,
            wallet_address: r.wallet?.wallet_id ?? null,
            wallet_type: r.wallet?.wallet_type ?? null,
            frozen: r.wallet?.frozen ?? false,
            freeze_reason: r.wallet?.freeze_reason ?? null,
          }))
        );
      } catch (e) {
        console.error("Error loading unregistered_lana_events:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [published]);

  const filtered = useMemo(() => {
    if (!requireOverLimit || limit == null) return rows;
    return rows.filter(r => r.unregistered_amount >= limit);
  }, [rows, requireOverLimit, limit]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDirection === "desc" ? -1 : 1;
      if (sortField === "unregistered_amount") {
        return (a.unregistered_amount - b.unregistered_amount) * dir;
      }
      return (new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()) * dir;
    });
    return arr;
  }, [filtered, sortField, sortDirection]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDirection(d => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDirection("desc"); }
  };

  const totalLana = useMemo(
    () => filtered.reduce((s, r) => s + r.unregistered_amount, 0),
    [filtered]
  );

  return { rows: sorted, isLoading, sortField, sortDirection, toggleSort, totalLana, count: filtered.length, limit };
};
