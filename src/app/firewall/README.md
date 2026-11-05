# Firewall 模块架构

# Firewall 模块架构（两层分离，2026-11-01）

> **分层约定**：关键防护引擎上移 `src/framework/firewall/`（五道管卡、封禁语义、
> 挑战 PoW），且**核心装配（bootstrap.js）由 `loader/registry/05-firewall.js` 直接启动**；
> 本目录（app 层）保留**与前端互动的部分**：策略配置与持久化、面板遥测与 WebSocket
> 广播、CLI、邮件告警通道注入。app → framework 单向依赖，framework 零依赖 app
> （由 `conventions/framework-app-isolation.test.js` 守卫）。
>
> **启动编排**（05-firewall.js，三步顺序不可换）：
> ① app 前置 `prepareAppFirewall()`（initDao 注册配置读取器 + 邮件通道，须先于核心，
> 因 registerRateLimit 注册期读 `defense.enableRateLimit`）→
> ② framework 核心 `firewallCorePlugin`（无条件启动）→
> ③ app 收尾 `firewallAppPlugin`（名单同步 + onClose 落盘）。
> 删除本目录后 ①③ 消失，② 以 framework 默认策略（`config/defaults.js`）继续防护。

## 目录结构

```
src/framework/firewall/               # 【架构层】防护引擎（始终存在）
├── block-manager.js                  # 封禁/白名单**真身**：三维度 CRUD + checkGlobalBlock + isUserManuallyBlocked
├── bootstrap.js                      # 【核心装配插件】firewallCorePlugin：限流插件 + 五阶段管道 + 观测钩子（05-firewall 直接启动）
├── challenge-template.js             # 人机挑战页 HTML 模板（内联 SHA-256 PoW 求解器，载荷服务端持有）
├── telemetry-sink.js                 # 遥测注入点：app 注册 pushRecord，引擎经此产生记录事件
├── config/
│   └── defaults.js                   # 默认安全策略矩阵（framework 单一来源；app config.js 只是 re-export）
├── interface/
│   └── config-access.js              # 配置读取器注册点（零 import，依赖图最底层，断开 util ↔ dao 环）
├── util/
│   ├── redis.js                      # Redis 访问层（key 构造、Lua、三维度封禁/白名单/计数/挑战语义、内存降级）
│   ├── shared.js                     # 共享内存状态（activeConnections、ipRequestTimestamps、getConfig）
│   ├── connection-tracker.js         # 并发连接追踪 + 僵尸清理定时任务
│   ├── fingerprint.js                # 请求指纹生成（IP+UA+Lang+Enc → SHA256 前 16 位）
│   └── pow-sha256.js                 # PoW 原语
└── engine/                           # 五道管卡（只做检测与响应，不含面板遥测）
    ├── index.js                      # barrel：检测器 / 自动响应 / 请求管道
    ├── pipeline.js                   # onRequest 五层拦截管道 + 登录结果观测 + 日志记录
    ├── auto-responder.js             # 攻击告警与自动响应（邮件通道由 app 注入，Webhook 直发）
    └── detectors/
        ├── first-ratelimit.js        # 第一层：@fastify/rate-limit 全局限流（enableRateLimit 开关）
        ├── rate-limiter.js           # 端点级滑窗限频（enableEndpointRateLimit 独立开关）
        ├── bot-detector.js           # Bot/僵尸网络检测 + 挑战触发
        ├── geo-filter.js             # 地理围栏 + GeoIP 解析
        ├── brute-force.js            # 登录爆破防护（IP 挑战 + 账号锁定，执行点在 oauth21 登录链）
        └── scan-trap.js              # 404/403 扫描陷阱检测

src/app/firewall/                     # 【应用层】面板/配置/遥测（可卸载；卸载后核心以默认策略运行）
├── index.js                          # app 扩展层：prepareAppFirewall（配置+邮件通道）/ firewallAppPlugin（名单+落盘）/ initFirewall（测试用组合）
├── config.js                         # 应用清单（loader 扫描约定，10-apps.js 消费）
├── config/
│   └── config.js                     # 默认安全策略矩阵、IP 解析 API 列表、常量定义
├── dao/
│   └── dao.js                        # 策略持久化（JSON）、黑白名单管理、向 framework 注册配置读取器
├── data/
│   ├── store.js                      # 面板遥测：环形缓冲、统计汇总、磁盘持久化、WebSocket 广播（注册遥测 sink）
│   └── stats-redis.js                # 遥测跨实例汇聚（自访问层拆出，随消费者留在 app）
├── services/                         # 面板编排（monitor / metrics / challenge 校验端点）
├── cli/                              # 运维命令行
└── permission/                       # 面板权限

### 分层约定（有契约测试守卫）

依赖方向**必须单向**，越靠下越底层：

```

interface/ → config/ util/ → dao/ → engine/ → services/ cli/ data/ → index.js
零依赖 只能向下 数据访问 检测响应 应用编排 入口

```

三条硬约束，由 `src/__tests__/conventions/firewall-layering.test.js` 用 DFS 三色法守着：

1. **无循环依赖**。ESM 下循环依赖不报错，只让某些模块拿到半初始化的绑定。
   历史上出现过 `engine/index.js ↔ engine/pipeline.js`，以及更隐蔽的跨 3 文件环
   `util/shared.js → dao/dao.js → util/redis.js`。
2. **`interface/` 零内部依赖**。它是依赖倒置点：`dao` 把自己的 `getSecuritySettings`
   注册进来，`util/shared.js` 从它读取 —— 这样 util 不必 import dao，环自然断开，
   且**没有快照副本**（注册的是函数引用）。一旦它开始 import 别人，环立刻回来。
3. **`engine/` 不持有存储实现**，也不转发 dao/util 的符号。
   封禁能力请直接 `import from '../dao/block-manager.js'`。

> 配置读取器未注册时 `readSecuritySettings()` 会**抛错**，而不是返回 `undefined`。
> 这是刻意的：后者会让 `settings.defense` 变成 `TypeError`，把失败点推得离根因很远。

## 请求处理流程

```

客户端请求
│
▼
auth onRequest（先注册）
├── ALS 初始化 → request.state = {}
└── JWT 验证 → request.state.user

▼
@fastify/rateLimit onRequest（全局限流）
└── keyGenerator → 已登录用 user.id，未登录用 IP

▼
firewall onRequest（五层拦截管道） ← engine/pipeline.js
│
├── 第 1 层：连接追踪
│ └── trackConnection(+1) ← util/connection-tracker.js
│
├── 第 2 层：全局封禁
│ └── checkGlobalBlock() ← dao/block-manager.js
│
├── 第 3 层：挑战 Cookie
│ └── checkChallengeCookie() ← engine/pipeline.js
│
├── 第 4 层：Bot 检测
│ └── checkBotChallenge() ← engine/detectors/bot-detector.js
│
└── 第 5 层：地理围栏 + 端点限频
├── checkGeoReputation() ← engine/detectors/geo-filter.js
└── checkRateLimit() ← engine/detectors/rate-limiter.js
│
▼ (若触发挑战)
buildChallengePage() ← data/challenge-template.js
│
▼ (正常放行)
业务路由处理
│
▼
firewall onSend 钩子
├── trackConnection(-1) ← util/connection-tracker.js
└── pushRecord() ← data/store.js（记录 + 广播）
│
▼
firewall onResponse 钩子
└── checkNotFoundTrap() ← engine/detectors/scan-trap.js

```

## 模块职责

### config/ — 配置文件

| 文件         | 职责                                              | 关键导出                                                                            |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| config.js    | 生效默认值（core 打底 + app 补自己的键）、IP 解析源、常量路径 | `DEFAULT_SECURITY_SETTINGS`, `DEFAULT_IP_APIS`, `CHALLENGE_SECRET`, `FIREWALL_FILE` |
| panel.js     | **面板层**配置：展示偏好 / 节点定位（`showTrajectory`、`activeIpApi`） | `DEFAULT_PANEL_SETTINGS`（core 不含这两个键）                                        |

### data/ — 运行中数据

| 文件                  | 职责                                                   | 关键导出                                                                          |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| store.js              | 1000 条环形缓冲区、地域/路径/IP 统计、10 秒节流持久化  | `pushRecord`, `getRecentRecords`, `getSummary`, `clearAll`, `setBroadcastHandler` |
| challenge-template.js | 生成含 SHA-256 PoW 的挑战 HTML 页面                    | `buildChallengePage`                                                              |

### dao/ — 数据交互层

| 文件             | 职责                                            | 关键导出                                                                                                                                                                    |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dao.js           | JSON 文件持久化、名单同步到 Redis、节点自动定位 | `getSecuritySettings`, `updateSecuritySettings`, `getServerNode`, `refreshServerNodeAuto`, `addToBlacklist`, `removeFromBlacklist`, `addToWhitelist`, `removeFromWhitelist` |
| block-manager.js | 封禁/白名单查询（前端面板）+ API 操作封装       | `getActiveBlocks`, `getActiveWhitelist`, `setBlockFp`, `removeBlockFp`, `setWhitelist`, `removeWhitelist`, `setWhitelistFp`, `removeWhitelistFp`                            |

### util/ — 公共工具

| 文件                  | 职责                                                          | 关键导出                                                                               |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| shared.js             | 共享状态容器（内存 Map：连接数 / 请求时间戳 + 配置读取入口）  | `activeConnections`, `ipRequestTimestamps`, `getConfig`                                 |
| redis.js              | Redis 访问层：语义化读写 + 超时/降级（`eval` 调用点全在此，含门面导出） | `readAccessState`, `setBlock`, `consumeRateWindow`, `grantPass`, `takeChallenge` 等      |
| redis-keys.js         | 键命名与纯函数（零依赖）：`rel` / `HASH` / `full` / `dimOf` / `ID_BY_DIM` | `rel`, `HASH`, `full`, `dimOf`, `ID_BY_DIM`, `NS`, `KEY_SENTINEL`                       |
| redis-memory.js       | Redis 不可用时的内存降级实现（表结构 + 惰性清理 + 各域内存读写） | `mem`, `TABLES`, `sweepMemory`, `readAccessStateFromMemory`, `resetMemoryState` 等       |
| lua-scripts.js        | 全部 Lua 脚本字面量（纯字符串、零依赖，KEYS/ARGV 编号即契约） | `LUA_READ_ACCESS_STATE`, `LUA_WRITE_BLOCK`, `LUA_RATE_WINDOW`, `LUA_HAS_PASS` 等（9 个） |
| connection-tracker.js | 并发连接追踪 + 僵尸清理                                       | `trackConnection`, `getConnectionStats`, `cleanupStaleConnections`, `startCleanupTask`  |
| fingerprint.js        | 请求指纹生成                                                  | `generateFingerprint`                                                                   |

### engine/ — 防火墙核心逻辑

| 文件                      | 职责                                                              | 关键导出                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| pipeline.js               | onRequest 五层拦截管道 + onSend 日志记录                          | `shouldSkipDeepCheck`, `buildRequestContext`, `checkGlobalBlockPhase`, `checkChallengeCookie`, `runDetectionPipeline`, `recordLog` |
| detectors/rate-limiter.js | 计数交给 @fastify/rate-limit 的 createRateLimit；超限落封禁           | `trackRequestCount`, `checkRateLimit`                                                                                              |
| detectors/scan-trap.js    | 404/403 扫描行为检测                                              | `checkNotFoundTrap`                                                                                                                |
| detectors/brute-force.js  | 登录暴力破解防护                                                  | `checkLoginBruteForce`, `isAccountLocked`                                                                                          |
| detectors/geo-filter.js   | 地理围栏 + GeoIP 解析                                             | `checkGeoReputation`, `resolveGeoInfo`                                                                                             |
| detectors/bot-detector.js | Bot/僵尸网络检测                                                  | `checkBotChallenge`                                                                                                                |
| dao/block-manager.js      | IP/指纹/设备三维度封禁核心（checkGlobalBlock + CRUD，Redis 双写 + 内存缓存） | `setBlock`, `removeBlock`, `setBlockForSubject`, `checkGlobalBlock`                                                                |

## 外部依赖

- `@fastify/rate-limit` — 全局速率限制插件（onRequest 阶段，支持用户/IP 双维度）
- `geoip-lite` — IP 地理位置数据库
- `fastify-plugin` — Fastify 插件封装

## 配置校验（三处入口，**一份规则**）

配置有三条入口，规则只有一份：`framework/firewall/config/schema.js` 的 `DEFENSE_SPEC` /
`PANEL_SPEC`（工具在 `framework/config/field-spec.js`）。

| 入口 | 校验执行点 | 非法值的结果 |
| --- | --- | --- |
| `src/config/firewall_config.js`（部署静态覆盖） | 随启动加载，走下面 persisted 的同一条清洗 | 丢弃 → 回落 `defaults.js` 默认值 + 启动 warn |
| `data/firewall_config.json`（手改 / 面板落盘） | `config/persisted.js` → `sanitizeSecuritySettings()` | 同上（一次告警列全部被丢弃键） |
| 面板 `PATCH /monitor/settings` | ① 接口 schema（**由 spec 生成**，数值带 `minimum`）② `dao.updateSecuritySettings()` 写前清洗 | 明显非法 → 400；能归一化的（`"100"` → `100`、`"false"` → `false`）→ 归一化后生效 |

三条硬规则：

1. **规则只写在 spec 里**。不要在检测器里写 `settings.x || 默认值`、也不要在 API schema 里手写
   `defense` 字段 —— 那会变成第二份规则，改了这处忘那处（历史上 `enableBotChallenge` 就只在
   API schema 里存在，后端根本没有这个键）。
2. **新增一个配置项要动三处**：`defaults.js`（值）+ `schema.js` 的 `DEFENSE_SPEC`（类型/上下界）
   + 读取点。`__tests__/firewall-config-schema.test.js` 会双向比对键集合，漏一处就红。
3. **写入期会归位形状**：`{ maxConn: 100 }` 这种忘了套 `defense` 的载荷会被收回 `defense` 下
   并打 warn。历史上前端有一处这么提交，后端深合并后写成顶层死键、重启即丢。

## 开关一览（总开关 + 五道闸门）

面板「Firewall」标签页把这套开关画成「总开关 + 每道闸门一个 checkbox」，全部落在
`securitySettings.defense` 下（因此也走同一份 spec 校验、可被 `src/config` 与 JSON 覆盖）。

| 层 | 配置键 | 关掉之后 |
| --- | --- | --- |
| 总开关 | `enableFirewall` | **整套防护旁路**：不计数、不查封禁、不下挑战、不拦请求（排障用，生产别留 false） |
| 闸门① 连接数 | `enableConnLimit` | 不再统计/限制单 IP 并发连接 |
| 闸门② 封禁 | `enableGlobalBlock` | 不再执行黑名单与已封禁态拦截（挑战态也属封禁键，一并失效） |
| 闸门③ 挑战 | `enableChallenge` | 挑战态请求直接放行、不再下发挑战页；**Bot 检测一并跳过**（它只会写挑战态） |
| 闸门④ Bot | `enableBotChallenge` | `checkBotChallenge()` 直接返回未命中（三档阈值保留，重开即恢复） |
| 闸门⑤ 地理围栏 | `enableGeoFilter` | 不再按 GeoIP 做 IDC / 境外收紧 |
| 旁路 全局限流 | `enableRateLimit` | 不注册全局 `@fastify/rate-limit` |
| 旁路 扫描陷阱 | `enableAutoBlacklist` | 404/403 不再累计、不再自动封禁 |

语义边界（改代码前先确认）：

- **关闸门 = 这道闸不拦**，其余闸门照常；每道闸的关闭点都在实现处留了注释，便于排障时确认
  "是关掉的"而不是"没生效"。
- `enableFirewall=false` 时 `onSend` 的 `-1` 也跳过 —— 没有 `+1` 就不能 `-1`，否则会去减
  别的请求留下的计数。
- 挑战闸门关闭时 Bot 检测无法处置（它唯一的处置手段是写挑战态），因此一并跳过，
  避免白烧 CPU 并往库里写没人读的状态。

## 数据持久化

> ⚠️ 下表路径均相对 **`src/`**：`app/firewall/config/config.js` 与 `data/store.js` 用的是
> `path.resolve(__dirname, '../../../data/...')`，从各自文件上溯三层都落在 `src/`——
> **不是仓库根**。仓库根的 `data/` 是 7 月遗留的死文件（零代码引用），已于 2026-09-19 删除。
> ⚠️ 第三行已迁移：守卫配置现在存**数据库** `guard_configs` 表，`data/guard_config.json` 已废弃。

| 文件                        | 内容                                          | 更新频率        |
| --------------------------- | --------------------------------------------- | --------------- |
| `data/firewall_config.json` | 服务器节点信息 + 安全策略配置                 | 防抖 1 秒       |
| `data/traffic_stats.json`   | 流量记录 + 统计数据                           | 节流 10 秒      |
| **（已迁 DB）** `guard_configs` 表 | 3 级 Guard 配置（由 `src/api/guard-config.js` 管理） | 启动时 + 变更时 |
```
