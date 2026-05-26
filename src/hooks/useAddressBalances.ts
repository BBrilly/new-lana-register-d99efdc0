import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches LANA balances for an arbitrary list of wallet addresses via the
 * fetch-wallet-balance edge function. Returns a Map<address, balance>.
 */
export const useAddressBalances = (addresses: (string | null | undefined)[], keyScope: string) => {
  const cleanAddresses = Array.from(
    new Set((addresses || []).filter((a): a is string => !!a))
  );

  return useQuery({
    queryKey: ["address-balances", keyScope, cleanAddresses.length, cleanAddresses.slice(0, 5).join(",")],
    enabled: cleanAddresses.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
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

      const BATCH = 50;
      const map = new Map<string, number>();
      for (let i = 0; i < cleanAddresses.length; i += BATCH) {
        const batch = cleanAddresses.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("fetch-wallet-balance", {
          body: { wallet_addresses: batch, electrum_servers: electrumServers },
        });
        if (error) {
          console.error("[useAddressBalances] batch error", error);
          continue;
        }
        if (data?.wallets) {
          for (const w of data.wallets as any[]) {
            map.set(w.wallet_id, w.balance || 0);
          }
        }
      }
      return map;
    },
  });
};
