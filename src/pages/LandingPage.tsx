import { Shield, TrendingUp, Calendar, Coins, Database, Activity, Lock, Wifi, AlertTriangle, Wallet, Copy, ArrowUpDown, ArrowUp, ArrowDown, Check, RefreshCw, ExternalLink, ChevronDown, ChevronUp, Menu, Snowflake, BarChart3, Globe } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import React, { useEffect, useState, useMemo } from "react";
import { NostrClient, SystemParameters, RelayStatus, getStoredParameters, getStoredRelayStatuses } from "@/utils/nostrClient";
import NostrStatusDialog from "@/components/NostrStatusDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import BlockDetailDialog from "@/components/BlockDetailDialog";
import PublicLinksSidebar from "@/components/PublicLinksSidebar";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAllNostrEvents, latoshisToLana, clearAllNostrEventsCache, CombinedEvent } from "@/hooks/useAllNostrEvents";
interface WalletWithBalance {
  id: string;
  wallet_id: string | null;
  wallet_type: string;
  name: string | null;
  display_name: string | null;
  balance: number;
  freeze_reason?: string;
  split_created?: number | null;
  frozen?: boolean;
}

const FREEZE_LABELS: Record<string, string> = {
  frozen_l8w: "Late Registration",
  frozen_max_cap: "Max Cap Exceeded",
  frozen_too_wild: "Suspicious Activity",
  frozen_unreg_Lanas: "Unreg. Lanas Exceeded",
};

const LandingPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [systemParams, setSystemParams] = useState<SystemParameters | null>(null);
  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [stats, setStats] = useState({
    registeredWallets: 0,
    todayTransactions: 0,
    yesterdayTransactions: 0,
    totalMonitoredTransactions: 0,
  });
  const [recentBlocks, setRecentBlocks] = useState<any[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const BLOCKS_PER_PAGE = 50;
  
  // Unregistered Lanas from Nostr relays
  const { events: nostrEvents, isLoading: nostrEventsLoading, error: nostrEventsError } = useAllNostrEvents();
  const [unregisteredPage, setUnregisteredPage] = useState(1);
  const EVENTS_PER_PAGE = 50;
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [eventNotes, setEventNotes] = useState<Record<string, string | null>>({});
  const [deletedWalletIds, setDeletedWalletIds] = useState<Set<string>>(new Set());
  const [existingWalletIds, setExistingWalletIds] = useState<Set<string>>(new Set());

  // Registered Lana Events (Knights transactions) state
  const [registeredEvents, setRegisteredEvents] = useState<any[]>([]);
  const [registeredEventsLoading, setRegisteredEventsLoading] = useState(false);
  const [currentSplit, setCurrentSplit] = useState<number | null>(null);

  // Outgoing TX state (registered -> unregistered)
  const [outgoingTx, setOutgoingTx] = useState<any[]>([]);
  const [outgoingTxLoading, setOutgoingTxLoading] = useState(false);

  // Wallet balances state
  const [walletBalances, setWalletBalances] = useState<WalletWithBalance[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [sortField, setSortField] = useState<'name' | 'balance' | 'wallet_type'>('balance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fxRatesWallets, setFxRatesWallets] = useState<{ EUR: number; GBP: number; USD: number } | null>(null);

  // Balance history state
  const [balanceSnapshots, setBalanceSnapshots] = useState<any[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);

  // Calculate 50 EUR/GBP/USD limit in LANA
  const lanaLimits = useMemo(() => {
    if (!fxRatesWallets) return null;
    return {
      EUR: fxRatesWallets.EUR > 0 ? 50 / fxRatesWallets.EUR : Infinity,
      GBP: fxRatesWallets.GBP > 0 ? 50 / fxRatesWallets.GBP : Infinity,
      USD: fxRatesWallets.USD > 0 ? 50 / fxRatesWallets.USD : Infinity,
    };
  }, [fxRatesWallets]);

  useEffect(() => {
    const loadSystemParameters = async () => {
      // First check session storage
      const stored = getStoredParameters();
      const storedStatuses = getStoredRelayStatuses();
      
      if (stored) {
        setSystemParams(stored);
        setRelayStatuses(storedStatuses);
        setIsLoading(false);
      }

      // Fetch fresh data from Nostr
      const client = new NostrClient();
      try {
        const { parameters, relayStatuses } = await client.fetchSystemParameters();
        if (parameters) {
          setSystemParams(parameters);
          setRelayStatuses(relayStatuses);
        }
      } catch (error) {
        console.error('Error loading system parameters:', error);
      } finally {
        setIsLoading(false);
        client.disconnect();
      }
    };

    loadSystemParameters();
  }, []);

  // Fetch deleted wallet IDs for cross-referencing
  // A wallet is considered "deleted" if it's in deleted_wallets OR if it no longer exists in wallets table
  useEffect(() => {
    const loadDeletedWallets = async () => {
      // Fetch explicitly deleted wallets
      const { data: deletedData } = await supabase.from('deleted_wallets').select('wallet_id');
      const explicitlyDeleted = new Set(deletedData?.map(dw => dw.wallet_id).filter(Boolean) as string[] || []);

      // Fetch all existing wallet addresses to detect implicitly deleted ones
      const allExisting = new Set<string>();
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase.from('wallets').select('wallet_id').range(offset, offset + PAGE_SIZE - 1);
        if (!data || data.length === 0) { hasMore = false; }
        else {
          data.forEach(w => { if (w.wallet_id) allExisting.add(w.wallet_id); });
          hasMore = data.length === PAGE_SIZE;
          offset += PAGE_SIZE;
        }
      }

      // We'll store existing wallet IDs so we can check if an event's wallet is missing
      setExistingWalletIds(allExisting);
      setDeletedWalletIds(explicitlyDeleted);
    };
    loadDeletedWallets();
  }, []);

  useEffect(() => {
    const loadBlockchainData = async () => {
      try {
        // Fetch registered wallets count
        const { count: walletsCount } = await supabase
          .from('wallets')
          .select('*', { count: 'exact', head: true });

        // Fetch transactions for today and yesterday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const twoDaysAgo = new Date(yesterday);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);

        const { data: todayTx } = await supabase
          .from('transactions')
          .select('id')
          .gte('created_at', today.toISOString());

        const { data: yesterdayTx } = await supabase
          .from('transactions')
          .select('id')
          .gte('created_at', yesterday.toISOString())
          .lt('created_at', today.toISOString());

        // Fetch only transactions between DIFFERENT registered wallets (excluding self-transfers/staking)
        const { data: monitoredTransactions } = await supabase
          .from('transactions')
          .select('amount, from_wallet_id, to_wallet_id')
          .not('from_wallet_id', 'is', null)
          .not('to_wallet_id', 'is', null);

        // Filter out self-transfers (where from_wallet_id equals to_wallet_id)
        const totalMonitoredAmount = monitoredTransactions
          ?.filter(tx => tx.from_wallet_id !== tx.to_wallet_id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;

        setStats({
          registeredWallets: walletsCount || 0,
          todayTransactions: todayTx?.length || 0,
          yesterdayTransactions: yesterdayTx?.length || 0,
          totalMonitoredTransactions: totalMonitoredAmount,
        });

        // Get total block count
        const { count } = await supabase
          .from('block_tx')
          .select('*', { count: 'exact', head: true });
        
        setTotalBlocks(count || 0);

        // Fetch recent blocks with pagination
        const from = (currentPage - 1) * BLOCKS_PER_PAGE;
        const to = from + BLOCKS_PER_PAGE - 1;
        
        const { data: blocks } = await supabase
          .from('block_tx')
          .select('*')
          .order('block_id', { ascending: false })
          .range(from, to);

        if (blocks) {
          const formattedBlocks = blocks.map(block => {
            const coverage = block.all_block_transactions > 0
              ? Math.round((block.transaction_including_registered_wallets / block.all_block_transactions) * 100)
              : 0;

            return {
              id: `#${block.block_id}`,
              stakedTime: new Date(block.time_staked).toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              auditTime: formatDistanceToNow(new Date(block.time_audit), { addSuffix: true }),
              totalTx: block.all_block_transactions,
              registeredTx: block.transaction_including_registered_wallets,
              coverage: coverage,
            };
          });

          setRecentBlocks(formattedBlocks);
        }
      } catch (error) {
        console.error('Error loading blockchain data:', error);
      }
    };

    loadBlockchainData();
  }, [currentPage]);

  // Paginate nostr events
  const paginatedNostrEvents = useMemo(() => {
    const from = (unregisteredPage - 1) * EVENTS_PER_PAGE;
    const to = from + EVENTS_PER_PAGE;
    return nostrEvents.slice(from, to);
  }, [nostrEvents, unregisteredPage]);

  const totalUnregistered = nostrEvents.length;
  const totalUnregisteredPages = Math.ceil(totalUnregistered / EVENTS_PER_PAGE);

  const handleRefreshNostrEvents = () => {
    clearAllNostrEventsCache();
    window.location.reload();
  };

  // Fetch notes from database when expanding an event
  const handleExpandEvent = async (eventId: string, nostrEventId: string) => {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    
    setExpandedEventId(eventId);
    
    // Check if we already have notes for this event
    if (eventNotes[eventId] !== undefined) return;
    
    try {
      const { data } = await supabase
        .from('unregistered_lana_events')
        .select('notes')
        .eq('nostr_87003_event_id', nostrEventId)
        .maybeSingle();
      
      setEventNotes(prev => ({
        ...prev,
        [eventId]: data?.notes || null
      }));
    } catch (error) {
      console.error('Error fetching notes:', error);
      setEventNotes(prev => ({
        ...prev,
        [eventId]: null
      }));
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Load wallet balances for the third tab
  useEffect(() => {
    const loadWalletBalances = async () => {
      try {
        setWalletsLoading(true);
        
        // Robustna funkcija za pobiranje VSEH denarnic s paginacijo
        const fetchAllWallets = async () => {
          const allWallets: any[] = [];
          const PAGE_SIZE = 1000;
          let offset = 0;
          let hasMore = true;
          
          console.log('Fetching all wallets with pagination...');
          
          while (hasMore) {
            const { data: wallets, error } = await supabase
              .from('wallets')
              .select(`
                id,
                wallet_id,
                wallet_type,
                split_created,
                frozen,
                freeze_reason,
                main_wallet:main_wallets(name, display_name)
              `)
              .in('wallet_type', ['Wallet', 'Main Wallet', 'Knights', 'Lana8Wonder', 'LanaPays.Us', 'Lana.Discount'])
              .range(offset, offset + PAGE_SIZE - 1);
            
            if (error) {
              console.error(`Error fetching wallets at offset ${offset}:`, error);
              throw error;
            }
            
            if (!wallets || wallets.length === 0) {
              hasMore = false;
              console.log(`Pagination complete. No more wallets at offset ${offset}`);
            } else {
              allWallets.push(...wallets);
              console.log(`Fetched ${wallets.length} wallets (offset: ${offset}, total so far: ${allWallets.length})`);
              
              if (wallets.length < PAGE_SIZE) {
                hasMore = false;
              } else {
                offset += PAGE_SIZE;
              }
            }
          }
          
          console.log(`✅ Total wallets loaded: ${allWallets.length}`);
          return allWallets;
        };

        const wallets = await fetchAllWallets();

        if (!wallets || wallets.length === 0) {
          setWalletBalances([]);
          return;
        }

        // Get wallet addresses for balance fetch
        const walletAddresses = wallets
          .filter(w => w.wallet_id)
          .map(w => w.wallet_id as string);

        if (walletAddresses.length === 0) {
          setWalletBalances([]);
          return;
        }

        // Fetch system parameters for Electrum servers
        const { data: sysParams } = await supabase
          .from('system_parameters')
          .select('electrum, fx')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!sysParams?.electrum) {
          console.error('No Electrum servers configured');
          return;
        }

        const electrumServers = (sysParams.electrum as any[]).map(server => ({
          host: server.host,
          port: parseInt(server.port, 10)
        }));

        // Fetch balances from edge function
        const { data: balanceData, error: balanceError } = await supabase.functions.invoke(
          'fetch-wallet-balance',
          {
            body: {
              wallet_addresses: walletAddresses,
              electrum_servers: electrumServers,
            },
          }
        );

        if (balanceError) {
          console.error('Error fetching balances:', balanceError);
        }

        // Create balance map
        const balanceMap = new Map<string, number>();
        if (balanceData?.wallets) {
          balanceData.wallets.forEach((w: any) => {
            balanceMap.set(w.wallet_id, w.balance || 0);
          });
        }

        // Parse FX rates for limit calculation
        const fx = (sysParams as any).fx || {};
        setFxRatesWallets({
          EUR: fx.EUR || 0,
          GBP: fx.GBP || 0,
          USD: fx.USD || 0,
        });

        // Map wallets with balances
        const walletsWithBalances: WalletWithBalance[] = wallets.map(wallet => ({
          id: wallet.id,
          wallet_id: wallet.wallet_id,
          wallet_type: wallet.wallet_type,
          name: (wallet.main_wallet as any)?.name || null,
          display_name: (wallet.main_wallet as any)?.display_name || null,
          balance: balanceMap.get(wallet.wallet_id || '') || 0,
          split_created: (wallet as any).split_created ?? null,
          frozen: (wallet as any).frozen ?? false,
          freeze_reason: (wallet as any).freeze_reason || undefined,
        }));

        setWalletBalances(walletsWithBalances);
      } catch (error) {
        console.error('Error loading wallet balances:', error);
      } finally {
        setWalletsLoading(false);
      }
    };

    loadWalletBalances();
  }, []);

  // Load balance snapshots for history chart
  useEffect(() => {
    const loadSnapshots = async () => {
      try {
        setSnapshotsLoading(true);
        const { data } = await supabase
          .from('balance_snapshots')
          .select('*')
          .order('recorded_at', { ascending: true });
        setBalanceSnapshots(data || []);
      } catch (error) {
        console.error('Error loading balance snapshots:', error);
      } finally {
        setSnapshotsLoading(false);
      }
    };
    loadSnapshots();
  }, []);

  // Load registered lana events (Knights transactions) for current split
  useEffect(() => {
    const loadRegisteredEvents = async () => {
      try {
        setRegisteredEventsLoading(true);

        // Get current split value from system_parameters
        const { data: sysParams } = await supabase
          .from('system_parameters')
          .select('split')
          .order('fetched_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const splitValue = sysParams?.split ? parseInt(sysParams.split, 10) : null;
        setCurrentSplit(splitValue);

        if (splitValue === null) {
          setRegisteredEvents([]);
          return;
        }

        // Fetch registered_lana_events for current split
        const { data: events } = await supabase
          .from('registered_lana_events')
          .select(`
            id,
            wallet_id,
            amount,
            notes,
            detected_at,
            split,
            block_id,
            transaction_id
          `)
          .eq('split', splitValue)
          .order('detected_at', { ascending: false });

        if (events && events.length > 0) {
          // Get wallet info
          const walletIds = [...new Set(events.map(e => e.wallet_id))];
          
          const { data: wallets } = await supabase
            .from('wallets')
            .select(`
              id,
              wallet_id,
              main_wallet:main_wallets(name, display_name)
            `)
            .in('id', walletIds);

          const walletMap = new Map(wallets?.map(w => [w.id, w]) || []);

          const formattedEvents = events.map(event => {
            const wallet = walletMap.get(event.wallet_id);
            return {
              ...event,
              wallet_address: wallet?.wallet_id || null,
              wallet_name: (wallet?.main_wallet as any)?.name || null,
              wallet_display_name: (wallet?.main_wallet as any)?.display_name || null,
            };
          });

          setRegisteredEvents(formattedEvents);
        } else {
          setRegisteredEvents([]);
        }
      } catch (error) {
        console.error('Error loading registered events:', error);
      } finally {
        setRegisteredEventsLoading(false);
      }
    };

    loadRegisteredEvents();
  }, []);

  // Load outgoing transactions (registered -> unregistered)
  useEffect(() => {
    const loadOutgoingTx = async () => {
      try {
        setOutgoingTxLoading(true);

        const { data: transactions, error } = await supabase
          .from('transactions')
          .select('id, amount, block_id, notes, created_at, from_wallet_id')
          .not('from_wallet_id', 'is', null)
          .is('to_wallet_id', null)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching outgoing tx:', error);
          return;
        }

        if (!transactions || transactions.length === 0) {
          setOutgoingTx([]);
          return;
        }

        // Get sender wallet details
        const walletIds = [...new Set(transactions.map(tx => tx.from_wallet_id).filter(Boolean))];
        
        const { data: wallets } = await supabase
          .from('wallets')
          .select(`
            id,
            wallet_id,
            main_wallet:main_wallets(name, display_name)
          `)
          .in('id', walletIds);

        const walletMap = new Map(wallets?.map(w => [w.id, w]) || []);

        // Fetch deleted wallets to mark them
        const { data: deletedWallets } = await supabase
          .from('deleted_wallets')
          .select('wallet_id');

        const deletedAddressSet = new Set(
          deletedWallets?.map(dw => dw.wallet_id).filter(Boolean) || []
        );

        // Collect all parsed destination addresses
        const parsedAddresses: string[] = [];
        const txWithAddress = transactions.map(tx => {
          const toMatch = tx.notes?.match(/to\s+(L[A-Za-z0-9]+)/i);
          const toAddress = toMatch ? toMatch[1] : tx.notes || '-';
          parsedAddresses.push(toAddress);
          return { ...tx, toAddress };
        });

        // Check which destination addresses are actually registered
        const uniqueAddresses = [...new Set(parsedAddresses.filter(a => a !== '-'))];
        let registeredAddressSet = new Set<string>();
        if (uniqueAddresses.length > 0) {
          const { data: registeredWallets } = await supabase
            .from('wallets')
            .select('wallet_id')
            .in('wallet_id', uniqueAddresses);
          registeredAddressSet = new Set(
            registeredWallets?.map(w => w.wallet_id).filter(Boolean) as string[] || []
          );
        }

        // Filter out transactions where destination is actually registered
        const filtered = txWithAddress.filter(tx => !registeredAddressSet.has(tx.toAddress));

        const formatted = filtered.map(tx => {
          const wallet = walletMap.get(tx.from_wallet_id);

          return {
            ...tx,
            from_name: (wallet?.main_wallet as any)?.display_name || (wallet?.main_wallet as any)?.name || null,
            from_address: wallet?.wallet_id || null,
            to_address: tx.toAddress,
            to_was_deleted: deletedAddressSet.has(tx.toAddress),
          };
        });

        setOutgoingTx(formatted);
      } catch (error) {
        console.error('Error loading outgoing tx:', error);
      } finally {
        setOutgoingTxLoading(false);
      }
    };

    loadOutgoingTx();
  }, []);

  // Filter and sort wallets for different tabs
  const knightsWallets = useMemo(() => {
    return walletBalances.filter(w => w.wallet_type === 'Knights');
  }, [walletBalances]);

  const allWallets = useMemo(() => {
    return walletBalances.filter(w => (w.wallet_type === 'Wallet' || w.wallet_type === 'Main Wallet') && !w.frozen);
  }, [walletBalances]);

  const lana8WonderWallets = useMemo(() => {
    return walletBalances.filter(w => w.wallet_type === 'Lana8Wonder');
  }, [walletBalances]);

  const lanaPayUsWallets = useMemo(() => {
    return walletBalances.filter(w => w.wallet_type === 'LanaPays.Us');
  }, [walletBalances]);

  const lanaDiscountWallets = useMemo(() => {
    return walletBalances.filter(w => w.wallet_type === 'Lana.Discount');
  }, [walletBalances]);

  // Frozen wallets derived from walletBalances (already have balances)
  const frozenWallets = useMemo(() => {
    return walletBalances.filter(w => w.frozen);
  }, [walletBalances]);

  const frozenLoading = walletsLoading;

  const frozenTotalBalance = useMemo(() => {
    return frozenWallets.reduce((sum, w) => sum + w.balance, 0);
  }, [frozenWallets]);

  const lana8WonderTotalBalance = useMemo(() => {
    return lana8WonderWallets.reduce((sum, w) => sum + w.balance, 0);
  }, [lana8WonderWallets]);

  const lanaPayUsTotalBalance = useMemo(() => {
    return lanaPayUsWallets.reduce((sum, w) => sum + w.balance, 0);
  }, [lanaPayUsWallets]);

  const lanaDiscountTotalBalance = useMemo(() => {
    return lanaDiscountWallets.reduce((sum, w) => sum + w.balance, 0);
  }, [lanaDiscountWallets]);

  const sortWallets = (wallets: WalletWithBalance[]) => {
    return [...wallets].sort((a, b) => {
      if (sortField === 'balance') {
        return sortDirection === 'desc' ? b.balance - a.balance : a.balance - b.balance;
      } else if (sortField === 'wallet_type') {
        const typeA = a.wallet_type.toLowerCase();
        const typeB = b.wallet_type.toLowerCase();
        return sortDirection === 'desc' 
          ? typeB.localeCompare(typeA)
          : typeA.localeCompare(typeB);
      } else {
        const nameA = (a.display_name || a.name || '').toLowerCase();
        const nameB = (b.display_name || b.name || '').toLowerCase();
        return sortDirection === 'desc' 
          ? nameB.localeCompare(nameA)
          : nameA.localeCompare(nameB);
      }
    });
  };

  const sortedKnightsWallets = useMemo(() => sortWallets(knightsWallets), [knightsWallets, sortField, sortDirection]);
  const sortedAllWallets = useMemo(() => sortWallets(allWallets), [allWallets, sortField, sortDirection]);
  const sortedLanaPayUsWallets = useMemo(() => sortWallets(lanaPayUsWallets), [lanaPayUsWallets, sortField, sortDirection]);
  const sortedLanaDiscountWallets = useMemo(() => sortWallets(lanaDiscountWallets), [lanaDiscountWallets, sortField, sortDirection]);

  const knightsTotalBalance = useMemo(() => knightsWallets.reduce((sum, w) => sum + w.balance, 0), [knightsWallets]);
  const allWalletsTotalBalance = useMemo(() => allWallets.reduce((sum, w) => sum + w.balance, 0), [allWallets]);

  // Total balance of ALL registered wallets (Knights + All Wallets + Lana8Wonder)
  const totalRegisteredBalance = useMemo(() => {
    return walletBalances.reduce((sum, w) => sum + w.balance, 0);
  }, [walletBalances]);

  const toggleSort = (field: 'name' | 'balance' | 'wallet_type') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Check if a wallet is deleted (explicitly in deleted_wallets OR no longer exists in wallets table)
  const isWalletDeleted = (walletId: string | undefined): boolean => {
    if (!walletId) return false;
    if (deletedWalletIds.has(walletId)) return true;
    // If we have loaded existing wallets and this one isn't there, it's been deleted
    if (existingWalletIds.size > 0 && !existingWalletIds.has(walletId)) return true;
    return false;
  };

  const copyWalletId = (walletId: string) => {
    navigator.clipboard.writeText(walletId);
    setCopiedId(walletId);
    toast.success('Wallet ID copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const connectedRelays = relayStatuses.filter(r => r.connected).length;
  const totalRelays = relayStatuses.length;
  
  const totalPages = Math.ceil(totalBlocks / BLOCKS_PER_PAGE);
  
  const getUnregisteredPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 10;
    
    if (totalUnregisteredPages <= maxVisiblePages) {
      for (let i = 1; i <= totalUnregisteredPages; i++) {
        pages.push(i);
      }
    } else {
      if (unregisteredPage <= 6) {
        for (let i = 1; i <= 8; i++) pages.push(i);
        pages.push('ellipsis');
        pages.push(totalUnregisteredPages);
      } else if (unregisteredPage >= totalUnregisteredPages - 5) {
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalUnregisteredPages - 7; i <= totalUnregisteredPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('ellipsis');
        for (let i = unregisteredPage - 2; i <= unregisteredPage + 2; i++) pages.push(i);
        pages.push('ellipsis');
        pages.push(totalUnregisteredPages);
      }
    }
    return pages;
  };
  
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 10;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 6) {
        for (let i = 1; i <= 8; i++) pages.push(i);
        pages.push('ellipsis');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 5) {
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalPages - 7; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('ellipsis');
        for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicLinksSidebar />
      {/* Header */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-primary-foreground">L</span>
              </div>
              <span className="text-xl font-semibold text-foreground hidden sm:inline">Lana Register</span>
              <span className="text-xl font-semibold text-foreground sm:hidden">LR</span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/api-docs")}>
                <Database className="mr-2 h-4 w-4" />
                API Docs
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/public-api")}>
                <Globe className="mr-2 h-4 w-4" />
                Public Data
              </Button>
              <Button variant="ghost" size="sm">
                <Activity className="mr-2 h-4 w-4" />
                Nostr Standards
              </Button>
              {!isLoading && systemParams && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowStatusDialog(true)}
                  className="gap-2"
                >
                  <Wifi className="h-4 w-4 text-success" />
                  <span className="font-medium">{connectedRelays}/{totalRelays} connected</span>
                </Button>
              )}
              <Button onClick={() => navigate("/login")} size="sm">
                Login
              </Button>
            </div>

            {/* Mobile hamburger */}
            {isMobile && (
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 flex flex-col gap-2">
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => { navigate("/api-docs"); setMobileMenuOpen(false); }}>
                      <Database className="h-4 w-4" />
                      API Docs
                    </Button>
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => { navigate("/public-api"); setMobileMenuOpen(false); }}>
                      <Globe className="h-4 w-4" />
                      Public Data
                    </Button>
                    <Button variant="ghost" className="justify-start gap-2" onClick={() => setMobileMenuOpen(false)}>
                      <Activity className="h-4 w-4" />
                      Nostr Standards
                    </Button>
                    {!isLoading && systemParams && (
                      <Button
                        variant="ghost"
                        className="justify-start gap-2"
                        onClick={() => { setShowStatusDialog(true); setMobileMenuOpen(false); }}
                      >
                        <Wifi className="h-4 w-4 text-success" />
                        {connectedRelays}/{totalRelays} connected
                      </Button>
                    )}
                    <Button className="justify-start gap-2" onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}>
                      Login
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mb-6 md:mb-8 text-center">
          <h1 className="mb-3 md:mb-4 text-3xl sm:text-4xl md:text-6xl font-bold text-primary">Lana Register</h1>
          <p className="text-base md:text-xl text-muted-foreground">
            Transparent blockchain monitoring and wallet registration system
          </p>
        </div>

        {/* Currently Auditing + Total Balance */}
        <div className="mb-8 md:mb-12 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-center">
            <Shield className="h-5 w-5 md:h-6 md:w-6 text-success shrink-0" />
            <span className="text-sm md:text-lg text-foreground">
              Currently auditing <span className="font-bold text-primary">{stats.registeredWallets}</span> accounts
            </span>
          </div>
          <div className="flex items-center gap-2 text-center">
            <Coins className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <span className="text-sm md:text-lg text-foreground">
              Total registered Lanas:{' '}
              <span className="font-bold text-primary">
                {walletsLoading ? 'Loading...' : `${totalRegisteredBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} LANA`}
              </span>
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 md:mb-12 grid gap-4 md:gap-6 sm:grid-cols-2 md:grid-cols-3">
          <Card className="bg-success/10 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/20">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold text-foreground">{stats.todayTransactions} tx</p>
              </div>
            </div>
          </Card>

          <Card className="bg-primary/10 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Yesterday</p>
                <p className="text-2xl font-bold text-foreground">{stats.yesterdayTransactions} tx</p>
              </div>
            </div>
          </Card>

          <Card className="bg-secondary/50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <Coins className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Monitored Transactions</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.totalMonitoredTransactions.toLocaleString('en-US', { maximumFractionDigits: 2 })} LANA
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Feature Cards */}
        <div className="mb-8 md:mb-12 grid gap-4 md:gap-6 sm:grid-cols-2 md:grid-cols-3">
          <Card className="p-6 transition-all hover:shadow-lg">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <Badge variant="outline">Transparent Community</Badge>
            </div>
            <h3 className="mb-2 text-xl font-bold text-foreground">Open Access</h3>
            <p className="text-muted-foreground">
              All blockchain data is publicly accessible for complete transparency
            </p>
          </Card>

          <Card className="p-6 transition-all hover:shadow-lg">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <Badge variant="outline">Real-time Monitoring</Badge>
            </div>
            <h3 className="mb-2 text-xl font-bold text-foreground">Live Updates</h3>
            <p className="text-muted-foreground">
              Blockchain is monitored every minute for new transactions
            </p>
          </Card>

          <Card className="p-6 transition-all hover:shadow-lg">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <Lock className="h-5 w-5 text-success" />
              </div>
              <Badge className="bg-success/20 text-success">Active</Badge>
            </div>
            <h3 className="mb-2 text-xl font-bold text-foreground">No Secrets</h3>
            <p className="text-muted-foreground">
              Everything is transparent - nothing to hide from the community
            </p>
          </Card>
        </div>

        {/* Tabs Section */}
        <Card className="p-3 sm:p-6 overflow-hidden">
          <Tabs defaultValue="blocks" className="w-full">
            <div className="overflow-x-auto -mx-3 sm:-mx-0 px-3 sm:px-0">
              <TabsList className="mb-4 sm:mb-6 flex-wrap h-auto gap-1 w-max sm:w-auto">
                <TabsTrigger value="blocks" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Database className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Audited </span>Blocks
                </TabsTrigger>
                <TabsTrigger value="unregistered" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Unregistered </span>({totalUnregistered})
                </TabsTrigger>
                <TabsTrigger value="knights" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
                  Knights ({knightsWallets.length})
                </TabsTrigger>
                <TabsTrigger value="lanadiscount" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
                  Lana.Discount ({lanaDiscountWallets.length})
                </TabsTrigger>
                <TabsTrigger value="allwallets" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">All </span>Wallets ({allWallets.length})
                </TabsTrigger>
                <TabsTrigger value="lanapaysus" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
                  LanaPays ({lanaPayUsWallets.length})
                </TabsTrigger>
                <TabsTrigger value="lana8wonder" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Coins className="h-3 w-3 sm:h-4 sm:w-4" />
                  L8W ({lana8WonderWallets.length})
                </TabsTrigger>
                <TabsTrigger value="registered" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Knights </span>TX ({registeredEvents.length})
                </TabsTrigger>
                <TabsTrigger value="outgoing" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Outgoing </span>TX ({outgoingTx.length})
                </TabsTrigger>
                <TabsTrigger value="frozen" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Snowflake className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Frozen </span>({frozenWallets.length})
                </TabsTrigger>
                <TabsTrigger value="balancehistory" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Balance </span>History
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Audited Blocks Tab */}
            <TabsContent value="blocks">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Recent blockchain blocks audited for registered wallet transactions
                </p>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Block ID</TableHead>
                      <TableHead>Staked Time</TableHead>
                      <TableHead>Audit Time</TableHead>
                      <TableHead className="text-right">Total TX</TableHead>
                      <TableHead className="text-right">Registered TX</TableHead>
                      <TableHead className="text-right">Coverage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentBlocks.map((block) => (
                      <TableRow 
                        key={block.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setSelectedBlock(block);
                          setShowBlockDialog(true);
                        }}
                      >
                        <TableCell className="font-mono font-medium">{block.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{block.stakedTime}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{block.auditTime}</TableCell>
                        <TableCell className="text-right">{block.totalTx}</TableCell>
                        <TableCell className="text-right">{block.registeredTx}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${block.coverage}%` }}
                              />
                            </div>
                            <span className="text-sm">{block.coverage}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Blocks Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    {((currentPage - 1) * BLOCKS_PER_PAGE) + 1}-{Math.min(currentPage * BLOCKS_PER_PAGE, totalBlocks)} of {totalBlocks}
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => {
                            if (currentPage > 1) {
                              setCurrentPage(p => p - 1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {getPageNumbers().map((page, idx) => (
                        page === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${idx}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => {
                                setCurrentPage(page as number);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => {
                            if (currentPage < totalPages) {
                              setCurrentPage(p => p + 1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </TabsContent>

            {/* Unregistered Lanas Tab */}
            <TabsContent value="unregistered">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Unregistered Lana events from Nostr relays (Kind 87003)
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefreshNostrEvents}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {nostrEventsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : nostrEventsError ? (
                <div className="text-center text-destructive py-8">
                  Error loading events: {nostrEventsError}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Wallet ID</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Return TX</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedNostrEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No unregistered Lana events found from relays
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedNostrEvents.map((event, index) => (
                          <React.Fragment key={event.id}>
                            <TableRow 
                              className={cn("cursor-pointer hover:bg-muted/50", isWalletDeleted(event.walletId) && "bg-muted/40 opacity-70")}
                              onClick={() => handleExpandEvent(event.id, event.id)}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {expandedEventId === event.id ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  {((unregisteredPage - 1) * EVENTS_PER_PAGE) + index + 1}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  {event.profile ? (
                                    <>
                                      <div className="font-medium text-sm">
                                        {event.profile.displayName || event.profile.name || 'Unknown'}
                                      </div>
                                      <div className="font-mono text-xs text-muted-foreground">
                                        {event.userPubkey ? `${event.userPubkey.substring(0, 8)}...${event.userPubkey.slice(-4)}` : '-'}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="font-mono text-xs text-muted-foreground">
                                      {event.userPubkey ? `${event.userPubkey.substring(0, 8)}...${event.userPubkey.slice(-4)}` : '-'}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs">
                                    {event.walletId ? `${event.walletId.substring(0, 8)}...${event.walletId.slice(-6)}` : '-'}
                                  </span>
                                  {event.walletId && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyWalletId(event.walletId);
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {isWalletDeleted(event.walletId) && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Deleted</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {latoshisToLana(event.unregisteredAmountLatoshis).toFixed(4)} LANA
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDistanceToNow(new Date(event.createdAt * 1000), { addSuffix: true })}
                              </TableCell>
                              <TableCell>
                                {isWalletDeleted(event.walletId) ? (
                                  <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                                    Deleted
                                  </Badge>
                                ) : event.isReturned ? (
                                  <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">
                                    <Check className="h-3 w-3 mr-1" />
                                    Returned
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-yellow-600 border-yellow-500/30">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {event.isReturned && event.returnEvent?.txId ? (
                                  <a 
                                    href={`https://chainz.cryptoid.info/lana/tx.dws?${event.returnEvent.txId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-primary hover:underline font-mono text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {event.returnEvent.txId.substring(0, 8)}...
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                            {expandedEventId === event.id && (
                              <TableRow>
                                <TableCell colSpan={7} className="bg-muted/30 p-4">
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Nostr Event ID</div>
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1 break-all">{event.id}</code>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(event.id, 'Event ID')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Full Wallet ID</div>
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1 break-all">{event.walletId || '-'}</code>
                                          {event.walletId && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(event.walletId, 'Wallet ID')}>
                                              <Copy className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">User Pubkey</div>
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1 break-all">{event.userPubkey || '-'}</code>
                                          {event.userPubkey && (
                                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(event.userPubkey, 'User Pubkey')}>
                                              <Copy className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Amount (Latoshis)</div>
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1">{event.unregisteredAmountLatoshis}</code>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(event.unregisteredAmountLatoshis, 'Amount')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {event.txId && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Transaction ID</div>
                                        <div className="flex items-center gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1 break-all">{event.txId}</code>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(event.txId!, 'Transaction ID')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {event.content && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Event Content</div>
                                        <div className="flex items-start gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1 break-all whitespace-pre-wrap">{event.content}</code>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(event.content, 'Content')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold text-muted-foreground uppercase">Notes (from database)</div>
                                      {eventNotes[event.id] === undefined ? (
                                        <div className="text-xs text-muted-foreground">Loading...</div>
                                      ) : eventNotes[event.id] ? (
                                        <div className="flex items-start gap-2">
                                          <code className="text-xs bg-background p-2 rounded border flex-1 break-all whitespace-pre-wrap">{eventNotes[event.id]}</code>
                                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(eventNotes[event.id]!, 'Notes')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-muted-foreground italic">No notes available</div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              {/* Unregistered Pagination */}
              {totalUnregisteredPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {((unregisteredPage - 1) * EVENTS_PER_PAGE) + 1} to {Math.min(unregisteredPage * EVENTS_PER_PAGE, totalUnregistered)} of {totalUnregistered} events
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => {
                            if (unregisteredPage > 1) {
                              setUnregisteredPage(p => p - 1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={unregisteredPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      
                      {getUnregisteredPageNumbers().map((page, idx) => (
                        page === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${idx}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => {
                                setUnregisteredPage(page as number);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              isActive={unregisteredPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => {
                            if (unregisteredPage < totalUnregisteredPages) {
                              setUnregisteredPage(p => p + 1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                          }}
                          className={unregisteredPage === totalUnregisteredPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </TabsContent>

            {/* Knights Wallets Tab */}
            <TabsContent value="knights">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Balance overview for Knights wallet type
                </p>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="font-bold text-lg text-primary">
                    {knightsTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                  </span>
                </div>
              </div>

              {walletsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => toggleSort('name')}
                          >
                            Name
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>Wallet ID</TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -mr-3 font-medium"
                            onClick={() => toggleSort('balance')}
                          >
                            Balance
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedKnightsWallets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No Knights wallets found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedKnightsWallets.map((wallet, index) => (
                          <TableRow key={wallet.id}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {wallet.display_name || wallet.name || '-'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {wallet.wallet_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {`${wallet.wallet_id.substring(0, 8)}...${wallet.wallet_id.slice(-6)}`}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => copyWalletId(wallet.wallet_id!)}
                                  >
                                    {copiedId === wallet.wallet_id ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* All Wallets Tab */}
            <TabsContent value="allwallets">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Balance overview for Wallet and Main Wallet types
                </p>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="font-bold text-lg text-primary">
                    {allWalletsTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                  </span>
                </div>
              </div>

              {walletsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
              {/* FX Limit Info */}
              {lanaLimits && fxRatesWallets && (
                <div className="mb-4 p-3 rounded-lg border bg-muted/30 flex flex-wrap gap-4 items-center text-sm">
                  <span className="font-medium text-muted-foreground">50 unit limit in LANA:</span>
                  <Badge variant="outline" className="gap-1">
                    EUR: {lanaLimits.EUR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LANA
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    GBP: {lanaLimits.GBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LANA
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    USD: {lanaLimits.USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LANA
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                    <Snowflake className="h-3 w-3 text-sky-500" /> Frozen
                    <span className="mx-1">|</span>
                    <AlertTriangle className="h-3 w-3 text-sky-400" /> Over limit
                  </span>
                </div>
              )}

              <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => toggleSort('name')}
                          >
                            Name
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => toggleSort('wallet_type')}
                          >
                            Wallet Type
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>Wallet ID</TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -mr-3 font-medium"
                            onClick={() => toggleSort('balance')}
                          >
                            Balance
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAllWallets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No wallets found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedAllWallets.map((wallet, index) => {
                          const lanaLimit = lanaLimits?.EUR ?? null;
                          const overLimit = lanaLimit !== null && wallet.balance > lanaLimit && !wallet.frozen;
                          const isFrozen = wallet.frozen === true;
                          return (
                          <TableRow key={wallet.id} className={cn(
                            isFrozen && "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-950/50",
                            overLimit && !isFrozen && "bg-sky-50/60 hover:bg-sky-100/60 dark:bg-sky-900/20 dark:hover:bg-sky-900/30"
                          )}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {isFrozen && <Snowflake className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
                                <span className={cn("font-medium", overLimit && "text-sky-600 dark:text-sky-400 font-semibold")}>
                                  {wallet.display_name || wallet.name || '-'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {wallet.wallet_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {wallet.wallet_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {`${wallet.wallet_id.substring(0, 8)}...${wallet.wallet_id.slice(-6)}`}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => copyWalletId(wallet.wallet_id!)}
                                  >
                                    {copiedId === wallet.wallet_id ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className={cn("text-right font-semibold", overLimit && "text-sky-600 dark:text-sky-400")}>
                              {overLimit && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                              {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </TabsContent>

            {/* LanaPays.Us Wallets Tab */}
            <TabsContent value="lanapaysus">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Balance overview for LanaPays.Us wallet type ({lanaPayUsWallets.length} wallets)
                </p>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="font-bold text-lg text-primary">
                    {lanaPayUsTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                  </span>
                </div>
              </div>

              {walletsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => {
                              if (sortField === 'name') {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('name');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            Name
                            {sortField === 'name' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableHead>
                        <TableHead>Wallet ID</TableHead>
                        <TableHead className="text-center">Split</TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -mr-3 font-medium"
                            onClick={() => {
                              if (sortField === 'balance') {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('balance');
                                setSortDirection('desc');
                              }
                            }}
                          >
                            Balance
                            {sortField === 'balance' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLanaPayUsWallets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No LanaPays.Us wallets found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedLanaPayUsWallets.map((wallet, index) => (
                          <TableRow key={wallet.id}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <span className="font-medium">{wallet.display_name || wallet.name}</span>
                            </TableCell>
                            <TableCell>
                              {wallet.wallet_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {`${wallet.wallet_id.substring(0, 8)}...${wallet.wallet_id.slice(-6)}`}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => copyWalletId(wallet.wallet_id!)}
                                  >
                                    {copiedId === wallet.wallet_id ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {wallet.split_created != null ? (
                                <Badge variant="outline" className="text-xs font-mono">#{wallet.split_created}</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Lana.Discount Wallets Tab */}
            <TabsContent value="lanadiscount">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Balance overview for Lana.Discount wallet type ({lanaDiscountWallets.length} wallets)
                </p>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="font-bold text-lg text-primary">
                    {lanaDiscountTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                  </span>
                </div>
              </div>

              {walletsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => {
                              if (sortField === 'name') {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('name');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            Name
                            {sortField === 'name' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableHead>
                        <TableHead>Wallet ID</TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => {
                              if (sortField === 'balance') {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('balance');
                                setSortDirection('desc');
                              }
                            }}
                          >
                            Balance
                            {sortField === 'balance' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLanaDiscountWallets.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No Lana.Discount wallets found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedLanaDiscountWallets.map((wallet, index) => (
                          <TableRow key={wallet.id}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <span className="font-medium">{wallet.display_name || wallet.name}</span>
                            </TableCell>
                            <TableCell>
                              {wallet.wallet_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {`${wallet.wallet_id.substring(0, 8)}...${wallet.wallet_id.slice(-6)}`}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => copyWalletId(wallet.wallet_id!)}
                                  >
                                    {copiedId === wallet.wallet_id ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Lana8Wonder Wallets Tab */}
            <TabsContent value="lana8wonder">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Balance overview for Lana8Wonder wallet type ({lana8WonderWallets.length} wallets)
                </p>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Total: </span>
                  <span className="font-bold text-lg text-primary">
                    {lana8WonderTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                  </span>
                </div>
              </div>

              {walletsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -ml-3 font-medium"
                            onClick={() => {
                              if (sortField === 'name') {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('name');
                                setSortDirection('asc');
                              }
                            }}
                          >
                            Name
                            {sortField === 'name' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableHead>
                        <TableHead>Wallet ID</TableHead>
                        <TableHead className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="gap-1 -mr-3 font-medium"
                            onClick={() => {
                              if (sortField === 'balance') {
                                setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSortField('balance');
                                setSortDirection('desc');
                              }
                            }}
                          >
                            Balance
                            {sortField === 'balance' && (
                              sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortWallets(lana8WonderWallets).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No Lana8Wonder wallets found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortWallets(lana8WonderWallets).map((wallet, index) => (
                          <TableRow key={wallet.id}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <span className="font-medium">{wallet.display_name || wallet.name}</span>
                            </TableCell>
                            <TableCell>
                              {wallet.wallet_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {`${wallet.wallet_id.substring(0, 8)}...${wallet.wallet_id.slice(-6)}`}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => copyWalletId(wallet.wallet_id!)}
                                  >
                                    {copiedId === wallet.wallet_id ? (
                                      <Check className="h-3 w-3 text-success" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Registered Knights Transactions Tab */}
            <TabsContent value="registered">
              <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
                <p className="text-sm text-muted-foreground">
                  Knights wallet transactions for current split period
                </p>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm text-muted-foreground mr-2">Total v Splitu:</span>
                    <span className="font-bold text-primary text-lg">
                      {registeredEvents.reduce((sum, event) => sum + Number(event.amount), 0).toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                    </span>
                  </div>
                  <Badge variant="outline" className="text-sm">
                    Current Split: {currentSplit !== null ? currentSplit : 'Loading...'}
                  </Badge>
                </div>
              </div>

              {registeredEventsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Wallet Owner</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Split</TableHead>
                        <TableHead>Detected</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registeredEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No Knights transactions found for current split ({currentSplit})
                          </TableCell>
                        </TableRow>
                      ) : (
                        registeredEvents.map((event, index) => (
                          <TableRow key={event.id}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {(event.wallet_display_name || event.wallet_name) && (
                                  <div className="font-medium text-sm">
                                    {event.wallet_display_name || event.wallet_name}
                                  </div>
                                )}
                                {event.wallet_address && (
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {`${event.wallet_address.substring(0, 8)}...${event.wallet_address.slice(-6)}`}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {Number(event.amount).toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{event.split}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {event.detected_at
                                ? formatDistanceToNow(new Date(event.detected_at), { addSuffix: true })
                                : '-'}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {event.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Outgoing TX Tab */}
            <TabsContent value="outgoing">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Transactions sent from registered wallets to unregistered addresses
                </p>
                {outgoingTx.length > 0 && (
                  <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">Total lost:</span>
                    <span className="text-sm font-bold text-destructive">
                      {outgoingTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} LANA
                    </span>
                  </div>
                )}
              </div>

              {outgoingTxLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Block</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outgoingTx.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No outgoing transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        outgoingTx.map((tx, index) => (
                          <TableRow key={tx.id}>
                            <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {tx.from_name && (
                                  <div className="font-medium text-sm">{tx.from_name}</div>
                                )}
                                {tx.from_address && (
                                  <div
                                    className="font-mono text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-1 group"
                                    onClick={() => {
                                      navigator.clipboard.writeText(tx.from_address);
                                      toast.success("From address copied!");
                                    }}
                                    title="Click to copy"
                                  >
                                    {`${tx.from_address.substring(0, 8)}...${tx.from_address.slice(-6)}`}
                                    <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div
                                className="font-mono text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-1 group"
                                onClick={() => {
                                  navigator.clipboard.writeText(tx.to_address);
                                  toast.success("To address copied!");
                                }}
                                title="Click to copy"
                              >
                                {tx.to_address.length > 20
                                  ? `${tx.to_address.substring(0, 8)}...${tx.to_address.slice(-6)}`
                                  : tx.to_address}
                                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                {tx.to_was_deleted && (
                                  <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">Deleted</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 })} LANA
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {tx.block_id ? `#${tx.block_id}` : '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {tx.created_at
                                ? formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Frozen Wallets Tab */}
            <TabsContent value="frozen">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Wallets currently frozen by the registrar
                </p>
                {frozenWallets.length > 0 && (
                  <div className="text-sm font-medium">
                    Total Frozen: <span className="text-destructive">{frozenTotalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} LAN</span>
                  </div>
                )}
              </div>

              {frozenLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : frozenWallets.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No frozen wallets found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Wallet Type</TableHead>
                        <TableHead>Wallet Address</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {frozenWallets.map((wallet, index) => (
                        <TableRow key={wallet.id}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">
                            {wallet.display_name || wallet.name || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{wallet.wallet_type}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {wallet.wallet_id
                              ? `${wallet.wallet_id.slice(0, 8)}...${wallet.wallet_id.slice(-6)}`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {FREEZE_LABELS[wallet.freeze_reason || ''] || wallet.freeze_reason || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="gap-1">
                              <Snowflake className="h-3 w-3" />
                              Frozen
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Balance History Tab */}
            <TabsContent value="balancehistory">
              {snapshotsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading balance history...</div>
              ) : balanceSnapshots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No balance snapshots recorded yet. Data will appear after the first hourly snapshot.</div>
              ) : (
                <>
                  <div className="h-[400px] w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={balanceSnapshots.map(s => ({
                        time: new Date(s.recorded_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                        balance: Number(s.total_balance_lana),
                        wallets: s.wallet_count,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="time" className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} />
                        <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                          formatter={(value: number) => [`${value.toLocaleString()} LANA`, 'Balance']}
                        />
                        <Line type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead className="text-right">Total Balance (LANA)</TableHead>
                          <TableHead className="text-right">Wallets</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...balanceSnapshots].reverse().map((snap) => (
                          <TableRow key={snap.id}>
                            <TableCell className="text-xs">
                              {new Date(snap.recorded_at).toLocaleString('en-GB', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {Number(snap.total_balance_lana).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">{snap.wallet_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

          </Tabs>
        </Card>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 Lana Register. All rights reserved.</p>
        </div>
      </footer>

      {/* Nostr Status Dialog */}
      <NostrStatusDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        systemParams={systemParams}
        relayStatuses={relayStatuses}
      />

      {/* Block Detail Dialog */}
      {selectedBlock && (
        <BlockDetailDialog
          open={showBlockDialog}
          onOpenChange={setShowBlockDialog}
          blockId={selectedBlock.id}
          blockData={{
            stakedTime: selectedBlock.stakedTime,
            auditTime: selectedBlock.auditTime,
            totalTx: selectedBlock.totalTx,
            registeredTx: selectedBlock.registeredTx,
            coverage: selectedBlock.coverage,
          }}
        />
      )}
    </div>
  );
};

export default LandingPage;
