# UNB-001 - Bootstrap app and deliver first Pokedex tracker

## Summary
Create the first working version of the Pokemon Unbound tracker using React + TypeScript + Vite, focusing on a simple and beautiful Pokedex experience with progress persistence.

## Scope
- Bootstrap project with React + TypeScript + Vite structure.
- Load all Pokemon available in Unbound by parsing the species source file.
- Allow marking each Pokemon as caught/missing.
- Persist progress in browser localStorage.
- Keep UI intentionally simple, clean, and readable.

## Acceptance Criteria
- App starts as a Vite React TypeScript project.
- Pokedex list is populated from Unbound species source.
- Clicking a Pokemon toggles caught status.
- Progress survives browser refresh/reopen.
- User can search and filter by caught status.

## Implementation Notes
- Source data URL:
  `https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/include/constants/species.h`
- Parsed keys follow `SPECIES_*` format.
- Local storage key: `unbound-tracker-caught-v1`.

## Status
Done

## Follow-up
- UNB-002: Add Dockerized local development workflow.
- UNB-003: Fix Pokedex parsing and add persistent local source cache.
