# Antigravity Firewall - Full Architecture Reference

## 1. System Overview

```
+------------------------------------------------------------------+
|                        Browser (Vue 3 SPA)                        |
|  firewall/src/  |  Vite + Tailwind + ECharts + vue-i18n          |
+------------------------------------------------------------------+
         |  HTTP/REST (axios)          |  WebSocket
         v                              v
+------------------------------------------------------------------+
|                    Fastify v5 Server (Node.js ESM)                 |
|                                                                    |
|  onRequest Hook Chain:                                             |
|    Auth(ALS) -> Firewall(fingerprint/block/bot/geo/ratelimit)     |
|  preHandler Hook Chain:                                            |
|    Auth(JWT verify) -> Guard(3-level cascade)                     |
|  Route Handler -> reply.result.success()                          |
|  onSend -> store.pushRecord() -> WS broadcast                    |
|  onResponse -> scanner trap detection                             |
+------------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
   +-----------+       +-----------+       +-------------+
   |  MySQL    |       |  Redis    |       |  Filesystem |
   | (Sequelize|       | (cache,   |       | (config,    |
   |  v6)      |       |  bans,    |       |  stats)     |
   +-----------+       |  ratelimit|       +-------------+
                       +-----------+
```

---

## 2. Backend Boot Sequence

```
index.js
  |
  v
src/app.js  createApp()
  |  register: helmet, cors, multipart, static, websocket, cookie
  |  setGlobalErrorHandler()
  v
src/loader/index.js  initLoader(app)
  |
  v
src/loader/engine.js  runEngine(app)
  |  scan src/loader/registry/ alphabetically, execute each
  |
  +---> 00-globals.js      reply.result.success/fail/unauth/forbidden
  +---> 02-redis.js         app.redis (null if unavailable)
  +---> 03-db.js            app.db {sequelize, Sequelize, transaction}
  +---> 04-auth.js          app.auth + ALS onRequest/preHandler hooks
  +---> 05-firewall.js      rate-limit + onRequest/onSend/onResponse hooks
  +---> 06-models.js        auto-load src/models/** -> app.db.<ns>.<Model>
  +---> 07-api.js           auto-load src/api/** -> register routes
  |
  v
saveGuardConfig()  -> data/guard_config.json
```

---

## 3. Request Lifecycle (Complete Call Chain)

```
Client Request
  |
  v
[1] Auth onRequest  (src/auth/index.js)
  |  request.state = {}
  |  als.run(ctxAdapter, done)  -- wraps entire lifecycle in AsyncLocalStorage
  |
  v
[2] Firewall onRequest  (src/firewall/index.js)
  |  generateFingerprint(request)       -- SHA256(IP|UA|Lang|Enc) -> 16 hex
  |  resolveGeoInfo(ip)                 -- geoip-lite lookup
  |  trackConnection(ip, +1)            -- concurrent conn counter
  |  checkGlobalBlock(redis, ip, fp)    -- fp whitelist -> ip whitelist -> fp block -> ip block
  |    |
  |    +-- if blocked: return 429/403 + Retry-After header
  |
  |  check fw_verified cookie
  |    +-- verify fw:pass:fp:{fp}:{token} OR fw:pass:{ip}:{token} in Redis
  |    +-- if valid: skip remaining checks
  |
  |  trackRequestCount(ip)              -- 60s sliding window
  |  checkBotChallenge(redis, ip, ua, count)
  |    +-- classify UA: no-UA / bot-UA / browser-UA
  |    +-- if threshold exceeded: setBlock(CHALLENGE), serve challenge page
  |
  |  checkGeoReputation(redis, ip, url)
  |    +-- IDC IPs: stricter rate limit (60/min)
  |    +-- overseas + internal path: rate limit (30/min)
  |    +-- overseas + sensitive path: rate limit (10/min)
  |
  |  per-path rate limits:
  |    /api/sms  -> 3 req / 600s
  |    /api/order -> 10 req / 60s
  |
  v
[3] Auth preHandler  (src/auth/index.js)
  |  extract JWT from: cookie -> Authorization header -> custom header -> session
  |  jwt.verify(token, JWT_SECRET)
  |  check Redis blacklist: blacklist:token:{sha256hash}
  |  set request.state.user
  |
  v
[4] Guard preHandler  (src/api/guard.js)
  |  Level 1 (System): enabled? IP whitelist? login required?
  |  Level 2 (Group):  enabled? IP whitelist? roles? login required?
  |  Level 3 (API):    enabled? IP whitelist? roles? login required?
  |    +-- if denied: reply.result.forbidden() or reply.result.unauth()
  |
  v
[5] Route Handler
  |  business logic
  |  reply.result.success(data) / reply.result.fail(msg)
  |
  v
[6] Firewall onSend  (src/firewall/index.js)
  |  trackConnection(ip, -1)
  |  pushRecord(log) -> store -> WS broadcast to all clients
  |
  v
[7] Firewall onResponse  (src/firewall/index.js)
  |  if statusCode 404/403:
  |    checkNotFoundTrap(redis, ip, url, statusCode)
  |      +-- Lua script: atomic incr + expire
  |      +-- if count >= maxNotFoundAttempts: setBlock(SCANNER)
  |
  v
[8] Global Error Handler  (src/app.js)
     format AJV errors, log 5xx as error, 4xx as warn
```

---

## 4. Backend Module Map

### 4.1 Core Bootstrap

| File | Exports | Purpose |
|------|---------|---------|
| `index.js` | - | Entry point, loads dotenv, calls createApp(), listens on PORT |
| `src/app.js` | `createApp()` | Creates Fastify instance, registers plugins, calls initLoader |
| `src/loader/index.js` | `initLoader(app)` | Calls runEngine, then saveGuardConfig |
| `src/loader/engine.js` | `runEngine(app)` | Scans registry/, executes loaders in alphabetical order |
| `src/loader/registry/00-globals.js` | - | Decorates `reply.result` with success/fail/unauth/forbidden |
| `src/loader/registry/02-redis.js` | - | Connects Redis, decorates `app.redis` (null on failure) |
| `src/loader/registry/03-db.js` | - | Connects Sequelize, decorates `app.db` |
| `src/loader/registry/04-auth.js` | - | Registers auth plugin (ALS + JWT) |
| `src/loader/registry/05-firewall.js` | - | Registers firewall plugin (rate-limit + hooks) |
| `src/loader/registry/06-models.js` | - | Auto-loads models from src/models/, runs associate(), optional sync |
| `src/loader/registry/07-api.js` | - | Auto-loads API routes from src/api/, registers guard configs |

### 4.2 Auth System (`src/auth/`)

| File | Key Functions | Purpose |
|------|---------------|---------|
| `index.js` | `initAuth(app)` | Fastify plugin: onRequest creates ALS context, preHandler verifies JWT |
| `als.js` | `getCtx()`, `getDb()`, `getRedis()`, `getServerResource(name)` | AsyncLocalStorage accessors for request-scoped context |
| `xToken.js` | `login(uid, payload)`, `check()`, `getLoginId()`, `checkRole(role)`, `checkPermission(perm)` | JWT sign/verify, role/permission checks |
| `sso.js` | `ssoServer.authorize(ctx)`, `ssoServer.exchange(ctx)` | SSO ticket-based auth flow |
| `utils/lib/captcha.js` | `generateCaptcha()`, `verifyCaptcha(captcha, tag)`, `checkCaptchaVerified(tag)` | SVG captcha generation and verification |
| `utils/lib/encrypt.js` | `decryptWithPrivateKey(data)` | RSA decryption for client-encrypted passwords |

### 4.3 Firewall System (`src/firewall/`)

| File | Key Functions | Purpose |
|------|---------------|---------|
| `index.js` | `initFirewall(app)` | Fastify plugin: registers rate-limit, onRequest/onSend/onResponse hooks |
| `config.js` | `CHALLENGE_SECRET`, `DEFAULT_SECURITY_SETTINGS`, `DEFAULT_IP_APIS` | Configuration constants and defaults |
| `fingerprint.js` | `generateFingerprint(request)` | SHA256(IP\|UA\|Lang\|Enc) -> 16-char hex fingerprint |
| `detector.js` | see table below | Core detection engine (all check/block/whitelist functions) |
| `challenge-template.js` | `buildChallengePage(ip, fingerprint?)` | Generates HTML challenge page with HMAC-signed nonce |
| `store.js` | `pushRecord(record)`, `getSummary()`, `getRecentRecords()`, `clearAll()`, `setBroadcastHandler(fn)` | In-memory traffic stats ring buffer + WS broadcast |
| `dao/dao.js` | `initDao()`, `getServerNode()`, `getSecuritySettings()`, `updateSecuritySettings(patch)`, `addToBlacklist()`, `removeFromBlacklist()`, `addToWhitelist()`, `removeFromWhitelist()`, `syncManualBlacklistToRedis()`, `syncManualWhitelistToRedis()`, `refreshServerNodeAuto()` | Data access layer: config persistence, Redis sync |
| `guard.js` | `createGuard(options)` | Route-level access guard (IP whitelist, roles, login) |
| `location.js` | `getIpInfo(ip)` | GeoIP lookup wrapper |
| `utils/util.js` | `safeRedis(redis, fn, fallback)` | Redis operation wrapper with graceful degradation |
| `utils/resilient-store.js` | `ResilientStore.incr(key, cb)`, `ResilientStore.child(opts)` | Rate-limit store with Redis+memory fallback |

#### detector.js Function Catalog

| Function | Signature | Purpose |
|----------|-----------|---------|
| `setBlock` | `(redisClient, ip, metadata)` | Dual-write block to Redis key + hash, fallback to memory Map |
| `removeBlock` | `(redisClient, ip)` | Remove block from Redis + memory |
| `setWhitelist` | `(redisClient, ip, durationSeconds)` | Dual-write whitelist to Redis key + hash |
| `removeWhitelist` | `(redisClient, ip)` | Remove whitelist from Redis + memory |
| `setBlockFp` | `(redisClient, fingerprint, metadata)` | Fingerprint-level block (same dual-write pattern) |
| `removeBlockFp` | `(redisClient, fingerprint)` | Remove fingerprint block |
| `setWhitelistFp` | `(redisClient, fingerprint, durationSeconds)` | Fingerprint-level whitelist |
| `removeWhitelistFp` | `(redisClient, fingerprint)` | Remove fingerprint whitelist |
| `getActiveBlocks` | `(redisClient) -> Array` | Merge Redis hash + memory Map blocks, sorted by remaining TTL |
| `getActiveWhitelist` | `(redisClient) -> Array` | Merge Redis hash + memory Map whitelists, sorted by TTL |
| `getBlockStatus` | `(redisClient, blockKey) -> string\|null` | Read block status (supports old string + new JSON format) |
| `memorySlidingWindow` | `(key, limit, windowSec) -> boolean` | In-memory sliding window rate limiter (Redis fallback) |
| `trackRequestCount` | `(ip) -> number` | Per-IP 60s sliding window request counter |
| `checkRateLimit` | `(redisClient, actorId, options) -> boolean` | Redis sorted-set sliding window, auto-block on exceed |
| `checkGlobalBlock` | `(redisClient, ip, fingerprint?) -> void` | **Main entry**: fp whitelist -> ip whitelist -> fp block -> ip block |
| `checkNotFoundTrap` | `(redisClient, ip, url, statusCode) -> void` | 404/403 scanner detection via Lua atomic counter |
| `checkLoginBruteForce` | `(redisClient, ip, username, success) -> void` | Login brute force: IP counter + username counter + account lock |
| `isAccountLocked` | `(redisClient, username) -> boolean` | Check if account is locked |
| `trackConnection` | `(ip, delta) -> number` | Concurrent connection tracker, throws 429 on exceed |
| `getConnectionStats` | `() -> object` | Top 10 IPs by connection count |
| `cleanupStaleConnections` | `() -> void` | Remove zombie connections (2x max) |
| `checkGeoReputation` | `(redisClient, ip, url) -> void` | IDC/overseas rate limiting |
| `checkBotChallenge` | `(redisClient, ip, ua, requestCount) -> boolean` | UA classification + threshold-based challenge |
| `resolveGeoInfo` | `(ip) -> {region, city}` | GeoIP lookup via geoip-lite |

### 4.4 API Routes (`src/api/`)

#### Auth System (`src/api/auth/`)
| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/api/v1/auth/login` | POST | `token.js` | User login, returns JWT |
| `/api/v1/auth/oss-token` | GET | `token.js` | OSS upload credential (requires login) |
| `/api/v1/auth/logout` | POST | `token.js` | Clear cookie, logout |

#### SSO System (`src/api/sso/`)
| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/api/v1/sso/login` | POST | `login.js` | SSO unified login, returns ticket + redirect URL |
| `/api/v1/sso/check_username` | GET | `register.js` | Check username availability |
| `/api/v1/sso/register` | POST | `register.js` | User registration with email verification |
| `/api/v1/sso/utils/captcha` | GET | `utils.js` | Generate SVG captcha (base64 PNG) |
| `/api/v1/sso/utils/send-email-code` | POST | `utils.js` | Send 6-digit email verification code |

#### Firewall System (`src/api/firewall/`)
| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/api/firewall/v1/monitor/summary` | GET | `monitor.js` | Dashboard stats + server node |
| `/api/firewall/v1/monitor/records` | GET | `monitor.js` | Recent traffic records |
| `/api/firewall/v1/monitor/clear` | POST | `monitor.js` | Clear all audit records |
| `/api/firewall/v1/monitor/node/update` | PATCH | `monitor.js` | Update server node metadata |
| `/api/firewall/v1/monitor/node/refresh` | POST | `monitor.js` | Auto-detect server geolocation |
| `/api/firewall/v1/monitor/settings` | GET | `monitor.js` | Get security settings |
| `/api/firewall/v1/monitor/settings` | PATCH | `monitor.js` | Update security settings (partial) |
| `/api/firewall/v1/monitor/blacklist` | POST | `monitor.js` | Add to blacklist |
| `/api/firewall/v1/monitor/blacklist` | DELETE | `monitor.js` | Remove from blacklist |
| `/api/firewall/v1/monitor/blocks` | GET | `monitor.js` | List active bans (IP + fingerprint) |
| `/api/firewall/v1/monitor/blocks` | POST | `monitor.js` | Add IP ban |
| `/api/firewall/v1/monitor/blocks/:ip` | DELETE | `monitor.js` | Remove IP ban |
| `/api/firewall/v1/monitor/blocks/fp` | POST | `monitor.js` | Add fingerprint ban |
| `/api/firewall/v1/monitor/blocks/fp/:fp` | DELETE | `monitor.js` | Remove fingerprint ban |
| `/api/firewall/v1/monitor/whitelist` | GET | `monitor.js` | List active whitelists |
| `/api/firewall/v1/monitor/whitelist` | POST | `monitor.js` | Add IP whitelist |
| `/api/firewall/v1/monitor/whitelist/:ip` | DELETE | `monitor.js` | Remove IP whitelist |
| `/api/firewall/v1/monitor/whitelist/fp` | POST | `monitor.js` | Add fingerprint whitelist |
| `/api/firewall/v1/monitor/whitelist/fp/:fp` | DELETE | `monitor.js` | Remove fingerprint whitelist |
| `/api/firewall/v1/monitor/ws` | WS | `monitor.js` | Real-time traffic push (INIT + LOG messages) |
| `/api/firewall/v1/challenge/verify` | POST | `challenge.js` | Verify browser challenge, issue fw_verified cookie |
| `/api/firewall/v1/apiconfigs/` | GET | `apiConfig.js` | Get 3-level security config tree |
| `/api/firewall/v1/apiconfigs/:sys/:grp` | PATCH | `apiConfig.js` | Hot-update config path |
| `/api/firewall/v1/apiconfigs/toggle/:sys/:grp` | POST | `apiConfig.js` | Toggle group/API enabled |
| `/api/firewall/v1/apiconfigs/toggle-system/:sys` | POST | `apiConfig.js` | Toggle system enabled |

#### Book System (`src/api/book/`)
| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/api/v1/books/` | GET | `list.js` | Placeholder endpoint |

### 4.5 Core Utilities (`src/core/`, `src/api/`)

| File | Key Functions | Purpose |
|------|---------------|---------|
| `src/core/result.js` | `Result.success()`, `Result.fail()`, `Result.unauth()`, `Result.forbidden()` | Standardized API response wrapper |
| `src/api/guard.js` | `isIpMatch(ip, rule)`, `applyGuardLogic(opts, req, reply)`, `createGuard(sys, grp, api)`, `registerSecureRoute(fastify, opts)`, `registerGroupMetadata(meta)`, `setRegistrationContext(sys)`, `getFullUrl(url)` | 3-level cascade guard + route registration |
| `src/api/guard-config.js` | `registerSystemMetadata()`, `registerGroupMetadata()`, `registerApiMetadata()`, `getGuardConfig()`, `setGuardConfig()`, `getAllGuardConfigs()`, `saveGuardConfig()` | Guard config persistence (JSON file) |

### 4.6 Database Models (`src/models/`)

```
User (users)
  |-- uid PK, username, nickname, email, phone, avatar, status
  |
  +-- hasOne --> UserIdentity (user_identities)
  |     |-- id PK, uid FK, identity_type(PASSWORD/WECHAT/GITHUB), identifier, credential
  |
  +-- hasOne --> SsoUser (sso_user_traces)
  |     |-- uid PK/FK, last_login_at, last_login_ip, last_login_app
  |     |
  |     +-- hasMany --> SsoSession (sso_sessions)
  |           |-- id PK, uid FK, app_id, device_id, token, ip, location, user_agent, last_active
  |
  +-- belongsToMany --> Group (groups) [through UserGroup]
        |-- id PK, name, info, level(1=Root,2=Guest,3=User)
        |
        +-- belongsToMany --> Permission (permissions) [through GroupPermission]
              |-- id PK, name, module, app_id

UserGroup (user_group_links)     -- join table: uid, group_id
GroupPermission (group_permission_links) -- join table: group_id, permission_id
EmailCode (email_codes)          -- email, code, status, expired_at
Rbac (Rbac)                      -- composite PK: uid+app_id, roles(JSON), permissions(JSON)
SsoLog (sso_logs)                -- id, uid, event, app_id, ip, location, user_agent, details(JSON)
```

### 4.7 Redis Key Schema

| Pattern | Type | Purpose |
|---------|------|---------|
| `fw:block:{ip}` | String (JSON) | IP block record with TTL |
| `fw:block:fp:{fp}` | String (JSON) | Fingerprint block record with TTL |
| `fw:blocked:ips` | Hash | Index of all IP blocks (for listing) |
| `fw:blocked:fps` | Hash | Index of all fingerprint blocks |
| `fw:whitelist:{ip}` | String | IP whitelist marker with TTL |
| `fw:whitelist:fp:{fp}` | String | Fingerprint whitelist marker with TTL |
| `fw:whitelisted:ips` | Hash | Index of all IP whitelists |
| `fw:whitelisted:fps` | Hash | Index of all fingerprint whitelists |
| `fw:rl:{actorId}` | Sorted Set | Sliding window rate limit (score=timestamp) |
| `fw:trap:{ip}` | String | 404/403 scanner trap counter (Lua incr+expire) |
| `fw:brute:ip:{ip}` | String | Login brute force IP counter |
| `fw:brute:user:{user}` | String | Login brute force username counter |
| `fw:lock:{user}` | String | Account lock marker |
| `fw:pass:{ip}:{token}` | String | Challenge pass token (IP-bound) |
| `fw:pass:fp:{fp}:{token}` | String | Challenge pass token (fingerprint-bound) |
| `blacklist:token:{hash}` | String | JWT blacklist (SHA256 of token) |

---

## 5. Frontend Architecture

### 5.1 Component Tree

```
App.vue (root, owns ALL state)
  |
  +-- MapChart.vue              -- ECharts world+china map, animated traffic lines
  +-- LogTable.vue              -- Real-time traffic log stream
  +-- RegionList.vue            -- Top 5 regions with progress bars
  +-- PathList.vue              -- Top 6 API paths with progress bars
  |
  +-- SystemSettingsModal.vue   -- 4-tab control hub (Panel/Security/Firewall/Others)
  |     +-- uses: NavItem, SettingRow, FormField, ToggleSwitch, TagInput,
  |               PrimaryButton, DataTable, StatusPing
  |
  +-- SecurityConsoleModal.vue  -- 3-level security config matrix
  |     +-- ConfigPanel.vue     -- System/Group/API tree with toggles
  |
  +-- PolicyEditModal.vue       -- Edit IP whitelist, roles, requireLogin for a config node
  |
  +-- DefenseManagementModal.vue -- Advanced defense rule editor
  |
  +-- BaseModal.vue             -- Shared modal shell (backdrop, animation, slots)
```

### 5.2 UI Components (`firewall/src/components/ui/`)

| Component | Props | Purpose |
|-----------|-------|---------|
| `BaseModal` | modelValue, isDark, size, showDots, closable, zIndex, backdropClass, transition | Modal shell with frosted glass backdrop, enter/leave animations |
| `DataTable` | isDark, columns, data, emptyMessage, maxHeight | Generic table with slot-based cell rendering |
| `EmptyState` | icon, message | Centered placeholder with icon |
| `FormField` | modelValue, label, type, placeholder, hint, rows, isDark, variant | Input/textarea with 3 style variants (default/mono/flat) |
| `GlassCard` | isDark, padding | Glass-morphism container |
| `NavItem` | isActive, icon, label, isDark, showChevron, variant | Sidebar navigation item |
| `PrimaryButton` | variant, size | Action button with color variants |
| `SectionHeader` | isDark, icon, iconColor, label | Bordered section divider |
| `SettingRow` | isDark, icon, title, description, iconBg, iconColor | Settings row: icon + title + control slot |
| `StatusPing` | color | Animated pulsing dot indicator |
| `TagInput` | modelValue, label, badge, placeholder, isDark, color | Tag/chip input with add/remove |
| `ToggleSwitch` | modelValue, color | Accessible toggle switch |

### 5.3 API Client (`firewall/src/api/firewall.js`)

| Method | HTTP | Endpoint | Called By |
|--------|------|----------|-----------|
| `getSummary()` | GET | `/api/firewall/v1/monitor/summary` | App.fetchData() |
| `getRecords()` | GET | `/api/firewall/v1/monitor/records` | App.fetchData() |
| `clearRecords()` | POST | `/api/firewall/v1/monitor/clear` | App.resetStats() |
| `updateNode(data)` | PATCH | `/api/firewall/v1/monitor/node/update` | App.syncNodeToServer() |
| `refreshNode()` | POST | `/api/firewall/v1/monitor/node/refresh` | App.refreshNodeLocation() |
| `getSettings()` | GET | `/api/firewall/v1/monitor/settings` | App.fetchData() |
| `updateSettings(data)` | PATCH | `/api/firewall/v1/monitor/settings` | App.saveSecuritySettings(), handleSavePartial() |
| `addBlacklist(type, value)` | POST | `/api/firewall/v1/monitor/blacklist` | App.handleAddBlacklist() |
| `removeBlacklist(type, value)` | DELETE | `/api/firewall/v1/monitor/blacklist` | App.handleRemoveBlacklist() |
| `getBlocks()` | GET | `/api/firewall/v1/monitor/blocks` | App.fetchBlocks() |
| `addBlock(data)` | POST | `/api/firewall/v1/monitor/blocks` | App.handleAddBlock() |
| `removeBlock(ip)` | DELETE | `/api/firewall/v1/monitor/blocks/:ip` | App.handleRemoveBlock() |
| `addBlockFp(data)` | POST | `/api/firewall/v1/monitor/blocks/fp` | App.handleAddBlock() |
| `removeBlockFp(fp)` | DELETE | `/api/firewall/v1/monitor/blocks/fp/:fp` | App.handleRemoveBlock() |
| `getWhitelist()` | GET | `/api/firewall/v1/monitor/whitelist` | App.fetchWhitelist() |
| `addWhitelist(data)` | POST | `/api/firewall/v1/monitor/whitelist` | App.handleAddWhitelist() |
| `removeWhitelist(ip)` | DELETE | `/api/firewall/v1/monitor/whitelist/:ip` | App.handleRemoveWhitelist() |
| `addWhitelistFp(data)` | POST | `/api/firewall/v1/monitor/whitelist/fp` | App.handleAddWhitelist() |
| `removeWhitelistFp(fp)` | DELETE | `/api/firewall/v1/monitor/whitelist/fp/:fp` | App.handleRemoveWhitelist() |
| `getApiConfigs()` | GET | `/api/firewall/v1/apiconfigs/` | App.fetchData() |
| `toggleGuard(sys, grp, api?)` | POST | `/api/firewall/v1/apiconfigs/toggle/:sys/:grp` | App.toggleGuard() |
| `toggleSystem(sys)` | POST | `/api/firewall/v1/apiconfigs/toggle-system/:sys` | App.toggleSystem() |
| `updateConfig(sys, grp, api, data)` | PATCH | `/api/firewall/v1/apiconfigs/:sys/:grp` | App.saveConfig() |

### 5.4 Data Flow

```
WebSocket Server
  |-- INIT -> { summary, logs, serverPosition, securitySettings }
  |-- LOG  -> single traffic event (incremental update)
  v
App.vue (all state lives here)
  |
  |-- fetchData() on mount:
  |     getApiConfigs() -> configs
  |     getSummary() -> summary, serverPosition, securitySettings
  |     getSettings() -> availableIpApis
  |     getBlocks() -> activeBlocks
  |     getWhitelist() -> activeWhitelist
  |
  |-- props down ->:
  |     MapChart       <- wsEvents, serverPosition, isDarkMode, showTrajectory
  |     LogTable       <- logs, isDarkMode
  |     RegionList     <- summary.topRegions, isDarkMode
  |     PathList       <- summary.topPaths, isDarkMode
  |     SystemSettingsModal <- (10 props, 22 emits)
  |     SecurityConsoleModal <- configs, isDarkMode
  |     PolicyEditModal <- editForm, editingSystem/Group/Api
  |     DefenseManagementModal <- securitySettings, summary, loading
  |
  |-- events up <-:
  |     close, toggle, toggleSystem, edit, save, saveNode, syncNode,
  |     refreshNode, setLocale, setTheme, fetchData, resetStats,
  |     addBlacklist, removeBlacklist, saveSecurity, savePartial,
  |     addBlock, removeBlock, fetchBlocks, addWhitelist, removeWhitelist,
  |     fetchWhitelist, tagAdd, tagRemove, openSecurityConsole, openDefense
```

### 5.5 i18n Structure (`firewall/src/i18n/index.js`)

5 languages: zh, en, ja, fr, de

```
nav.*           -- theme, settings
common.*        -- save, confirm, cancel, enable, disable, status, source,
                   expire, action, remaining, sec, min, hr, manual, automatic,
                   refresh, unban, remove, permanent, expired, system_ready, unknown
table.*         -- method, endpoint, region, code
stats.*         -- traffic_stream, blocked
config.*        -- security_config, system_list, group_list, api_list,
                   enable, disabled, login_required, ip_whitelist, roles
settings.tabs.* -- panel, security, firewall, others
settings.panel.* -- node_ui, node_location, country, region, city, latitude,
                    longitude, auto_detect, refresh_location, api_matrix,
                    api_matrix_desc, enter_matrix, show_trajectory
settings.firewall.* -- rate_limit_title, max_requests, time_window, scanner_title,
                       trigger_count, block_duration, detect_window, brute_title,
                       account_limit, ip_limit, account_lock, ip_block, conn_title,
                       max_conn, geo_title, sensitive_paths, overseas_limit/window/block,
                       bot_title, no_ua/bot_ua/browser_threshold, bot/browser_ua_keywords,
                       trust_list, internal_prefix, idc_prefix, safe_paths, save_trust,
                       defense_modules.{rate_limit,scanner,brute_force,conn_limit,geo_filter,bot_detect}
settings.others.* -- full_sync, audit_reset, ban_management, whitelist_management,
                     ip_address, duration_sec, whitelist_duration, no_active_bans,
                     no_active_whitelist
settings.defense.* -- deploy, trap_trigger, block_time, rate_reqs (+ descriptions)
settings.system.*  -- lang
settings.node.*    -- name, ip_api
hud.*              -- show, hide
map.*              -- server_node, traffic_from, blocked_event
```

---

## 6. Key Architectural Patterns

### 6.1 Resilience / Graceful Degradation
- Every Redis operation wrapped in `safeRedis()` or try/catch
- On Redis failure: falls back to in-memory Maps (memoryBlocks, memoryWhitelist, memoryWindows, memoryFallback)
- Atomic file writes: `.tmp` then rename
- Debounced persistence: config 1s, traffic stats 10s
- Loader isolation: each registry file independently try/caught

### 6.2 Fingerprint-First Ban Strategy
```
checkGlobalBlock(redis, ip, fingerprint)
  1. fingerprint whitelist? -> PASS
  2. IP whitelist?          -> PASS
  3. fingerprint block?     -> BLOCK (403/429)
  4. IP block?              -> BLOCK (403/429)
  5. manual blacklist?      -> BLOCK (memory fallback)
```

### 6.3 Challenge Flow
```
Bot detected -> buildChallengePage(ip, fp)
  -> HMAC sign nonce+timestamp with fingerprint (or IP)
  -> Browser collects WebGL/screen/timezone fingerprint
  -> POST to /challenge/verify
  -> Server validates signature (accepts both IP and FP signed)
  -> Issues fw_verified cookie + Redis tokens (both IP-bound and FP-bound)
  -> Subsequent requests check both token types
```

### 6.4 Three-Level Guard Cascade
```
Request arrives
  -> Level 1 (System): enabled? IP whitelist?
  -> Level 2 (Group):  enabled? IP whitelist? roles?
  -> Level 3 (API):    enabled? IP whitelist? roles? login?
  -> Any level can independently block; stops on first denial
```

### 6.5 WebSocket Protocol
```
Client connects -> Server sends INIT { summary, logs, serverNode, securitySettings }
Server pushes LOG { time, ip, method, url, statusCode, region, city, blocked, ... }
Client sends PING every 20s -> Server responds PONG
Auto-reconnect on close (3s delay)
```
