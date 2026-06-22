import { useState, useEffect } from 'react';
import { SimplePool, Event, Filter } from 'nostr-tools';

export interface Kind87003Event {
  id: string;
  walletId: string;
  userPubkey: string;
  txId?: string;
  linkedEvent?: string;
  unregisteredAmountLatoshis: string;
  content: string;
  createdAt: number;
}

export interface Kind87009Event {
  id: string;
  linkedEventId: string; // The 87003 event this resolves
  userPubkey: string;
  txId?: string;
  fromWallet?: string;
  toWallet?: string;
  amountLanoshis: string;
  createdAt: number;
}

// Cache for all events
let cached87003Events: Kind87003Event[] | null = null;
let cached87009Events: Kind87009Event[] | null = null;
let cacheTimestamp: number = 0;
let isFetching: boolean = false;
let fetchPromise: Promise<{ events87003: Kind87003Event[]; events87009: Kind87009Event[] }> | null = null;
const CACHE_DURATION_MS = 60000; // 1 minute cache

// Collect trusted signer pubkeys from KIND 38888 system parameters.
const getTrustedPubkeys = (params: any): Set<string> => {
  const signers = params?.trusted_signers || {};
  const all = new Set<string>();
  for (const list of Object.values(signers)) {
    if (Array.isArray(list)) {
      for (const pk of list) if (typeof pk === 'string' && pk) all.add(pk.toLowerCase());
    }
  }
  return all;
};

// Function to fetch all events (shared between all hook instances)
const fetchAllEvents = async (): Promise<{ events87003: Kind87003Event[]; events87009: Kind87009Event[] }> => {
  const { getStoredParameters, getStoredRelayStatuses } = await import('@/utils/nostrClient');
  
  const params = getStoredParameters();
  const relayStatuses = getStoredRelayStatuses();
  
  const defaultRelays = [
    'wss://relay.lanavault.space',
    'wss://relay.lanacoin-eternity.com'
  ];
  
  const connectedRelays = relayStatuses
    .filter(r => r.connected)
    .map(r => r.url);
  
  const relaysToUse = connectedRelays.length > 0 
    ? connectedRelays 
    : (params?.relays || defaultRelays);

  console.log(`🔍 Fetching Kind 87003 and 87009 events from ${relaysToUse.length} relays:`, relaysToUse);

  const pool = new SimplePool();

  // Restrict to trusted signers from KIND 38888 server-side so spam pubkeys
  // don't saturate the relay limit window.
  const trustedSet = getTrustedPubkeys(params);
  const trustedAuthors = trustedSet.size > 0 ? [...trustedSet] : undefined;

  const filter87003: Filter = { kinds: [87003], limit: 1000 };
  const filter87009: Filter = { kinds: [87009], limit: 1000 };
  if (trustedAuthors) {
    filter87003.authors = trustedAuthors;
    filter87009.authors = trustedAuthors;
  }

  // Fetch both kinds in parallel
  const [fetched87003Raw, fetched87009Raw] = await Promise.all([
    pool.querySync(relaysToUse, filter87003),
    pool.querySync(relaysToUse, filter87009)
  ]);

  // Strict trusted-signers filter — same behavior as landing page (useAllNostrEvents):
  // if trusted_signers (KIND 38888) is not loaded, show NOTHING. This prevents
  // spam pubkeys from appearing in the logged-in wallet view.
  const fetched87003 = trustedSet.size > 0
    ? fetched87003Raw.filter(e => trustedSet.has(e.pubkey.toLowerCase()))
    : [];
  const fetched87009 = trustedSet.size > 0
    ? fetched87009Raw.filter(e => trustedSet.has(e.pubkey.toLowerCase()))
    : [];

  console.log(`📥 Fetched ${fetched87003Raw.length}→${fetched87003.length} Kind 87003 events and ${fetched87009Raw.length}→${fetched87009.length} Kind 87009 events (trusted signers: ${trustedSet.size})`);

  // Parse 87003 events
  const parsed87003: Kind87003Event[] = fetched87003.map((event: Event) => {
    const pTag = event.tags.find(t => t[0] === 'p');
    const walletIdTag = event.tags.find(t => t[0] === 'WalletID');
    const txTag = event.tags.find(t => t[0] === 'TX');
    const linkedEventTag = event.tags.find(t => t[0] === 'Linked_event');
    // Accept both correct ('UnregisteredAmountLatoshis') and legacy typo ('UnregistratedAmountLatoshis').
    const amountTag =
      event.tags.find(t => t[0] === 'UnregisteredAmountLatoshis') ||
      event.tags.find(t => t[0] === 'UnregistratedAmountLatoshis');

    return {
      id: event.id,
      walletId: walletIdTag?.[1] || '',
      userPubkey: pTag?.[1] || '',
      txId: txTag?.[1],
      linkedEvent: linkedEventTag?.[1],
      unregisteredAmountLatoshis: amountTag?.[1] || '0',
      content: event.content,
      createdAt: event.created_at
    };
  });

  // Parse 87009 events
  const parsed87009: Kind87009Event[] = fetched87009.map((event: Event) => {
    const pTag = event.tags.find(t => t[0] === 'p');
    const eTag = event.tags.find(t => t[0] === 'e'); // Reference to 87003 event
    const txTag = event.tags.find(t => t[0] === 'tx');
    const fromWalletTag = event.tags.find(t => t[0] === 'from_wallet');
    const toWalletTag = event.tags.find(t => t[0] === 'to_wallet');
    const amountTag = event.tags.find(t => t[0] === 'amount_lanoshis');

    return {
      id: event.id,
      linkedEventId: eTag?.[1] || '',
      userPubkey: pTag?.[1] || '',
      txId: txTag?.[1],
      fromWallet: fromWalletTag?.[1],
      toWallet: toWalletTag?.[1],
      amountLanoshis: amountTag?.[1] || '0',
      createdAt: event.created_at
    };
  });

  parsed87003.sort((a, b) => b.createdAt - a.createdAt);
  parsed87009.sort((a, b) => b.createdAt - a.createdAt);
  
  pool.close(relaysToUse);
  
  return { events87003: parsed87003, events87009: parsed87009 };
};

export const useWalletNostrEvents = (walletAddress: string | undefined) => {
  const [events, setEvents] = useState<Kind87003Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setEvents([]);
      return;
    }

    const loadEvents = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const now = Date.now();
        
        // Check if we have valid cached events
        if (cached87003Events && cached87009Events && (now - cacheTimestamp) < CACHE_DURATION_MS) {
          // Get set of resolved 87003 event IDs (those that have 87009)
          const resolvedEventIds = new Set(cached87009Events.map(e => e.linkedEventId));
          
          // Filter: only show 87003 events for this wallet that are NOT resolved
          const walletEvents = cached87003Events.filter(e => 
            e.walletId === walletAddress && !resolvedEventIds.has(e.id)
          );
          console.log(`📦 Using cached events: ${walletEvents.length} unresolved for wallet ${walletAddress} (${resolvedEventIds.size} total resolved)`);
          setEvents(walletEvents);
          setIsLoading(false);
          return;
        }

        // If already fetching, wait for that fetch to complete
        if (isFetching && fetchPromise) {
          console.log(`⏳ Waiting for ongoing fetch for wallet ${walletAddress}`);
          const { events87003, events87009 } = await fetchPromise;
          const resolvedEventIds = new Set(events87009.map(e => e.linkedEventId));
          const walletEvents = events87003.filter(e => 
            e.walletId === walletAddress && !resolvedEventIds.has(e.id)
          );
          console.log(`📥 Found ${walletEvents.length} unresolved events for wallet ${walletAddress}`);
          setEvents(walletEvents);
          setIsLoading(false);
          return;
        }

        // Start new fetch
        isFetching = true;
        fetchPromise = fetchAllEvents();
        
        const { events87003, events87009 } = await fetchPromise;
        
        // Cache results
        cached87003Events = events87003;
        cached87009Events = events87009;
        cacheTimestamp = Date.now();
        isFetching = false;
        fetchPromise = null;

        // Get set of resolved 87003 event IDs
        const resolvedEventIds = new Set(events87009.map(e => e.linkedEventId));

        // Filter for this wallet AND only unresolved
        const walletEvents = events87003.filter(e => 
          e.walletId === walletAddress && !resolvedEventIds.has(e.id)
        );
        console.log(`📥 Found ${walletEvents.length} unresolved events for wallet ${walletAddress} (${resolvedEventIds.size} total resolved)`);
        setEvents(walletEvents);
      } catch (err) {
        console.error('Error fetching Nostr events:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
        isFetching = false;
        fetchPromise = null;
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, [walletAddress]);

  return { events, isLoading, error };
};

// Helper function to convert latoshis to LANA
export const latoshisToLana = (latoshis: string): number => {
  return parseFloat(latoshis) / 100000000;
};

// Function to clear cache (useful for manual refresh)
export const clearNostrEventsCache = () => {
  cached87003Events = null;
  cached87009Events = null;
  cacheTimestamp = 0;
  isFetching = false;
  fetchPromise = null;
};
