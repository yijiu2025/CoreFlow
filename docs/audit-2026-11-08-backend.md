# 后端全量检查报告（2026-11-08）

> 范围：`src/` 全部 376 个非测试源文件（约 5.7 万行），逐文件阅读，不依赖子 agent 扫描。
> 判据：只记**能在当前代码里定位、能说清触发路径、能在部署环境复现**的问题；上轮记录中已被修掉或属于显式设计取舍的条目单列在「复查与排除」。
> 结论：**4 项必须在部署前修**（P0/P1），7 项建议本迭代修（P2），其余为 P3。

## 修复状态（2026-11-08 当日已全部落地）

P0 四项、P2 七项、P3 中可安全修的六项均已改完，`jest` 全量 157 套件 / 1885 用例通过，ESLint 干净。
逐条对应见文末「已修复清单」；每条改动都在代码注释里写了"为什么"，新增/修正的用例见：

- `src/__tests__/app/oauth21/token-replay.test.js`（P0-1，4 例）
- `src/__tests__/app/oauth21/authorize-login-guard.test.js`（P0-2/3，4 例）
- `src/__tests__/firewall.test.js`（P0-4 新增"已登录 403 不计入且不污染计数"）
- `src/__tests__/dao.test.js`（P2-5 契约修正：`findRevoked` 必须带 `revoked:true`）
- `src/__tests__/framework/scheduler/scheduler-lock.test.js`（P2-9 新增"跨周期可再次抢到"）
- `src/__tests__/storage-path.test.js`（P2-8 夹具改为真实角色码，新增 `admin:*` 通配用例）

---

## P0 —— 认证链路的直接缺陷

### 1. 授权码重放仍能换出令牌（无 Redis 部署）

- `app/oauth21/dao/code.dao.js:119-120`：DB 分支发现 `consumed=true` 时，**返回数据并打上 `replay_detected: true`**，而不是 `null`。
- `app/oauth21/services/token.service.js:105-107`：只判 `if (!codeData) throw`，从不读 `replay_detected`（全仓仅 `code.dao.js` 生产该字段，零消费点，`grep replay_detected` 可自证）。
- 后果：`REDIS_ENABLED=false` 或 Redis 不可用时（该分支是 DB 兜底路径），同一个 authorization_code 可以被兑换**多次**，每次都签发新的 access_token + refresh_token。RFC 6749 §4.1.2 要求拒绝，并对已发出的令牌做吊销。
- 复现：Redis 关闭 → `POST /oauth2.1/token`（authorization_code + 同一 code + 同一 code_verifier）连续两次 → 第二次仍 200 且返回全新 refresh_token。
- 修法：`consume()` 在 `consumed=true` 时返回 `null` 并把 `replay_detected` 作为**独立信号**抛出（或让 service 显式处理：`if (codeData.replay_detected) { revoke 该 code 已签发的令牌; throw invalid_grant }`）。只让 DAO 标记、service 不判，等于没做。

### 2. `/oauth2.1/authorize/login` 是可无限爆破的登录口

- 路由：`api/oauth21/v1/auth/authorize.js:36-49`（`POST /authorize/login`，无 `config.rateLimit`，全局限流默认关闭 → 见 P3-1）。
- 实现：`app/oauth21/services/authorization.service.js:119-124` 的 `authenticateUser` 只做 `findByUsername + verifyPassword`：
  - **没有图形验证码**（对比 `login.service.js:99-115` 的 `directLogin` 强制消费 captcha）；
  - **没有 `isAccountLocked` 检查**（对比 `login.service.js:151`）；
  - **没有 `status` 检查**（禁用账号同样可登录，见 P0-3）。
- 后果：攻击者 `GET /oauth2.1/authorize?...` 拿一个 sessionId（公开端点，失败不消费），然后对同一 sessionId 无限次 `POST /authorize/login` 猜密码。防火墙的 `observeLoginOutcome` 确实在计数（该路由声明了 `credentialRoute: true`），账号锁标记也写进去了——**但这条路径从不读它**，于是账号维度锁形同不存在；IP 维度只会在 10 次后给挑战，换 IP 即绕。
- 修法：最短路径是把 `handleAuthorizeLogin` 接到与 `directLogin` 同一套前置（captcha 消费 + `detectLoginAnomaly` + `isAccountLocked`），并给该路由加 `config.rateLimit`。

### 3. 禁用账号（`status=0`）仍可完成登录，且被 `|| 'active'` 掩盖

三处叠加，缺一不可：

1. `app/oauth21/dao/user.dao.js:80-105` `findByUsername` 返回的对象**不含 `status` 字段**（`findById` / `findByEmail` 都有，唯独密码登录走的那条没有）；
2. `app/oauth21/services/login.service.js:204` 直接使用该对象，全程无 `status` 判定；
3. `app/oauth21/services/token-issuer.service.js:164` 写 session 载荷时用 `status: user.status || 'active'`——`0` 被折叠成 `'active'`。

- 后果：被禁用/封禁的账号 `POST /oauth2.1/login` 返回 200、拿到 `session_token`（后续由 `bind-session` 换成真 sid）；真正拦住它的是**下一个请求**里 `session.js:408` 的 `isSessionUserActive`（要求 `Number(status)===1`）→ 会话被吊销。即"登录成功但立刻被登出"，同时每次登录都会：签发并写一条 `session_token`（300s）、写审计 `LOGIN_SUCCESS`、跑一遍设备环境检测。
- 修法：`findByUsername` 补 `status`；登录链路（`directLogin` 与 `handleAuthorizeLogin`）在签发前显式判 `Number(user.status) === 0 → 403 账号已禁用`；`token-issuer` 改 `status: user.status ?? 'active'`（`??` 而不是 `||`）。

### 4. 扫描陷阱把**业务 403** 计入扫描计数，可把正常用户封 1 小时

- `framework/firewall/bootstrap.js:137-156` 的 `onResponse`：`if ([404, 403].includes(reply.statusCode)) checkNotFoundTrap(...)`。
- `framework/firewall/engine/detectors/scan-trap.js:115` 同样把 403 计入，默认阈值 `maxNotFoundAttempts=10 / notFoundWindow=60s`（`config/defaults.js:112-116`）、`blacklistDuration=3600s`，且 `setBlockForSubject` 会**同时封 IP 与设备**（跨 IP 生效）。
- 全仓只有 2 条路由声明了 `config.firewall.skipScanTrap: true`（`api/files/v1/download.js:73`、`api/firewall/v1/challenge.js`），而 `src/api/**` 里有 25 处产出 403：`reply.result.forbidden`（权限不足）、`getWorkPreview` 的草稿/非公开 403、CSRF/来源校验 403 等。
- 触发路径（真实会发生）：前端某个轮询循环打到一个无权限接口（3 个接口 × 4 次重试 = 12 次即越线），60 秒内即判定 SCANNER → 该用户**及其设备**被封 1 小时，且因为封禁是设备维度，换网络也解不开。全局限流默认关闭，没有任何其它层能拦住这个正反馈。
- 修法：两种都行，建议组合——(a) 只把 **404/405** 计入扫描陷阱（403 是"有权限问题"不是"在猜路径"）；(b) 若要保留 403，则把 `reply.result.forbidden` 的产出点统一加 `skipScanTrap` 声明，并把默认阈值调高。

---

## P2 —— 应当本迭代修

### 5. 过期的 refresh_token 被当成"盗用"，把用户全设备登出

- `app/oauth21/dao/token.dao.js:55-65` `find()` 过滤 `expires_at > now`；`:87-91` `findRevoked()` **只按哈希查，不过滤 `revoked` / 过期**。
- `app/oauth21/services/token.service.js:227-238`：`find()` 空 → 调 `findRevoked()` 拿到行（哪怕它只是"过期了、从未被轮转"）→ 判定 `reuse = theft` → `revokeAllForUser(sub)`。
- 后果：任何一次"用过期 refresh token 刷新"（长期不打开的标签页、离线客户端重试、客户端时钟偏差）都会把该用户**所有设备**的 refresh token 全部吊销。攻击面反过来也成立：任何人只要持有一个该用户的历史 refresh token 值，就能主动触发这次全量吊销（拒绝服务）。
- 修法：`findRevoked` 必须加 `revoked: true`（真盗用判据是"已轮转的旧令牌被再次使用"）；过期应走独立分支（删该行 + 回 `invalid_grant`，不动 family）。

### 6. 刷新路径的账号状态判定用严格相等（字符串 '0' 漏拦）

- `app/oauth21/services/token.service.js:249`：`if (user.status === 0)`。
- 同一文件 `:143`（授权码路径）已经改成 `Number(user.status) === 0`，并留了注释说明原因——**刷新路径没跟上**。部分 DB 驱动/连接配置下 TINYINT 会以字符串返回，此时 `'0' === 0` 为 false → 禁用用户可继续用 refresh_token 续期。
- 修法：`:249` 改为 `Number(user.status) === 0`，与 `:143`、`session-store.js:112`（`isSessionUserActive`）统一。

### 7. `update-remember-me` 无上限累积 refresh token，且该路由无限流

- `framework/auth/session/session.js:702-713`：每次 `rememberMe=true` 都新生成一个 refresh token 并 `zAdd` 进 `userRefreshStore` 与 `familyStore`，**没有任何裁剪**（对比 `createSession` 在 `:220-247` 有 `maxRefreshTokens` 裁剪逻辑）。
- 路由 `api/auth/v1/session.js:118-124`：`requireLogin: true`，**无 `config.rateLimit`**（同文件其它路由都有）。
- 后果：任一登录用户循环调用即可在 Redis 里堆积任意数量的 refresh token（每个 30 天 TTL，值 64 hex），构成低成本写放大/内存占用；同时每个 token 都是一枚长期有效凭证，凭证面变大。
- 修法：`updateRememberMe` 复用 `createSession` 的裁剪步骤；该路由补 `rateLimit`（例如 10/min）。

### 8. 私有文件下载的管理员分支永远不成立

- `api/files/v1/download.js:107`：`const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');`
- 仓内**不存在** `admin` 这个角色码：`src/app/*/permission/roles.js` 的全部角色是 `admin_admin / admin_operator / admin_viewer / fw_admin / … / superadmin`（`superadmin` 由 `scripts/setup-superadmin.js` 建立，见 `app/guard/services/authority.js:24-36`）。
- 后果：管理员/超管**永远无法下载他人私有文件**（`403 无权访问该文件`），安全审计、工单取证都走不通。这是功能缺陷，不是越权。
- 修法：改用已有的 `isSuperAdmin(user)`（`app/guard/services/authority.js`）或 `permissions.allows` 判定 `admin:*` / `files:read`，不要硬编码角色字面量。

### 9. 定时任务在多实例下**半频执行**

- `framework/scheduler/index.js:89-105`：周期锁 `ttl = max(interval*2, interval+60s)`；`:118-126` `executeTask` 抢到锁后执行任务，**执行完不释放**（注释明确"故意不释放"）。
- 后果：锁活 2 个周期 → 同一实例在下一个 tick（间隔 1 周期）抢锁必然失败并跳过 → 实际执行频率是配置值的一半（`intervalHours: 24` 变成 48 小时）。单实例（未配置 Redis）不受影响，所以本地/CI 全绿。
- 修法：`ttl = interval + 一个安全余量（如 +30s）`，并在任务结束 `finally` 里不需要释放（让它在下一 tick 前自然过期即可）；更稳的做法是锁 TTL 用 interval，配合 `startRenew()` 在任务执行期间续期。

### 10. 守卫配置的版本号被赋成对象 + 快照写入后不刷新

同一模块两个缺陷，都会污染"配置版本"这一唯一可信的比对依据。

- `api/guard-config.js:388 / 570 / 599`：`currentVersion = await saveWithTimeout(...)`，而 `saveWithTimeout` 返回的是 `{maxVersion, updated, versions}`（`:337-371`）→ `currentVersion` 变成对象。后续 `:652` 的 `Math.max(currentVersion, …)` 得到 `NaN`，`:600` 日志打印 `version=[object Object]`，`:358` 的回滚快照版本也是对象。
- `app/guard/dao/guard-config.dao.js:95`：`isChanged = compareKey !== this._snapshot[systemKey]`，但写入成功后**从不更新 `this._snapshot[systemKey]`**。后果：把某个开关改走又改回原值（A→B→A）时，第二次 `isChanged=false`，**A 不会落库**，DB 里留着 B；下一个实例同步/重启后配置回到 B，运维看到的是"我改回来了但它自己又变回去了"。同一 system 的原始快照的"上次已落库值"因此永远滞后一代。
- 修法：`currentVersion = result.maxVersion`（三处）；`saveToDB` 在写入分支里 `this._snapshot[systemKey] = compareKey`（`else` 分支不用动）。

### 11. 公开端点无端点限流 + 每请求 3 次 Redis 写入

- 全局限流默认关闭：`framework/firewall/config/defaults.js:215` `enableRateLimit: false`；端点级只对**显式声明**的路由生效，`api/oauth21/v1/auth/qr.js` 的 `GET /qr/generate`、`POST /qr/scan`、`GET /qr/status` **都没有 `config.rateLimit`**。
- `GET /qr/generate` 一次调用产生 3 次写：`issueH5Token`（`framework/auth/security/signature.js:191-217`，`h5_token` 1h TTL，浏览器无 token 时 `bootstrapToken` 自动下发）+ `qrStore.set(qrKey, …)` + `qrStore.set(ticket:…)`（各 120s）。
- 后果：匿名可把 Redis 当写放大用（受 Redis 内存与连接池限制，非无限，但零成本）。
- 修法：给这三条（以及 `POST /qr/confirm`）加 `config.rateLimit`；`h5_token` 引导下发加"每 IP 每分钟一次"的桶。

---

## P3 —— 低危 / 一致性问题

| # | 位置 | 问题 | 影响 |
|---|---|---|---|
| 12 | `framework/verify/pow/service.js:328-329` | `if (depth <= 0) return true` | 难度为 0 时任意十进制答案都通过。当前 `clampDifficulty` 保证 ≥1，但这是判题函数的 fail-open 默认值，任何新调用方（或历史载荷）传 0 就等于关掉 PoW |
| 13 | `app/oauth21/crypto/tokens.js:25-33` | 设备码 `userCode` 用 `Math.random()` | V8 PRNG 状态可被少量输出还原 → 用户码可预测；`authorizeDevice`（`device.service.js:97-112`）也无尝试上限。影响有限（批准方向是"给他人设备签自己账号的令牌"），但令牌生成不该用非 CSPRNG。`crypto.randomInt` 一行可换 |
| 14 | `framework/db/index.js:40` | DSN 只对 `DB_PASS` 做 `encodeURIComponent`，`DB_USER` / `DB_NAME` 未编码 | 用户名/库名含 `@ : / ?` 时连接串被解析错位（云托管账号常见 `user@host` 形态），报错指向"认证失败"，难排查 |
| 15 | `app/posecraft/dao/interaction.dao.js:170-176` | 收藏用 check-then-`create`（点赞用的是 `findOrCreate`） | 并发双击同一作品 → `uk_user_collect_work` 唯一索引冲突 → 500 |
| 16 | `api/posecraft/v1/work.js:352-368` | `likeWork` 返回的 `likes_count` 是**自增前**读到的快照 | 响应里的计数比实际少 1；前端乐观更新后会出现"跳一下" |
| 17 | `app/posecraft/dao/work.dao.js:85,272` | 推荐公式用了 `collects_count * 12 + shares_count * 8`，但全仓**没有任何代码写这两个列** | 收藏/分享权重恒为 0，`sort=recommended` 实际只剩 `likes×15 + views + RAND()`；页面上的收藏/分享数也永远是 0 |
| 18 | `framework/verify/sms/dao.js:47-54`、`voice/dao.js` 同构 | 先落码再发送；发送失败仍占用 `rateLimit` 窗口 | 服务商抖动时用户 60 秒内无法重试（当前 provider 是空实现，必抛错，这条会一直触发） |
| 19 | `framework/config/runtime.js:47-96` | `deepMerge` / `applyInPlace` 直接 `out[key] = …`，未拦 `__proto__` / `constructor` | `data/*_config.json` 里写 `{"__proto__":{…}}` 会给该配置对象换原型（污染范围限于该对象，不是全局 `Object.prototype`），属"配置面"加固项 |
| 20 | `app/notice/dao/notice.js` 全量 | `sms` / `dingtalk` / `wechat` 通道 `saveConfig` 只处理 `email`，其余静默返回 | 面板保存成功但什么都没写，用户以为生效了 |

另：`framework/verify/{qrcode,sms,voice}` 三个模块（含 DAO/Service 共约 700 行）**零引用**，是死代码；`sms`/`voice` 的 provider 实现直接抛"尚未接入"。不影响安全，但会让"短信验证码"看起来已具备而实际不可用。

---

## 复查与排除（上轮记录 / 疑似点，本次核实后**不成立**）

| 候选 | 结论 |
|---|---|
| `redis-store.usage()` 参数错位 | **已修**：`redis-store.js:514` 签名为 `(prefix, scanLimit, useBackup)`，绑定层 `:879` 正确传 three-args |
| 绑定的 `mget` / `mset` 丢 `useBackup` | 事实成立（`:880-881`），但**全仓无任何业务调用**（`grep '\.mget(\|\.mset('` 仅命中定义处），且 `backup:true` 只用于 `stream-store`，不可达 → 不计入 |
| `client_credentials` 令牌无法通过认证 | **已修**：`bearer-auth.js:41-60` 显式接受 `token_type === 'client_token'` 并短路，不再查用户表 |
| health 慢日志 id 字符串比较 | 该实现已不存在（`api/system/v1/health.js` 现只剩 DB/Redis 探活） |
| H5 签名对 GET 可绕过 | 是**显式取舍**（`signature.js:43-52` 引导放行限 GET/HEAD，写方法回 403）；但需知悉两个后果：① 签名对 `/oauth2.1` 前缀下所有 GET 端点实际无效（`auth.middleware.js:36-42` 只对该前缀生效，其它前缀的 `requireSignature` 是死元数据）；② 每次匿名 GET 都会写一条 `h5_token`（见 P2-11） |
| 扫码登录可被截图劫持 | **已修**：`qr.service.js:36-70` 把"印在二维码上的 ticket"与"兑换令牌用的 qrKey"拆开，`getQrStatus` 只认真 qrKey |
| `/authorize/consent` 信任 body 里的 user_id | **已修**：`authorization.service.js:338-347` 只认服务端 session 里的 `uid` |
| Work 详情越权读草稿 | **已修**：`api/posecraft/v1/work.js:180-192` 公开/作者/管理员三判 |
| `createWork` 的 `image_url` 可指向任意路径 | **已修**：`UPLOADED_IMAGE_RE` 白名单 + `preview.js` 侧 `publicUrlToPath` |
| `jobDao.poll/cancel` 无归属校验 | **已修**：`job.dao.js:82-84`、`:130-132` 均带 `user_id` |
| PKCE 缺失 | 不成立：`config.js:80-83` `pkce.required=true`，`/authorize` 强制校验 `code_challenge` |
| `redirect_uri` 开放重定向 | 不成立：`authorization.service.js:95-97` 严格等值比对注册列表 |

---

## 部署前的最小修复清单

1. `code.dao.consume` 的重放分支 → 拒绝，并吊销该 code 已签发令牌（P0-1）。
2. `/authorize/login` 补齐 captcha + `isAccountLocked` + `status`，并加 `rateLimit`（P0-2）。
3. `findByUsername` 返回 `status`；登录链路判 `Number(status)===0`；`status: user.status ?? 'active'`（P0-3）。
4. 扫描陷阱只计 404/405（或给全部业务 403 加声明）（P0-4）。
5. 顺手可一并做的低风险项：`findRevoked` 加 `revoked: true`（P2-5）、`:249` 改 `Number()`（P2-6）、`download.js` 管理员判定换 `isSuperAdmin`（P2-8）、`currentVersion = result.maxVersion`（P2-10）。

其余 P2/P3 建议排进下一个迭代，不阻塞部署。

---

## 已修复清单（2026-11-08）

| 编号 | 改动文件 | 实际做法 |
|---|---|---|
| P0-1 | `app/oauth21/services/token.service.js` | `handleAuthorizationCode` 在消费后显式判 `codeData.replay_detected` → `invalid_grant` 且不签发令牌 |
| P0-2 | `api/oauth21/v1/auth/authorize.js`、`services/authorization.service.js` | 路由加 `rateLimit: 10/min`；service 在验密**前**判 `isAccountLocked`（423），验密后判 `Number(status)===0`（403） |
| P0-3 | `dao/user.dao.js`、`services/login.service.js`、`services/token-issuer.service.js` | `findByUsername` 返回 `status`；`directLogin` 增加禁用判定（403 + 审计）；`status: user.status ?? 'active'` |
| P0-4 | `framework/firewall/engine/detectors/scan-trap.js`、`bootstrap.js` | 新增 `authenticated` 参数：已登录的 403 不计入（匿名 403 仍计）；bootstrap 传 `Boolean(request.state?.user)` |
| P2-5 | `app/oauth21/dao/token.dao.js` | `findRevoked` 增加 `revoked: true` 过滤（过期但未轮转不再被判盗用） |
| P2-6 | `app/oauth21/services/token.service.js` | 刷新路径 `Number(user.status) === 0` |
| P2-7 | `framework/auth/session/session.js`、`api/auth/v1/session.js` | `updateRememberMe` 先 `deleteRefreshTokensForSession` 再发新 token（替换而非累加）；路由加 `rateLimit: 10/min` |
| P2-8 | `api/files/v1/download.js` | 管理员判定改为 `isSuperAdmin(user) \|\| hasAdminWildcard(user)`（`admin:*` / `*`） |
| P2-9 | `framework/scheduler/index.js` | 锁名带周期序号 `scheduler:<task>:p<period>`（TTL 仍 2×周期），跨周期不再被自己的旧锁挡住 |
| P2-10 | `api/guard-config.js`、`app/guard/dao/guard-config.dao.js` | 三处 `currentVersion = (await saveWithTimeout(...)).maxVersion`；写入后同步 `_snapshot[systemKey]` |
| P2-11 | `api/oauth21/v1/auth/qr.js` | 四条扫码路由各加 `config.rateLimit`（generate 20 / scan 20 / confirm 20 / status 60 每分钟） |
| P2-12 | `api/oauth21/v1/auth/login.js` | `/login`、`/mini-login` 各 20/min，`/login/verify-email` 10/min（groupId 隔离） |
| P3-12 | `framework/verify/pow/service.js` | 难度 `< 1` 判**失败**（判题函数不再 fail-open） |
| P3-13 | `app/oauth21/crypto/tokens.js` | `generateUserCode` 改用 `crypto.randomInt` |
| P3-14 | `framework/db/index.js` | DSN 对 `DB_USER` / `DB_NAME` 一并 `encodeURIComponent` |
| P3-15 | `app/posecraft/dao/interaction.dao.js` | 收藏改 `findOrCreate`（并发不再撞唯一索引） |
| P3-16 | `app/posecraft/dao/interaction.dao.js`、`api/posecraft/v1/work.js` | 新增 `_readLikeCount`，点赞/取消后回读真实计数 |
| P3-17 | `app/posecraft/dao/interaction.dao.js` | 收藏增删同步 `collects_count`（此前全仓无写入点） |
| P3-18 | `framework/verify/sms/dao.js`、`voice/dao.js` | 发送失败撤销验证码记录（不再白占频率窗口） |
| P3-19 | `framework/config/runtime.js` | `deepMerge` / `applyInPlace` 跳过 `__proto__` / `constructor` / `prototype` |

未改的两项（记录在案，不属缺陷）：`shares_count` 仍无写入点 —— 仓内没有"分享"端点，等该功能落地时一并接上；`framework/verify/{qrcode,sms,voice}` 仍是死代码，删除属独立清理任务，不宜与本次安全修复混在一个提交里。
