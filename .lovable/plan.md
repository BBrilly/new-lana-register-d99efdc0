
## Cilj
Objaviti NIP-09 (Kind 5) deletion request na vse relayje za 396 Kind 87003 + 396 pripadajočih Kind 4 (NIP-04 DM) eventov, ki so bili danes objavljeni za znesek `< 1 LANA` (vsi po 0.00000001 — prah, ki se ne bi smel objavljati).

## 1. DB migracija
Nove kolone na `unregistered_lana_events` za sledenje izbrisom:
```sql
ALTER TABLE public.unregistered_lana_events
  ADD COLUMN IF NOT EXISTS nostr_deletion_published boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nostr_deletion_event_ids text[],
  ADD COLUMN IF NOT EXISTS nostr_deletion_published_at timestamptz;
```

## 2. Nova edge funkcija `delete-small-unregistered-87003`
Pot: `supabase/functions/delete-small-unregistered-87003/index.ts`

Body (vsi opcijski):
- `maxAmount` (default `1`) — vse `unregistered_amount < maxAmount`
- `sinceToday` (default `true`) — `nostr_87003_published_at >= date_trunc('day', now())`
- `dryRun` (default `false`) — samo prešteje, ne objavlja
- `batchSize` (default `100`) — koliko `e` tagov na en Kind 5

Logika:
1. Naloži `nostr_registrar_nsec` (`app_settings`), `relays` (`system_parameters`).
2. Pridobi vse kandidate s `nostr_deletion_published = false` in `nostr_87003_event_id IS NOT NULL`.
3. Razdeli na batche po `batchSize`:
   - **Kind 5 za 87003**: `tags = [...e-tagi 87003 ID-jev, ['k','87003']]`, content `"Auto-cleanup: published in error for dust amount (<1 LANA)"`
   - **Kind 5 za DM-je**: `tags = [...e-tagi DM event ID-jev, ['k','4']]`, isti content
4. Vsak Kind 5 podpiši (`finalizeEvent`) in objavi z `Promise.race` (8s/relay) na vse relayje (isti pattern kot drugi cron-i).
5. Po uspešni objavi (vsaj 1 relay) označi pripadajoče vrstice:
   ```sql
   UPDATE unregistered_lana_events
   SET nostr_deletion_published = true,
       nostr_deletion_event_ids = ARRAY[<kind5_87003_id>, <kind5_dm_id>],
       nostr_deletion_published_at = now()
   WHERE id = ANY(<batch_ids>)
   ```

Response: `{ success, processed, batches, deletionEventIds: [...], dryRun }`.

## 3. Izvedba
1. Deploy funkcije.
2. Klic `dry-run`: pričakovano `processed: 396, batches: 4 (po 100) → 8 Kind 5 dogodkov`.
3. Pravi klic z `dryRun=false`.
4. Preverim DB da so vrstice označene + edge logs za potrjeno objavo.

## 4. Učinek
- Relayji, ki spoštujejo NIP-09, izbrišejo originalne Kind 87003 in DM-je.
- LandingPage (bere unregistered Lanas iz Nostra) jih ne bo več prikazoval, ko se relayji posodobijo.
- DB vrstice ostanejo za audit, samo označene kot izbrisane.
- Funkcija ostane na voljo (lahko jo kličemo ročno z drugim `maxAmount` v prihodnosti).

## Datoteke
- migracija (3 stolpci)
- nova: `supabase/functions/delete-small-unregistered-87003/index.ts`
