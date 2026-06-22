## Dodatek iskanja po Wallet ID na `/admin/delete`

V zavihku **Delete Main** trenutno deluje samo iskanje po Nostr hex ID. Dodali bomo možnost iskanja tudi po **Wallet ID** (L-naslov).

### Spremembe v `src/components/AdminDeleteMainWalletTab.tsx`

1. Posodobiti placeholder inputa: `"Nostr hex ID (64 hex) or Wallet ID (L...)"`.
2. V `handleSearch` dodati avtomatsko prepoznavo:
   - Če je vnos 64-znakovni hex → obstoječa pot (iskanje `main_wallets` po `nostr_hex_id`).
   - Če se začne z `L` → najprej poiskati v `main_wallets.wallet_id`; če ni zadetka, v `wallets.wallet_id` → vzeti `main_wallet_id` in naložiti pripadajoč main wallet.
   - Sicer napaka: `"Enter a valid Nostr hex ID or Wallet ID (L...)"`.
3. Po najdbi main walleta naložiti pripadajoče `wallets` enako kot zdaj. Vse nadaljnje obnašanje (delete flow, KIND 30889/27235 podpis) ostane nespremenjeno — še vedno se uporabi `mainWallet.nostr_hex_id`.

### Brez sprememb
- Zavihek **Delete Frozen**, edge funkcije, RLS, baza.