import { SimplePool, verifyEvent } from 'nostr-tools';
const wallet = 'LiJoPczEsgouQSN2HcZaj1jQkK5Ryk9Hz4';
const relays = ['wss://relay.lanavault.space','wss://relay.lanacoin-eternity.com','wss://relay.lanaheartvoice.com','wss://relay.lovelana.org'];
const pool = new SimplePool();
const since = Math.floor(Date.now()/1000) - 7*86400;
const fetched = await pool.querySync(relays, { kinds:[87003], since, limit: 5000 });
const map = new Map();
for (const e of fetched) map.set(e.id, e);
const events = [...map.values()].filter(e => e.tags.some(t => t[0] === 'WalletID' && t[1] === wallet)).sort((a,b)=>b.created_at-a.created_at);
console.log(JSON.stringify({wallet, fetched:fetched.length, unique:map.size, matched:events.length, since:new Date(since*1000).toISOString()}, null, 2));
const byPubkey = {};
const byDay = {};
let noAmount = 0;
for (const e of events) {
  byPubkey[e.pubkey] = (byPubkey[e.pubkey] || 0) + 1;
  const day = new Date(e.created_at*1000).toISOString().slice(0,10);
  byDay[day] = (byDay[day] || 0) + 1;
  const amount = e.tags.find(t => t[0] === 'UnregisteredAmountLatoshis')?.[1] ?? e.tags.find(t => t[0] === 'UnregistratedAmountLatoshis')?.[1];
  if (!amount) noAmount++;
}
console.log('byPubkey', byPubkey);
console.log('byDay', byDay);
console.log('no amount tag', noAmount);
for (const e of events.slice(0,30)) {
  const amount = e.tags.find(t => t[0] === 'UnregisteredAmountLatoshis')?.[1] ?? e.tags.find(t => t[0] === 'UnregistratedAmountLatoshis')?.[1] ?? 'MISSING';
  const tx = e.tags.find(t => t[0] === 'TX' || t[0] === 'tx')?.[1] ?? '';
  const linked = e.tags.find(t => t[0] === 'Linked_event')?.[1] ?? '';
  console.log(JSON.stringify({id:e.id, pubkey:e.pubkey, validSig:verifyEvent(e), created_at:new Date(e.created_at*1000).toISOString(), amount, lana:Number(amount)/1e8, tx, linked, content:e.content, tags:e.tags}, null, 2));
}
pool.close(relays);
