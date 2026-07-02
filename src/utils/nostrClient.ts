import { SimplePool, Event, Filter } from 'nostr-tools';

const RELAYS = [
  'wss://relay.lanavault.space',
  'wss://relay.lanacoin-eternity.com'
];

const AUTHORIZED_PUBKEY = '9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3';

export interface SystemParameters {
  relays: string[];
  electrum: Array<{ host: string; port: string }>;
  fx: {
    EUR: number;
    USD: number;
    GBP: number;
  };
  split: string;
  split_target_lana: string;
  split_started_at: string;
  split_ends_at: string;
  freeze_lana_account_above: string;
  max_cap_lanas_on_split: string;
  version: string;
  valid_from: string;
  trusted_signers: {
    Lana8Wonder: string[];
    LanaRegistrar: string[];
    LanaRooms: string[];
    LanaAlignment: string[];
    LanaPaysUs: string[];
    '100MillionFun': string[];
    LanaKnights: string[];
    LanaHelpsUs: string[];
  };
}

export interface RelayStatus {
  url: string;
  connected: boolean;
  latency?: number;
}

export class NostrClient {
  private pool: SimplePool;
  private relayStatuses: Map<string, RelayStatus>;

  constructor() {
    this.pool = new SimplePool();
    this.relayStatuses = new Map();
  }

  async fetchSystemParameters(): Promise<{
    parameters: SystemParameters | null;
    relayStatuses: RelayStatus[];
  }> {
    const filter: Filter = {
      kinds: [38888],
      authors: [AUTHORIZED_PUBKEY],
      '#d': ['main'],
      limit: 1
    };

    // Test initial relay connectivity and measure latency
    const relayStatusPromises = RELAYS.map(async (url) => {
      const startTime = Date.now();
      try {
        await this.pool.ensureRelay(url);
        const latency = Date.now() - startTime;
        const status: RelayStatus = { url, connected: true, latency };
        this.relayStatuses.set(url, status);
        return status;
      } catch (error) {
        console.error(`Failed to connect to ${url}:`, error);
        const status: RelayStatus = { url, connected: false };
        this.relayStatuses.set(url, status);
        return status;
      }
    });

    const initialRelayStatuses = await Promise.all(relayStatusPromises);

    // Fetch events from all connected relays
    const connectedRelays = RELAYS.filter(url => 
      this.relayStatuses.get(url)?.connected
    );

    if (connectedRelays.length === 0) {
      console.error('No relays connected');
      return { parameters: null, relayStatuses: initialRelayStatuses };
    }

    try {
      const events = await this.pool.querySync(connectedRelays, filter);
      
      if (events.length === 0) {
        console.warn('No kind 38888 events found');
        return { parameters: null, relayStatuses: initialRelayStatuses };
      }

      // Get the latest event
      const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];

      // Verify the event
      if (!this.verifyEvent(latestEvent)) {
        console.error('Invalid event signature or pubkey');
        return { parameters: null, relayStatuses: initialRelayStatuses };
      }

      // Parse content
      const parameters = this.parseEventContent(latestEvent);
      
      if (!parameters) {
        return { parameters: null, relayStatuses: initialRelayStatuses };
      }

      // Now connect to ALL relays from the system parameters
      const allRelayStatuses = await this.connectToAllRelays(parameters.relays);
      
      // Store in session storage
      sessionStorage.setItem('lana_system_parameters', JSON.stringify(parameters));
      sessionStorage.setItem('lana_relay_statuses', JSON.stringify(allRelayStatuses));

      return { parameters, relayStatuses: allRelayStatuses };
    } catch (error) {
      console.error('Error fetching system parameters:', error);
      return { parameters: null, relayStatuses: initialRelayStatuses };
    }
  }

  private async connectToAllRelays(relays: string[]): Promise<RelayStatus[]> {
    console.log(`Connecting to ${relays.length} relays...`);
    
    const allRelayPromises = relays.map(async (url) => {
      // Check if already tested
      if (this.relayStatuses.has(url)) {
        return this.relayStatuses.get(url)!;
      }

      const startTime = Date.now();
      try {
        await this.pool.ensureRelay(url);
        const latency = Date.now() - startTime;
        const status: RelayStatus = { url, connected: true, latency };
        this.relayStatuses.set(url, status);
        console.log(`✓ Connected to ${url} (${latency}ms)`);
        return status;
      } catch (error) {
        console.error(`✗ Failed to connect to ${url}:`, error);
        const status: RelayStatus = { url, connected: false };
        this.relayStatuses.set(url, status);
        return status;
      }
    });

    return await Promise.all(allRelayPromises);
  }

  private verifyEvent(event: Event): boolean {
    // Verify pubkey matches authorized pubkey
    if (event.pubkey !== AUTHORIZED_PUBKEY) {
      return false;
    }

    // Verify d-tag is "main"
    const dTag = event.tags.find(t => t[0] === 'd');
    if (!dTag || dTag[1] !== 'main') {
      return false;
    }

    return true;
  }

  private parseEventContent(event: Event): SystemParameters | null {
    try {
      const content = JSON.parse(event.content);
      
      // Extract relays from tags
      const relays = event.tags
        .filter(t => t[0] === 'relay')
        .map(t => t[1]);

      // Extract electrum servers
      const electrum = event.tags
        .filter(t => t[0] === 'electrum')
        .map(t => ({ host: t[1], port: t[2] }));

      // Extract exchange rates
      const fxTags = event.tags.filter(t => t[0] === 'fx');
      const fx = {
        EUR: parseFloat(fxTags.find(t => t[1] === 'EUR')?.[2] || '0'),
        USD: parseFloat(fxTags.find(t => t[1] === 'USD')?.[2] || '0'),
        GBP: parseFloat(fxTags.find(t => t[1] === 'GBP')?.[2] || '0')
      };

      // Extract split, version, valid_from
      const split = event.tags.find(t => t[0] === 'split')?.[1] || '0';
      const split_target_lana = event.tags.find(t => t[0] === 'split_target_lana')?.[1] || '0';
      const split_started_at = event.tags.find(t => t[0] === 'split_started_at')?.[1] || '0';
      const split_ends_at = event.tags.find(t => t[0] === 'split_ends_at')?.[1] || '0';
      const freeze_lana_account_above = event.tags.find(t => t[0] === 'freeze_lana_account_above')?.[1] || '0';
      const max_cap_lanas_on_split = event.tags.find(t => t[0] === 'max_cap_lanas_on_split')?.[1] || '0';
      const version = event.tags.find(t => t[0] === 'version')?.[1] || '0';
      const valid_from = event.tags.find(t => t[0] === 'valid_from')?.[1] || '0';

      return {
        relays: relays.length > 0 ? relays : content.relays || [],
        electrum: electrum.length > 0 ? electrum : content.electrum || [],
        fx,
        split,
        split_target_lana,
        split_started_at,
        split_ends_at,
        freeze_lana_account_above,
        max_cap_lanas_on_split,
        version,
        valid_from,
        trusted_signers: content.trusted_signers || {
          Lana8Wonder: [],
          LanaRegistrar: [],
          LanaRooms: [],
          LanaAlignment: [],
          LanaPaysUs: [],
          '100MillionFun': [],
          LanaKnights: [],
          LanaHelpsUs: []
        }
      };
    } catch (error) {
      console.error('Error parsing event content:', error);
      return null;
    }
  }

  disconnect() {
    this.pool.close(RELAYS);
  }
}

export const getStoredParameters = (): SystemParameters | null => {
  const stored = sessionStorage.getItem('lana_system_parameters');
  return stored ? JSON.parse(stored) : null;
};

export const getStoredRelayStatuses = (): RelayStatus[] => {
  const stored = sessionStorage.getItem('lana_relay_statuses');
  return stored ? JSON.parse(stored) : [];
};

// ============= KIND 88888 — Lana8Wonder Annuity Plan =============

const LANA8WONDER_PUBLISHER_PUBKEY = 'a56253e6232b2ab5a96b60d233434d4f759ba4c858a3cc0f4ec51906dce73ae6';

export interface Lana8WonderLevel {
  row_id?: string;
  level_no: number;
  trigger_price: number;
  coins_to_give: number;
  cash_out?: number;
  remaining_lanas?: number;
}

export interface Lana8WonderAccount {
  account_id: number;
  wallet: string;
  levels: Lana8WonderLevel[];
}

export interface Lana8WonderPlan {
  subject_hex: string;
  plan_id: string;
  coin: string;
  currency: string;
  policy: string;
  accounts: Lana8WonderAccount[];
  event: Event;
}

export const fetchLana8WonderPlan = async (
  subjectHex: string
): Promise<Lana8WonderPlan | null> => {
  const relayStatuses = getStoredRelayStatuses();
  let relays = relayStatuses.filter(r => r.connected).map(r => r.url);
  const params = getStoredParameters();
  if (relays.length === 0 && params?.relays) relays = params.relays;
  if (relays.length === 0) relays = RELAYS;

  const pool = new SimplePool();
  try {
    const filter: Filter = {
      kinds: [88888],
      '#d': [`plan:${subjectHex}`],
      '#p': [subjectHex],
      limit: 5,
    };

    const events: Event[] = await Promise.race([
      pool.querySync(relays, filter),
      new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), 6000)),
    ]);

    if (!events || events.length === 0) return null;

    const valid = events
      .filter((e) => e.pubkey === LANA8WONDER_PUBLISHER_PUBKEY)
      .sort((a, b) => b.created_at - a.created_at);
    if (valid.length === 0) return null;

    const latest = valid[0];
    const content = JSON.parse(latest.content);
    return {
      subject_hex: content.subject_hex,
      plan_id: content.plan_id,
      coin: content.coin,
      currency: content.currency,
      policy: content.policy,
      accounts: content.accounts || [],
      event: latest,
    };
  } catch (err) {
    console.error('Error fetching KIND 88888 plan:', err);
    return null;
  } finally {
    try { pool.close(relays); } catch {}
  }
};

export interface Lana8WonderDueResult {
  dueLana: number;
  triggeredLevels: Array<{ account_id: number; level_no: number; trigger_price: number; coins_to_give: number }>;
  matchedAccountIds: number[];
}

export const calculateLana8WonderDue = (
  plan: Lana8WonderPlan,
  walletAddress: string,
  currentPrice: number
): Lana8WonderDueResult => {
  const triggered: Lana8WonderDueResult['triggeredLevels'] = [];
  const matched: number[] = [];
  let sum = 0;
  for (const acc of plan.accounts) {
    if (acc.wallet !== walletAddress) continue;
    matched.push(acc.account_id);
    for (const lvl of acc.levels || []) {
      if (Number(lvl.trigger_price) <= currentPrice) {
        sum += Number(lvl.coins_to_give) || 0;
        triggered.push({
          account_id: acc.account_id,
          level_no: lvl.level_no,
          trigger_price: Number(lvl.trigger_price),
          coins_to_give: Number(lvl.coins_to_give) || 0,
        });
      }
    }
  }
  return {
    dueLana: Math.round(sum * 1e8) / 1e8,
    triggeredLevels: triggered,
    matchedAccountIds: matched,
  };
};

