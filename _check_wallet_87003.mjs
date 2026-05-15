import { SimplePool, verifyEvent } from 'nostr-tools';
const wallet = 'LiJoPczEsgouQSN2HcZaj1jQkK5Ryk9Hz4';
const relays = ['wss://relay.lanavault.space','wss://relay.lanacoin-eternity.com','wss://relay.lanaheartvoice.com','wss://relay.lovelana.org'];
const pool = new SimplePool();
const since = Math.floor(Date.now()/1000) - 7*86400;
const events = await pool.querySync(relays, { kinds:[87003], '#WalletID':[wallet], since, limit: 1000 });
console.log(JSON.stringify({wallet, relays, since:new Date(since*1000).toISOString(), total:events.length}, null, 2));
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
for (const e of events.slice(0,20)) {
  const amount = e.tags.find(t => t[0] === 'UnregisteredAmountLatoshis')?.[1] ?? e.tags.find(t => t[0] === 'UnregistratedAmountLatoshis')?.[1] ?? 'MISSING';
  const tx = e.tags.find(t => t[0] === 'TX' || t[0] === 'tx')?.[1] ?? '';
  const linked = e.tags.find(t => t[0] === 'Linked_event')?.[1] ?? '';
  console.log(JSON.stringify({id:e.id, pubkey:e.pubkey, validSig:verifyEvent(e), created_at:new Date(e.created_at*1000).toISOString(), amount, lana:Number(amount)/1e8, tx, linked, content:e.content, tags:e.tags}, null, 2));
}
pool.close(relays);
