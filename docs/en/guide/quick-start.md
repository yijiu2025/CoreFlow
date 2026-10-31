# Quick start {#quick-start}

## Requirements

- **Node.js** ≥ 18 (`package.json` does not declare `engines`, so this is a convention rather
  than an enforced constraint — below 18 you will hit confusing failures from missing ESM,
  `fetch` and `AbortSignal.timeout` support)
- **MySQL** ≥ 8.0
- **Redis** ≥ 6.0 (optional: when **not configured** the app uses the in-process `MapStore`;
  once configured it must be reachable, otherwise the access layer returns 503 instead of
  silently falling back to memory). Multi-instance production requires Redis

## Install

```bash
# Clone (theme-core is a git submodule; without --recurse-submodules it stays empty)
git clone --recurse-submodules https://github.com/yijiu2025/CoreFlow.git
cd CoreFlow

# Install dependencies
npm install
```

> This repository is backend-only. The frontend projects (`oauth21` / `posecraft` / `admin` /
> `poseadmin` / `firewall` / `phonecopy`) live in their own repositories — install and run them
> there.

## Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` and set at least:

```ini
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=root
DB_PASS=your_password

# Secrets (must be strong random values, ≥ 32 chars)
APP_SECRET=your-app-secret-key
SESSION_SECRET=your-session-secret-key
FIREWALL_SECRET=your-firewall-secret-key

# Redis (optional)
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

::: warning
In production every default secret must be replaced — the framework detects unsafe values at
boot and refuses to start.
:::

## Migrate the database

```bash
npm run migrate
```

## Start the server

```bash
# nodemon with hot reload
npm run dev
```

The API listens on `http://localhost:3000`. Any frontend is a separate application — see the
frontend repositories for their dev servers.

## Verify the install

```bash
# Liveness (200 as long as the process is alive; does not touch dependencies)
curl http://localhost:3000/v1/health/live
# → {"code":200,"message":"...","data":{"status":"ok"},"timestamp":...,"requestId":"..."}

# Readiness (503 as soon as a critical dependency is down)
curl http://localhost:3000/v1/health/ready
# when a critical dependency is down: data.dependencies.<name>.status = "down", HTTP 503
```

> Responses are **wrapped** (`code` / `message` / `data` / `timestamp` / `requestId`) — not a
> bare `{"status":"ok"}`. Health-check scripts should key off the HTTP status code.

## Super admin

### First initialisation

```ini
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=your-strong-password
```

```bash
npm run setup:admin
```

### Add or switch super admins

```bash
# Grant superadmin to an existing user (existing admins are kept)
npm run setup:admin -- --email new-admin@example.com

# Or change SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD in .env and run again
```

::: tip
Multiple super admins are supported; `setup:admin` only adds, never removes.
:::

### Revoke

```bash
npm run revoke:admin -- --email user@example.com
```

Safety rails:

- refuses to revoke the last remaining super admin (no lock-out)
- asks for confirmation by default; `--force` skips it
- clears that user's Redis sessions immediately

## Commands

```bash
npm run dev          # development server
npm start            # production start
npm run migrate      # run database migrations
npm run lint         # ESLint with auto-fix
npm run format       # Prettier
npm test             # Jest
```

## Next steps

- [Project structure](/en/guide/project-structure)
- [Architecture](/en/core/architecture)
- [Auth integration](/en/standards/auth-integration)
