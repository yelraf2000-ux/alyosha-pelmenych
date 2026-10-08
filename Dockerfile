# syntax=docker/dockerfile:1
# One file, two images: `api` (Fastify) and `web` (Caddy with the built storefront).
# docker-compose.yml builds both.

# ---------- Build: install everything, bundle the API, build the storefront ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifests first, so the dependency layer is reused until they change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

# Type checking happens in development (`npm run typecheck`). Leaving it out here keeps the build
# within the memory of a small VPS.
RUN npm run build -w @alyosha/api \
 && cd apps/web && npx vite build


# ---------- API ----------
FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app

# Runtime dependencies only (no Vite, TypeScript or test tools).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev -w @alyosha/api && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle

ENV PORT=3000 \
    MIGRATIONS_DIR=/app/apps/api/drizzle \
    UPLOADS_DIR=/data/uploads

# Product photos live on a volume mounted here; it must belong to the unprivileged user.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000

# Pending database migrations are applied on every start, then the server takes over the process.
CMD ["sh", "-c", "node apps/api/dist/migrate.js && exec node --enable-source-maps apps/api/dist/server.js"]


# ---------- Web: HTTPS, static storefront, reverse proxy to the API ----------
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
