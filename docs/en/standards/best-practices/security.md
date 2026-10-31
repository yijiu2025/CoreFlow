# Security {#security}

## Passwords

- **All new hashes use `crypto.scrypt`** (`src/framework/auth/password-hash.js`, runs on the
  libuv thread pool, with back-pressure via `SCRYPT_MAX_CONCURRENCY`)
- Historical `bcrypt` hashes are **verification-only**: never write bcrypt again, on success or
  failure. On a successful login `isLegacyHash()` detects them and upgrades in place to scrypt
- ⚠️ **Do not bring `bcryptjs` back into the password path**: it is pure JS, and
  `hashSync`/`compareSync` monopolise the main thread (measured: ten concurrent hashes froze the
  event loop for 649–774ms). The async variant is no better — it merely yields in slices. This
  documentation once stated the opposite ("use bcryptjs for password hashing"); the concurrency
  cap on the `bcrypt` verification path (`BCRYPT_MAX_CONCURRENCY`) exists precisely to absorb
  bursts of legacy hashes
- Production validates secret strength and refuses default or short values

## Replay protection

- Timestamp check: **±2 minutes** (`src/framework/auth/signature.js` —
  `Math.abs(now - ts) > 120_000` is rejected)
- Nonce deduplication (Redis atomic check-and-mark): used by both H5 request signing
  (`_m_h5_tk`) and RSA-encrypted login requests

## CSRF

- Double-submit cookie, **scoped to `/oauth2.1` only**
- The exclusion list only admits endpoints that do not rely on browser cookies (token / revoke /
  crypto / device flows). Login, consent confirmation, QR confirmation and logout **must stay
  protected** (login CSRF = login hijacking)

## Rate limits

| Endpoint | Limit | Implementation |
| --- | --- | --- |
| Login / quick login | 5 per minute per IP | `app/oauth21/middleware/rate-limiter.js` |
| Email second factor | 5 per minute per IP | same |
| QR confirmation | 10 per minute per IP | same |
| Registration | 5 per minute per IP (endpoint `config.rateLimit`) + email code + image CAPTCHA |
| Global | 600 per 60s per key (user / IP) | `@fastify/rate-limit`, threshold from `defense.rateLimitRequests` |

> ⚠️ The global threshold lives at `defense.rateLimitRequests` in
> `src/data/firewall_config.json`. It has been configured as 10000/60s in the past (≈167 rps per
> key, i.e. that layer did not exist). The startup log prints the effective value and warns above
> 1000.

## Login lockout

- Same account: 5 failures within 15 minutes → locked for 30 minutes
- Same IP: 10 failures within 15 minutes → temporary block plus an alert

## Cookies

```
sid cookie: HttpOnly / Secure / SameSite=Lax
  - HMAC-SHA256 signature
  - accessCount increments on every request (replay protection)
  - signatures compared with timingSafeEqual (timing attacks), length checked first
sid_r cookie: HttpOnly / SameSite=Strict / path narrowed to the refresh endpoint
```

## CORS

Production only allows the `CORS_ORIGINS` allowlist; **an empty allowlist fails closed for
sensitive endpoints** (`src/framework/auth/origin-guard.js`: Origin → Referer → non-browser
request, three levels, reject when undecidable). Do not copy `process.env.CORS_ORIGINS.split(',')`
into sample code — it throws `TypeError` when the variable is unset.

## Response headers

```js
reply.header('X-Content-Type-Options', 'nosniff');
reply.header('X-Frame-Options', 'SAMEORIGIN');          // pages needing iframes: issue CSP frame-ancestors from an allowlist
reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

> Do **not** send `X-XSS-Protection`: modern browsers dropped it, and older IE treated legitimate
> content as reflected XSS — which made it exploitable.

## Reverse-proxy trust

`PROXY_TRUST_CIDR` may only contain the **exact address of the reverse proxy**
(e.g. `172.18.0.2/32`). Anything inside a trusted range can set its own `X-Forwarded-For`, and
`request.ip` is the sole input to IP allowlists, rate-limit keys and block records — trusting
something like `172.16.0.0/12` hands the entire IP dimension to the attacker. `src/app.js` warns
at boot when a range is too wide.

## Secrets

Production must replace every default secret:

```ini
APP_SECRET=strong random value (≥ 32 chars)
SESSION_SECRET=strong random value
FIREWALL_SECRET=strong random value
```

The framework detects unsafe defaults at boot and refuses to start.
