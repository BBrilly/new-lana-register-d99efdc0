import { SimplePool } from 'nostr-tools';
const pool = new SimplePool();
const relays = ['wss://relay.lanavault.space','wss://relay.lanacoin-eternity.com','wss://relay.lanaheartvoice.com','wss://relay.lovelana.org'];
const since = Math.floor(Date.now()/1000) - 5*86400;
const events = await pool.querySync(relays, { kinds:[87003], since, limit: 500 });
console.log('total:', events.length);
const zeros = events.filter(e => {
  const a = e.tags.find(t=>t[0]==='UnregistratedAmountLatoshis');
  return !a || a[1]==='0' || a[1]==='';
});
console.log('zero amount:', zeros.length);
const byCreator = {};
for (const e of zeros) byCreator[e.pubkey]=(byCreator[e.pubkey]||0)+1;
console.log('zeros by pubkey:', byCreator);
for (const e of zeros.slice(0,5)) {
  console.log(JSON.stringify({id:e.id,pubkey:e.pubkey,created_at:new Date(e.created_at*1000).toISOString(),tags:e.tags,content:e.content}));
}
process.exit(0);
