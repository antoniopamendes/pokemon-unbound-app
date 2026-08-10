# UNB-002 - Add Dockerized local development workflow

## Summary
Enable local app development without installing npm directly on the host machine.

## Scope
- Add Dockerfile for the React + Vite app.
- Add docker-compose service for local development.
- Mount source code for live editing.
- Expose Vite dev server on port 5173.
- Update README with Docker-first run instructions.

## Acceptance Criteria
- `docker compose up --build` starts the app.
- App is reachable at `http://localhost:5173`.
- Source code changes on host reflect in the running container.
- README clearly documents Docker usage.

## Implementation Notes
- Base image: `node:20-alpine`.
- Vite runs with `--host 0.0.0.0 --port 5173`.
- Named volume is used for `/app/node_modules` to avoid host/container conflicts.

## Status
Done

## Follow-up
- UNB-003: Fix Pokedex parsing and add persistent local source cache.
- UNB-004: Add Pokemon details, move/item/ability info, and sprite storage.
