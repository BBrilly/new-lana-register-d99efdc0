## Problem

Na `/unregistered-over-limit` se prikazujejo dogodki, ki imajo `nostr_87003_published = true`, vendar je njihov `unregistered_amount` zelo majhen (npr. 0.00000001 LANA → prikazano kot "0"). Ti niso resnično over-limit.

Dva napaki:

1. **Napačna enota zneska** — hook deli `unregistered_amount` z `1e8`, vendar je vrednost v bazi že v **LANA**, ne v lanoshijih (min 0.00000001, max 100000). Zato vsi mali zneski izgledajo kot "0".
2. **Manjka limit filter** — stran mora prikazati le tiste, katerih znesek dejansko presega prag `freeze_lana_account_above` iz `system_parameters` (trenutno = 100 LANA).

## Rešitev

### `src/hooks/useUnregisteredLanaEvents.ts`
- Odstrani deljenje z `1e8` — `unregistered_amount` obravnavaj kot LANA neposredno.
- Naloži `freeze_lana_account_above` iz `system_parameters` (parseFloat) in ga vrni kot `limit`.
- Dodaj boolean parameter `requireOverLimit` (default false): ko je `true`, filtriraj `rows` na `unregistered_amount >= limit`.
- `totalLana` se izračuna iz filtriranih vrstic brez deljenja.

### `src/components/UnregisteredLanaTable.tsx`
- Formatter `fmtLana` ne deli več z 1e8 (vrednost je že LANA).
- V naslovni vrstici dodaj `Badge` z prikazanim limitom (npr. `Limit: ≥ 100 LANA`) kadar je posredovan.

### `src/pages/UnregisteredOverLimitPage.tsx`
- Kliče `useUnregisteredLanaEvents(true, { requireOverLimit: true })`.
- Subtitle posodobljen: "Events published as Kind 87003 with amount above the freeze limit."

### `src/pages/UnregisteredDustPage.tsx`
- Ostane nespremenjen za filter, samo popravek enote pride preko hooka/tabele.

Brez sprememb edge funkcij, brez sprememb sheme.

## Summary

Popravi enoto prikaza (vrednost je že v LANA, ne lanoshi) in doda filter po `system_parameters.freeze_lana_account_above`, da stran prikaže res samo dogodke, ki so presegli limit.
