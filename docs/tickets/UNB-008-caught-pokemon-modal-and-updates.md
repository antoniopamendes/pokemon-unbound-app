# UNB-008 — Caught Pokémon Modal + Editable Caught Data

## Summary
When marking a Pokémon as caught, open a modal to configure the caught Pokémon data (level, ability, item, moveset, EVs, IVs, nature, and current evolved species). Show this data in the detail panel and allow updates.

---

## Acceptance Criteria

| # | Criterion | Done |
|---|-----------|------|
| 1 | Marking a Pokémon as caught opens a configuration modal | ✅ |
| 2 | Modal captures level, nature, ability, item, EVs, IVs, and moveset | ✅ |
| 3 | Modal supports selecting the current evolved species from evolution chain | ✅ |
| 4 | Caught Pokémon data is persisted in localStorage | ✅ |
| 5 | Detail panel shows caught Pokémon configuration | ✅ |
| 6 | Detail panel has an update action to reopen and edit caught data | ✅ |
| 7 | Unmarking as caught removes persisted caught profile for that species | ✅ |

---

## Implementation Notes

- Added new types:
  - `CaughtPokemonProfile`
  - `CaughtPokemonMap`
- Added storage helpers:
  - `loadCaughtPokemonMap()`
  - `saveCaughtPokemonMap()`
- Catching flow:
  - `Missing -> Caught` opens modal
  - Save in modal writes caught flag + caught profile
  - `Caught -> Missing` removes caught profile and toggles status off
- Update flow:
  - "Update caught Pokémon" button in details header opens same modal with existing values prefilled
- Evolution handling:
  - Modal offers current species options from the selected Pokémon's evolution tree
- Validation:
  - level 1-100
  - EV total <= 510
  - no duplicate moves
  - selected moves must be learnable by chosen current species
  - selected ability must belong to chosen current species

---

## Files Changed

- `src/types.ts`
- `src/storage.ts`
- `src/App.tsx`
- `src/styles.css`

---

## Status: Done
