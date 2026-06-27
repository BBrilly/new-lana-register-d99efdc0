import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WalletWithBalance {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
  name: string | null;
  display_name: string | null;
  balance: number;
  split_created: number | null;
  frozen?: boolean;
  freeze_reason?: string;
  main_wallet_id?: string | null;
  nostr_hex_id?: string | null;
}

export interface FxLimits {
  EUR: number;
  GBP: number;
  USD: number;
}

export const usePublicWalletBalances = (walletTypes: string[]) => {
  const [walletBalances, setWalletBalances] = useState<WalletWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'balance' | 'wallet_type'>('balance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [fxRates, setFxRates] = useState<FxLimits | null>(null);

  // Calculate how much 50 EUR/GBP/USD is in LANA
  // FX rate = how many EUR per 1 LANA, so 50 EUR / rate = LANA limit
  const lanaLimits = useMemo(() => {
    if (!fxRates) return null;
    return {
      EUR: fxRates.EUR > 0 ? 50 / fxRates.EUR : Infinity,
      GBP: fxRates.GBP > 0 ? 50 / fxRates.GBP : Infinity,
      USD: fxRates.USD > 0 ? 50 / fxRates.USD : Infinity,
    };
  }, [fxRates]);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const allWallets: any[] = [];
        const PAGE_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('wallets')
            .select(`id, wallet_id, wallet_type, split_created, frozen, freeze_reason, main_wallet_id, main_wallet:main_wallets(name, display_name, nostr_hex_id)`)
            .in('wallet_type', walletTypes)
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) throw error;
          if (!data || data.length === 0) { hasMore = false; }
          else {
            allWallets.push(...data);
            hasMore = data.length === PAGE_SIZE;
            offset += PAGE_SIZE;
          }
        }

        if (allWallets.length === 0) { setWalletBalances([]); return; }

        const walletAddresses = allWallets.filter(w => w.wallet_id).map(w => w.wallet_id as string);
        if (walletAddresses.length === 0) { setWalletBalances([]); return; }

        const { data: sysParams } = await supabase
          .from('system_parameters')
          .select('electrum, fx')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!sysParams?.electrum) { console.error('No Electrum servers'); return; }

        // Parse FX rates
        const fx = (sysParams as any).fx || {};
        setFxRates({
          EUR: fx.EUR || 0,
          GBP: fx.GBP || 0,
          USD: fx.USD || 0,
        });

        const electrumServers = (sysParams.electrum as any[]).map(s => ({
          host: s.host, port: parseInt(s.port, 10)
        }));

        // Split into smaller chunks + retry, so a single slow Electrum server
        // doesn't cause silent 0-balances for thousands of wallets.
        const CHUNK = 200;
        const MAX_ATTEMPTS = 3;
        const chunks: string[][] = [];
        for (let i = 0; i < walletAddresses.length; i += CHUNK) {
          chunks.push(walletAddresses.slice(i, i + CHUNK));
        }
        console.log(`Fetching balances in ${chunks.length} chunks of up to ${CHUNK}`);

        const balanceMap = new Map<string, number>();
        let failedAddresses = 0;

        const fetchChunk = async (chunk: string[], idx: number): Promise<any | null> => {
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              const { data, error } = await supabase.functions.invoke('fetch-wallet-balance', {
                body: { wallet_addresses: chunk, electrum_servers: electrumServers },
              });
              if (error) throw error;
              if (data?.wallets) return data;
              throw new Error('empty response');
            } catch (e) {
              console.warn(`Chunk ${idx + 1}/${chunks.length} attempt ${attempt} failed:`, e);
              if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 800 * attempt));
              }
            }
          }
          return null;
        };

        const results = await Promise.all(chunks.map((c, i) => fetchChunk(c, i)));
        results.forEach((data, i) => {
          if (data?.wallets) {
            data.wallets.forEach((w: any) => balanceMap.set(w.wallet_id, w.balance || 0));
          } else {
            failedAddresses += chunks[i].length;
          }
        });

        if (failedAddresses > 0) {
          toast.warning(
            `Balances for ${failedAddresses} wallets could not be loaded (Electrum timeout). Please refresh.`
          );
        }


        setWalletBalances(allWallets.map(wallet => ({
          id: wallet.id,
          wallet_id: wallet.wallet_id,
          wallet_type: wallet.wallet_type,
          name: (wallet.main_wallet as any)?.name || null,
          display_name: (wallet.main_wallet as any)?.display_name || null,
          balance: balanceMap.get(wallet.wallet_id || '') || 0,
          split_created: wallet.split_created ?? null,
          frozen: wallet.frozen ?? false,
          freeze_reason: wallet.freeze_reason || undefined,
          main_wallet_id: wallet.main_wallet_id ?? null,
          nostr_hex_id: (wallet.main_wallet as any)?.nostr_hex_id ?? null,
        })));
      } catch (err) {
        console.error('Error loading wallets:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [walletTypes.join(',')]);

  const sortWallets = (wallets: WalletWithBalance[]) => {
    return [...wallets].sort((a, b) => {
      if (sortField === 'balance') {
        return sortDirection === 'desc' ? b.balance - a.balance : a.balance - b.balance;
      } else if (sortField === 'wallet_type') {
        return sortDirection === 'desc'
          ? b.wallet_type.toLowerCase().localeCompare(a.wallet_type.toLowerCase())
          : a.wallet_type.toLowerCase().localeCompare(b.wallet_type.toLowerCase());
      } else {
        const nameA = (a.display_name || a.name || '').toLowerCase();
        const nameB = (b.display_name || b.name || '').toLowerCase();
        return sortDirection === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      }
    });
  };

  const toggleSort = (field: 'name' | 'balance' | 'wallet_type') => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const copyWalletId = (walletId: string) => {
    navigator.clipboard.writeText(walletId);
    setCopiedId(walletId);
    toast.success('Wallet ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalBalance = useMemo(() => walletBalances.reduce((s, w) => s + w.balance, 0), [walletBalances]);
  const sorted = useMemo(() => sortWallets(walletBalances), [walletBalances, sortField, sortDirection]);

  return { walletBalances, sorted, totalBalance, isLoading, copiedId, sortField, sortDirection, toggleSort, copyWalletId, fxRates, lanaLimits };
};
