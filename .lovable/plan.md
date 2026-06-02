## Prikaz trenutnega SPLIT-a v headerju

### Cilj
V navigacijski vrstici (`Layout.tsx`) prikazati trenutni SPLIT, da je uporabnikom vedno jasno, v katerem splitu so.

### Implementacija

1. **`Layout.tsx`** — dodaj prikaz splita:
   - Uporabi obstoječo funkcijo `getStoredParameters()` iz `@/utils/nostrClient`, ki prebere `split` iz `sessionStorage` (tja ga zapiše `LandingPage.tsx` preko `NostrClient`).
   - Če v `sessionStorage` ni podatka, naredi fallback poizvedbo na Supabase `system_parameters` tabelo.
   - Dodaj vizualni element v header (npr. poleg naslova "Decentralised Lana Register"), ki prikazuje `Split: X`.

### Primer končnega izgleda
```
[L] Decentralised Lana Register    Split: 42    [Wallets] [Admin] [Logout]
```

### Tehnične podrobnosti
- Datoteka: `src/components/Layout.tsx`
- Uporabi `useEffect` z enkratnim branjem ob mountu.
- Če split ni znan, se element ne prikaže.
- Stilsko usklajeno z obstoječim dizajnom (badge ali manjši tekst).

### Spremembe
- Urejanje: `src/components/Layout.tsx` — dodajanje importa, state, useEffect in JSX elementa v header.