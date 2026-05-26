## Cilj
Trenutno uporabniki ne morejo izbrisati zamrznjenih (frozen) denarnic — gumb za brisanje je skrit. Dovolimo brisanje tudi za frozen denarnice, pri čemer ohranimo ostale zaščite (protected tipi: Main, Lana8Wonder, Knights, LanaKnights).

## Sprememba

**`src/components/WalletCard.tsx`** (vrstica 76):
- Odstrani pogoj `!isFrozen` iz `canDelete`.
- Novo: `const canDelete = !["main", "lana8wonder", "knights", "lanaknights"].some(...)`.

To samodejno omogoči gumb za brisanje + dialog tudi pri zamrznjenih denarnicah.

## Backend
`supabase/functions/delete-wallet/index.ts` že **ne** blokira frozen denarnic (preverja samo PROTECTED_TYPES in lastništvo), zato ni potrebnih sprememb. Po brisanju funkcija ponovno objavi KIND 30889 z aktualnim seznamom denarnic.

## Brez sprememb
- Posodobitev spomina (`mem://features/wallet-deletion`) bo izvedena po implementaciji, da odraža, da frozen ne blokira več brisanja.
- Brez sprememb v UI besedilu dialoga (lahko dodam opozorilo, če želite — povejte).
