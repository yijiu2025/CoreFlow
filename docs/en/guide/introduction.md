# Introduction {#introduction}

CoreFlow is a backend framework built on **Fastify v5 + Sequelize v6**. It ships the parts
every project ends up writing — authentication, authorization, firewall, OAuth 2.1 — so you can
spend your time on business logic.

> Since 2026-10-31 this repository contains **the backend only**. The frontend projects
> (`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`) were moved out
> and are maintained separately. Frontend and backend talk over an **HTTP wire protocol**
> (HTTP + cookies); the contract lives in [Auth integration](/en/standards/auth-integration).

## Core capabilities

### Authentication

Two modes out of the box:

- **Session mode** (default): server-side session backed by a cookie + Redis, with automatic
  renewal, multi-device management and remote sign-out
- **JWT mode** (optional): stateless authentication for service-to-service or headless clients

Both support RSA-encrypted login, HMAC-signed cookies and replay protection.

### Permissions (PBAC)

**Policy-Based Access Control**:

- Permission codes follow the `{app}:{resource}:{action}` triple
- Wildcard matching (e.g. `fw:admin:*`)
- Deny beats allow
- Role inheritance with weight precedence
- App isolation plus global visibility

### Firewall

A five-stage interception pipeline:

```
connection tracking → global blocking → human challenge → bot detection → geo-fencing / endpoint rate limiting
```

### OAuth 2.1

A complete authorization server:

- Authorization code + PKCE
- JWT issuance and validation
- Multi-client management
- Fine-grained scopes

## Tech stack

| Layer | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | ≥ 24 (ESM, LTS) |
| Framework | Fastify | v5 |
| ORM | Sequelize | v6 |
| Database | MySQL | 8.0+ |
| Cache | Redis (optional) | v5 client / 6.0+ server |
| Auth | Session + JWT | – |
| Migrations | Umzug | v3 |

## Design principles

1. **A module is an app**: one directory holds everything — config, permissions, models, routes
   and business logic
2. **Convention over configuration**: loaders discover and register modules; no manual imports
3. **Secure by default**: a three-level guard system, each level able to stop a request on its own
4. **Progressive enhancement**: Redis is optional (in-process `MapStore` when unset, a strict
   503 when configured but unreachable); JWT is optional (session by default)
5. **Frontend decoupled**: the backend exposes an HTTP contract only (session cookie /
   signature / CSRF header) — any stack can consume it, and this repository carries no
   frontend code

## Next steps

- [Quick start](/en/guide/quick-start) — get an instance running
- [Project structure](/en/guide/project-structure) — how the tree is organised
- [Architecture](/en/core/architecture) — how the layers fit together
