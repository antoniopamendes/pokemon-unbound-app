# UNB-005 — Enhanced Pokémon Detail Panel

## Summary
Polish the detail panel with full evolution chains, styled moves table, type color chips, stat bars, and move category icons.

---

## Context
After UNB-004 delivered the initial detail panel, the user reported several UX gaps:
- Evolution only showed direct forward evolutions; the full chain (pre-evolutions + successors) was missing.
- Moves were shown as a flat button list with no stats.
- Types had no visual identity (no color chips).
- Move categories (Physical/Special/Status) had no icon.

---

## Acceptance Criteria

| # | Criterion | Done |
|---|-----------|------|
| 1 | Full evolution chain shown for any selected Pokémon (all pre-evos + post-evos in one row) | ✅ |
| 2 | Clicking another Pokémon in the chain navigates to it | ✅ |
| 3 | Moves displayed as a table: Lv · Name · Type chip · Category icon · Power · Acc · PP | ✅ |
| 4 | Clicking a move row opens the move inspector | ✅ |
| 5 | Type tokens rendered as colored pills (matching standard Pokémon type palette) | ✅ |
| 6 | Move category shown as inline SVG icon (triangle=Physical, circle=Special, bar=Status) | ✅ |
| 7 | Base stats shown as labeled bar chart rows | ✅ |
| 8 | Dataset cache key bumped to v3 to force fresh parse | ✅ |

---

## Implementation Notes

### Evolution chain algorithm (`unboundData.ts`)
- Built `buildFullEvoChains()` that constructs a reverse map (target → source) from the parsed `evolutions` table.
- For each species, walks backward to find the root ancestor, then DFS-forward to build an ordered flat chain.
- The chain is stored as `PokemonEvolution[]` where each node's `method`/`condition` describes how it evolved from the previous member.
- Branching evolutions (Eevee) list all branches sequentially; the current Pokémon is highlighted.

### Type colors (`src/typeColors.ts`)
- New module exporting `TYPE_COLORS` map and helpers `getTypeColor(token)` / `getTypeTextColor(token)`.
- Text is dark on light types (Normal, Electric, Ground, Grass, Ice, Steel) and white on all others.

### Move table (`App.tsx` — `MovesTable` component)
- Extracted `MovesTable` component that accepts `{ learn, info }` entries.
- Egg moves pass `level: -1` and display "—" in the Lv column.
- Category column uses inline `<SplitIcon>` SVG (no external image dependency).

### Stats bars
- Each stat rendered as `label / bar / value` grid row.
- Bar width = `(value / 255) * 100%`, capped at 100%.

---

## Files Changed
- `src/typeColors.ts` — new file, type → color mapping
- `src/unboundData.ts` — `buildFullEvoChains()`, `buildPokemonDataset()` updated, cache key bumped to v3
- `src/App.tsx` — `SplitIcon` component, `MovesTable` component, stats grid, evo chain display, inspector update
- `src/styles.css` — `.type-chip`, `.stats-grid`, `.stat-row`, `.stat-bar`, `.moves-table`, `.evo-chain` etc.

---

## Status: Done
