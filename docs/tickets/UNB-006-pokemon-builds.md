# UNB-006 — Per-Pokémon Builds (EV/IV/Nature/Ability/Item/Moveset)

## Summary
Add a build planner for each Pokémon with local persistence. Users can save unlimited builds per Pokémon.

---

## Acceptance Criteria

| # | Criterion | Done |
|---|-----------|------|
| 1 | User can create multiple builds for the selected Pokémon | ✅ |
| 2 | Each build stores Nature, Ability, Item, EVs, IVs, and Moveset | ✅ |
| 3 | EV inputs are constrained to 0-252 per stat and validated to max total 510 | ✅ |
| 4 | IV inputs are constrained to 0-31 per stat | ✅ |
| 5 | Nature selector exposes all 25 standard natures | ✅ |
| 6 | Moveset selector only allows moves learnable by that Pokémon (level-up + egg) | ✅ |
| 7 | Builds persist between reloads with localStorage | ✅ |
| 8 | User can remove saved builds | ✅ |
| 9 | Ability selector only offers the selected Pokémon's available abilities | ✅ |
| 10 | Item selector supports any known item in the dataset | ✅ |
| 11 | Nature selector displays stat up/down effects | ✅ |
| 12 | Build name is required and shown as the build title | ✅ |

---

## Implementation Notes

- Added new types:
  - `StatSpread`
  - `PokemonBuild`
  - `BuildMap`
- Added storage helpers:
  - `loadBuildMap()`
  - `saveBuildMap()`
- App-level state now keeps:
  - per-species build map
  - current build draft (name, nature, ability, item, EVs, IVs, moveset)
- Learnable move options are derived from selected Pokémon data:
  - level-up moves
  - egg moves
  - duplicates removed
- Validation on add:
  - EV total <= 510
  - no duplicate moves in the moveset
  - all selected moves belong to the learnable move set
  - selected ability belongs to the selected Pokémon ability list

---

## Files Changed

- `src/types.ts`
- `src/storage.ts`
- `src/App.tsx`
- `src/styles.css`

---

## Status: Done
