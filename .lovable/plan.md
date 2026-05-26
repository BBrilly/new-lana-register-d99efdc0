## Problem

Skupni "Total Registered Balance" na landing page (`/`) trenutno NE vključuje denarnic tipa **Retail**. V `src/pages/LandingPage.tsx` (vrstica 356) je hardcoded seznam wallet typov:

```ts
.in('wallet_type', ['Wallet', 'Main Wallet', 'Knights', 'Lana8Wonder', 'LanaPays.Us', 'Lana.Discount'])
```

Manjka `'Retail'`. Zato `totalRegisteredBalance` (vrstica 736, prikaz vrstica 927) ne šteje Retail bilance.

Isti manko je v `src/pages/AllWalletsPage.tsx` (vrstica 9) — tabela "All Wallets" prav tako izpušča Retail.

Opomba: `balance_snapshots` (cron v `blockchain-monitor`) **že** vključuje vse denarnice brez filtra, zato so zgodovinski grafi pravilni — popraviti je treba samo prikaz v realnem času na frontendu.

## Rešitev

1. **`src/pages/LandingPage.tsx`** — v `fetchAllWallets` (vrstica 356) dodaj `'Retail'` v `.in('wallet_type', [...])`.
2. **`src/pages/AllWalletsPage.tsx`** — v `WALLET_TYPES` konstanto (vrstica 9) dodaj `'Retail'`.
3. Posodobi komentar na vrstici 735 v LandingPage, da omeni Retail.

`LanaholdersPage` že vključuje Retail (vrstica 12), nič za popraviti.

## Vpliv

- Skupna bilanca na landing page bo večja za znesek Retail denarnic.
- Tabela "All Wallets" bo prikazala tudi Retail vrstice (z dodanim `wallet_type` stolpcem, ki je že podprt).
- Vsi obstoječi tabi (Lana8Wonder, Knights, LanaPays.Us, Lana.Discount) ostanejo nedotaknjeni — filtrirajo po lastnem tipu.
