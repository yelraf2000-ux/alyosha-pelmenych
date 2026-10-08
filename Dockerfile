# syntax=docker/dockerfile:1
# One file, three images:
#   api       Fastify                           } docker-compose.yml builds these two
#   web       Caddy with the built storefront   }
#   allinone  the API serving the storefront itself: for hosts that run one container and bring
#             their own HTTPS (Render, see render.yaml). It is the last stage, so it is what a
#             plain `docker build .` produces.

# ---------- Build: install everything, bundle the API, build the storefront ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifests first, so the dependency layer is reused until they change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The ffmpeg-static package would download a 70 MB binary from GitHub while installing, and a
# failed download fails the whole build. Nothing in this stage runs ffmpeg, so its installer is
# told the binary is already there (it only checks that FFMPEG_BIN is a file).
ENV FFMPEG_BIN=/bin/true
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

# ffmpeg, which converts product videos, comes from Debian rather than from the download the
# ffmpeg-static package makes on install: FFMPEG_BIN tells its installer to skip the download
# and tells the app which binary to run.
RUN apt-get update  && apt-get install -y --no-install-recommends ffmpeg  && rm -rf /var/lib/apt/lists/*
ENV FFMPEG_BIN=/usr/bin/ffmpeg

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


# ---------- All-in-one: API + storefront in a single container ----------
FROM api AS allinone
COPY --from=build /app/apps/web/dist /app/web
ENV WEB_DIST_DIR=/app/web
# No shell on free hosting, so first-time data is added here; --if-empty leaves a filled database alone.
CMD ["sh", "-c", "node apps/api/dist/migrate.js && node apps/api/dist/seed.js --if-empty && exec node --enable-source-maps apps/api/dist/server.js"]
