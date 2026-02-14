# Internal Viewer v0

A minimal React + Vite + Tailwind dashboard for viewing Sense platform data locally.

## Setup

1. Install dependencies (from root or this folder):
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

## Configuration

- **API URL**: Defaults to `http://127.0.0.1:3000` (hardcoded in `App.tsx` for v0).
- **Client ID**: Defaults to `test-client` (hardcoded header).

## Troubleshooting

- **CORS Error**: Ensure the API is running with CORS enabled. Check `apps/api/src/index.ts` for `@fastify/cors` registration.
- **No Data**: Ensure the API is running (`npm run dev -w apps/api`) and database is seeded (`scripts/seed-dashboard.ts`).
