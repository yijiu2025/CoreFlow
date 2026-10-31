# Authentication {#auth}

## Modes

| Mode | Enabled by | Token storage | Verification |
| --- | --- | --- | --- |
| Session (default) | `JWT_ENABLED=false` | Redis (`sid`/`sid_r` cookies, HttpOnly) | cookies sent automatically |
| JWT | `JWT_ENABLED=true` | **HttpOnly cookie first**; Bearer (in memory) only for cross-origin / CLI | JWT signature validation |

> 🔴 **Never put long-lived tokens in `localStorage`**: any same-origin XSS can read them and
> replay them indefinitely. In browsers prefer an `HttpOnly` cookie (the reference frontend does
> exactly this); when Bearer really is required (cross-origin APIs, command-line clients), keep
> `access_token` **in memory only** and `refresh_token` in an HttpOnly cookie, and renew silently
> on page load.

## Password storage

Passwords use Node's built-in `crypto.scrypt` (`src/framework/auth/password-hash.js`, async, runs
on the libuv thread pool). Historical bcrypt hashes (`$2a$` / `$2b$` / `$2y$`) remain
**verification-only**, and are transparently rewritten to scrypt on a successful login.

**New code must not reintroduce `bcrypt` / `bcryptjs`**: the sync variants freeze the event loop,
and the async variant is still pure-JS computation — measured, ten `bcrypt.hash` calls froze the
loop for up to 649ms, versus 22ms for scrypt.

scrypt has a global concurrency cap (`SCRYPT_MAX_CONCURRENCY`, default 16) — over the cap
requests queue rather than saturate the thread pool. Legacy bcrypt verification has its own cap
(`BCRYPT_MAX_CONCURRENCY`, default 4) because each call blocks the main thread for ~68ms.

## Two-token session

### Short-lived login (no "remember me")

- `sid` cookie: HMAC-signed sessionId, HttpOnly, Max-Age = **30 minutes** (`SHORT_SESSION_TTL = 1800`)
- Redis: `session:<sessionId>` = JSON (user + roles + permissions), TTL matches `sid`

### Long-lived login ("remember me")

- `sid` cookie: Max-Age = **30 days** (`LONG_SESSION_TTL = 2592000`)
- `sid_r` cookie: refreshToken, Max-Age = **30 days** (`REFRESH_TOKEN_TTL`)
- The `sid_r` → sessionId mapping in Redis lives **180 days** (`USER_COOKIE_TTL`, renewed on activity)
- When `sid` expires the session is refreshed via `sid_r` with no user-visible interruption;
  refresh is an **atomic claim**, so the same refreshToken succeeds exactly once

> All four constants live in `src/framework/auth/cookie.js`. If the session is evicted from
> Redis, `session_tokens` in the DB still holds `last_active`: within the short TTL the cache is
> rebuilt, beyond the long TTL the session is revoked.

### Cookie signature format

```
base64url(sessionId:accessCount).hmac-sha256-signature
```

- `accessCount` increments on every request and the cookie is re-signed (replay protection)
- signatures are compared with `timingSafeEqual` (timing-attack resistant)

## Session payload (Redis)

```json
{
  "userId": 123,
  "uid": "uuid-xxx",
  "username": "alice",
  "email": "alice@example.com",
  "avatar": "https://...",
  "status": 1,
  "appId": "firewall",
  "roles": ["admin", "operator"],
  "permissions": { "allows": ["user:read", "config:*"], "denies": ["user:delete"] },
  "permFingerprint": "first 16 chars of sha256",
  "ip": "192.168.1.1",
  "deviceId": "WEB-DaBOSbNdSuc-8s4T",
  "deviceFingerprint": "first 32 chars of sha256(device_id|uid|UA)",
  "deviceType": "browser",
  "userAgent": "Mozilla/5.0 ...",
  "familyId": "hex, 16 bytes",
  "loginAt": 1717000000,
  "lastActiveAt": 1717000000,
  "rememberMe": false
}
```

- `permFingerprint`: compared when a session is restored (Redis rebuild / `sid_r` refresh). If it
  is unchanged the cached permissions are reused; if it changed the three permission tables are
  re-read — this stops a long-TTL session from running on stale permissions.
- `familyId`: identifies one login chain. If a rotated `sid_r` is replayed, only that family is
  revoked, leaving the user's other devices untouched.
- `loginAt` / `lastActiveAt` are **second**-precision timestamps.

## JWT (optional)

### Payload

```json
{
  "iss": "http://localhost:3000",
  "sub": "user-uuid",
  "aud": "firewall",
  "client_id": "firewall",
  "scope": "openid profile email",
  "iat": 1717000000,
  "exp": 1717000600,
  "jti": "uuid-xxx",
  "token_type": "access_token"
}
```

### Refresh flow

```
access_token expires (10 minutes)
  → API returns 401
  → client handle401() detects it
  → POST /oauth2.1/token (grant_type=refresh_token)
  → backend validates the refresh_token and issues a new access_token
  → queued requests are replayed
```

## OAuth 2.1 authorization flow

```
user visits a third-party app
  → redirect to SSO /authorize
  → SSO inspects cookies:
    - no login cookie      → { action: 'login' }
    - logged in, no consent → { action: 'consent' }
    - logged in, consented  → 302 redirect to redirect_uri?code=xxx
  → user confirms consent
  → callback carries the authorization code
  → the app exchanges the code for an access token
```

## Login methods

| Method | Flow | Typical client |
| --- | --- | --- |
| Email code | email → image CAPTCHA → email code → login | web |
| Password | credentials → RSA encryption → login | web |
| QR code | generate QR → scan on phone → confirm | desktop + mobile |
| Device code | generate device code → enter on another device → authorize | IoT / TV / CLI |

## iframe quick login

The auth centre exposes a minimal login page for iframe embedding, talking to the parent over
`postMessage`:

```html
<iframe id="sso" src="http://auth.yourdomain.com/mini-login?appName=firewall"></iframe>
```

🔴 **Validate both `origin` and `source`.** Checking `event.origin` alone is not enough: any
iframe on the same origin (ad slot, third-party preview, user-uploaded HTML) can post to the
parent, and with the right `type` it can inject an attacker's `session_token` — that is
**login hijacking** (the victim ends up signed into the attacker's account).

```javascript
const AUTH_ORIGIN = 'http://auth.yourdomain.com';
const frame = document.getElementById('sso');

window.addEventListener('message', event => {
  // ① the sender must be the auth centre (exact comparison — never startsWith / includes)
  if (event.origin !== AUTH_ORIGIN) return;
  // ② the sender must be the frame we embedded
  if (event.source !== frame.contentWindow) return;

  const { type, data } = event.data || {};
  if (type === 'LOGIN_SUCCESS') {
    // ③ a failed bind-session must abort the flow, never continue as success
    fetch('/auth/v1/bind-session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_token: data.session_token })
    }).then(r => {
      if (!r.ok) throw new Error('bind-session failed');
      location.assign('/');
    });
  }
});
```

The complete handshake (parent ↔ login page messages, timeout fallback) is described in
[Auth integration](/en/standards/auth-integration).

## Accessing the current user

```js
// option 1: read it off request.state
handler: async (request, reply) => {
  const user = request.state.user;
  user.uid;          // UUID
  user.userId;       // internal id
  user.username;
  user.roles;        // ['admin', 'user']
  user.permissions;  // { allows: [...], denies: [...] }
};

// option 2: StpUtil (the recommended entry point for permission checks)
import StpUtil from '../../framework/auth/stp-util.js';

StpUtil.getLoginId();               // current user id
StpUtil.check();                    // hard login check (401 when anonymous)
StpUtil.checkRole('admin');         // role check
StpUtil.hasPermission('user:read'); // permission test (fail-closed: missing → false)
```

## Kicking a user out

```js
import { kickUser } from '../framework/auth/session-kick.js';
await kickUser(userId, appId); // appId = null kicks the user out of every app
// deletes the Redis session (the whole family) + marks the DB row revoked → next request fails
```
