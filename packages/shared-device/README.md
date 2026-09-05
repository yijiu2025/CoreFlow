# stable-deviceid

[English](./README.md) | [简体中文](./README.zh-CN.md)

Stable, self-healing device identity for modern web applications.

`stable-deviceid` gives your web app a **durable device identifier** that survives the things that normally break it: storage cleared by the user or by Safari ITP, clock skew between client and server, multi-tab races, and per-origin identity fragmentation in iframe-based SSO. It ships with an optional, privacy-first device fingerprint and a one-line axios integration.

## Features

- **Structured device ID** — `{PLATFORM}-{ENCODED_TS}-{RANDOM}` (e.g. `WEB-DaBOSbNdSuc-8s4T`): obfuscated millisecond timestamp (64-bit magic XOR → Base62), 6-char high-entropy random suffix via `crypto.getRandomValues` with rejection sampling
- **Self-healing** — corrupted / legacy-format / expired / future-dated stored IDs are regenerated locally; server-side rejection converges within one round trip
- **Response-header sync** — the backend can push an authoritative ID via `X-Device-Id`; the client persists it and the very next request uses it
- **SSO identity unification** — in iframe-based SSO, child apps adopt the authoritative ID from the identity domain so one physical device maps to one identity everywhere
- **Security built in** — local validation mirrors the backend rule-by-rule (platform enum, lengths, Base62 charset, future-time rejection with ±5 min clock-skew tolerance, 365-day max age), dirty-value rejection, oversized-header filtering, log truncation
- **Privacy-friendly** — canvas + WebGL fingerprinting is **off by default**; storage access degrades silently to an in-memory fallback
- **Zero dependencies** — ESM-only, tree-shakable (`sideEffects: false`), full TypeScript types, 93 unit tests

## Installation

```bash
npm install stable-deviceid
```

Requires Node.js >= 18 (build tooling only; runtime targets modern browsers).

## Quick Start

### One-line axios integration (recommended)

```ts
import axios from 'axios';
import { setupDeviceSync } from 'stable-deviceid';

const http = axios.create({ baseURL: '/api', withCredentials: true });
setupDeviceSync(http);
```

`setupDeviceSync` registers everything for you:

1. A request interceptor injecting the `x-device-id` header (served from an in-memory cache — effectively zero overhead)
2. The device-fingerprint header `x-device-fp` when enabled (see [Device Fingerprinting](#device-fingerprinting))
3. A response interceptor syncing the device ID pushed via response headers
4. Cross-tab synchronization via the `storage` event (idempotent)

```ts
// Options
setupDeviceSync(http, {
  fingerprint: true,                    // force-enable fingerprinting (default: environment-based)
  onDeviceIdChange: (oldId, newId) => { /* react to identity changes */ }
});

// Disposal for HMR / tests
const dispose = setupDeviceSync(http);
dispose();
```

### Native fetch / explicit headers

```ts
import { getDeviceHeaders } from 'stable-deviceid';

fetch('/api/profile', { headers: { ...getDeviceHeaders() } });
```

### Manual interceptors (fine-grained control)

```ts
import {
  getStableDeviceId,          // stable device ID (persisted + in-memory cache)
  getDeviceFingerprint,       // fingerprint (async, 32-char hex)
  isDeviceFingerprintEnabled, // fingerprint toggle
  handleDeviceSyncInResponse, // response-header sync (pass the axios response)
  initDeviceSync              // global init (cross-tab listener, idempotent)
} from 'stable-deviceid';

http.interceptors.request.use(async config => {
  config.headers['x-device-id'] = getStableDeviceId();
  if (isDeviceFingerprintEnabled()) {
    try {
      config.headers['x-device-fp'] = await getDeviceFingerprint();
    } catch { /* fingerprinting must never break the request */ }
  }
  return config;
});

http.interceptors.response.use(response => {
  handleDeviceSyncInResponse(response);
  return response;
});
```

## API Reference

| Export | Description |
| --- | --- |
| `setupDeviceSync(instance, options?)` | One-line axios integration; returns a dispose function |
| `getDeviceHeaders()` | Synchronous `{ 'x-device-id': id }` for fetch / explicit headers |
| `getStableDeviceId()` | Stable device ID (generated once, then reused) |
| `getCurrentDeviceId()` / `setDeviceId(id)` / `clearDeviceId()` | Read / validated write / clear |
| `adoptDeviceId(id)` | Adopt an SSO-pushed authoritative ID (format + platform checks, cross-origin unification) |
| `validateDeviceIdFormat(id)` | Local format validation → `{ valid, reason? }` |
| `parseDeviceId(id)` | Parse ID metadata (platform / timestamp / age); `null` when invalid |
| `syncDeviceFromHeaders(headers, options?)` | Sync from response headers (Headers / AxiosHeaders / plain objects) |
| `handleDeviceSyncInResponse(response, options?)` | Response-interceptor helper (axios and fetch Response) |
| `initDeviceSync(options?)` | Global init: cross-tab listener + change callback (idempotent) |
| `getDeviceFingerprint()` / `isDeviceFingerprintEnabled()` | Fingerprint collection (promise-cached, concurrent-safe) and toggle |
| `sha256(message)` | SHA-256 (Web Crypto first, pure-JS fallback on insecure contexts) |
| `getDeviceIdStats()` | Debug stats (current ID / parsed info / source) |

Constants: `STORAGE_KEY`, `MAX_AGE_DAYS` (365), `CLOCK_SKEW_TOLERANCE_MS` (±5 min), `DEVICE_PLATFORMS`, `RANDOM_SUFFIX_LENGTH`.

## SSO Identity Unification

When your app embeds an SSO login page (e.g. an OAuth authorization iframe) in a different origin, each origin would normally hold its own device ID. On login success, have the identity domain push its authoritative ID inside the `LOGIN_SUCCESS` message and adopt it **before** binding the session, so the bind request already carries the unified identity:

```ts
window.addEventListener('message', event => {
  // Always verify event.origin and event.source in production (omitted here)
  if (event.data?.type === 'LOGIN_SUCCESS' && event.data.deviceId) {
    adoptDeviceId(event.data.deviceId); // format + platform validation built in
  }
});
```

## Device Fingerprinting (off by default)

```html
<!-- Option 1: server/template-injected meta toggle -->
<meta name="device-fp" content="true" />
```

```bash
# Option 2: Vite environment variable
VITE_DEVICE_FINGERPRINT=true
```

```ts
// Option 3: explicit option (recommended for non-Vite bundlers)
setupDeviceSync(http, { fingerprint: true });
```

Collection combines canvas rendering differences and WebGL renderer/vendor strings, hashed with SHA-256 (first 32 hex chars). The result is promise-cached: concurrent calls are deduplicated and a failed collection (headless / anti-fingerprint browsers) returns an empty string instead of a constant hash, preventing false matches.

## Security Design

- **Backend-aligned validation** — local rules mirror the backend `validateDeviceId` one-to-one; illegitimate stored IDs are regenerated locally, avoiding per-request regeneration loops
- **Dirty-input defense** — response-header values over 128 chars are ignored, external input in logs is truncated, `setDeviceId` rejects malformed writes
- **Cache coherence** — any identity write invalidates the in-memory cache immediately; the next request carries the new ID
- **Graceful degradation** — private browsing / storage failures fall back to an in-memory layer without throwing, never breaking the request chain

## Device ID Format

```
{PLATFORM}-{ENCODED_TIMESTAMP}-{RANDOM_SUFFIX}
Example: WEB-DaBOSbNdSuc-8s4T
```

- `PLATFORM` — `WEB` / `IOS` / `ANDROID` (detected from the user agent)
- `ENCODED_TIMESTAMP` — (ms timestamp − 2024-01-01 offset) XOR 64-bit golden-ratio magic → Base62, fixed 11 chars
- `RANDOM_SUFFIX` — 6-char Base62 (≈35.7 bits of entropy), rejection-sampled

## Using Inside the nodeServers Monorepo

Frontends in this workspace consume the source directly through a Vite alias (development stays bundler-native):

```ts
// vite.config.ts
resolve: { alias: { 'stable-deviceid': fileURLToPath(new URL('../packages/shared-device/src/index.ts', import.meta.url)) } }
```

```json
// tsconfig.json
"paths": { "stable-deviceid": ["../packages/shared-device/src/index.ts"], "stable-deviceid/*": ["../packages/shared-device/src/*"] },
"include": ["src/**/*.ts", "../packages/shared-device/src/**/*.ts"]
```

`"stable-deviceid": "*"` in each app's `package.json` links the workspace package.

## Build & Publish (maintainers)

```bash
cd packages/shared-device
npm run build     # esbuild per-module transform → dist/ + tsc emits dist/index.d.ts
npm publish       # prepack rebuilds automatically; ESM-only, access: public
```

## Limitations

- In private browsing, storage falls back to a per-session in-memory ID that changes on reload (a `console.warn` is emitted)
- `isDeviceFingerprintEnabled` relies on `import.meta.env` (Vite) and the DOM; non-Vite consumers should use the meta tag or the `fingerprint` option
- On very old browsers without `crypto.getRandomValues`, the random suffix falls back to `Math.random` (warned; affects uniqueness only, not security)
- Safari ITP clears script-writable storage; pair the library with a server-side httpOnly-cookie recovery mechanism for full continuity

## License

[MIT](./LICENSE) © 2026 qirly
