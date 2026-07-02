import { SimplePool } from 'nostr-tools';
const pool = new SimplePool();
const relays = ['wss://relay.lanavault.space','wss://relay.lanacoin-eternity.com','wss://relay.lanaheartvoice.com','wss://relay.lovelana.org'];
const evs = await pool.querySync(relays, { kinds:[38888], authors:['9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3'], '#d':['main'], limit: 10});
console.log('count', evs.length);
for (const e of evs.sort((a,b)=>b.created_at-a.created_at)) {
  const split = e.tags.find(t=>t[0]==='split')?.[1];
  const ver = e.tags.find(t=>t[0]==='version')?.[1];
  const fx = e.tags.filter(t=>t[0]==='fx');
  console.log(new Date(e.created_at*1000).toISOString(), 'split=', split, 'version=', ver, 'fx=', JSON.stringify(fx), 'id=', e.id.slice(0,12));
}
pool.close(relays);
process.exit(0);
