## Cilj

Dovoli admin brisanje main denarnice tudi, ko ima uporabnik še druge (ne-main) denarnice. Vse pripadajoče denarnice se arhivirajo v `deleted_wallets` in nato odstranijo iz `wallets`, glavni zapis pa iz `main_wallets`.

## Spremembe

### `supabase/functions/admin-delete-main-wallet/index.ts`
- **Odstrani blokado** `if (otherWallets.length > 0) → 400`. Nadomesti z opozorilom v log (`⚠ User owns N other wallets — they will also be archived and deleted`).
- **Nostr publish** (KIND 5 + tombstone 30889) ostane nespremenjen — tombstone na `d=nostr_hex_id` izbriše celoten listing uporabnika, kar pokrije vse naslove naenkrat.
- **Arhiv v `deleted_wallets`**: poleg trenutnega `main_wallet` zapisa vstavi tudi po eno vrstico za vsako vrstico v `relatedWallets` (tako main entries kot others). Vsaka vrstica:
  - `original_wallet_uuid = wallet.id`
  - `wallet_id = wallet.wallet_id`
  - `wallet_type = wallet.wallet_type` (originalni tip)
  - `nostr_hex_id = ownerHex`
  - `main_wallet_id = mainWallet.id`
  - `reason = "admin_deleted_with_main | admin_nostr_hex_id: <adminHex> | frozen: <bool>"`
  - Vse vstavi v enem `insert([...])` klicu.
- **Brisanje iz `wallets`**: `delete().eq("main_wallet_id", mainWallet.id)` izbriše vse pripadajoče vrstice (main + others) v enem klicu — namesto trenutnega `delete().in("id", mainEntries.ids)`.
- **Brisanje iz `main_wallets`** ostane.
- Response sporočilo dopolni: `wallets_archived: N, wallets_deleted: N`.

### `src/components/AdminDeleteMainWalletTab.tsx`
- `canDelete = !!mainWallet` (odstrani pogoj `otherWallets.length === 0`).
- Odstrani warning blok "Cannot delete: user still owns N other wallet(s)".
- V `AlertDialog` step 1 dodaj jasno opozorilo: "Vse pripadajoče denarnice (skupaj N) bodo arhivirane in izbrisane." — pokaže se ne glede na število.
- Toast po uspehu: "Main wallet + N other wallets deleted and archived."

## Tehnične opombe

- `deleted_wallets` že podpira INSERT za `authenticated` in nima unique constraintov na `original_wallet_uuid`, tako da bulk insert deluje.
- Stanja (balance) ne shranjujemo — `deleted_wallets` nima stolpca za znesek; arhiviramo identiteto naslova (`wallet_id`, `wallet_type`, `main_wallet_id`, `nostr_hex_id`). To je v skladu z obstoječim modelom arhiviranja v drugih admin delete funkcijah.
- Brez sprememb sheme, brez sprememb RLS.

## Summary

Admin lahko zdaj izbriše main denarnico ne glede na število drugih denarnic uporabnika. Edge funkcija najprej objavi NIP-09 deletion + tombstone 30889, nato arhivira VSE pripadajoče vrstice v `deleted_wallets` in jih izbriše iz `wallets` ter `main_wallets`. UI odstrani blokado in opozorilo.
