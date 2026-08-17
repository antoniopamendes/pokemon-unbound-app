.PHONY: dev build stop logs

# Start the Vite development server through Docker Compose.
dev:
	docker compose up --build

# Run the production build inside the web container.
build:
	docker compose run --rm web npm run build

# Stop and remove the Compose containers.
stop:
	docker compose down

# Follow logs from the web service.
logs:
	docker compose logs -f web
