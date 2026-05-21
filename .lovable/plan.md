## Cilj

Lastnik denarnice tipa **Wallet** lahko z enim klikom spremeni tip v **Retail**. Pretvorba je enosmerna in dovoljena izključno za vir `Wallet`. Vsi ostali tipi (Main Wallet, LanaPays.Us, Knights, Lana8Wonder, Retail, …) ostajajo nespremenljivi. Po uspešni spremembi se na releje ponovno objavi `KIND 30889` z osveženim seznamom denarnic uporabnika.

## Spremembe

### 1. Nova edge funkcija `update-wallet-type`
Po vzoru `update-wallet-notes/index.ts`:
- Vhod: `api_key`, `wallet_uuid`, `nostr_id_hex`, `new_wallet_type`.
- Validacije:
  - Aktivni API ključ.
  - Denarnica obstaja in `main_wallet.nostr_hex_id === nostr_id_hex` (lastništvo).
  - `wallet.wallet_type === 'Wallet'` in `new_wallet_type === 'Retail'` — sicer 403/400 z jasno napako (prepreči obraten prehod in vse druge prehode).
- `UPDATE wallets SET wallet_type = 'Retail' WHERE id = wallet_uuid`.
- Ponovna gradnja in objava `KIND 30889`:
  - prebere `nostr_registrar_nsec` iz `app_settings`,
  - prebere releje iz `system_parameters.relays` (flat array — glej core memory),
  - povleče vse uporabnikove `wallets` (`wallet_id, wallet_type, notes, amount_unregistered_lanoshi, frozen`),
  - sestavi `w` tag po obstoječi v1.1 shemi s 7 polji,
  - `SimplePool.publish` z `Promise.race` timeouti (8s/objava, ~30s skupaj — glej core memory),
  - tag `d` = `nostr_id_hex`, `status` = `"active"`.
- Vrne `{ success, message }` brez razkrivanja internih napak.

### 2. Frontend — `WalletCard.tsx`
- Nov prop `onConvertToRetail?: (id: string) => Promise<void>`.
- Akcija vidna **samo** če `wallet.type === 'Wallet'` (case-sensitive ujemanje, ker so DB vrednosti case-sensitive — glej core memory) in ni `frozen`.
- Gumb v vrstici z akcijami: »Convert to Retail« s potrditvenim `AlertDialog`-om, ki opozori, da je dejanje enosmerno.
- Po uspehu: toast + `refetch` (preko klica v parent handlerju).

### 3. `Wallets.tsx`
- Dodan handler `handleConvertToRetail(id)`, ki kliče `supabase.functions.invoke('update-wallet-type', { body: { api_key, wallet_uuid, nostr_id_hex, new_wallet_type: 'Retail' } })`, prikaže toast in osveži seznam.
- Preda `onConvertToRetail` v `WalletCard`.

### 4. Brez sprememb sheme
DB ostaja enaka — `Retail` že obstaja v `wallet_types`. Migracije niso potrebne.

## Tehnične opombe

- `verify_jwt = false` za edge funkcijo (skladno z ostalimi tukaj uporabljenimi funkcijami, API ključ se validira v kodi).
- Strogo strežniško preverjanje pravila prehoda — frontend zgolj skriva gumb, edge funkcija zavrne vse, kar ni `Wallet → Retail`.
- `KIND 30889` objavljen z istim formatom kot v `update-wallet-notes`, da ohranimo v1.1 shemo (7. polje `freeze_status`).

## Datoteke

- nov: `supabase/functions/update-wallet-type/index.ts`
- spremenjen: `src/components/WalletCard.tsx`
- spremenjen: `src/pages/Wallets.tsx`
