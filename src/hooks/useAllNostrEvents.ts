import { useState, useEffect } from 'react';
import { SimplePool, Event, Filter } from 'nostr-tools';
import { getStoredParameters, getStoredRelayStatuses } from '@/utils/nostrClient';

// Collect all trusted signer pubkeys from KIND 38888 system parameters.
// Only events authored by one of these pubkeys are surfaced in the UI.
const getTrustedPubkeys = (): Set<string> => {
  const params = getStoredParameters();
  const signers = params?.trusted_signers || {};
  const all = new Set<string>();
  for (const list of Object.values(signers)) {
    if (Array.isArray(list)) {
      for (const pk of list) if (typeof pk === 'string' && pk) all.add(pk.toLowerCase());
    }
  }
  return all;
};

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
  linkedEventId: string;
  userPubkey: string;
  txId?: string;
  fromWallet?: string;
  toWallet?: string;
  amountLanoshis: string;
  createdAt: number;
}

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
}

export interface CombinedEvent extends Kind87003Event {
  isReturned: boolean;
  returnEvent?: Kind87009Event;
  profile?: NostrProfile;
}

// Cache for all events
let cached87003Events: Kind87003Event[] | null = null;
let cached87009Events: Kind87009Event[] | null = null;
let cachedProfiles: Map<string, NostrProfile> | null = null;
let cacheTimestamp: number = 0;
let isFetching: boolean = false;
let fetchPromise: Promise<{ events87003: Kind87003Event[]; events87009: Kind87009Event[]; profiles: Map<string, NostrProfile> }> | null = null;
const CACHE_DURATION_MS = 60000; // 1 minute cache

// Function to fetch all events
const fetchAllEvents = async (): Promise<{ events87003: Kind87003Event[]; events87009: Kind87009Event[]; profiles: Map<string, NostrProfile> }> => {
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

  console.log(`🔍 [AllNostrEvents] Fetching Kind 87003 and 87009 events from ${relaysToUse.length} relays:`, relaysToUse);

  const pool = new SimplePool();

  // Fetch both kinds in parallel
  const [fetched87003, fetched87009] = await Promise.all([
    pool.querySync(relaysToUse, { kinds: [87003], limit: 1000 } as Filter),
    pool.querySync(relaysToUse, { kinds: [87009], limit: 1000 } as Filter)
  ]);
  
  console.log(`📥 [AllNostrEvents] Fetched ${fetched87003.length} Kind 87003 events and ${fetched87009.length} Kind 87009 events`);

  // Filter to trusted signers from KIND 38888 only.
  const trusted = getTrustedPubkeys();
  const filtered87003 = trusted.size > 0
    ? fetched87003.filter(e => trusted.has(e.pubkey.toLowerCase()))
    : fetched87003;
  const filtered87009 = trusted.size > 0
    ? fetched87009.filter(e => trusted.has(e.pubkey.toLowerCase()))
    : fetched87009;

  console.log(`🔐 [AllNostrEvents] Trusted filter: 87003 ${fetched87003.length} → ${filtered87003.length}, 87009 ${fetched87009.length} → ${filtered87009.length} (trusted signers: ${trusted.size})`);

  // Parse 87003 events
  const parsed87003: Kind87003Event[] = filtered87003.map((event: Event) => {
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
  const parsed87009: Kind87009Event[] = filtered87009.map((event: Event) => {
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

  // Collect unique pubkeys from 87003 events
  const uniquePubkeys = [...new Set(parsed87003.map(e => e.userPubkey).filter(p => p))];
  console.log(`👤 [AllNostrEvents] Fetching Kind 0 profiles for ${uniquePubkeys.length} unique pubkeys`);

  // Fetch Kind 0 (profile) events for all pubkeys
  const profiles = new Map<string, NostrProfile>();
  
  if (uniquePubkeys.length > 0) {
    try {
      const fetchedProfiles = await pool.querySync(relaysToUse, { 
        kinds: [0], 
        authors: uniquePubkeys,
        limit: 500 
      } as Filter);
      
      console.log(`📥 [AllNostrEvents] Fetched ${fetchedProfiles.length} Kind 0 profile events`);

      // Parse profile events - keep the most recent for each pubkey
      const profileMap = new Map<string, { event: Event; createdAt: number }>();
      
      for (const event of fetchedProfiles) {
        const existing = profileMap.get(event.pubkey);
        if (!existing || event.created_at > existing.createdAt) {
          profileMap.set(event.pubkey, { event, createdAt: event.created_at });
        }
      }

      // Parse the profile content
      for (const [pubkey, { event }] of profileMap) {
        try {
          const content = JSON.parse(event.content);
          profiles.set(pubkey, {
            pubkey,
            name: content.name,
            displayName: content.display_name || content.displayName,
            picture: content.picture,
          });
        } catch (e) {
          console.warn(`Failed to parse profile for ${pubkey}:`, e);
        }
      }
      
      console.log(`👤 [AllNostrEvents] Parsed ${profiles.size} profiles`);
    } catch (e) {
      console.error('[AllNostrEvents] Error fetching profiles:', e);
    }
  }

  parsed87003.sort((a, b) => b.createdAt - a.createdAt);
  parsed87009.sort((a, b) => b.createdAt - a.createdAt);
  
  pool.close(relaysToUse);
  
  return { events87003: parsed87003, events87009: parsed87009, profiles };
};

export const useAllNostrEvents = () => {
  const [events, setEvents] = useState<CombinedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEvents = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const now = Date.now();
        
        // Check if we have valid cached events
        if (cached87003Events && cached87009Events && cachedProfiles && (now - cacheTimestamp) < CACHE_DURATION_MS) {
          const returnedEventIds = new Map(cached87009Events.map(e => [e.linkedEventId, e]));
          
          const combinedEvents: CombinedEvent[] = cached87003Events.map(event => ({
            ...event,
            isReturned: returnedEventIds.has(event.id),
            returnEvent: returnedEventIds.get(event.id),
            profile: cachedProfiles.get(event.userPubkey),
          }));
          
          console.log(`📦 [AllNostrEvents] Using cached events: ${combinedEvents.length} total (${combinedEvents.filter(e => e.isReturned).length} returned)`);
          setEvents(combinedEvents);
          setIsLoading(false);
          return;
        }

        // If already fetching, wait for that fetch to complete
        if (isFetching && fetchPromise) {
          console.log(`⏳ [AllNostrEvents] Waiting for ongoing fetch`);
          const { events87003, events87009, profiles } = await fetchPromise;
          const returnedEventIds = new Map(events87009.map(e => [e.linkedEventId, e]));
          
          const combinedEvents: CombinedEvent[] = events87003.map(event => ({
            ...event,
            isReturned: returnedEventIds.has(event.id),
            returnEvent: returnedEventIds.get(event.id),
            profile: profiles.get(event.userPubkey),
          }));
          
          setEvents(combinedEvents);
          setIsLoading(false);
          return;
        }

        // Start new fetch
        isFetching = true;
        fetchPromise = fetchAllEvents();
        
        const { events87003, events87009, profiles } = await fetchPromise;
        
        // Cache results
        cached87003Events = events87003;
        cached87009Events = events87009;
        cachedProfiles = profiles;
        cacheTimestamp = Date.now();
        isFetching = false;
        fetchPromise = null;

        // Create map of returned event IDs to their 87009 events
        const returnedEventIds = new Map(events87009.map(e => [e.linkedEventId, e]));

        // Combine events with return status and profile
        const combinedEvents: CombinedEvent[] = events87003.map(event => ({
          ...event,
          isReturned: returnedEventIds.has(event.id),
          returnEvent: returnedEventIds.get(event.id),
          profile: profiles.get(event.userPubkey),
        }));
        
        console.log(`📥 [AllNostrEvents] Loaded ${combinedEvents.length} events (${combinedEvents.filter(e => e.isReturned).length} returned)`);
        setEvents(combinedEvents);
      } catch (err) {
        console.error('[AllNostrEvents] Error fetching Nostr events:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
        isFetching = false;
        fetchPromise = null;
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, []);

  return { events, isLoading, error };
};

// Helper function to convert latoshis to LANA
export const latoshisToLana = (latoshis: string): number => {
  return parseFloat(latoshis) / 100000000;
};

// Function to clear cache (useful for manual refresh)
export const clearAllNostrEventsCache = () => {
  cached87003Events = null;
  cached87009Events = null;
  cachedProfiles = null;
  cacheTimestamp = 0;
  isFetching = false;
  fetchPromise = null;
};
