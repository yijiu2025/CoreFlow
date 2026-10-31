# Multi-server architecture {#multi-server}

> ## 📐 Status: design document · **not implemented**
>
> **The "per-role module trimming" described here does not exist in the code.**
>
> - `SERVER_ROLE`, `MODULE_*` and friends have **zero references** in the repository and are absent
>   from `.env.example`;
> - the current loader (`src/framework/loader/registry/`) loads **everything**; there is no
>   role-based trimming.
>
> **Two facts that have moved since this page was written:**
>
> 1. the Docker artefacts **are implemented** (`Dockerfile` / `docker-compose.yml` /
>    `docker/entrypoint.mjs`, plus a compose full-stack smoke pipeline) — see
>    [Docker deployment](/en/deployment/docker);
> 2. every horizontal-scaling blocker previously listed here **has been fixed and is gated**:
>    distributed scheduler lock (E1), guard-config sync across instances (E2), telemetry and WS
>    broadcast externalised (E3). Re-run `npm run verify:all` to check. In other words, "several
>    instances running the same workload" is already safe — **what is missing is only per-role
>    module trimming**.
>
> **Do not plan a deployment based on this page.** It is kept as a design reference, not a
> description of the current state.

## Overview

```
┌──────────────┐          ┌──────────────┐
│  Primary      │          │  Node A      │
│  (auth)       │          │  (business)  │
│               │          │              │
│  OAuth 2.1    │◄────────►│  business API│
│  user / IAM   │ verify   │  app data    │
│  session      │  token   │  local perms │
└──────┬───────┘          └──────────────┘
       │
       ▼
┌──────────────┐
│ shared DB     │
│ MySQL / Redis │
└──────────────┘
```

## Design-time switches (not implemented)

**Primary server:**

```ini
SERVER_ROLE=auth
MODULE_OAUTH21=true
MODULE_USER=true
MODULE_IAM=true
MODULE_NOTICE=true
MODULE_SESSION=true
```

**Node:**

```ini
SERVER_ROLE=app
MODULE_OAUTH21=false
MODULE_USER=false
MODULE_IAM=false
MODULE_SESSION=true

AUTH_SERVER_URL=https://auth.example.com
AUTH_SERVER_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
```

## Token verification

The primary server signs JWTs (RS256); nodes verify with the public key:

```
primary : sign with private key → access token (JWT)
node    : verify with public key → claims (sub, role, scope, …)
```

Advantages:

- verification is local — zero network cost per request
- the public key can be distributed safely
- tokens already issued stay verifiable even if the primary server is briefly unavailable

## Node types

| Type | User authorisation | User data | State sync | Typical use |
| --- | --- | --- | --- | --- |
| User-facing | required | yes | required | user portals, SaaS |
| Service | not required | no | not required | cron jobs, data sync |
| Hybrid | partial | partial | partial | e-commerce |

## User-state propagation

**Core rule: notify only the apps this user has authorised.**

```
auth service:
  user is banned
    → look up oauth_user_approval: the user authorised App A and App B
    → POST https://app-a.example.com/internal/webhook/user-state
    → POST https://app-b.example.com/internal/webhook/user-state
    → App C is not notified
```

| Change | Urgency | Mechanism |
| --- | --- | --- |
| Ban / account deletion | immediate | token blacklist + webhook |
| Role / permission change | soon | webhook |
| Profile update | eventual | short-lived token refresh |

## Option comparison

| Dimension | A: config switches | B: separate databases | C: microservices |
| --- | --- | --- | --- |
| Work involved | small | medium | large |
| Deployment complexity | low | medium | high |
| Data isolation | none | yes | yes |
| Independent scaling | no | no | yes |
| Fits stage | early / mid | mid | large scale |
