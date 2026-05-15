## Diagnoza

Filter trusted signerjev deluje pravilno — naš `LanaRegistrar` pubkey (`bcb0cf91…521e`) JE v `trusted_signers` v KIND 38888. Tvoji ključi niso bili izbrisani.

Težava je v **vrstnem redu in kapaciteti poizvedbe**:

- Releji vrnejo zadnjih `limit: 1000` Kind 87003 eventov (dejansko vrnili 500).
- Vseh 500 vrnjenih je iz spam pubkeya `080936…26b427` (NI trusted).
- Naši legitimni eventi iz našega registrarja so zadnjič bili objavljeni **20. aprila 2026** (pred ~25 dnevi) — releji jih ne pošljejo več, ker jih spam izrine iz najnovejših 500.
- Filter potem upravičeno odreže vseh 500 → 0 prikazanih.

Zato vidiš prazno tabelo: ne ker je filter slab, ampak ker spam zasede celotno okno relay query-ja.

## Popravek

Premakniti filter **na rejev side** — v `pool.querySync(...)` Filter dodati `authors: [...trustedPubkeys]`. Tako rele od začetka pošlje samo evente avtoriziranih signerjev in spam ne more zasesti limit kvote.

### Spremembe (samo `src/hooks/useAllNostrEvents.ts`)

1. Pridobi trusted pubkeys ZGORAJ pred query-jem.
2. Če je trusted set neprazen, dodaj `authors: [...trusted]` v oba filtra (87003 in 87009).
3. Obdrži tudi client-side filter kot varnostno mrežo (releji včasih ne spoštujejo `authors`).
4. Če `trusted_signers` še ni naložen iz session storage (race condition po reload-u), počakaj/ne filtriraj — fallback na trenutno vedenje, da ne prikažemo praznega seznama brez razloga.

```ts
const trusted = getTrustedPubkeys();
const trustedAuthors = trusted.size > 0 ? [...trusted] : undefined;

const baseFilter87003: Filter = { kinds: [87003], limit: 1000 };
const baseFilter87009: Filter = { kinds: [87009], limit: 1000 };
if (trustedAuthors) {
  baseFilter87003.authors = trustedAuthors;
  baseFilter87009.authors = trustedAuthors;
}

const [fetched87003, fetched87009] = await Promise.all([
  pool.querySync(relaysToUse, baseFilter87003),
  pool.querySync(relaysToUse, baseFilter87009),
]);
```

Client-side `filtered87003` / `filtered87009` ostane nespremenjen kot dvojna obramba.

## Validacija po implementaciji

1. Osveži landing → console mora prikazati `Trusted filter: 87003 N → N` (skoraj brez razlike, ker rele že filtrira).
2. Tabela "Unregistered Lana events from Nostr relays" mora pokazati naše stare aprilske evente (~82 v bazi).
3. Spam pubkey `080936…26b427` se ne pojavi.

## Opomba glede sveže aktivnosti

Cron `kind-cron-87003-monitoring-unregistered-coins` v zadnjih 25 dneh ni objavil nobenega novega 87003 eventa, ker `unregistered_lana_events` v tabeli ni novih. To je ločeno vprašanje — ko bo cron spet zaznal neregistrirano LANO, se bo objavil normalno (s pravilnim `UnregisteredAmountLatoshis` tagom, ki je bil že popravljen).