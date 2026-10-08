# Алёша Пельменыч — online shop

Storefront, admin panel and API for a small dumpling producer in Yerevan. Buyers build a cart and leave
an order request; the owner gets a Telegram message and contacts them. There is no online payment and
no customer accounts. The full specification is in [SPEC.md](SPEC.md); what the client still has to
provide is in [TODO_CLIENT.md](TODO_CLIENT.md).

| Part | Where | What |
| --- | --- | --- |
| Storefront and admin | `apps/web` | React, Vite, TypeScript. The admin lives at `/admin`. |
| API | `apps/api` | Fastify, PostgreSQL, Drizzle. Migrations are in `apps/api/drizzle`. |
| Shared types and validation | `packages/shared` | Used by both. |
| Deployment | `Dockerfile`, `docker-compose.yml`, `deploy/` | Caddy, API, Postgres, daily backups. |

## Local development

You need Node.js 22 and PostgreSQL installed (only its programs are used; see below).

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev
```

- Shop: http://localhost:5173
- Admin: http://localhost:5173/admin. The development password is the `DEV_ADMIN_PASSWORD` constant
  in `apps/api/src/auth.ts`.
- API: http://localhost:3000 (the shop reaches it through Vite's proxy)

`npm run db:start` creates a private Postgres in `.devdb/` on port 54329, with no password, using the
Postgres programs already on your machine. It does not touch any other Postgres you run. If the
programs are not on `PATH` and not under `C:\Program Files\PostgreSQL`, set `PG_BIN` to their `bin`
folder. To use your own server instead, change `DATABASE_URL` in `apps/api/.env`.

Without Telegram settings, order notifications are printed in the API's terminal output.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and shop together, restarting on changes |
| `npm test` | API tests, on the separate `alyosha_test` database |
| `npm run typecheck` | Type-check the API and the shop |
| `npm run db:start` / `db:stop` | Start or stop the local dev database |
| `npm run db:migrate` | Apply new migrations |
| `npm run db:seed` | Add the three placeholder products and the default texts (skips what exists) |
| `npm run db:generate` | After changing `apps/api/src/db/schema.ts`: write a new migration |
| `npm run admin:password` | Set the local admin password |
| `npm run build` | Production build of the shop into `apps/web/dist` |
| `npm run build:demo` | Static demo into `apps/web/dist-demo`: runs without a server, no admin |

## Settings (environment variables)

Secrets live only in `.env` files, which are git-ignored. Locally that is `apps/api/.env`; on the
server it is `.env` next to `docker-compose.yml`.

| Variable | Local | Server | Meaning |
| --- | --- | --- | --- |
| `DATABASE_URL` | set | built by Compose | Postgres connection string |
| `DATABASE_URL_TEST` | set | — | Database that `npm test` empties and uses |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | built from `DOMAIN` | The site's address. The only origin allowed by CORS and by the admin. |
| `DOMAIN` | — | set | Domain without `https://` and without `www` |
| `POSTGRES_PASSWORD` | — | set | Database password |
| `ADMIN_PASSWORD_HASH` | dev value | set | Hash of the admin password (bcrypt, or base64 of it) |
| `SESSION_SECRET` | dev value | set | Signs the admin session cookie; at least 32 characters |
| `TELEGRAM_BOT_TOKEN` | optional | set | Bot that sends the notifications |
| `TELEGRAM_CHAT_ID` | optional | set | Who receives them |
| `UPLOADS_DIR` | `uploads` | set in the image | Folder for product photos |
| `TRUST_PROXY` | `0` | set by Compose | `1` only behind the reverse proxy |
| `PORT` | `3000` | set in the image | API port |

With `NODE_ENV=production` the API refuses to start if the admin password or `SESSION_SECRET` is
missing or is still the development value.

## Deploying to a server

For a fresh Ubuntu 24.04 VPS. One vCPU and 1 GB of memory are enough to run the shop; building the
images on 1 GB needs the swap file from step 1.

Before you start, point the domain's DNS **A record** at the server's IP address. The HTTPS certificate
cannot be issued until that record works.

### 1. Prepare the server

Log in as root (or use `sudo`).

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable
```

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Get the code

Keep the project in a private Git repository and clone it:

```bash
git clone <your repository URL> /opt/alyosha && cd /opt/alyosha
```

### 3. Create `.env`

```bash
cp .env.production.example .env
```

Fill in `DOMAIN`, then generate the two secrets and paste them in:

```bash
openssl rand -hex 24
```

```bash
openssl rand -hex 32
```

The first is `POSTGRES_PASSWORD`, the second is `SESSION_SECRET`.

### 4. Build, then set the admin password

```bash
docker compose build
```

```bash
docker compose run --rm --no-deps api node apps/api/dist/set-admin-password.js --print
```

It asks for the password twice without showing it, and prints an `ADMIN_PASSWORD_HASH=…` line.
Put that line into `.env`.

### 5. Start

```bash
docker compose up -d
```

The first start takes a minute: the database is created, migrations run, and Caddy gets the
certificate. Check that all four services are up:

```bash
docker compose ps
```

On the very first deploy, add the placeholder products and default texts:

```bash
docker compose exec api node apps/api/dist/seed.js
```

Open `https://<your domain>` and `https://<your domain>/admin`. The owner then replaces the
placeholders himself in the admin (see [TODO_CLIENT.md](TODO_CLIENT.md)).

Use the domain exactly as written in `DOMAIN`. There is no `www` address; if you want one, add a
second site block to `deploy/Caddyfile` that redirects it.

### Updating

```bash
cd /opt/alyosha && git pull && docker compose up -d --build && docker image prune -f
```

New database migrations are applied automatically when the API container starts.

### Logs

```bash
docker compose logs -f api
```

Replace `api` with `web` (HTTPS and certificates), `db` or `backup`.

## Backups

The `backup` service writes into `backups/` on the server every night at 23:00 UTC (03:00 in Yerevan):

- `db-<date>.dump`: the whole database
- `uploads-<date>.tar.gz`: the product photos

Files older than 14 days are deleted. To make a backup right now:

```bash
docker compose exec backup sh /usr/local/bin/backup.sh
```

These files are on the same server as the shop. Copy them somewhere else regularly, for example
from your own computer:

```bash
scp -r root@<server>:/opt/alyosha/backups ./alyosha-backups
```

### Restoring

The database (replaces everything in it with the backup):

```bash
docker compose stop api
docker compose exec -T db pg_restore -U alyosha -d alyosha --clean --if-exists --no-owner < backups/db-<date>.dump
docker compose start api
```

The photos:

```bash
docker compose run --rm --no-deps --user root -v "$PWD/backups:/backups:ro" api sh -c "tar -xzf /backups/uploads-<date>.tar.gz -C /data && chown -R node:node /data/uploads"
```

## Telegram bot

The owner gets a message for every new order and every «Сообщить о поступлении» request.

1. In Telegram, open **@BotFather**, send `/newbot`, choose a name and a username. BotFather replies
   with the bot **token**.
2. The owner opens the new bot and presses **Start**. A bot cannot write to someone who has not
   started it.
3. Find the owner's **chat id**. Open this address in a browser (with the token in place) and look
   for `"chat":{"id":` followed by a number:

   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```

   If the list is empty, send the bot any message and reload.
4. Put both values into `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) and apply:

   ```bash
   docker compose up -d
   ```

5. Check that the bot can reach the owner:

   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/sendMessage" -d chat_id=<CHAT_ID> -d text="Проверка"
   ```

To send notifications to a group instead, add the bot to the group, write something there, and use
the group's id from `getUpdates` (a negative number).

Locally the same two variables go into `apps/api/.env`; restart `npm run dev` afterwards.

## Admin password

The password is never stored, only its hash. Changing it signs out every device.

On the server:

```bash
docker compose run --rm --no-deps api node apps/api/dist/set-admin-password.js --print
```

Replace the `ADMIN_PASSWORD_HASH` line in `.env` with the printed one, then:

```bash
docker compose up -d
```

Locally, this writes the new hash straight into `apps/api/.env`:

```bash
npm run admin:password
```

If the password is forgotten, do the same: there is nothing to recover, a new one simply replaces it.
To sign everyone out without changing the password, put a new `SESSION_SECRET` into `.env`.
