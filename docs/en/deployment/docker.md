# Docker deployment {#docker}

> ## ✅ Status: implemented
>
> | File | Purpose |
> | --- | --- |
> | `Dockerfile` | multi-stage build, non-root, tini as PID 1, built-in health probe |
> | `docker-compose.yml` | app + MySQL + Redis on one host, health-gated, with persistent volumes |
> | `docker/entrypoint.mjs` | wait for dependencies → optional migration → start and forward signals |
> | `.dockerignore` | trims the build context (the working tree holds huge third-party checkouts) |
> | `.env.docker.example` | deployment environment template (every required key explained) |
> | `.github/workflows/release-docker.yml` | build + push image, then a **full-stack compose smoke test** (shown as `Publish Image`) |

## Quick start

```bash
# 1. Prepare config (replace every change-me)
cp .env.docker.example .env.docker

# 2. Create the schema — migrations are a one-off task, not part of app startup
docker compose --env-file .env.docker up -d --build mysql redis
docker compose --env-file .env.docker run --rm migrate

# 3. Start the app
docker compose --env-file .env.docker up -d app

# 4. Verify
curl -s http://127.0.0.1:3000/v1/health/ready
```

> ⚠️ **`--env-file .env.docker` is not optional.** Without it compose reads the repository's
> `.env` — the *development machine's* config (local DB password, a `192.168.x.x` Redis host) —
> and the container starts with credentials that cannot work. That is why
> `docker-compose.yml` uses `${DB_PASS:?...}`: fail loudly at start rather than mysteriously later.

## Image design: five trade-offs

Each one maps to a real failure; read the header comment in `Dockerfile` before changing any.

| Trade-off | Why |
| --- | --- |
| **No `npm ci`** | the lockfile records `wb-logkit` as `link: packages/log`, a gitignored nested repo that does not exist in CI or a clone → `npm ci` always fails. `npm install --workspaces=false` pulls both workspace packages from the registry instead |
| **`--ignore-scripts`** | the root `prepare` runs `husky` (a devDependency); with `--omit=dev` that binary is absent and the last install step explodes — and it also closes the postinstall supply-chain surface |
| **`node:24-slim`, not alpine** | `sharp` is a native module; slim (glibc) has official prebuilt binaries, alpine (musl) needs libc6-compat and tends to hit ABI mismatches on base-image upgrades |
| **No `.env.production` in the image** | it holds secrets and is gitignored. All config is injected by the orchestrator; `index.js`'s dotenv silently skips a missing file and never overrides injected variables. **Start with `node index.js`** — `npm start`'s `--env-file` aborts when the file is missing |
| **tini as PID 1** | the app handles SIGTERM itself (broadcast WS close frames → close DB/Redis). Without an init, PID 1 signal semantics differ and `docker stop` degrades to "wait 10s then SIGKILL", making the hand-written graceful shutdown pointless |

## Orchestration

### Health-gated startup, not a bare `depends_on`

```yaml
depends_on:
  mysql: { condition: service_healthy }
  redis: { condition: service_healthy }
```

A bare `depends_on` only means "the container started", not "it accepts connections". MySQL's
first initialisation takes 20–60s, during which the app would see an empty schema.
`entrypoint.mjs` adds a **bounded** wait as a second layer (`DEP_WAIT_TIMEOUT_MS`, default 90s)
and logs whether the connection actually succeeded.

### Dependency policy: DB hard-fails, Redis degrades and continues

A deliberate **asymmetry**, implemented in `src/framework/ops/dependency-plan.js` (unit-tested):

- **DB unavailable → exit**: an app without a pool can still listen but returns 500 for every
  request. Letting it "start successfully" is the worst failure mode — every monitor green,
  every user broken.
- **Redis unavailable → warn and continue**: the app boots, but capabilities that depend on
  Redis (rate limiting, CAPTCHA, sessions) return **503** rather than quietly using memory.
  `getStore()` only uses the in-process `MapStore` when Redis is **not configured at all**;
  when it is configured but unreachable the access layer keeps the Redis implementation and
  throws `RedisRequiredError`. Treating a cache hiccup as fatal trades one component's wobble
  for total unavailability, so the choice is "start degraded + report 503 from
  `/health/ready`" and let the load balancer drain the instance. Do **not** "fix" it by
  removing `REDIS_ENABLED`: that really does degrade to per-instance memory, and replicas then
  count separately.

### Give graceful shutdown room

```yaml
stop_grace_period: 35s   # the app's own fallback is 30s (SHUTDOWN_TIMEOUT in index.js)
```

The orchestrator's grace period **must exceed** the app's own timeout, otherwise the container
is SIGKILLed before `onClose` hooks flush guard config and broadcast WS close frames.

### Volumes

| Volume | Mount | Contents |
| --- | --- | --- |
| `app-logs` | `/app/logs` | rolling logs |
| `app-data` | `/app/src/data` | firewall telemetry and other persisted state |
| `app-uploads` | `/app/public/uploads` | user uploads |

## Running migrations

**Not part of app startup**: replicas starting together would run migrations concurrently and
rewrite the same schema — at best an error, at worst a half-applied state. Use a one-off task
in a dedicated deployment step:

```bash
docker compose --env-file .env.docker run --rm migrate
```

Single-host or demo setups can use the convenience flag `RUN_MIGRATIONS=true` (the entrypoint
runs migrations once before starting), but it is mutually exclusive with multiple replicas.

## Health probes

Three semantics (see `src/api/system/v1/health.js`):

| Endpoint | Semantics | Orchestrator use |
| --- | --- | --- |
| `GET /v1/health/live` | always 200, touches nothing | **liveness**: restart the instance on failure |
| `GET /v1/health/ready` | **503** when a critical dependency is down | **readiness**: drain from the load balancer |
| `GET /v1/health` | legacy, always 200 | do not use for new integrations |

The image's `HEALTHCHECK` uses **live** (so dependency flapping does not restart containers).
In Kubernetes, configure both:

```yaml
livenessProbe:  { httpGet: { path: /v1/health/live,  port: 3000 } }
readinessProbe: { httpGet: { path: /v1/health/ready, port: 3000 } }
```

## Troubleshooting

| Symptom | Look here first |
| --- | --- |
| Container up but `/v1/health/ready` returns 503 | `dependencies.database.status` and `redis.status` in the body; errors show only a label (e.g. `ECONNREFUSED`), full detail is in `docker compose logs app` |
| App exits at boot with "database connection failed (host:port/db)" | DB **configured but unreachable** (wrong host, wrong account, MySQL not initialised yet). `03-db.js` fails fast here and never continues with a `null` DB |
| App exits at boot with no dependency error | A **critical loader** failed (auth / firewall / models / keys / routes / apps) — only `01-monitor` / `02-redis` / `09-notice` may degrade |
| Log says "Redis wait timed out, continuing" | The process starts, but rate limiting / CAPTCHA / sessions return **503** (not an in-memory fallback). Check that `REDIS_HOST` uses the service name `redis` inside the container network, then inspect `redis.status` from `/v1/health/ready` |
| Missing table / column | Migrations were not run: `docker compose --env-file .env.docker run --rm migrate` |
| Probe keeps failing while the service works | You are probably hitting `/health/live` without the `/v1` prefix |
| `docker stop` takes 10 seconds | `stop_grace_period` is shorter than the app's fallback, or tini was removed from the image |
