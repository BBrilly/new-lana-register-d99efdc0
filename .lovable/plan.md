## Težava

Na sliki je toast: **"User still owns 8 other wallet(s). Delete those first."** — to sporočilo prihaja iz **stare/zastarele deployane različice** edge funkcije `admin-delete-main-wallet`. V trenutni izvorni kodi (`supabase/functions/admin-delete-main-wallet/index.ts`) je blokada **že odstranjena** in funkcija:

- Naredi log opozorilo namesto 400 napake (vrstica 131–133)
- Arhivira **vse** povezane denarnice v `deleted_wallets` (vrstica 207–224)
- Izbriše vse vrstice iz `wallets` preko `eq("main_wallet_id", …)` (vrstica 237–240)
- Izbriše glavni zapis iz `main_wallets`

Toast, ki ga uporabnik vidi, **ne obstaja v izvorni kodi** — to je dokaz, da na strežniku še teče prejšnja različica funkcije.

## Plan

### 1. Redeploy `admin-delete-main-wallet`
Ponovno deployaj edge funkcijo brez sprememb kode, da se na produkciji uporabi trenutna različica iz repozitorija.

### 2. Verifikacija
Po deployu poženi novo brisanje na isti glavni denarnici. Pričakovan rezultat:
- Brez toast napake
- Toast: `Main wallet + 9 related wallet(s) deleted and archived`
- Execution log prikaže: `⚠ User owns 8 other wallet(s) — they will also be archived and deleted` → `✓ Archived 9 row(s) to deleted_wallets` → `✓ Deleted 9 wallets row(s)` → `✓ Deleted from main_wallets` → `✅ DONE`

### Tehnične opombe

Nobene spremembe sheme ali RLS. Brez sprememb kode v `src/`. Logika brisanja (Nostr KIND 5 + tombstone KIND 30889 + arhiviranje v `deleted_wallets` + brisanje iz `wallets` in `main_wallets`) je že implementirana — potrebujemo le svež deploy.

Če po redeployu napaka ostane, bo naslednji korak preveriti `edge_function_logs` za točen vir 400 odgovora, ker tega sporočila v repo-ju ni.