# Firewall 模块架构

## 目录结构

```
src/firewall/
├── index.js                          # Fastify 插件入口：注册限流、同步名单、挂载生命周期钩子
│
├── config/                           # 配置文件
│   └── config.js                     # 默认安全策略矩阵、IP 解析 API 列表、常量定义
│
├── data/                             # 运行中数据
│   ├── store.js                      # 内存环形缓冲区（10000 条）、统计汇总、磁盘持久化、WebSocket 广播
│   └── challenge-template.js         # 人机挑战页面 HTML 模板（含 HMAC 签名 + 浏览器指纹采集）
│
├── dao/                              # 数据交互层（firewall ↔ API/前端）
│   ├── dao.js                        # 配置持久化（JSON 文件）、黑白名单管理、节点自动定位
│   └── block-manager.js              # 封禁/白名单查询接口 + API 操作封装
│
├── util/                             # 公共工具函数
│   ├── shared.js                     # 共享状态（activeConnections Map、getConfig 回调、Redis Key 常量）
│   ├── connection-tracker.js         # 并发连接追踪 + 僵尸清理定时任务
│   └── fingerprint.js                # 请求指纹生成（IP+UA+Lang+Enc → SHA256 前 16 位）
│
└── engine/                           # 防火墙核心逻辑
    ├── index.js                      # barrel 导出：统一暴露引擎子模块
    ├── pipeline.js                   # onRequest 五层拦截管道 + 日志记录
    │
    ├── detectors/                    # 检测器模块
    │   ├── rate-limiter.js           # 滑窗限频（Redis sorted-set + 内存降级）
    │   ├── scan-trap.js              # 404/403 扫描陷阱检测
    │   ├── brute-force.js            # 登录暴力破解防护
    │   ├── geo-filter.js             # 地理围栏 + GeoIP 解析
    │   └── bot-detector.js           # Bot/僵尸网络检测 + 挑战触发
    │
    └── dao/                          # 引擎内部数据操作
        └── block-manager.js          # IP/指纹封禁核心（checkGlobalBlock + CRUD）
```

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
  │   └── trackConnection(+1)              ← util/connection-tracker.js
  │
  ├── 第 2 层：全局封禁
  │   └── checkGlobalBlock()               ← engine/dao/block-manager.js
  │
  ├── 第 3 层：挑战 Cookie
  │   └── checkChallengeCookie()           ← engine/pipeline.js
  │
  ├── 第 4 层：Bot 检测
  │   └── checkBotChallenge()              ← engine/detectors/bot-detector.js
  │
  └── 第 5 层：地理围栏 + 端点限频
      ├── checkGeoReputation()             ← engine/detectors/geo-filter.js
      └── checkRateLimit()                 ← engine/detectors/rate-limiter.js
  │
  ▼ (若触发挑战)
buildChallengePage()                       ← data/challenge-template.js
  │
  ▼ (正常放行)
业务路由处理
  │
  ▼
firewall onSend 钩子
  ├── trackConnection(-1)                  ← util/connection-tracker.js
  └── pushRecord()                         ← data/store.js（记录 + 广播）
  │
  ▼
firewall onResponse 钩子
  └── checkNotFoundTrap()                  ← engine/detectors/scan-trap.js
```

## 模块职责

### config/ — 配置文件

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| config.js | 默认安全策略矩阵、IP 解析源、常量路径 | `DEFAULT_SECURITY_SETTINGS`, `DEFAULT_IP_APIS`, `CHALLENGE_SECRET`, `FIREWALL_FILE` |

### data/ — 运行中数据

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| store.js | 10000 条环形缓冲区、地域/路径/IP 统计、10 秒节流持久化 | `pushRecord`, `getRecentRecords`, `getSummary`, `clearAll`, `setBroadcastHandler` |
| challenge-template.js | 生成含 HMAC 签名的挑战 HTML 页面 | `buildChallengePage` |

### dao/ — 数据交互层

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| dao.js | JSON 文件持久化、名单同步到 Redis、节点自动定位 | `getSecuritySettings`, `updateSecuritySettings`, `getServerNode`, `refreshServerNodeAuto`, `addToBlacklist`, `removeFromBlacklist`, `addToWhitelist`, `removeFromWhitelist` |
| block-manager.js | 封禁/白名单查询（前端面板）+ API 操作封装 | `getActiveBlocks`, `getActiveWhitelist`, `setBlockFp`, `removeBlockFp`, `setWhitelist`, `removeWhitelist`, `setWhitelistFp`, `removeWhitelistFp` |

### util/ — 公共工具

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| shared.js | 共享状态容器（内存 Map、Redis Key、Lua 脚本、配置缓存） | `activeConnections`, `getConfig`, `KEY`, `memoryBlocks`, `memoryWhitelist` 等 |
| connection-tracker.js | 并发连接追踪 + 僵尸清理 | `trackConnection`, `getConnectionStats`, `cleanupStaleConnections`, `startCleanupTask` |
| fingerprint.js | 请求指纹生成 | `generateFingerprint` |

### engine/ — 防火墙核心逻辑

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| pipeline.js | onRequest 五层拦截管道 + onSend 日志记录 | `shouldSkipDeepCheck`, `buildRequestContext`, `checkGlobalBlockPhase`, `checkChallengeCookie`, `runDetectionPipeline`, `recordLog` |
| detectors/rate-limiter.js | Redis 滑窗限频，内存降级 | `trackRequestCount`, `checkRateLimit` |
| detectors/scan-trap.js | 404/403 扫描行为检测 | `checkNotFoundTrap` |
| detectors/brute-force.js | 登录暴力破解防护 | `checkLoginBruteForce`, `isAccountLocked` |
| detectors/geo-filter.js | 地理围栏 + GeoIP 解析 | `checkGeoReputation`, `resolveGeoInfo` |
| detectors/bot-detector.js | Bot/僵尸网络检测 | `checkBotChallenge` |
| dao/block-manager.js | IP/指纹封禁核心（checkGlobalBlock + CRUD，Redis 双写 + 内存缓存） | `setBlock`, `removeBlock`, `checkGlobalBlock` |

## 外部依赖

- `@fastify/rate-limit` — 全局速率限制插件（onRequest 阶段，支持用户/IP 双维度）
- `geoip-lite` — IP 地理位置数据库
- `fastify-plugin` — Fastify 插件封装

## 数据持久化

| 文件 | 内容 | 更新频率 |
|------|------|----------|
| `data/firewall_config.json` | 服务器节点信息 + 安全策略配置 | 防抖 1 秒 |
| `data/traffic_stats.json` | 流量记录 + 统计数据 | 节流 10 秒 |
| `data/guard_config.json` | 3 级 Guard 配置（由 `src/api/guard.js` 管理） | 启动时 + 变更时 |
