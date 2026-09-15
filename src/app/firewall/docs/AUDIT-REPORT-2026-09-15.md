# 审查报告：app/firewall（+ api/firewall）

- 审查日期：2026-09-15
- 审查范围：`src/app/firewall/**`（33 文件 / 约 4874 行）+ `src/api/firewall/**`（6 文件 / 约 804 行）
- 审查方式：全量源码阅读 + `app.inject()` 实测 + Redis `INFO commandstats` 量化 + 依赖图脚本 + `createGuard` 直接调用
- 依据：`docs/AUDIT-PROMPT.md`（本目录）+ `.workbuddy/memory/MEMORY.md`
- 纪律：**本次审查未修改任何产品代码**；探针脚本位于 `.tmp-probe/`（已 gitignore），审查结束清理

| 等级 | 数量 | 说明 |
| ---- | ---- | ---- |
| 🔴 严重 | **4** | 挑战链路整体死锁、挑战可脚本绕过、安全配置从未加载（限流全线失效 + 配置覆盖丢失）、任意登录用户可改全域守卫策略 |
| 🟡 中等 | **15** | 双注册导致统计/阈值失真、两套防护未接线、指纹可秒破、5 个静默无效开关、测试全部失真、`allowRoles` 永不匹配、循环依赖等 |
| 🔵 低 | 17 | 文档与实现不一致、命名、死代码、重复定义、计数重复、深层导入等 |

---

## 一、结论摘要

`firewall` 的**存储与访问层**（`util/redis.js`）质量很高：Lua 原子化、语义化收敛、内存降级语义对齐、注释把历史踩坑写清楚，本轮优化是成功的（单次 `readAccessState` 实测 1 次 EVAL 完成"2 HAS-EXISTS + 2 GET"）。

但**编排与接线层**问题严重，且几乎都是"宣称与实测不符"：

1. **人机挑战是一条死路**——触发后再也解不开，用户被硬封禁 30 分钟（🔴-1）；即使能提交，校验也形同虚设（🔴-2）。
2. **持久化的安全配置从未被加载**——磁盘上明明写着 `enableRateLimit: true`，运行时是 `false`；全局限流、端点限频（短信/订单/验证码）、IDC 与境外限频**全部没有生效**（🔴-3）。
3. **守卫授权粒度给了任意登录用户改全域策略的权力**（🔴-4）。
4. **三道防线中两道没接线**（🟡-2 暴力破解、🟡-3 自动响应/告警），第三道（挑战）本身是坏的（🔴-1）。
5. **插件入口被注册两次**，导致统计翻倍、扫描陷阱阈值实际减半（🟡-1）。
6. **4 个测试文件里 3 个是内联副本**（🟡-7）——这正是上述历史缺陷（扫描计数从未生效、挑战令牌写不进去、暴力破解未接入）能长期漏过的原因。

---

## 二、防护有效性专项：宣称 vs 实测

| # | 宣称（README / 注释 / 配置） | 实测结论 | 证据 |
| - | --------------------------- | -------- | ---- |
| 1 | 五层拦截管道：连接追踪→封禁→挑战→Bot→地理围栏 | ⚠️ 管道结构存在，但**每层执行两次**；地理围栏开关无效 | 探针 11/12：1 请求 `totalRequests` +2；探针 7：`enableGeoFilter` 为死键 |
| 2 | 触发 Bot 挑战后用户可完成验证继续访问 | ❌ **不成立**：挑战页返回后所有请求 429，验证接口自身也是 429 | 探针 4：`#16 → 200(挑战页)` → 下一次 `429`；`ipBlock={"status":"CHALLENGE","ttlSec":1800}` |
| 3 | 人机挑战用于"区分真实用户和自动化机器人" | ❌ **不成立**：凭证明文内嵌 HTML，校验字段全部客户端自报 | `challenge-template.js:64-69`；`challenge.service.js:28,51` |
| 4 | 指纹封禁"同一攻击者更换 IP 后仍可追踪" | ❌ **反向成立**：换 IP 指纹即变；改一个 Header 也变 | 探针 14：同一浏览器换 IP → 指纹不同；只改 `Accept-Language` → 指纹不同 |
| 5 | 限频（全局 `rateLimitRequests`、端点 `endpointRateLimits`、IDC/境外） | ❌ **全部未生效**（`enableRateLimit` 运行时为 false） | 探针 7：`x-ratelimit-limit` 头不存在；`getSecuritySettings().defense.enableRateLimit === false` |
| 6 | 登录暴力破解防护（账号锁定 + IP 挑战） | ❌ **从未接入**：`checkLoginBruteForce`/`isAccountLocked`/`recordLoginFailure` 全仓零调用 | grep 结果见 4.2 |
| 7 | 攻击自动封禁 + 邮件/Webhook 告警 | ❌ `handleAttackEvent` 全仓零调用；且 `alertConfig` 丢弃用户配置，即便接入也永不告警 | `auto-responder.js:43,46`，grep 见 4.3 |
| 8 | 扫描陷阱：窗口内 404 达 `maxNotFoundAttempts`(10) 才封禁 | ⚠️ 成立但**阈值实际是 5**（计数每次 +2） | 探针 12：`#2=2 #4=6 #6=10` → `#7 403` |
| 9 | 白名单优先级最高，命中直接放行 | ✅ 成立（Lua 内短路，指纹白名单优先于 IP） | `util/redis.js:76-94`；`firewall-redis-adapter.test.js` |
| 10 | Redis 抖动时"不因抖动把所有人拦死"（fail-open） | ✅ 按设计工作（但见 🔵-14 风险提示） | `util/redis.js:280-284` |
| 11 | 手动黑白名单"重启后重放" | ❌ 启动重放读的是**未加载的默认配置**（永远是空数组） | `dao/dao.js:293,326` + 探针 7 |
| 12 | 未登录者不能访问防火墙中控面板 | ✅ 12 个端点全部 401 | 探针 1 |
| 13 | IP 不可伪造（`req.ip`） | ✅ `trustProxy` 仅信任 `127.0.0.1/::1`，伪造 XFF 无效 | `app.js:66-68`；探针 2 P2e |
| 14 | PBAC 权限模型（fw_viewer/operator/admin） | ❌ 15 个权限码只注册不校验（所有路由无 `requirePermission`） | grep 见 4.9 |

---

## 三、文件组织审查

### 3.1 依赖图（脚本实测）

```
文件数=33  内部依赖边=75
内部循环依赖：
  src/app/firewall/engine/index.js → engine/pipeline.js → engine/index.js

扇入 TOP8：
  10  util/redis.js          ← 访问层，符合分层意图
   8  dao/dao.js
   7  engine/dao/block-manager.js
   7  util/shared.js
   6  dao/block-manager.js
   5  data/store.js
   4  engine/index.js
   3  cli/redis-boot.js

跨 app 依赖：无
import scripts/：无（依赖方向干净）
```

### 3.2 逐文件判定

| 文件 | 行数 | 职责是否单一 | 问题 | 优先级 |
| ---- | ---- | ------------ | ---- | ------ |
| `util/redis.js` | **1026** | ⚠️ 超 1000 硬限；但后半段是「内存降级实现」与「迁移辅助」两组不同关注点 | 见 3.3 拆分方案 | 🔴 组织硬限 |
| `dao/dao.js` | 400 | ⚠️ 混装 3 件事：配置持久化 / 名单管理 / **外部 HTTP 定位**（`refreshServerNodeAuto`） | 建议拆出 `dao/server-node.js` | 🔵 |
| `engine/auto-responder.js` | 139 | ✅ 单一 | **全仓零调用**（死文件） | 🟡 |
| `permission/seeder.js` | 106 | ❌ 与 `permission/roles.js` **逐字重复**同一份角色定义 | 删除（零调用） | 🟡 |
| `dao/block-manager.js` | 24 | ❌ 纯 re-export，与 `engine/dao/block-manager.js` 同名 | 合并或改名 `dao/index.js` | 🔵 |
| `engine/index.js` | 36 | ⚠️ barrel 与 `pipeline.js` 互相引用 → 环 | 让 `pipeline.js` 直接从具体模块导入 | 🟡 |
| `util/shared.js` | 60 | ✅ | 模块顶层 `setInterval(...).unref()` 副作用（可接受） | 🔵 |
| 其余 27 个 | — | ✅ 职责与文件名一致 | — | — |

### 3.3 `util/redis.js` 可执行拆分方案

| 新文件 | 装什么 | 预估行数 | 依据 |
| ------ | ------ | -------- | ---- |
| `util/redis/lua.js` | 7 段 Lua 常量 + `KEY_SENTINEL` + `full()` + `rel` + `HASH` | ~150 | 纯数据，零依赖，最底层 |
| `util/redis/memory.js` | `mem` 七张表 + `sweepMemory` + 全部 `*InMemory` 实现 + `memDeleteByRel` + `resetMemoryState` | ~230 | 只被 `redis/*` 调用，不反向依赖 |
| `util/redis/access.js` | `readAccessState` / `writeBlock` / `removeBlock` / `writeWhitelist` / `removeWhitelist` / `listActive` / `decodeStatus` / `resolveBlockTtl` / `normalizeDuration` | ~330 | 封禁白名单语义 |
| `util/redis/counters.js` | `bumpCounter` / `readCounter` / `removeCounters` / `consumeRateWindow` / `setFlag` / `hasFlag` / `grantPass` / `hasPass` | ~180 | 计数与令牌语义 |
| `util/redis/index.js` | barrel + `redisAvailable` / `store` / `scanKeys` / `getRaw` / `ttlOf` / `addBlockIndexEntry` / `hasIndexField` / `setIfAbsent` | ~120 | **保持现有导入路径不变** |

要点：① 现有一切 `from '../util/redis.js'` 与 `from './redis.js'` **不必改动**（barrel re-export 同名）；② 拆分后必须复验"无环"与"`store()` 唯一实例"；③ 顺手把 `framework/redis/utils.js` 的深层导入收敛掉（🔵-15）。

### 3.4 死代码清单（逐个 grep 全仓）

| 导出 | 定义位置 | 生产调用 | 测试调用 | 处置建议 |
| ---- | -------- | -------- | -------- | -------- |
| `handleAttackEvent` | `engine/auto-responder.js:139` | **0** | 0 | 整个文件连同 139 行删除，或接线到 `scan-trap`/`brute-force` |
| `checkLoginBruteForce` | `engine/detectors/brute-force.js:95` | **0** | 0 | 接到登录接口（`api/*/auth`）失败分支 |
| `isAccountLocked` | 同上 | **0** | 0 | 同上 |
| `recordLoginFailure` | `engine/detectors/scan-trap.js:95` | **0** | 0 | 同上（与 `checkLoginBruteForce` 职责重叠，二选一） |
| `setIfAbsent` | `util/redis.js:1024` | **0** | 0 | 删除（注释称"供启动同步使用"，实际启动同步未用它） |
| `readCounter` | `util/redis.js:1011` | **0** | 2 | 保留（CLI 与排障可用），或改为 CLI 专用 |
| `seedFirewallRoles` | `permission/seeder.js:106` | **0** | 0 | 删除（`roles.js` 已走静态注册） |
| `decodeStatus` | `util/redis.js:1003` | 内部 + 测试 | 4 | 保留（有契约测试） |
| `getConnectionStats` | `util/connection-tracker.js:95` | 0（仅 barrel） | 0 | 确认是否给面板用；否则删除 |

### 3.5 文档一致性

- ❌ `README.md:6` 目录树写 `src/firewall/`，实际是 `src/app/firewall/`。
- ❌ `README.md:13` 写"内存环形缓冲区（10000 条）"，`data/store.js:21` 是 `MAX_RECORDS = 1000`。
- ❌ `README.md` 目录树完全缺失：`util/redis.js`(1026)、`engine/detectors/first-ratelimit.js`、`services/*`(3)、`permission/*`(3)、`cli/*`(6)。
- ❌ `dao/dao.js:5` 头注释"系统级模块：日志使用 console"，实际已全部走 `createLogger`。
- ❌ `dao/dao.js:36` 注释"此函数由 index.js 在插件注册时调用"——**服务端从未调用**（见 🔴-3），CLI 才调用。

---

## 四、🔴 严重问题（4 个）

### 🔴-1 人机挑战链路整体死锁：触发即被硬封禁，验证接口自身也被拦

**位置**
- `engine/dao/block-manager.js:251-257`（`buildBlockError` 只特判 `SCANNER`）
- `engine/pipeline.js:79-98`（第 1 阶段早于 skip 判定）
- `app/firewall/index.js:44-66`（`checkGlobalBlockPhase` 在 `shouldSkipDeepCheck` 之前）
- `api/firewall/v1/challenge.js:29-41` + `guard` 的 system 级 `requireLogin: true`

**问题** 两处叠加，使"人机挑战"从可解降级为 30 分钟不可解的硬封禁。

**证据（实测，探针 3/4/13）**

```
P4 #16 status=200 html=true body=(挑战页 3290 字节)      ← 第一次（也是唯一一次）拿到挑战页
P4 触发后状态: ipBlock={"status":"CHALLENGE","ttlSec":1800}
P4 触发后再访问: status=429 {"error":"Security Policy Blocked","message":"Access temporary denied"}
P4 脚本化提交验证: status=429 {"error":"Security Policy Blocked","message":"Access temporary denied"}
P2d CHALLENGE 状态下调验证接口: status=429
P13 未登录 → firewall/challenge/verify: ❌ 拒绝 401（system 级 requireLogin=true）
```

代码侧：`decodeBlockEntry` 返回 `{status:'CHALLENGE', ttlSec:1800}` → `checkGlobalBlock` 对**任意**状态一律 `throw buildBlockError(block)` → 因为 `status !== 'SCANNER'`，落到 `err.statusCode = 429`。而 `setBlock(ip,{status:'CHALLENGE'})` 写的正是 `fw:block:{ip}`。于是：

1. 挑战页渲染后，`fetch('/api/firewall/v1/challenge/verify')` 先撞第 1 阶段 → 429；
2. 挑战页 JS 显示 "Verification Failed"，`location.reload()` 永不执行 → 用户被卡在 429；
3. 未登录用户即使绕过第 1 阶段，`challenge/verify` 也被 system 级 `requireLogin: true` 拦成 401。
4. `shouldSkipDeepCheck` 里那条 `'/api/firewall/v1/challenge/verify'` 白名单**位于第 1 阶段之后**，对验证接口毫无保护作用。

**影响** 任何被判定为 Bot 的**正常用户**（例如无 UA 的爬虫式 UA、或命中 `botPatterns` 的客户端）一旦触发一次挑战，就被硬封禁 30 分钟且无法自救；挑战功能等于"把可用性问题升级为拒绝服务"。

**建议**
1. `checkGlobalBlockPhase` 之前先判 `shouldSkipDeepCheck(request.url)`（skip 名单里的 URL 不查封禁）；或
2. `buildBlockError` 增加 `CHALLENGE` 分支：返回 `err.isChallenge = true`，由 `checkGlobalBlockPhase` 直接渲染挑战页；并且
3. 把 `challenge` 组的 `requireLogin` 在 system 级单独放行（`allowIps`/URL 级白名单），或把验证接口迁到不受守卫覆盖的公共路径。

---

### 🔴-2 人机挑战可被 10 行脚本绕过：凭证明文内嵌 + 校验字段全部客户端自报

**位置** `data/challenge-template.js:64-69`（凭证内嵌）、`services/challenge.service.js:41,46,51`（校验逻辑）

**问题** 挑战凭证 `nonce/timestamp/signature` 直接写在返回的 HTML 里；三个"环境检查"字段来自请求体，脚本可任意填。

**证据（实测，探针 4）**

```
P4 页面内嵌凭证: nonce=efa1f083c6… ts=1789479438737 sig=0d1594683498a96e… （明文可读 → 可脚本提取）
```

```js
// challenge-template.js:64-69
const data = { nonce: '${nonce}', timestamp: ${timestamp}, signature: '${signature}', ...collectFingerprint() };
// challenge.service.js:51
if (!webgl || webdriver || plugins === 0) return { ok:false, statusCode:403, reason:'Suspicious Environment' };
```

任何脚本只需：GET 任意页面 → 正则抠出三件套 → POST `{nonce, timestamp, signature, webgl:true, webdriver:false, plugins:1}` 即通过。**没有任何服务端可信证据**（无 JS 挑战计算、无一次性 nonce、无行为特征）。

**影响** 反自动化防护对**脚本化攻击者完全无效**；同时它拦得住的是"没有渲染能力的正常客户端"，与设计目标相反。

**建议** 短期：把 `nonce` 改为一次性（服务端签发时写 Redis，校验后 `DEL`），并把挑战从"校验静态字段"改为"校验服务端下发任务的计算结果"；中期：引入 PoW（发送 nonce，要求客户端算出 hashcash）——纯服务端可验证，无需信任客户端。

---

### 🔴-3 持久化安全配置文件在服务端从未被加载 → 限频全线未生效 + 覆盖式回写造成配置丢失

**位置**
- `dao/dao.js:38`（`initDao` 定义）、`:60`（`getSecuritySettings` 返回模块内存态）
- `dao/dao.js:70-82`（`triggerSave` 把**内存态整体**写回文件）
- `app/firewall/index.js:31-40`（插件启动只调 `startCleanupTask` / `registerRateLimit` / 两个 sync，**没有 `initDao()`**）
- 调用点仅 3 处，全在 CLI：`cli/blocks.js:84,141`、`cli/status.js:22`、`cli/whitelist.js:77,114`

**问题** `securitySettings` 是模块级变量，初值 `DEFAULT_SECURITY_SETTINGS`；只有 `initDao()` 会把磁盘文件读进来。服务端从不调用它。

**证据（实测，探针 7）**

```
【磁盘文件】enableRateLimit   = true
【运行时】  enableRateLimit   = false        ← 关键：磁盘开、内存关
【磁盘文件】serverNode.lastUpdate = null（从未自动定位）
已注册 @fastify/rate-limit: x-ratelimit-limit 头 = (无)
  #1 status=401 x-ratelimit-limit=(无) retry-after=(无)
```

**影响（按烈度排序）**
1. **限频全部失效**：`registerRateLimit` 因 `enableRateLimit=false` 直接 return → 全局 `@fastify/rate-limit` 未注册；`checkRateLimit` 首行 `if (!settings.enableRateLimit) return true` → `endpointRateLimits`（`/api/sms` 3/600s、`/api/order` 10/60s、`/api/verify` 10/60s）、`geo-filter` 的 IDC/境外限频**一个都没跑**。唯一还在工作的限流是 `bot-detector` 的内存计数与 404 陷阱。
2. **手动黑白名单"重启重放"实际是空操作**：`syncManualWhitelistToRedis()`/`syncManualBlacklistToRedis()` 读的是内存里的 `[]`（文件里的名单根本不在内存），所以 Redis 挂掉/白名单 TTL 到期后**名单永久丢失**，`cli/status.js` 还在打印"← 配置文件，重启后重放"（与实际行为不符）。
3. **配置覆盖（数据丢失）**：任何走 `updateSecuritySettings`/`addToBlacklist`/`addToWhitelist`/`refreshServerNodeAuto` 的路径都会 `triggerSave()` → `fs.writeFileSync(FIREWALL_FILE, JSON.stringify({serverNode, securitySettings}))`，即用**默认值**覆盖线上文件。`POST /api/firewall/v1/monitor/blocks`（`monitor.service.js:169` → `addToBlacklist('ip', ip)`）就是这条路径。
   现状旁证：文件内容 = 内置默认值 + 唯一差异 `enableRateLimit: true`（该项只可能来自一次 `PATCH /settings`），与"被默认值覆盖过一次"的特征吻合。（**本次审查未做破坏性写入实测**，该条为代码推导 + 现状旁证。）
4. 节点自动定位（`refreshServerNodeAuto`）只在"文件不存在"时触发 → 服务端永不自动定位。

**建议**
1. `app/firewall/index.js` 启动即 `initDao()`（放在 `syncManual*` 之前），并加一条契约测试固化"服务端启动必调 initDao"；
2. `triggerSave()` 增加防御：若 `initDao()` 未成功加载（用 `loaded` 标志），**拒绝写文件并告警**，杜绝默认值覆盖线上；
3. 把 `enableRateLimit` 这类开关纳入启动自检日志（当前 `false` 时应打 WARN 而不是静默）。

---

### 🔴-4 任意已登录用户（含零角色用户）可热更新**全域**守卫策略 → 关闭任意系统/模块的鉴权

**位置** `api/firewall/v1/apiConfig.js:19-28`（组元数据 `requireLogin: true, allowRoles: []`）→ `:30-92`（4 个路由：`GET /`、`PATCH /:system/:group`、`POST /toggle/:system/:group`、`POST /toggle-system/:system`）

**问题** 这组接口写的是"仅限受信任的管理内网访问"，但 `allowRoles` 为空、`allowIps` 为空，而守卫只在 `allowRoles.length > 0` 时才校验角色（`api/guard.js:171-195`）。因此**只要登录就能改**，包括改 `requireLogin / allowRoles / allowIps / enabled`（`guard-config.js:110` 的 `RUNTIME_FIELDS`）。

**证据（实测，探针 13：直接调真实 `createGuard`）**

```
===== 身份：role-less(user_26) =====
✅ 放行（守卫未拦截） | firewall/apiConfigs/getConfigs        | requireLogin=false allowRoles=[] | 已登录但无角色
✅ 放行（守卫未拦截） | firewall/apiConfigs/toggleSystemConfig | requireLogin=false allowRoles=[] | 已登录但无角色
❌ 拒绝 403          | firewall/export/exportBlocks          | requireLogin=true allowRoles=["admin"] | 已登录但无角色   ← 对照组：方法有效
===== 身份：anonymous =====
❌ 拒绝 401          | firewall/apiConfigs/getConfigs        | 未登录
```

数据侧（`guard_configs` 表实测）：system `firewall` → `requireLogin: true, allowRoles: []`；group `apiConfigs` → `requireLogin: true, allowRoles: []`；4 个 api → `requireLogin: false, allowRoles: []`。三级 `allowRoles` 全空 → 无角色校验。数据库现有用户中 **id=26/27 没有任何角色**（`iam_user_role` 仅 1 行：user 1 → superadmin），即真实存在这类账号。

**影响** 提权链：任意登录用户 → `POST /api/firewall/v1/apiconfigs/toggle-system/user`（或任意 system）→ 把目标系统的 `requireLogin` 置为 `false` / 把 `enabled` 改动 → **全站鉴权被削弱**；也可把自己的 IP 加进某组 `allowIps`，或读取全域守卫矩阵（信息泄露）。

**建议**
1. `apiConfigs` 组与 4 个 api 全部显式 `allowRoles: ['superadmin']`（注意：**不能写 `'admin'`**，见 🟡-8）；
2. 更稳妥：在 `updateConfig/toggleConfig/toggleSystemConfig` 三个 service 入口加二次校验（要求 `superadmin`），不只依赖路由元数据；
3. 守卫侧建议把 `RUNTIME_FIELDS` 的修改限制为"父级未锁定方可改子级"，避免"子级把父级的登录要求改没"。

---

## 五、🟡 中等问题（15 个）

### 🟡-1 `initFirewall` 被注册两次 → 全链路执行两遍（统计 ×2、扫描陷阱阈值减半）

**位置** `framework/loader/registry/05-firewall.js:10` + `framework/loader/registry/10-apps.js:113-116`（`appConfig.init`）+ `app/firewall/config.js:14`。`initFirewall` 被 `fastify-plugin` 包住，两次注册的钩子都落到根实例。

**证据（实测，探针 11/12）**

```
A. 1 个 401 请求 → totalRequests 增量 = 2（1=正常，2=钩子注册两次）
C. 连续 404 观察（配置阈值 10）：
   #1 status=404 计数=0
   #2 status=404 计数=2
   #4 status=404 计数=6
   #6 status=404 计数=10
   #7 status=403 计数=0     ← 实际 5 个 404 就触发封禁
```

命令计量（探针 8）：普通 401 请求 **10.02 条 Redis 命令 / 请求**，其中 `eval×2 + exists×4 + get×4` —— 恰好是 `readAccessState`（实测 1 次 EVAL = 2 EXISTS + 2 GET）跑了两遍。

**影响** ① 中控面板所有统计（`totalRequests`/`totalBlocked`/IP 榜）翻倍；② 扫描陷阱阈值实际减半，正常用户更容易被误封；③ 每请求 Redis 往返翻倍；④ `startCleanupTask` 被调两次 → 两个 5 分钟定时器；⑤ `registerRateLimit` 被调两次，第二次的重复注册错误被 `try/catch` 吞成一条 warn（`first-ratelimit.js:69-71`）。

**建议** 二选一：① 删掉 `05-firewall.js`（统一走 `config.init`）；或 ② 在 `10-apps.js` 注册前判断该 app 是否已有专属 loader。加契约测试：启动后断言 `initFirewall` 只执行一次（例如统计自增计数）。

### 🟡-2 登录暴力破解防护整套未接线（`enableBruteForce: true` 是空转）

**位置** `engine/detectors/brute-force.js:30,90`、`engine/detectors/scan-trap.js:26`；`engine/index.js:11-12` 有导出。
**证据** 全仓 grep：`checkLoginBruteForce` / `isAccountLocked` / `recordLoginFailure` 仅出现在"定义 + barrel re-export"，**零生产调用**。
**影响** 账号锁定（`fw:lock:{user}`）与 IP 挑战从未发生；配置里的 `bruteLimit/bruteWindow/accountLockTime/ipBlockTime/bruteIpLimit` 全部无效。登录接口目前只有 `@fastify/rate-limit` 兜底（而它又因 🔴-3 未注册）。
**建议** 在登录失败/成功分支接入（二选一保留 `checkLoginBruteForce` 或 `recordLoginFailure`，两者职责重叠）；顺带注意 `brute-force.js:68-81` 的**账号锁定可被用来 DoS 任意已知账号**（失败 5 次锁 15 分钟且可续），接入时应加"同 IP 才计数"或渐进制裁。

### 🟡-3 `engine/auto-responder.js` 整套死代码，且内部有 4 处自身缺陷

**位置** `engine/auto-responder.js:11,33,43,46,104,128`
**证据** `handleAttackEvent` 全仓零调用；该文件也不在 `engine/index.js` barrel 里。
**内部缺陷**
1. `:46` `const alertConfig = { ...DEFAULT_CONFIG.alert }` **丢弃了 `config`**（对比 `:45` 的 autoConfig）→ 即使接线，`email`/`webhookUrl` 恒为空 → `sendAlert` 永不发送（告警功能静默失效）。
2. `:33` `alertCooldown` Map 只写不清 → 无界增长（键含 IP）。
3. `:128` `fetch(webhookUrl, ...)` **无超时/AbortSignal**，且 URL 来自配置（SSRF 面）。
4. `:11` `import Logger from '.../log/index.js'` 用默认导出 → 日志 tag 变成 `app`，模块级 `LOG_LEVEL_*` 配置失效。
**建议** 先决定"接线还是删除"。若删除，`util/redis.js` 里为它写的 `resolveBlockTtl` 兜底逻辑可保留（仍有价值）。

### 🟡-4 请求指纹只是 `sha256(ip|ua|lang|enc)`，四个字段全客户端可控 → 指纹封禁可秒破 + NAT 误伤

**位置** `util/fingerprint.js:16-24`
**证据（实测，探针 14）**

```
(b) 基线指纹              = b74fef8333df0644
(b) 只改 Accept-Language  = bf9299238e29ebdd （不同 → 可秒破指纹封禁）
(b) 删掉 Accept-Language  = 59f733a59291bde0 （不同）
(b) 仅换 IP（同一浏览器） = d5211951e586e4b5 （不同 → "换 IP 仍可追踪"不成立）
```

**影响** ① 指纹封禁只需改一个 Header 即绕过；② 反向：`generateFingerprint` **包含 IP**，因此"换 IP 仍可追踪"的宣称不成立；③ 同 NAT 下同浏览器用户指纹相同（UA/语言/编码全默认），`checkGlobalBlock` 的"指纹优先"设计会**连带误封**；④ 挑战页辛苦采集的 `webgl/screen/timezone/plugins` 只用于一次性布尔断言，**从未参与指纹**（设计断裂，注释 `challenge.service.js:5` 也不成立）。
**建议** 若指纹要承担封禁决策，必须改成服务端可验证的信号（挑战通过时由服务端记录"该指纹已通过"，令牌与指纹绑定已在做）；同时把 IP 从指纹里剔除（改由 `fw:block:fp` + 独立 IP 维度组合），并在文档里如实描述其强度。

### 🟡-5 五个"静默无效开关"：管理员改了没有任何效果

**位置/证据**（全仓 grep，除配置定义外零读取）

| 键 | 定义处 | 读取处 | 但可被谁改 |
| -- | ------ | ------ | ---------- |
| `enableGeoFilter` | `config/config.js:228` | **无**（`checkGeoReputation` 无条件执行） | `schemas/monitor.js:97`、`updateSettingsSchema` |
| `enableConnLimit` | `config/config.js:224` | **无**（`trackConnection` 不看开关） | `schemas/monitor.js:95` |
| `enableUserRateLimit` | `config/config.js:211` | **无** | 配置文件 |
| `userRateLimitRequests` | `:212` | **无** | 配置文件 |
| `userRateLimitWindow` | `:213` | **无** | 配置文件 |
| `enableBotChallenge` | **不存在** | **无** | `schemas/monitor.js:98`（允许写入一个不存在的键） |

反方向还有两个"代码读、配置没有"的键（靠 `||` 兜底）：`settings.idcLimit`（`geo-filter.js:34`，恒 60）、`geoRules.overseasInternalLimit`（`:43`，恒 30）。

**影响** 运维在面板上关掉"地理围栏""并发连接限制"后，策略**照旧生效**（或反之），排障时会产生严重误判。
**建议** 给每个开关补上真正的分支判断（`if (!settings.enableGeoFilter) return;`），或从 Schema/配置里删掉；并加一条"配置键 ↔ 代码引用"的守卫测试（类似本仓已有的导出面契约测试）。

### 🟡-6 用 `err.message.includes('CHALLENGE')` 做控制流判断

**位置** `engine/pipeline.js:166` `const isChallenge = err.isChallenge || err.message?.includes('CHALLENGE');`
**证据** 项目规则明确禁止用消息文本做控制流（`AUDIT-PROMPT` §C、`MEMORY.md`）。此处方向是 **fail-open**：任何 message 含该字样的错误都会把"硬封禁"降级为"返回挑战页 200"。
**说明（诚实标注）** 本次未构造出稳定利用路径（当前错误消息都来自固定字面量；`checkRateLimit` 的 `Blocked, retry in Xs`、Redis 包装错误等均不含该串）。但它是明确的静默地雷：一旦有 `RedisRequiredError` 之类把 key/命令拼进 message（key 形如 `fw:block:...`、`fw:rl:{path}:{ip}`），行为就会变。
**建议** 删除字符串兜底，只认 `err.isChallenge === true`（`rate-limiter.js:73` 已正确设置该标记），并统一走一个 `ChallengeRequiredError` 类。

### 🟡-7 firewall 的 4 个测试中 3 个是内联副本 → 真身零覆盖

**证据**（`^import` 扫描）

| 测试文件 | 行数 | 是否 import 真身 |
| -------- | ---- | ---------------- |
| `__tests__/firewall.test.js` | 170 | ❌ 仅 `@jest/globals`，`isBot`/`isScanTrap` 全为内联副本 |
| `__tests__/bot-detector.test.js` | 115 | ❌ 同上 |
| `__tests__/redis-operations.test.js` | 136 | ❌ 同上 |
| `__tests__/firewall-redis-adapter.test.js` | 439 | ✅ 唯一真实（`import * as adapter from '../app/firewall/util/redis.js'`） |

**影响** 与 auth 模块历史缺陷同类（4 套 `verifyCookie` 副本掩盖 🔴-1）。这也解释了为何"扫描计数从未生效""挑战令牌写不进去""暴力破解未接入"能长期漏过测试。
**建议** 三个副本文件改写为 import 真身；至少补 4 条回归用例：① 挑战链路端到端；② 封禁状态机（4 种状态 × 入口行为）；③ 服务端启动调用 `initDao`；④ `initFirewall` 只注册一次。

### 🟡-8 `allowRoles: ['admin']` 永不匹配 → 防火墙导入/导出接口对所有人 403

**位置** `api/firewall/v1/export.js:31,44,70,94`
**证据** 实测 `createGuard('firewall','export','exportBlocks')`：**superadmin 身份也被拒 403**（探针 13）。原因：守卫是精确匹配 `allowRoles.some(r => userRoles.includes(r))`，而 `iam_role` 表中**不存在** `code='admin'` 的角色（实测列出 21 个角色：`user_*`/`fw_*`/`admin_admin`/`admin_operator`/`admin_viewer`/`oauth_*`/`posecraft_*`/`superadmin`，无 `admin`）；`permission-loader.js:102-106` 对 superadmin 补的是 `{appId}_admin`（如 `firewall_admin`），也不等于 `admin`。
**影响** firewall 的规则导入/导出（`/v1/export/{blocks,whitelist}`、`/v1/import/*`）**对任何真实账号都不可用**。同一模式在 `src/api/admin/**` 至少 15 处（属跨模块系统性问题，本报告只标注）。
**建议** 全仓把 `allowRoles: ['admin']` 改成实际存在的角色码（推荐 `superadmin` 或 `{appId}_admin` 语义），并加一条守卫测试：断言所有 `allowRoles` 值都能在 `iam_role.code` 里找到。

### 🟡-9 firewall 全部路由零 `requirePermission` → PBAC 只注册不校验

**证据** `grep -rn "requirePermission" src/api/firewall/` 无结果；`permission/index.js:13-53` 注册了 15 个权限码（`fw:monitor:*`/`fw:block:*`/…），`roles.js` 定义了 3 个角色 policy，但没有任何路由消费它们。
**影响** "观察者只能读、操作员可写、管理员全量"的模型完全未落地；`monitor` 组内**只读接口与写接口的授权完全一致**（同为"登录即可"）。`fw:admin:*` 通配符更是无人引用。
**建议** 给每个路由补 `requirePermission`（`fw_viewer`/`fw_operator`/`fw_admin` 的 policy 已就绪，接线成本很低）。

### 🟡-10 `engine/index.js` ↔ `engine/pipeline.js` 循环依赖

**证据** 依赖图脚本：`engine/index.js → engine/pipeline.js → engine/index.js`（`pipeline.js:9-17` 从 barrel 导入 `checkRateLimit/trackConnection/checkGeoReputation/checkBotChallenge/trackRequestCount/resolveGeoInfo/checkGlobalBlock`）。
**影响** ESM 下可运行，但 barrel 与实现互相引用会让初始化顺序变得脆弱；本仓已确立"框架/auth 目录必须无环"的约定。
**建议** `pipeline.js` 改为直接从 `./detectors/*` 与 `./dao/block-manager.js` 导入，barrel 只做外向聚合。

### 🟡-11 同一请求可能读到两个版本的配置

**证据** `pipeline.js:150` 用 `getSecuritySettings()`（**实时内存对象**）读 `endpointRateLimits`；而 `rate-limiter.js:60`/`bot-detector.js:22,55`/`geo-filter.js:19` 用 `getConfig()`（`util/shared.js:31` 的 **30s 快照**）。且 `getConfig()` 返回的是同一个对象引用（实测 `getConfig() === getSecuritySettings()` 为 true），`updateSecuritySettings` 的 `deepMerge` 会替换为新对象 → 快照最长 30s 指向旧对象。
**影响** 管理员改完配置后，同一请求内"限频规则用新值、Bot 阈值用旧值"，排查问题时现象不一致。
**建议** 全目录统一走 `getConfig()`（并在 `updateSecuritySettings` 后主动失效缓存），或统一走实时值。

### 🟡-12 `addToWhitelist` 缺 `await`：返回成功时 Redis 尚未写入

**位置** `services/monitor.service.js:211` `addToWhitelist(ip, dur);`（同文件其它调用都 `await`）——函数是 `async` 且内部 `await writeWhitelist(...)`。
**影响** 接口先返回"已添加白名单"，客户端立刻请求可能仍未放行（竞态）；写失败也无法反馈给调用方。
**建议** 补 `await`，并把返回值纳入 `result.ok`。

### 🟡-13 导出/导入不对称：导出缺失 `duration/expiresAt` → 回导后临时封禁时长失真

**位置** `api/firewall/v1/export.js:47-55`（导出字段）对比 `:110-120`（导入读取 `block.duration`）
**证据** 导出对象只含 `{ip,fingerprint,type,reason,status,permanent,createdAt}`；导入时 `ttlSec = Number(block.duration) > 0 ? … : 86400`。而 `getActiveBlocks()` 返回的 `remainingSeconds` 没有被导出。
**影响** 把"还剩 5 分钟的临时封禁"导出再导入 → 变成 24 小时；跨环境迁移规则会放大封禁时长。
**建议** 导出补 `duration`（取 `remainingSeconds`）且导入优先使用它；导出结构版本化（加 `version` 字段），并加"导出→导入"往返一致性测试。

### 🟡-14 导入/删除接口未防御空 `req.body`，导入无逐条校验且静默丢弃

**位置** `export.js:96` `const { blocks } = req.body;`、`:146`、`:125` `catch { skipped++ }`、`monitor.js:154` `req.body`
**证据** 这些路由**没有 body schema**（`registerSecureRoute` 的 `schema` 未传）→ 无 `content-type`/无 body 时 `req.body === undefined` → 解构抛 `TypeError` → 500。探针 1 侧证：带 `content-type: application/json` 但空 body 的 `DELETE /blocks/1.2.3.4` 返回 `400 Body cannot be empty...`（Fastify 层的报错），说明这条路径完全依赖请求格式。另外 `importBlocks` 的 `target` 可能为 `undefined`（`{reason:'x'}` 条目）→ 写入 `fw:block:undefined` 脏键；`importWhitelist` 还缺 `importBlocks` 里的 1000 条上限。
**影响** 接口健壮性不足（500 而非 400）；导入失败原因不可见（静默 skipped），与仓库"故障不静默"约定冲突。
**建议** 补 body schema（`required: ['blocks']`、`maxItems: 1000`、条目 `required: ['ip']` + IP 格式），`catch (err)` 改为记录原因并回传前 N 条失败明细。

### 🟡-15 `summary` 响应 schema 未声明 `topIps` 等字段 → 被 Fastify 响应序列化裁掉

**位置** `api/firewall/v1/schemas/monitor.js:21-53`（只声明 `totalRequests/totalBlocked/topRegions/topPaths/serverNode`）
**证据** `data/store.js:243-251` 的 `getSummary()` 还返回 `bufferedCount`/`bufferCapacity`/`topIps`（`topPaths[].apiName` 也未声明），而 Fastify 会按响应 schema **过滤未声明属性**。
**影响** 面板拿不到 TOP IP 与缓冲区水位（静默丢失，前端会显示空白而非报错）。
**建议** 补全 schema 属性（或给该路由关掉响应序列化裁剪），并加一个"service 返回键 ⊇ schema 声明键"的契约测试。

---

## 六、🔵 低优先级（17 个）

| # | 位置 | 问题 | 建议 |
| - | ---- | ---- | ---- |
| 🔵-1 | `README.md:6,13` | 路径写 `src/firewall/`（实际 `src/app/firewall/`）；环形缓冲写 10000 条（实际 1000） | 修正并补齐目录树（缺 6 个文件） |
| 🔵-2 | `dao/dao.js:5` | 头注释"日志使用 console"与实现（`createLogger`）不一致 | 改注释 |
| 🔵-3 | `engine/detectors/brute-force.js:20,64,77` | 日志里硬编码 ANSI 转义（`\x1b[33m`）→ 落盘文件被污染 | 删除颜色码（CLI 的输出走 `framework/cli` 的 `colors`） |
| 🔵-4 | `auto-responder.js:11`、`permission/seeder.js:8` | `import Logger from` 默认导出 → tag 退化为 `app`，模块级日志配置失效 | 改为 `createLogger('app.firewall.…')` |
| 🔵-5 | `permission/roles.js` vs `permission/seeder.js` | 同一份 3 角色定义**逐字重复**，其中 `seeder.js` 零调用 | 删除 `seeder.js` |
| 🔵-6 | `permission/seeder.js:17` | `if (!Role) return;` 是死代码——`getModel` 未命中**抛 TypeError**（实测：`getModel: 模型 "__NOPE__" 不存在`） | 去掉该判断或包进 try |
| 🔵-7 | `dao/block-manager.js` | 24 行纯 re-export，与 `engine/dao/block-manager.js` 同名，易误改错文件 | 合并为 `dao/index.js` 或直接引用 engine 层 |
| 🔵-8 | `engine/detectors/geo-filter.js:40` | `geoRules.internalPrefixes` 存的是 URL 路径（`['/internal/']`）却与"IP 前缀"命名混用（同文件 `:21` 的 `settings.internalIpPrefixes` 才是 IP） | 改名 `internalPaths` |
| 🔵-9 | `engine/detectors/geo-filter.js:65` | `resolveGeoInfo` 硬编码 `'172.'`（实测把 `172.217.160.78`(Google)、`172.64.155.1`(Cloudflare) 判为"内部网络/局域网"），与配置 `internalIpPrefixes`（172.16–172.31）两份真相 | 复用配置，删硬编码 |
| 🔵-10 | `cli/stats.js:37-38` | `scanKeys('pass:*')` 已包含 `pass:fp:*` → 展示上"挑战令牌 N（指纹维度 M）"里 N 重复计入 M | 明确拆分或改文案 |
| 🔵-11 | `cli/blocks.js:184` | 解封时用 `rel.accountLock(targetIp)` 清"账号锁定"（该键按用户名存），且未清 `brute:ip:{ip}` | 改为清 `bruteIp`（或同时清两者） |
| 🔵-12 | `services/challenge.service.js:41,46,56` | 签名用明文 `!==` 比较（非恒定时间）；时效只判"过期"不判"未来值/NaN"；`nonce` 无一次性消费 | 换 `timingSafeEqual` + 双向时间窗 + nonce 一次性 |
| 🔵-13 | `engine/detectors/bot-detector.js:21-25` | `ensurePatternsCompiled()` **每请求**做 2 次 `JSON.stringify` 只为算 hash | 用配置版本号/`getConfig()` 快照引用比较 |
| 🔵-14 | `util/shared.js:25`、`rate-limiter.js:28-43` | `ipRequestTimestamps` 在 60s 窗口内无界增长，且 `shift()` 在大数组下是 O(n)；`readAccessState` 前置查询让单次 404 多 1 次 RTT（被 🟡-1 放大为 2 次） | 改用固定长度环形缓冲；404 路径先计数再查状态 |
| 🔵-15 | `util/redis.js:29` | 深层导入 `framework/redis/utils.js`（该包已有 `index.js` barrel） | 收敛到 barrel |
| 🔵-16 | `engine/auto-responder.js` | 既零调用又不在 `engine/index.js` barrel 内（游离文件） | 删除或接线 |
| 🔵-17 | `app/firewall/index.js:44-66` | 未登录的 401 请求也会走完整个深度检测管道（Bot/Geo/限频）才被守卫拒绝 | 无法提前（钩子顺序使然），但可在 `shouldSkipDeepCheck` 之外增加"已知会被守卫拒绝"的短路开关 |

---

## 七、已确认无问题清单（检查过但确认正常，勿重复排查）

### 安全设计

| 检查项 | 结论 | 实测方法 / 原始输出 |
| ------ | ---- | ------------------- |
| `X-Forwarded-For` 伪造 | ✅ 无效 | `app.js:66-68` 默认 `trustProxy: ['127.0.0.1','::1']`；探针 2 P2e：伪造 `XFF=198.51.100.7`（该 IP 已封禁）→ `status=404`（正常路由，未被封） |
| 未登录访问中控面板 | ✅ 全部 401 | 探针 1：`summary/records/settings/blocks/whitelist/clear/node/refresh/PATCH settings` 共 11 个端点 → `401 {"code":401,"message":"身份验证失败，请先登录"}` |
| 白名单优先级 | ✅ Lua 内短路（指纹白名单优先于 IP） | `util/redis.js:76-94`；`firewall-redis-adapter.test.js` 覆盖 |
| 封禁写/删的原子性 | ✅ 单次 Lua，键与索引同写 | 探针 10：`setBlock → 3 命令 {set:1, eval:1, hset:1}`；`removeBlock → {del:1, eval:1, hdel:1}`（均 1 RTT） |
| 状态读取的原子性 | ✅ 1 次 EVAL 完成"白名单短路 + 封禁 + PTTL" | 探针 10：`readAccessState ×1 → 5 命令 {exists:2, eval:1, get:2}`；`hasPass ×1 → 3 命令 {exists:2, eval:1}` |
| 非法封禁入参不会产生"永久封禁" | ✅ `resolveBlockTtl` 兜底 60s；`normalizeDuration` 兜底 86400s | `util/redis.js:400-409,467-472`，注释记录了历史上 `{reason,duration}` 造成的 NaN 事故 |
| 挑战页 XSS | ✅ 无。模板只插值 `nonce`(hex)/`timestamp`(数字)/`signature`(hex)；服务端错误信息经 `innerText` 写入 | `challenge-template.js:64-69,83` |
| 签名算法降级 / 密钥硬编码 | ✅ `CHALLENGE_SECRET` 取环境变量，生产缺失即 `process.exit(1)` | `config/config.js:20-28` |
| Redis 不可用时的降级语义 | ✅ 与 Redis 路径一致（白名单短路、临时条目按 `expiresAt` 惰性过期、永久条目 `permanent` 标记） | `util/redis.js:318-353,594-613`；`firewall-redis-adapter.test.js` |

### 工程与规范

| 检查项 | 结论 | 证据 |
| ------ | ---- | ---- |
| ESLint | ✅ `src/app/firewall` + `src/api/firewall` **0 问题** | `eslint src/app/firewall src/api/firewall` 无输出 |
| `console.*` | ✅ 零使用 | `grep -rn "console\."` 无结果 |
| 依赖方向 | ✅ 无 `src → scripts`；无跨 app 依赖 | 依赖图脚本输出"import scripts/：无"、"跨 app 依赖：无" |
| 单文件硬限 | ⚠️ 仅 `util/redis.js`(1026) 超限，其余 ≤400 | 见 3.3 拆分方案 |
| `export` 位置规范 | ✅ 全部收敛到文件末尾（含 8 处 `export default` 在末行） | `grep '^export \(const\|function\|default\)'` 仅末行命中 |
| 定时器清理 | ✅ `startCleanupTask` 在 `onClose` 清、`shared.js:58` 的 sweep 已 `.unref()` | 代码确认（但被 🟡-1 注册两次） |

---

## 八、优先级排序（危害 / 修复成本）

| 顺序 | 问题 | 危害 | 修复成本 | 说明 |
| ---- | ---- | ---- | -------- | ---- |
| 1 | 🔴-3 启动未调 `initDao`（限流全线失效 + 配置覆盖） | 极高 | **极低**（1 行 + 1 个防御标志） | 性价比最高，先修这个 |
| 2 | 🔴-4 `apiConfigs` 补 `allowRoles` | 极高（提权） | **极低**（4 处加参数） | 与 🟡-8 一起处理 |
| 3 | 🔴-1 挑战链路死锁 | 高（用户被误封 30 分钟） | 低（skip 顺序调整 + `buildBlockError` 分支） | 与 🔴-2 同批 |
| 4 | 🟡-1 双注册 | 中高（误封 + 统计失真 + Redis 翻倍） | 低（删一个注册点） | 修完统计立即变准 |
| 5 | 🟡-8 `allowRoles:['admin']` 永不匹配 | 中高（接口不可用） | 低（改角色码） | 跨模块系统性问题 |
| 6 | 🔴-2 挑战可脚本绕过（一次性 nonce / PoW） | 高 | 中 | 需设计，先做 nonce 一次性 |
| 7 | 🟡-2 🟡-3 两套防护接线或删除 | 中 | 中（接线）／低（删除） | 先决定去留 |
| 8 | 🟡-5 静默无效开关 | 中（排障误导） | 低 | 与 3.5 文档一起 |
| 9 | 🟡-7 测试失真 | 中（回归无网） | 中 | 建议同步补 4 条回归用例 |
| 10 | 🟡-4 指纹强度 | 中 | 中 | 需与挑战方案一起设计 |
| 11 | 🟡-9 权限未接线 | 中 | 中（逐路由加 `requirePermission`） | policy 已就绪 |
| 12 | 🟡-10~15 + 🔵 全部 | 低-中 | 低 | 可批量处理 |
| 13 | 3.3 `util/redis.js` 拆分 | 组织硬限 | 中（脚本切片 + 无环复验） | 建议独立一轮 |

---

## 九、审查者自检清单

```
[x] 已完整读取 app 33 个 + api 6 个文件（含未跟踪的 util/redis.js 1026 行与 cli/redis-boot.js）
[x] 已用依赖图确认内部无环 —— ❌ 发现 1 处环（🟡-10），已在报告说明
[x] 已实测挑战链路端到端（探针 4：拿到挑战页 → 提取凭证 → 提交 → 429）
[x] 已实测封禁状态机（探针 2 P2d：CHALLENGE 状态 → 入口 429）
[x] 已实测未登录 / 已登录无角色 / 管理员 三种身份 × 5 个分组的守卫判定（探针 13）
[x] 已确认 trustProxy 与 XFF 伪造的实际效果（探针 2 P2e：无效）
[x] 已逐个 grep 所有导出，产出死代码清单（3.4）：6 个零生产调用导出 + 1 个仅测试
[x] 已核对每条声明式配置开关是否被代码读取（7 个死键，见 🟡-5）
[x] 已量化请求热路径 Redis 往返（探针 8/10：普通请求 10.02 命令 ≈ 2 次 EVAL/请求，因双注册）
[x] 已给出可执行的拆分方案（3.3，含每个新文件的职责与行数）
[x] 已输出「已确认无问题清单」并附原始输出（第七节）
[x] 探针脚本位于 .tmp-probe/（gitignore），并已清理探针写入的 Redis key（`scanKeys('*')` 归零）
[x] 报告未使用"可能""也许"等模糊表述而无依据；唯一标注为"推导"的条目（🔴-3 的配置覆盖）已明确说明依据与未做破坏性实测的原因
[x] 未修改任何产品代码
```

---

## 附录：探针清单与原始输出索引

| 探针 | 文件 | 用途 | 关键输出 |
| ---- | ---- | ---- | -------- |
| 1 | `.tmp-probe/probe1-auth.mjs` | 未登录访问 12 个端点 | 全部 `401`；`POST /blocks` 因 schema 先于守卫校验返回 `400 must have required property 'ip'` |
| 2 | `probe2-challenge.mjs` | 挑战/封禁语义 + XFF | `P2d CHALLENGE → 429`；`P2e 伪造 XFF → 404`（无效） |
| 3 | `probe3-challenge-clean.mjs` | 干净触发挑战（避开 404 陷阱） | 未触发（light-my-request 默认 UA 不匹配 botPatterns） |
| 4 | `probe4-challenge-bot.mjs` | 用 botPattern UA 触发 | `#16 → 200 挑战页`；后续 `429`；凭证明文 |
| 6 | `probe6-redis-ready.mjs` | 确认 app 内 Redis 真就绪 | `isRedisReady()=true`；`store.scan → ["fw:blocked:ips","fw:block:203.0.113.251"]` |
| 7 | `probe7-config-load.mjs` | 磁盘 vs 运行时配置 | `true vs false`；`x-ratelimit-limit=(无)` |
| 8 | `probe8-redis-rtt.mjs` | 每请求 Redis 命令数 | 普通请求 10.02 / 404 请求 17.67 / 带 cookie 16.30 |
| 10 | `probe10-isolate.mjs` | `CONFIG RESETSTAT` 逐操作隔离 | `readAccessState=5 命令/1 EVAL`；`setBlock=1 EVAL` |
| 11 | `probe11-double-register.mjs` | 双注册（首版观测点有误，已说明） | 环形缓冲满 500 时长度不变 → 改用 `totalRequests` |
| 12 | `probe12-fixed-count.mjs` | 修正版计数 | `1 请求 → totalRequests +2`；404 计数每次 +2 |
| 13 | `probe13-guard.mjs` | 真实 `createGuard` × 3 身份 × 5 分组 | role-less 放行 `apiConfigs`；superadmin 被 `export` 拒 |
| 14 | `probe14-claims.mjs` | GeoIP 前缀 + 指纹强度 | `172.217.160.78 → 内部网络`；改 Header → 指纹变 |
| — | `dep-graph.mjs` | 依赖图 / 环 / 扇入 | 1 处环；无 scripts、无跨 app |
| — | `whoami.mjs` | 用户与角色数据 | `user 26/27 无角色`；无 `code='admin'` 角色 |
