## Cilj
Na `/wallets/resolve-max-cap` za denarnice tipa **Lana8Wonder** ne zahtevamo doniranja celotnega stanja, ampak samo **zapadli znesek v LANA**, izračunan iz KIND 88888 plana in trenutne SPLIT cene. Za ostale tipe ostane obnašanje enako (celotno stanje).

## Vhodni podatki
- **subject_hex**: `nostr_hex_id` lastnika iz `main_wallets` (poiskan preko `wallets.main_wallet_id` za trenutno denarnico).
- **Trenutna cena EUR/LANA**: `system_parameters.split` (parseFloat).
- **Plan**: zadnji KIND 88888 event z relayjev, filter `{ kinds:[88888], "#d":["plan:"+subject_hex], "#p":[subject_hex] }`, veljaven le če `event.pubkey === "a56253e6232b2ab5a96b60d233434d4f759ba4c858a3cc0f4ec51906dce73ae6"`.

## Izračun zapadlega zneska
1. V `content.accounts` poišči account, kjer se `wallet` (ali `acct` tag `["acct", N, WALLET]`) ujema z `fromWallet` (L-address te denarnice).
2. Za vsak `level` tega accounta, kjer `trigger_price <= currentSplitPrice`, seštej `coins_to_give`.
3. `dueLana = round8(sum(coins_to_give))`.
4. Če accounta ne najdemo ali plana ni → prikaži napako in ne dovoli po\u0161iljanja (fallback ne sme biti "celotno stanje" — za Lana8Wonder gre vedno preko plana).
5. `sendAmount = min(dueLana, balanceLana - fee)`. Če `balanceLana <= dueLana + fee`, opozori uporabnika (ne blokiraj, po\u0161lje kar zmore, minus fee).

## UI spremembe (`src/pages/ResolveMaxCap.tsx`)
- Preberi tip denarnice iz `wallets` (dodaj query za `wallet_type` in `main_wallet_id`/`main_wallets.nostr_hex_id`).
- Novo stanje: `isLana8Wonder`, `planLoading`, `planError`, `dueLana`, `triggeredLevels[]` (za pregleden prikaz).
- Če `isLana8Wonder`:
  - Naslov kartice: "Resolve Lana8Wonder Freeze — Pay Due Amount".
  - Panel z detajli: trenutna cena (EUR/LANA), account #, seznam spro\u017eenih levelov (level_no, trigger_price, coins_to_give), skupaj `dueLana` v LANA + EUR ekvivalent.
  - "Amount to Send" prikazuje `dueLana` (ne celotno stanje). Če stanje < due, prika\u017ei opozorilo "Insufficient balance for full due amount".
  - Gumb: "Pay Due & Unfreeze Wallet".
- Sicer (drugi tipi): obstoje\u010de obna\u0161anje (donate all) ostane nespremenjeno.

## Nostr fetch helper
Dodaj v `src/utils/nostrClient.ts` novo funkcijo `fetchLana8WonderPlan(subjectHex)` — odpre WS na trenutno povezanih relayjih, po\u0161lje REQ, po\u010daka do 5s, izbere event z najve\u010djim `created_at`, preveri pubkey, parsira `content` kot JSON in vrne `{ accounts, event }`. Timeout in cleanup.

## Send flow
Uporabi obstoje\u010di `return-lanas-and-send-KIND-87009`, samo z drugim `amount`:
- `recipients: [{ address: donationWallet, amount: sendAmount }]` kjer je `sendAmount = min(dueLana, balance - fee)`.
- `memo: "Lana8Wonder due payment — level(s) X,Y triggered at price P."`
- Po uspehu enako klic `freeze-wallets` z `freeze:false`.

## Edge cases
- Plan nima nobenega spro\u017eenega levela pri trenutni ceni → `dueLana = 0` → onemogo\u010di gumb z besedilom "No levels triggered yet — nothing due."
- Ve\u010d accountov mapira na isto denarnico → se\u0161tej vse.
- Publisher pubkey ne ujema → napaka "Invalid plan signer".

## Datoteke
- `src/pages/ResolveMaxCap.tsx` — glavne spremembe UI + logika.
- `src/utils/nostrClient.ts` — `fetchLana8WonderPlan()`.

## Brez sprememb
- Edge funkcije, DB shema, ostali tipi denarnic in tokovi.
