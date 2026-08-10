# Pokemon Unbound App

Simple web companion/tracker for a Pokemon Unbound playthrough.

## Current milestone

Detailed Unbound Pokedex tracker with:
- Full list parsed from Unbound species source
- Caught/missing toggle per Pokemon
- Progress counter
- local progress persistence
- Search and caught-only filter
- Per-Pokemon details: base stats, level-up and egg moves, catch locations, abilities, held items, evolutions
- Move/ability/item detail inspector
- Persistent local cache for fetched Unbound data and sprite images

## Run

### Docker (recommended)

1. Install Docker Desktop.
2. Start the app: `docker compose up --build`
3. Open `http://localhost:5173`

### Without Docker

1. Install Node.js 20+.
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`

## Ticket log

Progress is tracked in `docs/tickets/`.
