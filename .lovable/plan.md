## Težava

Na landing strani (`/`) zavihek **All Wallets** ne vključuje Retail denarnic — niti v seznamu niti v seštevku »Total«. V bazi je 23 Retail denarnic, ki so spregledane.

## Vzrok

V `src/pages/LandingPage.tsx` (vrstice 668–670) je filter `allWallets` omejen samo na `Wallet` in `Main Wallet`:

```ts
const allWallets = useMemo(() => {
  return walletBalances.filter(
    w => (w.wallet_type === 'Wallet' || w.wallet_type === 'Main Wallet') && !w.frozen
  );
}, [walletBalances]);
```

Knights, LanaPays.Us, Lana.Discount in Lana8Wonder imajo svoje zavihke — Retail pa svojega zavihka nima, zato bi moral biti vključen v All Wallets, a trenutno pade ven.

`/all-wallets` in `/lanaholders` že imata Retail v `WALLET_TYPES`, zato sta tam pravilna — težava je samo na zavihku All Wallets na landing strani.

## Popravek

V `src/pages/LandingPage.tsx`:

1. **Vrstica 669** — dodaj `Retail` v filter:
   ```ts
   const allWallets = useMemo(() => {
     return walletBalances.filter(
       w => (w.wallet_type === 'Wallet' || w.wallet_type === 'Main Wallet' || w.wallet_type === 'Retail') && !w.frozen
     );
   }, [walletBalances]);
   ```

2. **Vrstica 1585** — posodobi opis zavihka:
   ```
   Balance overview for Wallet, Main Wallet, and Retail types
   ```

Števec ob naslovu (`All Wallets ({allWallets.length})`) in `allWalletsTotalBalance` se osvežita samodejno.

## Kar ostane nespremenjeno

- `totalRegisteredBalance` (»Total registered Lanas« na vrhu) že vključuje vse tipe — pravilen.
- `/all-wallets`, `/lanaholders` ostaneta nedotaknjena.
- Drugi zavihki (Knights, Lana8Wonder, LanaPays.Us, Lana.Discount, Frozen) se ne spreminjajo.