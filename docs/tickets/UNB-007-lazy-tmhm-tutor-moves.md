# UNB-007 — Lazy TM/HM and Tutor Move Lists

## Summary
Extend Pokémon move sections to include all requested categories: Level-Up, TM/HM, Tutor, and Egg moves.

---

## Acceptance Criteria

| # | Criterion | Done |
|---|-----------|------|
| 1 | Detail panel shows move categories in order: Level-Up, TM/HM, Tutor, Egg | ✅ |
| 2 | TM/HM and Tutor data is fetched lazily per selected Pokémon | ✅ |
| 3 | Lazy-fetched TM/HM and Tutor data is cached for reuse | ✅ |
| 4 | Existing move tooltip behavior continues to work for new categories | ✅ |
| 5 | Build move validation includes TM/HM and Tutor learnable moves | ✅ |

---

## Implementation Notes

- Added `fetchPokemonMoveBuckets(speciesKey)` in `pokeApi.ts`:
  - fetches `https://pokeapi.co/api/v2/pokemon/{species}`
  - extracts move learn methods:
    - `machine` → TM/HM bucket
    - `tutor` → Tutor bucket
  - caches result in persistent cache by species key
- App now maps PokéAPI move slugs to internal move keys through dataset move names.
- Added new sections in UI:
  - `Moves (TM/HM)`
  - `Moves (Tutor)`
- Added loading states for lazy buckets.
- Learnable move pool used by builds now includes TM/HM and Tutor moves.

---

## Files Changed

- `src/pokeApi.ts`
- `src/App.tsx`

---

## Status: Done
