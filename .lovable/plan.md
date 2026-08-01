## Cilj

Nova cron edge funkcija, ki bere releje, zaznava KIND 87057 (facilitator zamrzne/odmrzne osebo), zapiše dogodek v bazo, zamrzne/odmrzne vse denarnice te osebe in propagira spremembo na KIND 30889 (trenutno stanje) ter KIND 87010 (audit).

## Ugotovljeno stanje

- `kind-cron-87055-own-exit-monitor` že dela isti vzorec: releji iz `system_parameters.relays`, `since` iz zadnjega zapisa, dedupe po `event_id`, freeze/unfreeze z razlogom `frozen_own`, `publish87010(...)` in nato KIND 30889 z `d = pubkey` in `w` tagi (7. polje = freeze_reason).
- `wallets` ima le `frozen`, `freeze_reason` — ni podatka o SPLIT-u zamrznitve niti o veljavnosti do SPLIT-a.
- `wallet_freeze_events` (audit 87010) ima `status`, `reason`, `amount_lanoshis`, `effective_at`, `frozen_at` — prav tako brez SPLIT polj.
- Trenutni SPLIT je v `system_parameters.split` (iz KIND 38888).

## Načrt izvedbe

**1. Migracija — SPLIT polja in tabela dogodkov**

- `wallets`: dodaj `freeze_split integer` (v katerem SPLIT-u je bila zamrznjena), `freeze_until_split integer` (do katerega SPLIT-a velja; NULL = odprto), `freeze_reason_details text default ''` (dodatni razlog / prosto besedilo iz `content`).
- `wallet_freeze_events`: dodaj enaka polja `split`, `until_split`, `reason_details`, da audit ostane popoln.
- Nova tabela `own_person_freeze_events`: `id`, `event_id` (unique), `facilitator_pubkey`, `frozen_person_hex`, `process_event_id`, `status` (`frozen`/`live`), `content`, `effective_at`, `frozen_at`, `until_split`, `split_at_event` (SPLIT ob obdelavi), `event_created_at`, `applied`, `created_at`.
- GRANT (`select` za `anon`/`authenticated`, `all` za `service_role`), RLS vklopljen, javno branje, pisanje samo service_role.

**2. Nova edge funkcija `kind-cron-87057-own-person-freeze-monitor`**

Obdelava po korakih:

1. Naloži releje in trenutni `split` iz `system_parameters`.
2. `since` = zadnji `event_created_at` iz `own_person_freeze_events` − 10 min, sicer zadnjih 24 h.
3. Poizvedba `{ kinds: [87057], since }`.
4. Validacija dogodka (fail-closed):
   - `status` mora biti `frozen` ali `live`, sicer zavrzi;
   - točno en `p` tag z markerjem `frozen` (več = zavrni);
   - `e` tag z markerjem `process` ali `root` (marker ne sme biti razlog za zavrnitev) → `case_root`;
   - `effective_at` obvezen; `content` neprazen pri `frozen`.
5. Preverjanje avtoritete facilitatorja:
   - naloži KIND 87044 po `case_root` id → avtor case roota;
   - naloži KIND 37044 na `d = own:<case_root>`; upoštevaj samo zapise, katerih avtor je avtor case roota (ali facilitator, ki mu je bil predan — sledenje verigi predaje);
   - allow-list = vsi `p` tagi z markerjem `facilitator` (marker na indeksu 2 ali 3), male črke;
   - če `event.pubkey` ni na allow-listi → dogodek se zavrne in ne shrani kot veljaven.
6. Dedupe po `event_id`, vstavi zapis v `own_person_freeze_events`.
7. Izračun stanja na osebo (ANY-OF med facilitatorji): za vsak `(oseba, facilitator)` vzemi najvišji `created_at`; oseba je zamrznjena, če katerikoli zadnji zapis pravi `frozen` **in** njegov `until_split` (če obstaja) še ni pretečen glede na trenutni SPLIT.
8. Uveljavitev na denarnicah:
   - najdi `main_wallets` po `nostr_hex_id` = oseba (če je ni, samo zabeleži in preskoči);
   - freeze: vse še nezamrznjene denarnice → `frozen = true`, `freeze_reason = 'frozen_own_person'`, `freeze_split = <trenutni split>`, `freeze_until_split = <until_split ali NULL>`, `freeze_reason_details = <content>`;
   - unfreeze (ali SPLIT lapse): samo denarnice z `freeze_reason = 'frozen_own_person'` → `frozen = false`, razlogi in SPLIT polja počiščena.
9. KIND 87010 za vsako spremenjeno denarnico prek obstoječega `_shared/publish87010.ts` (razširjen za `split`, `until_split`, `reason_details` v tagih in v `wallet_freeze_events`); `frozen_at` pri unfreeze iz `getLastFrozenAt`.
10. KIND 30889 za vsako spremenjeno osebo — isti format kot v 87055 monitorju (7. polje `w` taga = freeze_reason).
11. Označi obdelane zapise `applied = true`, vrni povzetek korakov.

**3. Razširitev `_shared/publish87010.ts`**

- Nova neobvezna polja vnosa: `split`, `until_split`, `reason_details`.
- Doda taga `["split", "<n>"]` in `["until_split", "<n>"]` (ko obstaja) ter shrani v nove stolpce `wallet_freeze_events`.
- Mapiranje razloga: `frozen_own_person` → `frozen_too_wild` (spec slovar).

**4. Konfiguracija in cron**

- `supabase/config.toml`: `[functions.kind-cron-87057-own-person-freeze-monitor] verify_jwt = false`.
- Funkcija je klicljiva ročno; navodilo za cron (npr. vsakih 10 min) dodam v `.lovable/CRON_SETUP.md` — cron se v Lovable Cloud doda ročno, enako kot ostali.

**5. SPLIT lapse pri vsakem zagonu**

Ob vsakem teku funkcija preveri tudi vse denarnice z `freeze_reason = 'frozen_own_person'` in `freeze_until_split < trenutni split` → samodejno odmrzne, objavi 87010 (`unfrozen`, memo "SPLIT lapse") in osveži 30889.

## Tehnične podrobnosti

- Vsi ključi v hex (64 znakov); `npub`/bech32 se zavrne.
- Objave na releje z `Promise.race` timeouti (8 s na objavo, 30 s skupno), kot pri ostalih funkcijah.
- Napaka pri Nostr objavi nikoli ne prekine spremembe v bazi — samo se logira.
- KIND 87057 je procesno dejstvo; denarniško stanje ostaja izključno v 30889/87010 — zato se `frozen_own_person` nikoli ne prepiše čez druge razloge (max cap, l8w …), in odmrzne se le tisto, kar je zamrznil ta proces.
