# Development environment

This project is run through Docker Compose. Do not suggest or run host `node`,
`npm`, `npx`, or package-manager commands.

Use Docker Compose for all development and verification tasks:

- Start or rebuild the app: `docker compose up --build`
- Run a production build: `docker compose run --rm web npm run build`
- Run a one-off npm script: `docker compose run --rm web npm run <script>`

The `web` service owns the Node.js environment and its dependencies. Keep all
host-side commands limited to Docker and repository tooling.
