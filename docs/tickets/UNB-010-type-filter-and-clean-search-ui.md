# UNB-010 — Type Filter + Cleaner Search UI

## Summary
Improve Pokédex discoverability by adding type-based filtering, showing types directly in list rows, and removing `SPECIES_*`-style search hints.

---

## Acceptance Criteria

| # | Criterion | Done |
|---|-----------|------|
| 1 | Types are shown under Pokémon name in details header | ✅ |
| 2 | Search area includes a type filter below the search field | ✅ |
| 3 | Pokédex list rows display each Pokémon's type chips | ✅ |
| 4 | Search only matches readable Pokémon names (not `SPECIES_*` keys) | ✅ |
| 5 | Search placeholder no longer suggests `SPECIES_*` input | ✅ |

---

## Implementation Notes

- Added `typeFilter` state with an `All types` default.
- Built `availableTypeFilters` dynamically from loaded dataset types and sorted by display label.
- Updated `filteredEntries` logic to combine:
  - name match on `displayName` only
  - optional caught-only filter
  - optional type filter
- Updated list row layout:
  - keeps dex number + name
  - adds per-row type chips
  - keeps catch/count action on the right
- Moved detail type chips to sit directly below the selected Pokémon name in the detail header.
- Updated controls styling so text input and select share the same form style.

---

## Files Changed

- `src/App.tsx`
- `src/styles.css`

---

## Status: Done
