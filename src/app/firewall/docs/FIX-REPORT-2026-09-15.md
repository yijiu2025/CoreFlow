# 修复报告：app/firewall（+ api/firewall）

> 对应审查报告：`AUDIT-REPORT-2026-09-15.md`（4🔴 / 15🟡 / 17🔵）
> 本文件只记录**已落地的改动 + 实测证据**，并如实列出未修项。
> 日期：2026-09-15

---

## 一、总览

| 等级 | 报告数 | 已修 | 未修 | 说明 |
| --- | --- | --- | --- | --- |
| 🔴 严重 | 4 | 4 | 0 | 全部闭环，含复验中发现的两个"修了也没用"的隐藏缺陷 |
| 🟡 中危 | 15 | 14 | 1 | 未修项为 🟡-7（测试内联副本），见 §5 |
| 🔵 低危 | 17 | 15 | 2 | 未修 🔵-7（同义重命名）、🔵-17（设计取舍） |

**复验中新发现 3 个缺陷**（原报告没有，其中 2 个会让 🔴-4 / 🔴-3 的"修法"变成空操作）——见 §3。

### 验证结果（全部在真实 MySQL + 真实 Redis 192.168.31.19 上跑）

| 手段 | 结果 |
| --- | --- |
| 全量 Jest | **57 套 / 812 项通过**（11 项 skip），0 失败 |
| ESLint | 0 error / 0 warning |
| 端到端探针 A（授权与 schema） | **16 / 16 通过** |
| 端到端探针 B（4🔴 + 关键🟡 行为） | **27 / 27 通过** |
| 限流拦截决定性实验 | `max=2` 连打 6 次 → `200 200 429 429 429 429`（修复前恒为 200） |

---

## 二、🔴 严重项修复

### 🔴-1 挑战链路整体死锁 → 已修

**改动**
- `engine/dao/block-manager.js` `buildBlockError`：`status === 'CHALLENGE'` 时返回
  `err.isChallenge = true`、`statusCode = 200`（原先只有 `SCANNER` 被特判，其余一律 429）。
- `engine/pipeline.js` `checkGlobalBlockPhase`：识别 `err.isChallenge` →
  ① 持有效令牌则撤销挑战态放行；② 放行 `/challenge/verify` 自身；③ 否则返回挑战页。
- `api/firewall/system.json`：系统级 `requireLogin: true → false`。级联守卫是
  system→group→api，系统级为真会把挑战验证接口一起 401 掉；改为由各组自行声明。

**证据**：CHALLENGE 态请求返回 `200(text/html)` 而不是 429；未登录打 `challenge/verify`
得到 `403 {"ok":false,"reason":"Challenge Expired"}`（能到达业务）而不是 401。

### 🔴-2 挑战可被脚本绕过 → 已修（改为真实工作量证明）

**改动**
- 新增 `util/pow-sha256.js`：纯 JS SHA-256 + `verifyPow(challengeId, salt, answer, difficulty)`。
  浏览器求解器与服务器校验器**用同一份代码**（页面内联 `sha256Hex.toString()`），杜绝"两边算法漂移"。
- `data/challenge-template.js` 重写：页面只输出不透明 `CHALLENGE_ID` / `SALT` / `DIFFICULTY`，
  **不再内嵌任何明文凭据或 HMAC 签名**；载荷（ip/fingerprint/salt/difficulty/issuedAt）由服务端持有。
- `util/redis.js` 新增 `writeChallenge(id, payload, ttl)` / `takeChallenge(id)`；
  后者是 **`LUA_TAKE_CHALLENGE`（GET+DEL 原子）**，天然单次有效。
- `services/challenge.service.js` 重写：`takeChallenge` 原子取用、`safeEqual`
  （`timingSafeEqual` + 长度归一化）、校验 IP/指纹绑定 + PoW。

**证据**：探针解出 PoW（`answer=13156`）→ 提交返回 `{"ok":true}` 并下发 `fw_verified`；
**同一 challengeId 重放被拒**；页面 HTML 中 `signature` 已不存在。

### 🔴-3 持久化安全配置从未加载 → 已修（连带发现限流注册顺序缺陷，见 N-2）

**改动**
- `app/firewall/index.js`：`initFirewall` 内**第一步**调用 `initDao()`，必须先于
  `registerRateLimit` / `sync*`，否则它们读到的仍是默认值。
- `engine/detectors/first-ratelimit.js` `errorResponseBuilder` 补 `statusCode: 429`（见 N-2）。
- `src/framework/loader/registry/05-firewall.js` 恢复为**唯一注册点**（见 N-2）。
- 存量脏数据收敛：新增 `scripts/sync-guard-config.js`，剥掉 `guard_configs` 表中
  覆盖代码声明的 4 个运行时字段（默认 dry-run，`--apply` 才写并 bump version）。

**证据**：`getSecuritySettings().defense.enableRateLimit === true`（磁盘值）；
公开路由响应带 `x-ratelimit-limit: 10000`；限流真实拦截（见表格）。

### 🔴-4 任意登录用户可改全域守卫策略 → 已修（但必须先修 N-1，否则是空操作）

**改动**
- `api/firewall/v1/apiConfig.js`：4 条路由全部改用
  `requirePermission: FIREWALL_PERMISSIONS.CONFIG.{READ,WRITE,TOGGLE}`。
- `api/firewall/v1/export.js` / `monitor.js` / `metrics.js` / `challenge.js`：共 15 个权限码逐一接线。
- `app/firewall/permission/roles.js`：`fw_admin` 的动作由 `fw:admin:*` 改为 **`fw:*`**
  （原写法只能匹配 `fw:admin:` 前缀，实际上覆盖不到任何有效权限码）。
- `app/guard/services/config.service.js`：热更新接口加**字段白名单**（见 N-3）。

**证据**：零角色用户改全域策略 → `403 权限不足：需要 [fw:config:toggle] 权限`；
只读角色 → 403；`fw:*` 管理员 → 放行；零角色导出封禁 → 403。

---

## 三、复验中新发现的缺陷（原报告未覆盖）

### N-1 `registerApiMetadata` 丢弃 `requirePermission` → 全仓 HTTP 路由的 `requirePermission` 一直是空操作

`api/guard-config.js` 的 `registerApiMetadata` 只把 `name/url/method/enabled/requireLogin/allowIps/allowRoles`
写进配置对象，**`requirePermission` 被静默丢弃**；而 `createGuard` → `applyGuardLogic` 恰恰是从
**配置对象**读 `requirePermission`。结论：`registerSecureRoute({requirePermission})` 传了等于没传。

这条缺陷的杀伤力在"修复"语境下更大：**若只按原报告的修法把 `allowRoles:['admin']` 换成
`requirePermission`，等于把本来有效的保护换成空操作**（export 组正是这种情况）。

**修法**：`registerApiMetadata`（连同 system/group 两级）补上 `requirePermission`，
并明确它属于**代码级**字段（与 name/url/method 同类，**不入 RUNTIME_FIELDS**）——
否则运维改一次 DB 就能永久提权。

**证据**：修复后 `getGuardConfig('firewall','apiConfigs','toggleSystemConfig').requirePermission === 'fw:config:toggle'`；
全量体检「没有任何 API 条目的 requirePermission 处于 undefined」通过；6 条授权断言全绿。

### N-2 限流插件注册位置晚于路由 → 限流"注册成功但永不触发"

`@fastify/rate-limit` v10 的 `global: true` 是通过 **`addHook('onRoute', ...)`** 给
「注册在它之后」的路由挂限流配置的。而防火墙插件原先挂在 `10-apps`（`08-api` 之后），
于是：插件确实注册了（`printPlugins` 可见、`hasPlugin` 为 true），但 **401 条已注册路由一条都没被覆盖**。

最小复现已确认规则：路由注册在限流之前 → 无效；限流先注册 → 生效。

另有一个独立缺陷：`errorResponseBuilder` 返回的对象缺 `statusCode`，而插件是
`throw errorResponseBuilder(...)`，Fastify 只认 `statusCode` → **限流命中返回 500 而非 429**。

**修法**
1. 把防火墙插件移到 `loader/registry/05-firewall.js`（早于 `08-api`），并**从
   `app/firewall/config.js` 移除 `init`**（只留一个注册点，同时解决 🟡-1 双注册）。
2. `errorResponseBuilder` 补 `statusCode: 429`（保留 `code` 以兼容本项目响应体契约）。

**证据**：`max=2` 连打 6 次 → `200 200 429 429 429 429`；修复前恒 `200`（且修复中间态为 `500`）。

### N-3 守卫热更新接口可改写任意字段（可自我提权）

`app/guard/services/config.service.js` 的 `updateConfig` 把请求体原样 `Object.assign` 进配置对象，
调用方可把 `enabled` 置 false（关掉某组的守卫）或把 `requirePermission` 置 null（抹掉权限门槛）。
`requirePermission` 变成真字段后这条通道危害升级。

**修法**：加 `PATCHABLE_FIELDS` 白名单（`enabled/requireLogin/allowIps/allowRoles/description`），
出现未知字段**显式 400 报错**而不是静默丢弃。

---

## 四、🟡 中危项

| 条目 | 修法 | 位置 |
| --- | --- | --- |
| 🟡-1 `initFirewall` 双注册 | 唯一注册点收敛到 `05-firewall.js`；`config.js` 去掉 `init` | `loader/registry/05-firewall.js`、`app/firewall/config.js` |
| 🟡-2 暴力破解未接线 | `onResponse` 挂 `observeLoginOutcome` → 真正调用 `checkLoginBruteForce`；账号锁定时清计数，避免无限续期 DoS | `index.js`、`engine/pipeline.js`、`detectors/brute-force.js` |
| 🟡-3 `auto-responder.js` 死代码 | 重写：`defense.alert` / `defense.autoBlock` 深合并（原实现丢弃配置）、Webhook `AbortController` 5s、告警冷却表封顶 5000；并接线 `scan-trap` / `brute-force` | `engine/auto-responder.js` |
| 🟡-4 指纹四字段全客户端可控 | 更正文档表述（指纹含 IP，跨 IP 追踪不成立）；新增 `generateDeviceFingerprint`（去 IP、仅观测、不用于封禁） | `util/fingerprint.js`、`engine/dao/block-manager.js` |
| 🟡-5 静默死开关 | `enableGeoFilter` / `enableConnLimit` 真正参与判定；`challengeDifficulty` 等补进默认配置 | `detectors/geo-filter.js`、`util/connection-tracker.js`、`config/config.js` |
| 🟡-6 用 `err.message.includes('CHALLENGE')` 做控制流 | 删除该 fail-open 判断，改用 `err.isChallenge` | `engine/pipeline.js` |
| 🟡-7 3 个测试是内联副本 | **未修**，仅加显著警示注记 | 见 §5 |
| 🟡-8 `allowRoles:['admin']` 永不匹配 | export 组去掉写死角色，授权交给 `requirePermission` | `api/firewall/v1/export.js` |
| 🟡-9 零 `requirePermission` | 15 个权限码按 `fw_viewer`/`fw_operator`/`fw_admin` 策略逐路由接线 | `api/firewall/v1/*.js` |
| 🟡-10 `engine/index.js ↔ pipeline.js` 循环依赖 | `pipeline.js` 直接 import 实现模块，不再回头 import barrel | `engine/pipeline.js` |
| 🟡-11 同一请求读到两版配置 | 去掉 `getConfig()` 的 30s 缓存（`updateSecuritySettings` 后立即一致） | `util/shared.js` |
| 🟡-12 `addToWhitelist` 缺 `await` | 补 `await` | `services/monitor.service.js` |
| 🟡-13 导出/导入不对称 | 导出补 `duration/expiresAt/remainingSeconds`，回导不再把 5 分钟临时封禁放大成 24h | `api/firewall/v1/export.js` |
| 🟡-14 导入/删除未防御空 body、静默丢弃 | 补 body schema；导入失败逐条收集（上限 20）后返回 | `v1/export.js`、`v1/schemas/monitor.js` |
| 🟡-15 `summary` schema 裁字段 | schema 补 `bufferedCount/bufferCapacity/topIps/topPaths[].apiName`，并删掉不存在的 `enableBotChallenge` | `v1/schemas/monitor.js` |

---

## 五、🔵 低危项

**已修（15）**

| 条目 | 修法 |
| --- | --- |
| 🔵-1 README 路径/容量错误 | `src/firewall/` → `src/app/firewall/`；环形缓冲 10000 → **1000**（实测 `MAX_RECORDS=1000`）；挑战页描述改为 PoW |
| 🔵-2 `dao.js` 头注释与实现不符 | 注释已改为"日志统一走 `framework/log`" |
| 🔵-3 日志硬编码 ANSI | 删除 `brute-force.js` 的 `C.yellow/C.reset`（3 处），避免污染 `logs/*.log` |
| 🔵-4 默认导入 `Logger` | `auto-responder.js` 用 `createLogger`；`seeder.js` 已删除 |
| 🔵-5 角色定义逐字重复 | 删除零调用的 `permission/seeder.js`（其 `fw_admin` 还是旧的坏值 `fw:admin:*`） |
| 🔵-6 `if (!Role) return` 死代码 | 随 `seeder.js` 删除一并消除 |
| 🔵-8 `internalPrefixes` 命名与语义混用 | 局部变量改名 `internalUrlPaths` + 注释说明配置键保持兼容 |
| 🔵-9 `resolveGeoInfo` 硬编码 `'172.'` | 改用 `defense.internalIpPrefixes`（172.16–172.31 / 10. / 192.168. / 127. / ::1） |
| 🔵-10 挑战令牌重复计数 | `pass:*` 含 `pass:fp:*`，改为「IP 维度 + 指纹维度 = 总数」 |
| 🔵-11 解封清错键 | 原 `rel.accountLock(ip)` 拼出 `lock:<ip>` 永不命中；改为清 `rel.bruteIp(ip)` 并说明账号锁按用户名 |
| 🔵-12 挑战签名明文比较/无一次性 | 随 🔴-2 一并解决（`timingSafeEqual` + 原子单次消费 + 双向时间窗） |
| 🔵-13 `bot-detector` 每请求 `JSON.stringify` | 改为配置引用比较（`botPatterns === lastBotPatternsRef`） |
| 🔵-14 计时数组成员无界增长 | 随 Redis 化自然消除（限流窗口改由 `LUA_RATE_WINDOW` + TTL 承载） |
| 🔵-15 深层导入 `framework/redis/utils.js` | `isRedisReady` 补进 barrel，调用方改走 `framework/redis/index.js` |
| 🔵-16 `auto-responder.js` 游离文件 | 接线并纳入 `engine/index.js` barrel |

**未修（2）**

| 条目 | 原因 / 建议 |
| --- | --- |
| 🔵-7 `dao/block-manager.js` 纯 re-export 且与 engine 层同名 | 有 **7 个导入点**（`api/firewall/v1/export.js`、`monitor.js`，`cli/{blocks,stats,status,whitelist}.js`，`engine/detectors/bot-detector.js`）。改名需同步改 7 处 import，收益只是可读性；本次不动，避免把"修复提交"与纯重命名混在一起 |
| 🔵-17 未登录 401 也会走完深度检测管道 | 原报告即判定"钩子顺序使然、无法提前"。真正的解法是编排层短路（`shouldSkipDeepCheck` 之外再加"必然被守卫拒绝"的开关），属性能优化，需单独设计 |

---

## 六、遗留：🟡-7 三个测试文件仍是内联副本

`src/__tests__/firewall.test.js`、`bot-detector.test.js`、`redis-operations.test.js`
不 `import` 真身，只测文件内的同名副本 —— **它们永远通过，因此无法发现真身缺陷**，
这正是 4 个 🔴 长期漏过的根因。

本次仅加了显著警示注记（防止继续被当成真覆盖），**未改造**。改造要点：
- `bot-detector.test.js` → 真身 `checkBotChallenge` 依赖 `getConfig` 与 `setBlock`(Redis)，需 mock 两者；
- `redis-operations.test.js` → 应改为导入 `framework/redis` 真身（现已有 `src/__tests__/framework/redis/`）；
- `firewall.test.js` → 内容大部分与 `firewall-redis-adapter.test.js` 重叠，建议直接删除并迁入真身测试。

---

## 七、本次改动的关键文件

| 文件 | 说明 |
| --- | --- |
| `src/app/firewall/util/pow-sha256.js` | 新增：纯 JS SHA-256 + `verifyPow`（浏览器内联同一份实现） |
| `src/app/firewall/util/redis.js` | 新增：Redis 单一访问层（语义化 API + Lua 单往返 + 内存降级） |
| `src/app/firewall/data/challenge-template.js` | 重写：不透明 challengeId + PoW，无明文凭据 |
| `src/app/firewall/services/challenge.service.js` | 重写：原子单次消费 + `timingSafeEqual` |
| `src/app/firewall/engine/pipeline.js` | 重写：`err.isChallenge` 控制流、`observeLoginOutcome` 接线、去掉 barrel 反向依赖 |
| `src/app/firewall/engine/auto-responder.js` | 重写：配置深合并 + 真实接线 |
| `src/api/guard-config.js` | **N-1**：`requirePermission` 不再被丢弃（三级注册） |
| `src/app/guard/services/config.service.js` | **N-3**：热更新字段白名单 |
| `src/app/firewall/engine/detectors/first-ratelimit.js` | **N-2**：`errorResponseBuilder` 补 `statusCode` |
| `src/framework/loader/registry/05-firewall.js` | **N-2 + 🟡-1**：限流唯一且最早的注册点 |
| `scripts/sync-guard-config.js` | 新增：收敛 `guard_configs` 中被 DB 覆盖的运行时字段 |
