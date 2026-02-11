# Sense Monorepo

## Prerequisites
- Node.js (v20+)
- Docker & Docker Compose

## Quick Start

1. **Start Infrastructure**:
   ```bash
   npm run services:up
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Setup Database**:
   ```bash
   # Create .env if not exists (see .env.example)
   # Run migrations
   npm run db:migrate --name init

   # Seed database (creates default client/site/area)
   npm run db:seed
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

5. **Stop Services**:
   ```bash
   npm run services:down
   ```

## Workspaces
- `apps/api`: Main API services (Fastify)
- `apps/worker`: Background worker (Redis/Job processing)
- `packages/contracts`: Shared TypeScript contracts
- `packages/database`: Prisma ORM and database schema

## Testing
There are no tests yet.

## API Usage
The API runs on port 3000 by default.
Required header: `X-Client-Id: <UUID>`

### Device Registry
- `GET /api/v1/devices`
- `POST /api/v1/devices`
- `GET /api/v1/devices/:id`
- `PATCH /api/v1/devices/:id`
- `DELETE /api/v1/devices/:id`
