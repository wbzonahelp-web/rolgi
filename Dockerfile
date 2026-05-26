# Rolgi SStats Analytics Platform v6.0.0
# Multi-stage Docker build for production deployment

# Stage 1: Base
FROM node:22-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash

WORKDIR /app

# Copy package files
COPY package*.json ./

# Stage 2: Dependencies
FROM base AS dependencies

# Install all dependencies (including dev)
RUN npm install

# Stage 3: Production dependencies
FROM base AS prod-dependencies

# Install only production dependencies
RUN npm install --omit=dev

# Stage 4: Build
FROM dependencies AS build

# Copy source code
COPY . .

# Run linting and tests (optional, can be commented out)
# RUN npm run lint
# RUN npm test

# Stage 5: Production
FROM base AS production

# Set NODE_ENV
ENV NODE_ENV=production

# Copy production dependencies
COPY --from=prod-dependencies /app/node_modules ./node_modules

# Copy application code
COPY --from=build /app/src ./src
COPY --from=build /app/server.js ./
COPY --from=build /app/package.json ./
COPY --from=build /app/.env.example ./.env.example
COPY --from=build /app/static ./static
COPY --from=build /app/public ./public

# Create memories directory for schema lock
RUN mkdir -p memories

# Set user to non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
