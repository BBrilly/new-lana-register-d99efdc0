## Cilj

Ob vsaki spremembi statusa zamrznitve denarnice objaviti ločen KIND 87010 dogodek (append-only audit) — za vsako denarnico posebej — poleg obstoječega KIND 30889 (trenutno stanje). Dodatno enkratno objaviti zgodovino za že zamrznjene denarnice.

## Ugotovljeno stanje

- Skoraj vse zamrznitve/odmrznitve gredo skozi edge funkcijo `freeze-wallets` (klici iz FreezeManager, FrozenAccountsTab, OverLimit/Retail/LanaPays/Lana8Wonder/MaxCap tabov, ResolveMaxCap, blockchain-monitor auto-freeze). Edina izjema je `kind-cron-87055-own-exit-monitor`, ki `wallets.frozen` posodablja neposredno.
- Tabela `wallets` ima le `frozen`, `freeze_reason`, `updated_at` — ni zgodovine zamrznitev.
- Trenutno je zamrznjenih 21 denarnic, vse z razlogom `frozen_max_cap`; datum zamrznitve je približek iz `updated_at` (kar že prikazuje stolpec "Frozen At").

## Specifikacija KIND 87010 (iz dokumentacije)

Obvezni tagi: `wallet` (L-naslov), `p` (hex kupca), `status` = `frozen|unfrozen`, `reason`, `amount_lanoshis` (celo število), `effective_at` (unix). Priporočeno: `frozen_at` (samo pri unfrozen), `a` = `30889:<registrar_hex>:<customer_hex>`. Neponovljiv (append-only), podpisan z registrar ključem iz KIND 38888.

Dovoljeni razlogi po specifikaciji: `frozen_l8w`, `frozen_max_cap`, `frozen_too_wild`. V bazi uporabljamo tudi `frozen_unreg_Lanas` in `frozen_own` — predlagano mapiranje ob objavi (v bazi ostane original):
- `frozen_unreg_Lanas` → `frozen_too_wild`
- `frozen_own` → `frozen_too_wild`
- ostalo → nespremenjeno; privzeto `frozen_l8w`.

## Načrt izvedbe

**1. Migracija — tabela zgodovine `wallet_freeze_events`**
- Polja: `id`, `wallet_uuid`, `wallet_address`, `nostr_hex_id`, `status` (frozen/unfrozen), `reason`, `amount_lanoshis` (bigint), `effective_at` (timestamptz), `frozen_at` (timestamptz, nullable), `nostr_event_id`, `published_at`, `created_at`.
- GRANT za `authenticated`/`anon` (branje) in `service_role` (vse), RLS + politike (javno branje, zapis samo service_role).

**2. Skupni modul `supabase/functions/_shared/publish87010.ts`**
- Sestavi in podpiše KIND 87010 z registrar nsec iz `app_settings.nostr_registrar_nsec`, objavi na releje iz `system_parameters.relays` (z `Promise.race` timeouti 8s/objavo, 30s skupno, kot velja za ostale funkcije).
- Prejme seznam vnosov `{wallet_address, nostr_hex_id, status, reason, amount_lanoshis, effective_at, frozen_at?}`, objavi **en dogodek na denarnico** in vsakega zapiše v `wallet_freeze_events`.

**3. `freeze-wallets` — objava ob vsaki akciji**
- Po uspešni posodobitvi baze in pred/poleg KIND 30889: za vsako prizadeto denarnico pridobi trenutno stanje (edge funkcija `fetch-wallet-balance` z Electrum strežniki iz `system_parameters`) → `amount_lanoshis = round(balance * 1e8)`.
- `effective_at` = trenutek akcije; pri `unfrozen` doda `frozen_at` iz zadnjega `frozen` zapisa v `wallet_freeze_events` (če obstaja, sicer iz `wallets.updated_at` pred posodobitvijo).
- Pri unfreeze uporabi razlog, ki se odpravlja (prejšnji `freeze_reason` iz baze, prebran pred `UPDATE`).
- Napake pri objavi ne smejo prekiniti zamrznitve — logiraj in nadaljuj (enako kot pri 30889).

**4. `kind-cron-87055-own-exit-monitor`**
- Po vsaki avtomatski zamrznitvi/odmrznitvi (OWN exit / re-enter) kliče isti skupni modul, da se tudi te spremembe objavijo kot 87010.

**5. Enkratni backfill za obstoječe zamrznjene denarnice**
- Nova edge funkcija `backfill-87010` (ročni klic, brez crona), ki:
  - prebere vse denarnice z `frozen = true` (trenutno 21), pridobi stanja, uporabi `updated_at` kot `effective_at`;
  - preskoči tiste, ki že imajo zapis v `wallet_freeze_events` (idempotentno);
  - objavi 87010 `status=frozen` za vsako in zapiše v tabelo.
- Opomba: za že **odmrznjene** denarnice v bazi ni sledi (ni zgodovinskega zapisa `frozen=false` z datumom), zato zgodovinskih odmrznitev ni mogoče verodostojno rekonstruirati — backfill pokrije le trenutno zamrznjene. Od uvedbe naprej se beleži oboje.

**6. UI (minimalno)**
- V zavihku "Frozen Accounts" na `/admin/freeze` stolpec "Frozen At" preberi iz `wallet_freeze_events` (zadnji `frozen` zapis), s fallbackom na `updated_at`.

## Tehnične podrobnosti

- Registrar ključ: obstoječi `nostr_registrar_nsec` iz `app_settings`; `a` tag = `30889:<registrar pubkey>:<customer hex>`.
- `amount_lanoshis` vedno celo število ≥ 0; če stanja ni mogoče pridobiti, se uporabi 0 in doda `memo` z opombo.
- 87010 se objavi skupaj z osveženim 30889, kot zahteva specifikacija.
