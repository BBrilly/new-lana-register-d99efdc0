# Avtomatski freeze/unfreeze ob KIND 87055 (OWN Exit / Re-enter)

Cron na vsakih 5 minut bere relayje, lovi nove KIND 87055 dogodke, in glede na zadnji `action` (`exit`/`enter`) avtomatsko zamrzne ali odmrzne vse denarnice avtorja ter propagira spremembo prek KIND 30889.

## 1. Nova tabela `own_exit_events`
Migration — sledi vsem prejetim 87055 dogodkom (za audit + dedup + "latest-wins"):

- `id uuid PK`
- `event_id text UNIQUE NOT NULL` — Nostr event id
- `pubkey text NOT NULL` — avtor (= main_wallet.nostr_hex_id)
- `process_event_id text NOT NULL` — iz `e` taga
- `action text NOT NULL CHECK (action IN ('exit','enter'))`
- `content text`
- `event_created_at timestamptz NOT NULL`
- `processed_at timestamptz DEFAULT now()`
- `applied boolean DEFAULT false` — ali smo na podlagi tega že spremenili stanje
- Indeksi: `(pubkey, process_event_id, event_created_at DESC)`
- RLS: enable; `GRANT SELECT` za `anon` + `authenticated` (public audit), `GRANT ALL` za `service_role`. Policy: javno branje.

## 2. Nova edge funkcija `kind-cron-87055-own-exit-monitor`
`verify_jwt = false`. Naloge:

1. Naloži relaye iz `system_parameters` (najnovejši vnos).
2. Določi `since` = `max(event_created_at)` iz `own_exit_events` minus 10 min varnostni rob (ali zadnjih 24 h ob prvem zagonu).
3. Z `SimplePool.querySync(relays, { kinds: [87055], since })` poberi dogodke.
4. Za vsak dogodek:
   - Preskoči, če `event_id` že obstaja v `own_exit_events`.
   - Preveri obliko: `action` ∈ {exit, enter}, `e` tag s `process` markerjem prisoten, `pubkey` je 64-hex.
   - **Avtoriziraj**: avtor mora obstajati v `main_wallets.nostr_hex_id`. Sicer zavrži.
   - `INSERT` v `own_exit_events`.
5. Grupiraj po `(pubkey, process_event_id)`, izberi event z največjim `event_created_at` (latest-wins).
6. Za vsak (pubkey, proces) izračunaj **želeno stanje uporabnika za ta proces**: `exit` ⇒ zamrznjen, `enter` ⇒ aktiven.
7. **Trenutno stanje uporabnika**: če KATERIKOLI odprt proces zahteva `exit` ⇒ uporabnik mora biti frozen; sicer unfrozen (za naš trigger).
8. **Apply** spremembo samo, če se trenutno DB stanje razlikuje:
   - `exit` → vse denarnice tega `main_wallet_id` (ki niso že frozen z drugim razlogom): `UPDATE wallets SET frozen = true, freeze_reason = 'frozen_own'`.
   - `enter` → odmrzni samo tiste z `freeze_reason = 'frozen_own'` (nikoli ne odmrzni `frozen_l8w`, `frozen_over_limit` itd.).
9. Po DB spremembi: zgradi in objavi posodobljen **KIND 30889** (po istem vzorcu kot `supabase/functions/freeze-wallets/index.ts` — vključno z vsemi `w` tagi, `status="active"` na profilu, podpis z `nostr_registrar_nsec`, broadcast z `Promise.race` timeouti).
10. Označi obdelane dogodke `applied = true` in vrni povzetek.

Logiranje vsakega koraka z `correlationId`, da je razvidno v edge function logih.

## 3. Cron job (vsakih 5 minut)
Z `supabase--insert` ustvariti `cron.schedule` zapis, ki kliče edge funkcijo preko `net.http_post` (po vzorcu obstoječih cronov v `.lovable/CRON_SETUP.md`). Naslov: `kind-cron-87055-own-exit-monitor`, urnik `*/5 * * * *`.

## 4. Brez sprememb v UI
Proces je v celoti server-side. Obstoječ admin Freeze UI ostane nedotaknjen — `frozen_own` se bo pojavil v seznamih zamrznjenih denarnic, ker uporablja `wallets.frozen` + `freeze_reason`.

## Tehnične opombe
- `freeze_reason = 'frozen_own'` — uporablja se izključno za ta avtomatski tok; ročno odmrzovanje takih denarnic naj ostane mogoče prek obstoječega admin UI-ja, a se bo ob naslednjem heartbeatu vrnilo, dokler je zadnji 87055 še `exit` (kar je željeno vedenje "propagacije").
- Latest-wins se preverja PO INSERTU vseh novih dogodkov, ne zaporedno — tako se prepreči nepotreben "flap" znotraj enega cikla.
- KIND 30889 broadcast se izvede ENKRAT na uporabnika na cikel (po vseh spremembah), ne na vsak event.
- Verify_jwt = false (cron klic brez auth).
