# UNB-009 — Multi-Catch Tracking + Evolution Transfer

## Summary
Support catching multiple instances of the same species and transfer a caught instance to the evolved species when its current species is updated.

---

## Acceptance Criteria

| # | Criterion | Done |
|---|-----------|------|
| 1 | Same species can have multiple caught entries | ✅ |
| 2 | Pokédex row shows count of caught instances for that species | ✅ |
| 3 | Catch flow adds new entry instead of toggling caught state off | ✅ |
| 4 | Caught list in details supports update and remove per instance | ✅ |
| 5 | Updating an instance to an evolved species moves that instance to the evolved species bucket | ✅ |
| 6 | Caught profile Ability/Item/Moves show hover info popovers | ✅ |

---

## Implementation Notes

- `CaughtPokemonMap` is now a per-species array map:
  - `Record<string, CaughtPokemonProfile[]>`
- `CaughtPokemonProfile` now includes an `id` to support multiple instances and edits.
- Added storage migration in `loadCaughtPokemonMap()` to keep backward compatibility with the old single-profile shape.
- Pokédex list state and filter now derive caught status from caught-profile counts.
- Catch modal behavior:
  - list button always opens modal to add another caught instance
  - editing a specific caught instance updates that instance by `id`
  - if evolved species is changed, instance is removed from old species bucket and added to new one
- Caught profile display now reuses move/ability/item hover popovers used elsewhere in details.

---

## Files Changed

- `src/types.ts`
- `src/storage.ts`
- `src/App.tsx`

---

## Status: Done
