## Cilj
Prikazati **dejansko število blockchain transakcij registriranih LAN**, brez change transakcij — tako v UI (`LandingPage`) kot v javnem API-ju (`public-stats`).

## Problem
Trenutno se štejejo **DB vrstice** v `transactions` tabeli, kjer ena blockchain TX z več prejemniki ustvari več vrstic. Posledica: številka 672 (z 1000-row limitom) oz. 1244 (s paginacijo) namesto pravilnih ~42.

## Rešitev: štej distinct TX hash

Iz polja `notes` izvlečemo blockchain TX hash z regex `Blockchain transaction ([a-f0-9]{64})`.

Logika štetja:
1. Vse vrstice grupiramo po TX hash.
2. TX hash šteje v skupno številko **če in samo če** vsaj ena njegova vrstica ni čisti change (`from_wallet_id IS NULL OR to_wallet_id IS NULL OR from_wallet_id <> to_wallet_id`).
3. Skupni znesek (`total_amount_lana`) seštejemo samo iz ne-change vrstic znotraj teh TX hash-ev (sicer bi double-counting).
4. Vrstice brez TX hash v notes (npr. interni vnosi) tretiramo kot ločene "transakcije" — vsak ID = ena TX, prav tako filtrirano za change.

## Spremembe v datotekah

### 1. `supabase/functions/public-stats/index.ts`
- Razširi SELECT s `id, notes` (poleg `created_at, amount, from_wallet_id, to_wallet_id`).
- Po fetchu paginiranih TX-jev:
  - Izlušči `tx_hash` iz `notes` (regex).
  - Grupiraj po `tx_hash` (oz. po `id` če hash manjka).
  - Za vsako skupino: če obstaja vsaj ena ne-change vrstica → šteje kot 1 TX, znesek = vsota `amount` ne-change vrstic.
- Tako izračunani `transactions_today_count`, `transactions_today_total_lana`, `transactions_yesterday_*`, `transactions_per_day_last_30`.
- Enako za `transactions_all_time_count` in `transactions_all_time_total_lana`.

### 2. `src/pages/LandingPage.tsx`
- V query, ki vleče današnje/učerajšnje TX-je, dodaj `id, notes` in apliciraj enako distinct-hash logiko za prikazano številko.
- Dodaj `.limit(10000)` (oz. paginacijo) da se izognemo 1000-row limitu.

### 3. `src/pages/PublicApiPage.tsx` (opcijsko)
- Posodobi opis polj v shema bloku: pojasni, da `transactions_*_count` šteje **distinct blockchain transakcije**, ne DB vrstic, in da so change/self-transfer transakcije izključene.

## Validacija po implementaciji
SQL že potrjuje: za danes vrne **42** ne-change blockchain TX-jev (od 54 distinct hash-ev). To bo nova prikazana številka.
