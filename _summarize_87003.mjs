import { SimplePool } from 'nostr-tools';
const relays = ['wss://relay.lanavault.space','wss://relay.lanacoin-eternity.com','wss://relay.lanaheartvoice.com','wss://relay.lovelana.org'];
const trusted = new Set([
'bcb0cf91fb810b54c7cf18a1ababca455b008e2a7ebdf303a7c2a72bbc0f521e'
]);
const pool = new SimplePool();
const since = Math.floor(Date.now()/1000) - 7*86400;
const fetched = await pool.querySync(relays, { kinds:[87003], since, limit: 5000 });
const map = new Map();
for (const e of fetched) map.set(e.id, e);
const events = [...map.values()];
const byPubkey = {};
let trustedCount = 0, untrustedCount = 0, uuidTx = 0, blockchainTx = 0, missingLinked = 0;
for (const e of events) {
  const t = trusted.has(e.pubkey);
  if (t) trustedCount++; else untrustedCount++;
  const tx = e.tags.find(t=>t[0]==='TX'||t[0]==='tx')?.[1] || '';
  if (/[a-f0-9]{64}/i.test(tx)) blockchainTx++; else if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(tx)) uuidTx++;
  if (!e.tags.some(t=>t[0]==='Linked_event' && t[1])) missingLinked++;
  byPubkey[e.pubkey] ??= {count:0, first:null, last:null, sampleWallet:null, sampleTx:null, trusted:t};
  const b = byPubkey[e.pubkey];
  b.count++;
  const dt = new Date(e.created_at*1000).toISOString();
  b.first = !b.first || dt < b.first ? dt : b.first;
  b.last = !b.last || dt > b.last ? dt : b.last;
  b.sampleWallet ||= e.tags.find(t=>t[0]==='WalletID')?.[1];
  b.sampleTx ||= tx;
}
console.log(JSON.stringify({since:new Date(since*1000).toISOString(), fetched:fetched.length, unique:events.length, trustedCount, untrustedCount, uuidTx, blockchainTx, missingLinked, byPubkey}, null, 2));
pool.close(relays);
