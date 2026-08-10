# UNB-003 - Fix Pokedex parsing and add persistent local source cache

## Summary
Fix the empty Pokedex issue and make external source usage persistent so the app does not continuously re-fetch the same data.

## Scope
- Fix parser to support the Unbound species source format (`#define SPECIES_* ...`).
- Persist parsed Pokedex entries in localStorage.
- Add URL-level persistent HTTP caching utility for external assets (data and image URLs).
- Keep UI behavior unchanged.

## Acceptance Criteria
- Pokedex no longer shows "returned no entries" for the Unbound source.
- App can reopen and load Pokedex without re-parsing from the network each time.
- External URLs can be fetched through a persistent cache utility.

## Implementation Notes
- Species source:
  `https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/include/constants/species.h`
- Pokedex cache key:
  `unbound-pokedex-entries-v2`
- HTTP cache storage name:
  `unbound-tracker-http-cache-v1`

## Status
Done

## Follow-up
- UNB-004: Add Pokemon details, move/item/ability info, and sprite storage.
