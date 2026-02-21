FROM node:20-alpine

# Install curl for healthcheck (and openssl to match api/worker cache)
RUN apk add --no-cache openssl curl

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy app package files
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/viewer/package.json ./apps/viewer/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/

# Install dependencies (matches api/worker cache)
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 5173

# Start Vite dev server
CMD ["npm", "run", "dev", "-w", "apps/viewer", "--", "--host", "0.0.0.0", "--port", "5173"]
