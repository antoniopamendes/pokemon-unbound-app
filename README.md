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

## Optional: cross-device sync (free, via Supabase)

By default all progress is stored only in your browser's localStorage. To sync your caught
Pokemon/builds across devices for free:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run `docs/supabase-setup.sql` to create the storage table and
   security policies.
3. In Project Settings -> API, copy the **Project URL** and **anon public key**.
4. Copy `.env.example` to `.env.local` and paste those two values in.
5. In Supabase, go to Authentication -> URL Configuration and add your app's URL (e.g. your
   Vercel domain and `http://localhost:5173`) to the redirect allow list.
6. Restart the dev server / redeploy. A "Sign in to sync" button appears in the header; sign in
   with a magic link sent to your email, on any device, to see the same caught Pokemon everywhere.

If these env vars aren't set, the app works exactly as before (localStorage only, no sign-in UI).

On Vercel, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Project Environment Variables.

## Ticket log

Progress is tracked in `docs/tickets/`.
