# Novi javni strani: Unregistered Lanas (Over-Limit & Dust)

## Cilj
Dve ločeni javni strani s seznamom `unregistered_lana_events`:
- **Over-Limit (Frozen)** — vse vrstice z `nostr_87003_published = true` (objavljeno na relay, je sprožilo freeze).
- **Dust** — vse vrstice z `nostr_87003_published = false` (premajhne, niso bile objavljene / kandidatke za izbris).

Obe strani sta dodani kot novi povezavi v desni `PublicLinksSidebar`.

## Datoteke

### Nove
- `src/pages/UnregisteredOverLimitPage.tsx` — javna stran, route `/unregistered-over-limit`.
- `src/pages/UnregisteredDustPage.tsx` — javna stran, route `/unregistered-dust`.
- `src/hooks/useUnregisteredLanaEvents.ts` — skupni hook: parameter `published: boolean`, paginated fetch (1000/req, da obide 1000-row limit), join na `wallets` (wallet_id, lana_address, wallet_type, currency, frozen) in `main_wallets` (nostr_hex_id, owner_name če obstaja). Vrne sortirane podatke + skupni znesek.

### Spremenjene
- `src/App.tsx` — dodaj importa in oba `<Route>` zapisa nad catch-all.
- `src/components/PublicLinksSidebar.tsx` — dodaj v `LINKS` array dva nova vnosa (ikoni: `AlertTriangle` za over-limit, `Sparkles` ali `Dot` za dust).

## Vsebina strani (oba uporabljata isti layout)

Layout enak kot `AllWalletsPage`: `Back` gumb → `Card` → naslov, podnaslov, total amount badge → tabela.

Tabela (vrstice = `unregistered_lana_events`):
| Stolpec | Vir |
|---|---|
| Detected At | `detected_at` (format datum + ura) |
| Wallet | `wallets.lana_address` (truncate + copy) |
| Type | `wallets.wallet_type` |
| Amount (LANA) | `unregistered_amount / 1e8` (8 decimalk) |
| Notes | `notes` (truncate, tooltip) |
| 87003 Event | link na nostr event (če `nostr_87003_event_id` obstaja) |
| Status | frozen badge če `wallets.frozen` (samo over-limit stran) |

Sort: privzeto `detected_at DESC`, klik na headerje sortira (Amount, Detected).

Footer/header: `Total: X LANA` (vsota `unregistered_amount/1e8`) in `Count: N`.

Empty state:
- Over-Limit: "No over-limit unregistered Lanas — vse je v okvirih."
- Dust: "No dust events."

## PublicLinksSidebar zaporedje
Vstavi takoj za `Frozen Wallets`:
```
{ path: "/unregistered-over-limit", label: "Over-Limit Lanas", icon: AlertTriangle },
{ path: "/unregistered-dust", label: "Dust Lanas", icon: Sparkles },
```

## Tehnično
- Javni dostop (brez auth-gate-a, kot ostale public strani). `unregistered_lana_events` ima 4 policies — predvidoma anon read; če query vrne 0 brez napake, dodam migracijo `GRANT SELECT ... TO anon` + ustrezno policy (preverim šele po prvem zagonu, ne v tej iteraciji).
- Pagination loop: `range(offset, offset+999)` dokler vrne < 1000 (skladno z memory pravilom).
- `ReturnType<typeof setTimeout>` (nismo na node tipih).
- Brez sprememb edge funkcij, brez sprememb business logike — samo prikaz.
