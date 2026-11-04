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
