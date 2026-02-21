FROM node:20-alpine

# Install OpenSSL for Prisma and Curl for debugging
RUN apk add --no-cache openssl curl

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy all workspaces package.json files
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/viewer/package.json ./apps/viewer/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/database/package.json ./packages/database/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .
COPY scripts ./scripts

# Build contracts and generate prisma client
RUN npm run build:contracts
RUN npm run db:generate
RUN npm run build -w apps/worker

# Expose Worker Health Port
EXPOSE 3001

# Start Worker
CMD ["npm", "start", "-w", "apps/worker"]
