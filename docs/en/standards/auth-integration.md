# Auth integration {#frontend-auth}

This page is the **wire contract** between the backend and any client. The backend ships no
frontend code — everything below is what a client has to implement.

> ⚠️ **Security baseline**: use an **HttpOnly session cookie** (`withCredentials: true`, issued
> and renewed by the backend). **Never store long-lived, high-privilege tokens in
> `localStorage`/`sessionStorage`** — any XSS can read and persist them. Bearer tokens are for
> **standalone API clients** (server-to-server, mobile), where you must manage their lifecycle,
> revocation and rotation explicitly and document the different CSRF/XSS boundaries.

## Session model

The client holds **no credentials**. The session is carried by the backend's `sid` HttpOnly
cookie; the client only tracks UI state such as "request in flight". Whether a user is signed
in is answered by an API call, not by the presence of a local token:

```typescript
// call from a route guard; 401 means "not signed in" → redirect to login
const user = await getUserInfo();        // GET /user/v1/userinfo
const permissions = await getPermissions(); // GET /user/v1/permissions
```

> ⚠️ Older integrations serialised `token` / `user` / `roles` / `permissions` into
> `localStorage`. That pattern is gone: a permission snapshot in `localStorage` **expires
> silently** (the UI keeps allowing what the backend no longer allows), and any XSS can read it.
> Do not reintroduce it.

### Standalone API clients (no cookies)

For server-to-server, mobile and CLI clients that cannot hold cookies:

- keep `access_token` **in process memory only** — never in `localStorage`
- store `refresh_token` in the OS keychain or an equivalent secure store
- send `Authorization: Bearer <token>` on each request, and refresh on 401

## HTTP client

```typescript
import axios from 'axios';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
  withCredentials: true // cookies travel cross-origin too (backend needs a CORS allowlist + credentials)
});

service.interceptors.response.use(
  response => {
    const res = response.data;
    if (res.code === 200) return res.data;
    return Promise.reject(new Error(res.message));
  },
  error => {
    if (error.response?.status === 401) {
      // single 401 handler: clear local state → redirect to login, retry at most once
    }
    return Promise.reject(error);
  }
);

export default service;
```

## Request signing (`/oauth2.1` scope)

The middleware only applies to the **`/oauth2.1` prefix** (`/oauth2.10` is not matched) and
only when the route declares `config.requireSignature`:

| Case | Result |
| --- | --- |
| Route does not declare `requireSignature` | pass through (public routes unaffected) |
| Missing signature / missing timestamp / mismatched signature | **403** |
| Timestamp outside the allowed window | **403** |
| First visit (no `_m_h5_tk`) | issue `_m_h5_tk`; this request is not failed |

The client takes the token from the `_m_h5_tk` cookie, builds the string the backend expects,
puts it in the request header and also sends `x-device-id`. The algorithm lives in
`src/framework/auth/signature.js`.

## CSRF (`/oauth2.1` scope, enabled)

Double-submit cookie, scoped to `/oauth2.1`:

| Stage | Behaviour |
| --- | --- |
| Safe methods (GET/HEAD/OPTIONS) | issue a `_csrf` cookie if absent (not HttpOnly, readable by JS) |
| Bootstrap endpoint `GET /oauth2.1/csrf` | returns `{ token }` and sets the cookie, for clients that need it before the first POST |
| Unsafe methods | `x-csrf-token` must equal the `_csrf` cookie exactly; missing or different → **403** |
| Excluded endpoints | `/oauth2.1/token`, `/revoke`, `/crypto`, `/device_authorization`, `/device/token` — they rely on client credentials or one-time tokens, not browser cookies |

🔴 **Login is protected too** (login CSRF logs the victim into the attacker's account, so
everything they do afterwards lands in the attacker's account). A client that opens a login page
and submits immediately must therefore fetch the token first:

```typescript
async function ensureCsrfToken(): Promise<string> {
  const fromCookie = document.cookie.match(/(?:^|;\s*)_csrf=([^;]+)/)?.[1];
  if (fromCookie) return decodeURIComponent(fromCookie);
  const { token } = await service.get('/oauth2.1/csrf');
  return token;
}
```

> 🔴 **Rate limits on sensitive endpoints** (same scope; rule table in
> `src/app/oauth21/middleware/rate-limiter.js`):
> login / mini-login 5 per minute, email second factor 5 per minute, QR confirmation 10 per
> minute, iframe registration (`/oauth2.1/mini-register`) 3 per hour — all keyed by IP.
> Over the limit returns **429 + `Retry-After`**; clients should say "try again later" rather
> than "wrong password".
>
> ⚠️ **The real registration endpoint is in the user domain**: `POST /user/v1/register`,
> protected by its own `config.rateLimit` (5/min/IP) plus email and image CAPTCHA verification.
> `/oauth2.1/mini-register` is only the iframe entry point (a stub today).
> Every path in that rule table is compared against the real route table by
> `src/__tests__/security/rate-limit-rules.test.js` — a typo does not error, it just makes that
> rule permanently dead, which is exactly why the guard exists.
>
> Both hooks share an escape hatch, `OAUTH21_SECURITY_HOOKS=off` (on by default): use it only
> when an older client bundle without `x-csrf-token` is causing 403s, and turn it back on
> immediately afterwards.

## Endpoint reference

Prefixes come from `src/api/<domain>/<domain>.json` (`oauth21` is `/oauth2.1` with **no** `v1`
segment; the user domain is `/user` plus `/v1` in the route):

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/oauth2.1/login` | POST | standard login (RSA-encrypted password) |
| `/oauth2.1/mini-login` | POST | quick login (iframe-friendly) |
| `/oauth2.1/login/consent/confirm` | POST | confirm consent for quick login |
| `/oauth2.1/login/verify-email` | POST | email second factor after an anomalous environment |
| `/oauth2.1/logout` | POST | sign out |
| `/user/v1/register` | POST | registration |
| `/user/v1/userinfo` | GET | current user |
| `/user/v1/permissions` | GET | current user's permissions |
| `/auth/v1/verify-challenge` | POST | verify an image CAPTCHA |
| `/verify/v1/send-login-verify-code` | POST | send a login verification code |

## Client-side permission helpers

Hiding a button is **not** a security boundary — the real check is the backend guard, whose
rule is **deny-before-allow with wildcards** (a `denies` hit rejects regardless of `allows`).
Any client-side directive exists only to keep the UI honest; the backend is authoritative.
