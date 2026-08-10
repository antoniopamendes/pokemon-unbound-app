# UNB-004 - Add Pokemon details, move/item/ability info, and sprite storage

## Summary
Extend the tracker from a simple checklist into a complete Unbound companion view for each Pokémon.

## Scope
- Add a details panel for selected Pokémon.
- Show base stats, types, level-up and egg learnsets, locations, held items, abilities, and evolutions.
- Add inspector panels for move, ability, and item information.
- Parse data from Unbound/CFRU source files and cache parsed dataset locally.
- Fetch and cache Pokémon sprite images locally for offline reuse.

## Acceptance Criteria
- Selecting a Pokémon shows full detail sections in the app.
- Move/ability/item entries can be opened for extra information.
- Parsed external data is persisted locally (no repeated rebuild/fetch on every load).
- Sprite URLs are persisted and image payloads are cached locally.

## Implementation Notes
- Data sources:
  - `Base_Stats.c`, `Learnsets.c`, `Evolution Table.c`, `Front_Pic_Table.c`
  - `encounters.json`
  - `battle_moves.c`, `attack_name_table.string`, `attack_descriptions.string`
  - `abilities.h`, `ability_name_table.string`, `ability_descriptions.string`
  - `items.h`
- Parsed dataset cache key:
  `https://unbound-tracker.local/cache/unbound-dataset-v2.json`
- URL-level binary/text cache:
  `unbound-tracker-http-cache-v1`

## Status
Done

## Follow-up
- UNB-005: Expand learnset coverage to TM/HM and tutor moves.
- UNB-006: Enrich item metadata with richer descriptions/effects from additional source tables.
