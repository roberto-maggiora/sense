# Sense Monorepo Walkthrough

This guide explains how to run the Sense platform locally using Docker.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.
- `npm` installed.

## Quick Start

1. **Start the stack:**
   ```bash
   npm run docker:up
   ```
   This builds the images and starts Postgres, Redis, API, and Worker containers.
   The API will be available at [http://localhost:3000](http://localhost:3000).

2. **Check Health:**
   - API: [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health) (Should return `{"ok":true}`)
   - Worker: [http://localhost:3001/health](http://localhost:3001/health) (Should return `{"ok":true,"service":"worker"}`)

3. **Stop the stack:**
   ```bash
   npm run docker:down
   ```
   This stops and removes containers and volumes (resets database).

## Troubleshooting

- **Logs:** To view logs for all services:
  ```bash
  docker compose logs -f
  ```
  Or for a specific service:
  ```bash
  docker compose logs -f api
  docker compose logs -f worker
  ```

- **Database:** The database is persisted in a docker volume `sense-monorepo_postgres_data`. `npm run docker:down` deletes this volume to give you a fresh start. If you want to keep data, use `docker compose down` without `-v`.

## Development Workflow

### Starting the Stack
To start the entire stack (API, Worker, Postgres, Redis, Viewer) and rebuild images if needed:
```bash
npm run docker:up -- --build
```
- API: http://localhost:3000
- Viewer: http://localhost:5173
- Worker Health: http://localhost:3002/health

### Seeding Data
To seed the database with test data (runs inside the API container):
```bash
npm run docker:seed
```

### Smoke Tests
To run a quick smoke test against the running stack (runs inside the API container):
```bash
npm run docker:smoke
```

### Logs
To view logs for all services:
```bash
npm run docker:logs
```

### Stopping and Wiping Data
To stop the stack and remove volumes (fresh start):
```bash
npm run docker:wipe
```
