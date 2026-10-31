# CI/CD {#cicd}

> ## ✅ Status: implemented
>
> | File | Trigger | What it does |
> | --- | --- | --- |
> | `.github/workflows/ci.yml` | push to main, every PR | lint gate / full Jest suite / **cross-process gates** (real Redis) |
> | `.github/workflows/release-docker.yml` | push to main, `v*` tags, manual | build and push the image to GHCR + **full-stack compose smoke test** (shown as `Publish Image`) |
> | `.github/workflows/docs.yml` | push to main (`docs/**` changes), manual | build the documentation site and deploy to <https://yijiu2025.github.io/CoreFlow/> |

---

## CI vs CD, briefly

**CI (Continuous Integration)** means every merge into the trunk is re-verified by a machine. The
point is not "running scripts" — it is **moving verification off people**. Without CI, quality
depends on whoever committed remembering to run the tests, and people forget, especially under
deadline. CI makes it non-negotiable: red gate, no merge.

A typical CI does three things: static checks (lint / types), automated tests (unit, integration,
contract), and a build that proves the code produces an artefact — not merely that `npm run dev`
works locally.

| Abbreviation | Meaning | Key difference |
| --- | --- | --- |
| **Continuous Delivery** | the pipeline always keeps a releasable artefact | shipping stays a human decision |
| **Continuous Deployment** | every passing build goes to production automatically | the decision moves into the pipeline |

Most teams need **Delivery**. Both share the same pipeline; the difference is whether the last
step has a manual gate.

```
Without CI/CD:
  change code → run a few tests locally (if you remember) → commit → ship → users find the bugs

With CI/CD:
  change code → push → machine verifies (lint → tests → cross-process invariants → build → smoke)
                        │
                        ├─ fail: the code never reaches the trunk (the problem is yours, not the users')
                        └─ pass: artefacts are produced → (manual/automatic) release
```

The real win is not "fewer manual steps" — it is **finding problems before the merge instead of
after the deploy**. A bug caught in CI costs minutes; the same bug in production costs hours plus
trust.

---

## This project's pipelines

| Workflow | Job | What it blocks |
| --- | --- | --- |
| `ci.yml` | lint | style/convention drift, dead documentation links, a documentation site that will not build |
| `ci.yml` | test | unit / contract / structural-guard regressions |
| `ci.yml` | verify | concurrency defects that only appear across processes |
| `docs.yml` | build → deploy | publishing the documentation site to GitHub Pages |
| `release-docker.yml` | publish | image artefacts and boot smoke test |

`ci.yml` is the **only gate entry point** (branch protection requires its three job names);
`docs.yml` publishes and does not take part in PR checks — publishing needs `pages: write`,
which PRs from forks do not get.

### 1. `ci.yml` / lint — convention gate

```bash
node scripts/verify/doc-links.mjs                  # relative doc links (zero deps, runs first)
npx eslint src scripts migrations docker index.js  # style and conventions
DOCS_BASE=/CoreFlow/ npx vitepress build docs      # the docs site must build
```

These are this repository's own rules, several of which cannot be copied from elsewhere:

- **export placement**: every `export` must sit at the end of the file (`no-restricted-syntax`);
- **no `console.*`**: backend code logs through `src/framework/log`;
- **test-effectiveness** and friends are covered by the structural guards in
  `src/__tests__/conventions/` (they run in the test job).

Why only those directories: the working tree still holds huge third-party checkouts. Scanning
them would leave the pipeline permanently red — **a check that is always red is not a check**,
a principle that recurs throughout this repository.

The two documentation steps cover different failure modes:

- **dead links** (`doc-links.mjs`) only looks at relative links and needs no dependencies, so it
  runs before `npm install`. Its criterion is "would this target exist in a clean checkout":
  targets inside `docs/` must exist; targets outside `docs/` that git does not track count as
  external pointers and are skipped. Using `existsSync` yields "green locally, red in CI" — which
  is exactly what happened once.
- **the docs build** uses the **same base as production** (`/CoreFlow/`). A wrong base shows up as
  "build succeeded, every internal link 404 after deploy", which only a sub-path build reveals.

### 2. `ci.yml` / test — full suite

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --ci
```

`--experimental-vm-modules` is mandatory: the project is ESM and the tests rely heavily on
`jest.unstable_mockModule`. Without the flag large parts of the suite fail.

**This job needs Redis but not MySQL**, for two measured reasons:

- `framework/db` skips rather than aborts when no DB is configured, so MySQL can be absent;
- Redis **must** be present: the `framework/redis` integration suites skip without it, and a skip
  in CI means **pass** — the false-green trap where everything is green and not one line of Redis
  code ran.

So the test job declares a `redis:7` service (with `--health-cmd "redis-cli ping"`) and sets
`REDIS_DB: '15'` (isolated from local dev) plus `EXPECT_REDIS: 'true'`.
`src/__tests__/framework/redis/redis-ci-guard.test.js` reads that variable: **delete the service or
the env and it turns red immediately** instead of silently skipping.

> The reason that guard exists is worth remembering: making a test "optionally depend on a real
> service" makes it silently downgradable. Assertions that need external services must either be
> guarded so CI always provides them, or be honest that they are not a regression gate.

### 3. `ci.yml` / verify — cross-process invariants (real Redis)

```bash
node scripts/verify/lock-mutex.mjs        # E1: distributed lock mutual exclusion
node scripts/verify/ws-fanout.mjs         # E3: WS broadcast fan-out across instances
node scripts/verify/stats-aggregation.mjs # E3: telemetry aggregation across instances
node scripts/verify/queue-atomic.mjs      # U12: queue pointer Lua atomicity (no dups, no drops, no rewind)
```

All of these **look correct in a single process** thanks to singleton state; only real multiple
processes plus real Redis can falsify them. They used to depend on someone remembering to run
them — which meant nobody did. Only after moving into CI did the gate actually exist.

Exit codes are deliberately graded, and CI gives a different hint per level:

| Code | Meaning | CI reaction |
| --- | --- | --- |
| 0 | pass | continue |
| 1 | assertion failed (real regression) | fail, inspect the code |
| 2 | rollback incomplete | fail, and **inspect the data manually** |
| 3 | environment unavailable | also fail — the service is declared by us; if it cannot be reached, the pipeline is broken |

### 4. `docs.yml` — documentation publishing (GitHub Pages)

Site: <https://yijiu2025.github.io/CoreFlow/>

```
push to main (docs/**, package.json changes)
   → vitepress build docs (DOCS_BASE=/CoreFlow/)
   → verify the output really carries the /CoreFlow/ prefix
   → upload-pages-artifact → deploy-pages
```

Deliberate choices:

- **A project site lives on a sub-path.** The repository name `CoreFlow` puts the site at
  `/CoreFlow/`, so builds must pass `DOCS_BASE`; asset paths in `head` (favicon) are emitted
  verbatim and need the prefix added in `config.ts` (internal links are handled by VitePress).
- **In-progress deploys are not cancelled** (`cancel-in-progress: false`). Killing a build leaves
  the live site inconsistent with the repository for a while, and the docs site has no rollback
  button.
- **Publishing is separate from verification.** PRs build (lint job); only main publishes.
  Merging them would require `pages: write` on PRs, or make publishing fail on every PR.
- **No `npm ci`**: same reason as the backend jobs (the root lock records `wb-logkit` as a link to
  a nested repo that is not committed).

One-time setup: Settings → Pages → Source = **GitHub Actions**. Without it `deploy-pages` fails
with `Get Pages site failed`, which has nothing to do with the workflow.

### 5. `release-docker.yml` (Publish Image) — the CD artefact and its smoke test

```
build the image (gha layer cache + SBOM + provenance)
   → push to GHCR (branch name / commit sha / semver tags)
   → compose up mysql + redis
   → run migrations
   → start the app
   → poll /v1/health/ready until 200
```

**Why "the build succeeded" is not delivery**: this image has four failure modes that only appear
when it actually runs —

1. `npm install --workspaces=false` misses a production dependency → crashes at boot;
2. the entrypoint's dependency-wait logic is wrong → the container waits forever;
3. migrations were not run → tables missing, readiness returns 503;
4. the probe path is wrong (`/health/live` instead of the real `/v1/health/live`) → the health
   check never passes.

So the final step **really starts the stack with the repository's own `docker-compose.yml`** and
waits for `/v1/health/ready` to return 200 — the only way to prove compose, entrypoint and health
probes agree with each other.

> Deploying to a concrete environment (SSH, K8s, Watchtower) is **not implemented**, because that
> needs target credentials and a release policy only you know. The pipeline ends at "image pushed
> to the registry"; see the next section for how to continue.

---

## What you must configure by hand

Workflow files in the repository do not make a gate. Two GitHub steps are still required:

1. **Branch protection** (Settings → Branches → Branch protection rules): require the `Lint` /
   `Test` / `Verify` checks before merging into main. Without it the pipeline is just a page with
   coloured lights.
2. **GHCR permissions**: `release-docker.yml` pushes with the built-in `GITHUB_TOKEN` and declares
   `permissions: packages: write`. If organisation policy disables that, switch to a PAT in
   `secrets`.

### Wiring up a real deployment (example, not implemented)

```yaml
# append a job at the end of release-docker.yml
deploy:
  needs: [smoke]
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: production        # GitHub Environments can require approval → back to Delivery
  steps:
    - uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.DEPLOY_HOST }}
        username: ${{ secrets.DEPLOY_USER }}
        key: ${{ secrets.DEPLOY_KEY }}
        script: |
          cd /srv/nodeservers
          docker compose --env-file .env.docker pull
          docker compose --env-file .env.docker run --rm migrate
          docker compose --env-file .env.docker up -d app
```

---

## Not implemented

**Swagger / OpenAPI interactive docs**: neither `@fastify/swagger` nor `@fastify/swagger-ui` is in
`package.json`. The API contract currently lives in `src/api/<domain>/system.json` and the
`registerSecureRoute` declarations. If you build it, respect two project-specific constraints:

- routes are all registered through `registerSecureRoute`, so schemas belong there rather than
  being hand-written per endpoint;
- public endpoints such as `/docs` must go through the firewall and the `requireLogin` policy —
  do not leak internal topology.
