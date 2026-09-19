# 架构评估报告：扩展性与稳定性 {#architecture-review}

> 评估日期：2026-09-19
> 评估对象：`nodeServers`（模块化单体 / Fastify v5 + Sequelize v6 + Redis v5）
> 评估方式：全仓静态取证（290 个生产 JS 文件 / 41,405 行 / 173 条路由 / 32 个模型）
> 结论口径：每条结论都附**证据路径**，可复核；不含"建议引入某某技术"式的无据推测

---

## 一、总体结论

**这套系统的分层设计本身是健康的，不应该推倒重来。**

真正阻碍扩展性和稳定性的不是"分层不对"，而是三类**可定点修复**的问题：

| 类别 | 本质 | 影响面 |
| --- | --- | --- |
| **A. 单实例假定被硬编码进三个子系统** | 防火墙遥测、定时任务、运行时配置各自持有进程内状态或写本地文件 | 直接阻断横向扩展 |
| **B. 文档 / 代码 / 配置三者不一致** | 文档承诺的能力（多服务器、Docker、健康探针分级）在代码里**完全不存在** | 让扩容决策建立在错误前提上 |
| **C. 启动期失败语义不明确** | 有的子系统静默降级继续跑，有的 fail-fast 退出，无统一判据 | 故障时表现为"服务在跑但功能缺失" |

**一句话结论**：先做"让单实例变得可观测、可运维"，再做"把有状态的部分外置"。
在 A 类问题解决前，**加机器不但不会提升容量，还会让防火墙统计、限流阈值、定时任务行为全部错乱**。

---

## 二、现状架构（实测）

### 2.1 分层与依赖方向

```
index.js                    进程入口：dotenv → createApp → listen → 优雅关闭
  └─ src/app.js             组合根：注册 Fastify 插件链 + 全局错误处理 + 启动 loader 引擎
       └─ framework/loader  引擎：按文件名数字前缀顺序执行 registry/ 下的加载器
            ├─ 00-globals   reply.result 装饰器（success/fail/unauth/forbidden）
            ├─ 01-monitor   监控
            ├─ 02-redis     Redis 连接 + 健康监控（失败注入 null）
            ├─ 03-db        Sequelize 连接 + onClose 优雅退出
            ├─ 04-auth      Session 验证 + ALS 初始化
            ├─ 05-firewall  五层拦截管道 + @fastify/rate-limit 注册
            ├─ 06-models    扫描 src/models/ 注册为 app.db.<ns>.<Model>
            ├─ 07-keys      RSA 密钥
            ├─ 08-api       扫描 src/api/ 注册全部路由
            ├─ 09-notice    SMTP 种子数据
            └─ 10-apps      扫描 src/app/ 加载应用配置与权限
```

三个层次（`docs/core/architecture.md` 已定义，代码基本遵守）：

| 层 | 目录 | 职责 | 实测规模 |
| --- | --- | --- | --- |
| 系统层 | `src/framework/` | 基础设施（db / redis / log / auth / loader / scheduler / verify / cli / keys） | 12 个子模块 |
| 应用层 | `src/app/` | 业务域（firewall / oauth21 / user / admin / notice / guard / posecraft） | 7 个应用 |
| 路由层 | `src/api/` | 按域分目录，`registerSecureRoute()` 声明式注册 | 173 条路由 |

### 2.2 请求处理链路（实测于 `src/app.js` + `05-firewall.js` + `guard.js`）

```
onRequest  ① @fastify/cookie      解析 cookie
onRequest  ② auth                 Session 验证（sid → Redis → request.state.user）
onRequest  ③ @fastify/rate-limit  全局限流（store = Redis，故障降级内存）
onRequest  ④ firewall 第一层       连接数 + 黑/白名单 + 挑战态
onRequest  ⑤ firewall 第二层       挑战 cookie 校验
onRequest  ⑥ firewall 第三层       深度检测（Bot / 地理信誉 / 端点限频）
preHandler    guard               三级级联守卫（System → Group → API）
preHandler    verifySignature     H5 签名（仅 OAuth21）
handler       业务路由
onSend        记日志 + 连接数 -1
onResponse    登录结果观测（暴力破解）+ 404/403 扫描陷阱
```

### 2.3 已经做对、必须保护的部分

这些是资产，重构时**不要动**：

| 资产 | 证据 | 价值 |
| --- | --- | --- |
| **会话层完全 Redis 化** | `framework/auth/session-store.js` 7 个 `getStore()` 命名空间（session / refresh / user_refresh / refresh_rotated / session_family / user_sessions / auth:perm），**无进程内 Map 缓存** | 认证层**已具备横向扩展能力** |
| **规范的降级链** | `redis/get-store.js` 按 `isRedisConfigured()` 自动选 Redis / MapStore；`resilient-store.js` 给 `@fastify/rate-limit` 提供 Redis store + 内存兜底 | 单点故障时不整体崩塌 |
| **全局限流真的走 Redis** | `firewall/engine/detectors/first-ratelimit.js:31` 传 `store: createBoundStore(app, …)` | 多实例下阈值语义**正确**（未降级时） |
| **分层有守卫、带反例** | `conventions/firewall-layering.test.js`（12 项，DFS 三色法查环 + 自带反例） | 防止依赖倒挂回潮 |
| **导出位置统一契约** | `conventions/export-placement.test.js` + ESLint `no-restricted-syntax` | 可预测的模块边界 |
| **配置写入是原子的** | `app/firewall/dao/dao.js:89` 先写 tmp 再 rename | 不会写出半个 JSON |
| **优雅关闭有超时兜底** | `index.js:70` — 30s 后强制退出 | 防 onClose 挂死 |
| **测试有效性已有守卫** | `conventions/test-effectiveness.test.js` | 防虚假覆盖回潮 |

---

## 三、风险清单

### 🔴 A 类：阻断横向扩展（必须先修）

#### A-1 防火墙遥测状态全部在进程内，且写共享文件

**证据**：

| 状态 | 位置 | 载体 |
| --- | --- | --- |
| 访问记录环形缓冲（1000 条） | `app/firewall/data/store.js:62` | 模块级 `RingBuffer` |
| 累计请求数 / 拦截数 | `store.js:63-64` | 模块级 `let` |
| 地域 / 路径 / IP 统计 | `store.js:66-68` | 模块级 `Map` |
| 每 IP 60 秒请求时间戳 | `app/firewall/util/shared.js:31` | 模块级 `Map` |
| 每 IP 活跃连接数 | `shared.js:28` | 模块级 `Map` |
| WebSocket 广播 | `store.js:70` | 模块级 handler |

**最严重的一点**：`store.js:104-126` 的 `persistData()` 每 10 秒把上述内存状态**写回同一个文件**
`src/data/traffic_stats.json`（实测 194 KB）。

> **多实例下的后果**：N 个进程各持一份内存视图，且**互相覆写同一个文件**。
> 最终文件里是谁的数据取决于最后一次写入的时序 —— 统计面板的数字会随机跳变，
> 并且 `readFile → JSON.parse` 遇到另一个进程写到一半的情况会**整块数据丢失**
> （虽然有 tmp+rename 保护的只有 `dao.js`，`store.js:119` 是直接 `writeFile`）。

**处置**：
1. 统计聚合状态改存 Redis（Hash + `HINCRBY`），或明确宣布"统计仅本实例视角"并在面板标注。
2. **优先**：`store.js:119` 的直接写入改为 tmp+rename（与 `dao.js:89` 对齐）——这是单实例下也会踩的隐患。
3. 长期：把遥测与业务解耦，遥测走独立的聚合通道（见 §4 阶段 2）。

**验收**：起两个进程，打流量，确认统计不互相覆写；或确认单实例下 rename 原子性。

**实际实现**（`app/firewall/data/store.js`，2026-09-19）：

1. 写入改为 `tmp + rename`，临时文件名带 **pid**（`${DATA_FILE}.${process.pid}.tmp`）——
   多进程同时写时各自的 tmp 不互相踩；否则 A 写完 tmp、B 又覆写同一个 tmp，
   A 再 rename 就会把 B 的半截内容提升成正式文件。
2. 顺带补上**优雅关闭落盘**（`flushPersist`，挂在 firewall 的 `onClose`）：
   遥测只在内存里，滚动发布时不落盘就会丢掉最近的统计。
   带"有待写变更才写"的前置判断 —— 否则每次空跑启动都会把磁盘上的统计算成全零
   （该文件是被 git 跟踪的）。
3. `DATA_FILE` 支持 `FW_TRAFFIC_STATS_FILE` 覆盖：**测试必须覆盖它**，因为默认路径
   是被 git 跟踪的 `src/data/traffic_stats.json`，测试直写会在仓库里留下脏改动。

**验收（已实测，见 `src/__tests__/firewall-telemetry.test.js`）**：用**文件 inode 是否变化**
判定是否走了 rename 替换（rename → 新 inode；原地覆写 → inode 不变）。
**毒丸复验**：把实现改回直接 `writeFile` 后该断言立刻变红 —— 证明它不是
"写完能读回来就算过"的弱断言。

---

#### A-2 定时任务无分布式锁

**证据**：`framework/scheduler/index.js:93-103`

```js
const run = () => { taskFactory.run(app, taskConfig).catch(...) };
run();                                    // 启动立即跑一次
const timer = setInterval(run, intervalMs);
```

调度器用 `setInterval` 本地计时，**无 leader 选举、无分布式锁、无幂等保护**。

> **多实例下的后果**：
> ① 每个实例启动时都立刻执行一次 `session-cleanup` → N 倍并发删除；
> ② 每个周期都重复执行 → 清理量与实例数成正比；
> ③ 若未来加入"发通知""对账"类任务，会出现 N 份重复副作用。
> 这类问题**不会报错**，只会表现为"数据库负载莫名奇妙地高"。

**处置**（三选一，按成本排序）：
1. **最小**：加 Redis 分布式锁（`SET key val NX PX`），抢到锁才执行 —— 复用现有 `redis/lock-store.js`（该模块已存在，179 行）。
2. **中**：拆成独立的单实例 worker 进程（`SERVER_ROLE=worker`），应用进程完全不起调度器。
3. **最稳**：交给外部调度系统（cron / K8s CronJob）调用一个受保护的管理端点。

**验收**：起两个实例，观察 `session-cleanup` 每个周期只执行一次（日志计数 = 1）。

---

#### A-3 健康探针无分级语义

**证据**：`src/api/system/v1/health.js:26-32`

```js
handler: async (request, reply) => {
  return reply.result.success('ok', {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    redis: fastify.redisHealthy ? 'connected' : 'disconnected'
  });
}
```

**问题**：无论 DB 断开、Redis 断开，这个端点**永远返回 200 `ok`**。它把 redis 状态放在 body 里，但状态码不变。

> **后果**：编排系统（K8s / 负载均衡 / PM2）无法区分
> "进程活着但已无法服务"和"完全健康"。
> 一个 DB 连接池枯竭的实例会**继续留在负载均衡池里接收流量**，
> 表现为用户看到零散 500，而健康检查一片绿。
>
> 另注：`docs/roadmap/index.md:37-46` 规划的 `/health/live` 与 `/health/ready` 端点**均不存在**
> （全仓 grep `health/live|health/ready` 结果为空）。

**处置**：拆两个端点。
- `GET /health/live` —— 只反映进程存活，永远 200（用于 restart 判据）。
- `GET /health/ready` —— 检查 DB（`sequelize.authenticate()`）与 Redis 连通性，
  **任一关键依赖不可用即返回 503**（用于摘流判据）。

**实际实现**（`src/api/system/v1/health.js`，2026-09-19）—— 有三处需要显式决定的细节：

1. **真实路径带 `/v1` 前缀**：`system.json` 的 prefix 为空、group prefix 为 `/v1`
   （`registerGroupMetadata`）→ 端点是 `/v1/health/live`，不是 `/health/live`。
   本文档其它地方的 `/health` 均为简写。
2. **只有"已配置"的依赖参与判定**：`REDIS_ENABLED!=true` 时访问层走进程内 MapStore 降级，
   这是**合法模式而非故障** —— 判成 not ready 会让本来能服务的实例被摘流。
   未配置的依赖标记为 `skipped`，不算失败。
3. **探测必须有超时（3s）**：DB 连接池枯竭时 `sequelize.authenticate()` 会一直等到
   `pool.acquire` 超时（默认 30s），而编排系统探针超时通常只有 1~5s ——
   探针会被自身超时掐断，表现为"探针不稳定"而不是"依赖不可用"，根因被掩盖。

**兼容端点 `/v1/health` 保持原契约（恒 200）**：改成随依赖返回 503 等于悄悄改掉既有契约，
现有监控可能因此开始摘实例。就绪判定请显式用 `/health/ready`。

> **⚠️ 实施中发现的新风险（原报告未识别）：健康探针会被自己的 Bot 检测拦下。**
> `shouldSkipDeepCheck` 原本只豁免挑战验证接口与静态资源，探针走完整深度检测。
> 探针通常**不带 User-Agent**（部分 Docker HEALTHCHECK、自研监控），会命中
> `checkBotChallenge` 的 `requestCount > botChallengeNoUaLimit`（默认 10）分支 ——
> 按 60s 窗口、5s 一次的常规探测频率即 12 次 → **返回挑战页 HTML 且状态码 200**。
> 于是探针"看起来通过"却完全失效；若改判成 429，编排系统又会把健康实例摘掉，形成自伤。
> 已修：`pipeline.js` 新增 `PROBE_PATHS` 豁免名单（全局封禁 / 连接数限制阶段照常执行，
> 只跳过 Bot / 地理 / 端点限频这些启发式判定）。

**验收（已实测，见 `src/__tests__/api/health.test.js`）**：
Redis 配成"已配置但不可用"时 `/health/ready` 返回 503 且 `/health/live` 仍 200；
依赖恢复后回到 200；未配置依赖时 `skipped` 不判失败；带查询串不影响判定；
反例（普通业务路径、`/v1/healthz`、`/v1/health/ready-extra`）不被豁免。

---

### 🟡 B 类：文档与代码不一致（会误导扩容决策）

> 这一类不是代码 bug，但**对"我们要不要扩容、怎么扩容"的决策是直接有害的** ——
> 决策者会以为某些能力已经存在。

#### B-1 文档描述的多服务器架构**完全未实现**

**证据**：`docs/deployment/multi-server.md` 详述了 `SERVER_ROLE` + `MODULE_*` 开关方案（含主/子服务器分工图、Token 验签流程、用户状态同步 Webhook 设计）。

实测全仓引用数：

| 环境变量（文档承诺） | 代码引用 | `.env.example` |
| --- | --- | --- |
| `SERVER_ROLE` | **0** | 无 |
| `MODULE_OAUTH21` | **0** | 无 |
| `MODULE_USER` | **0** | 无 |
| `MODULE_IAM` | **0** | 无 |
| `MODULE_NOTICE` | **0** | 无 |
| `MODULE_SESSION` | **0** | 无 |
| `AUTH_SERVER_URL` | **0** | 无 |
| `AUTH_SERVER_PUBLIC_KEY` | **0** | 无 |

**结论**：该文档是一项**设计方案**，但**没有标注实现状态**。

> 📌 2026-09-19 复核实测更正：三份部署文档（`multi-server.md` / `docker.md` / `cicd.md`）
> **其实都在 vitepress 导航里**（`docs/.vitepress/config.ts:77-79`）—— 此前"未出现在任何导航索引里"
> 的判断有误。真正的问题是：**打开后看不出哪些内容是设计稿**。

**处置**：✅ **已完成 2026-09-19** —— 三份文档顶部均加实现状态块（`📐 设计稿 · 未实现` /
`示例配置 · 未落地`），逐条写明与现状的差距；未移动目录，保留既有链接可用。

#### B-2 部署制品声明为"已完成"，但文件不存在

**证据**：

| 声明 | 出处 | 实测 |
| --- | --- | --- |
| `Dockerfile` + `docker-compose.yml` "已就绪" | `docs/roadmap/index.md:57-60` | **两个文件都不存在** |
| `docs/deployment/docker.md` 内含完整 Dockerfile / compose / .dockerignore | 该文档 93 行 | 文件均不存在 |
| `.github/workflows/ci.yml` | `docs/deployment/cicd.md:6` | **`.github/` 目录不存在** |
| Pre-commit Hooks | `roadmap:61` | ✅ 属实（`.husky/pre-commit` 存在，husky ^9.1.7 + lint-staged ^17.0.7 已声明） |

**结论**：3 项部署相关声明中 2 项虚假。**没有 Dockerfile 意味着"部署形态"本身未被固化** ——
扩容方案无从谈起。

**处置**：要么补齐制品，要么把路线图的完成标记改回未完成。

> ✅ **已完成 2026-09-19（仅标注部分）**：`docs/roadmap/index.md` 的 "Docker 化 ✅ 已完成"
> 已改为 `📐 设计稿 · 未实现`，`docs/deployment/{docker,cicd}.md` 顶部加了"示例配置 · 未落地"说明。
> **制品补齐本身仍待做**（阶段 1 的 1.4）—— 它是多实例部署的前置条件，因为可复现的构建产物
> 正是扩容方案的载体。

#### B-3 环境变量面 104 个，无集中校验

**证据**：代码中 `process.env.*` 引用去重后共 **104 个**键；`.env` 实际配置 63 个。
配置的校验逻辑散落在各处（如 `app.js:93` 的 `validateSecrets`、`redis/plugin.js` 的端口/DB 号校验），
**无统一 schema**。

**后果**：
- 缺失/拼错一个键，往往表现为运行期某个功能静默不生效（而非启动失败）。
- 没有任何清单能回答"生产必须配哪些"。

**处置**：引入一处集中式配置模块（可用 zod / ajv，项目已有 ajv 依赖链），
启动时一次性校验并**输出来源与缺省值**。注意：`config-validation.test.js` 目前在
`KNOWN_INEFFECTIVE_TESTS`（虚假覆盖）清单里 —— 也就是说**配置校验从未被真正测试过**。

---

### 🟡 C 类：稳定性隐患

#### C-1 loader 静默吞掉子系统加载失败

**证据**：`framework/loader/engine.js:70-84`

```js
} catch (err) {
  if (err.code === 'DUPLICATE_ROUTE') throw err;   // 唯一的关键错误
  loadErrors.push({ file, message: err.message }); // 其余全部收集
}
// ...
log.warn(`⚠️ [Loader] 以下加载项出错（非致命）：`);
```

**问题**：只有 `DUPLICATE_ROUTE` 会终止启动。**其余任何加载失败都只打一条 warn，服务照常启动**。

> **后果**：一个子系统（比如密钥加载 `07-keys`、或某个应用 `10-apps`）加载失败时，
> 服务"启动成功"，但相关路由/能力缺失。运维看到的是"服务正常"，
> 用户看到的是"某功能 404/500"。**失败点离根因很远**，这正是排查成本最高的一类故障。

**处置**：区分"关键加载器"与"可选加载器"：
- 关键（redis / db / auth / api / keys）失败 → **终止启动**（fail-fast）；
- 可选（notice 种子、apps 权限）失败 → 保持 warn，但必须在健康探针里暴露出来
  （`/health/ready` 返回 degraded + 明细）。

**验收**：故意让 `07-keys` 抛错，服务应拒绝启动。

#### C-2 并发连接限制在多实例下语义失真，且泄漏计数只在 2× 阈值清理

**证据**：`app/firewall/util/connection-tracker.js`

- `activeConnections` 是**进程内 Map**（`shared.js:28`）→ N 实例下每 IP 实际可用连接数变成 `maxConn × N`。
- `cleanupStaleConnections()`（`:77-86`）只删除 `count > limit * 2` 的记录，
  且清理周期是 **5 分钟**。
  → 若某 IP 因异常路径（未走到 `onSend`）泄漏了少量计数（如 1~2），
  **永远不会被清理**，该 IP 会持续被额外扣减配额。

**处置**：
1. 计数器改 Redis（`INCR` / `DECR` + TTL），或在文档中明确"连接数限制是**单实例**语义"。
2. 清理逻辑改为"按 IP 最后活跃时间清理"，而非"按计数阈值清理"。

#### C-3 未配置连接超时；WebSocket 使优雅停机拖到 30s 兜底

**证据**：全仓 grep `forceCloseConnections|keepAliveTimeout|requestTimeout|connectionTimeout` 在 `src/` 下**无匹配**。
`index.js:45` 的 `SHUTDOWN_TIMEOUT = 30_000` 是唯一的兜底。

**问题**：`@fastify/websocket` 已注册（`app.js:297`），且存在 WebSocket 路由
（`api/guard.js:538` 的 `registerSecureWebSocket`）。
Fastify 在 `close()` 时**默认等待所有活跃连接关闭**，而 WebSocket 是长连接。

> **后果**：滚动发布/重启时，`app.close()` 会一直等到 30s 兜底触发
> `process.exit(1)`。对外表现为**每次发布都有 30 秒服务空白**，
> 且退出码是 1（失败），编排系统可能判定为异常退出。
> 另外未配置 `keepAliveTimeout` / `requestTimeout` 意味着慢连接可以长期占用资源。

**处置**（⚠️ 本节初稿给的方案经实测**部分不成立**，以下是更正后的结论）：

初稿建议"加 `forceCloseConnections: true` + 主动广播关闭帧"即可。实测（Node 24 / Fastify 5.8.5 /
`@fastify/websocket` 11.2.0，2026-09-19）发现**三个与直觉相反的事实**：

1. **`forceCloseConnections: true` 对已 upgrade 的连接完全无效。**
   `server.closeAllConnections()` 与 `closeIdleConnections()` 调用后
   `server._connections` 仍为 1、`server.close()` 回调不触发；只有真正 `socket.destroy()`
   才能解卡。（它对**普通 keep-alive 连接**有效 —— 可把 close 从"等超时"变成 1ms 返回，仍应开启。）
2. **`connectionTimeout` 是个空旋钮。** 实测传入后 `server.connectionTimeout` 为
   `undefined`、socket 上也没挂计时器，建连后不发任何字节 10s 也不会被断开。
   设置它只会制造"以为有保护"的假象，故**不设**。
3. **`headersTimeout` 会被 Fastify 静默丢弃。** 传入 12345 不报错，但
   `app.server.headersTimeout` 仍是 Node 默认 60000 —— Fastify 的选项校验对 schema 外的键
   是 `removeAdditional` 语义。慢 header 由 Node 内建的 60s 兜底，无需也无法从此处配置。
4. **"每次发布都有 30 秒空白"这个结论被高估了。** 对**行为规范的客户端**，默认实现
   `client.close()` 后 `app.close()` **约 5ms 返回**，并不会等到 30s。
   真正会挂住的是**半开连接**（移动端断网、浏览器崩溃、NAT 超时后服务端仍以为连接活着）——
   此时 `app.close()` 超过 5s 不返回，最终被 30s 兜底强杀、退出码 1。

**实际实现**（`src/framework/websocket/preclose.js` + `src/app.js`）：

```js
// 1) 连接层：显式声明 + 可用环境变量调整
Fastify({
  forceCloseConnections: true,          // 关掉普通 keep-alive 连接的等待（实测 1ms）
  keepAliveTimeout: HTTP_KEEP_ALIVE_TIMEOUT_MS, // 默认 72000，与 Fastify 内置默认一致
  requestTimeout: HTTP_REQUEST_TIMEOUT_MS // 默认 300000：Fastify 默认关闭它，
                                            // 而防火墙 6 个检测器里没有慢连接检测，
                                            // 这是慢速发 body 的唯一防线
});

// 2) WebSocket：自定义 preClose —— 广播关闭帧(1001) → 宽限期后 terminate 残留连接
await app.register(websocket, { preClose: createWsPreClose(WS_SHUTDOWN_GRACE_MS) });
```

**验收（已实测，见 `src/__tests__/websocket.test.js`）**：
- 规范客户端：收到 1001 关闭帧后立即断开，整体耗时约 5ms；
- 半开连接：宽限期（默认 1s，可配）后被强制断开，`app.close()` 按期返回；
- **反例对照**：同一场景下不挂载 `preClose`，`close()` 1.2s 内不返回 —— 证明上述修复确实起作用，
  而不是"本来就不会挂住"。

#### C-4 Redis 降级后限流阈值被放大 N 倍

**证据**：`resilient-store.js` 在 Redis 不可用时切到进程内 `memoryFallback` Map。

**问题**：这是**正确的设计取舍**（宁可不限流也不要整体不可用），但**语义会变**：
Redis 挂掉时，全局限流从"集群 300/分钟"变成"每实例 300/分钟"。

**处置**：不是 bug，但需要**被观测到**。
建议在 `/health/ready` 与监控里显式暴露 `redisHealthy`，
并在 Redis 降级期间**自动收紧单实例阈值**（如 `max / 预期实例数`），
或至少在日志中明确标注"当前为单实例限流语义"。

#### C-5 guard 配置的多实例一致性

**证据**：`api/guard-config.js` 是**模块级单例**（`let configs = {}`），
启动时从 DB 加载，运行期改配置走"防抖 + 异步写 DB"。

**问题**：
- A 实例改了守卫配置 → 只写 DB + 更新**自己的**内存；
- B 实例的内存**不会更新**，直到它重启。
- `mergeDbConfig` 只在启动时跑一次。

> **后果**：多实例下"运维在面板上关掉某个路由的鉴权"这类操作，
> **只在部分实例生效**。这在安全语义上是危险的（同一个路由，
> 用户请求打到不同实例得到不同的鉴权结果）。

**处置**：
1. **短期**：加版本号轮询（DB 里已有 `version` 字段）+ 每实例定期比对，
   发现版本变化就重载。
2. **中期**：把守卫配置的**运行时读取**改走 Redis（`getStore('guard')`），
   DB 只做持久化。这样所有实例天然一致。
3. 配合已有的 `scripts/sync-guard-config.js`（剥离运行时字段覆盖）。

---

### 🟢 D 类：架构卫生问题

#### D-1 应用层存在双向依赖：`oauth21` ⇄ `user`

**证据**：

| 方向 | 文件:行 | 内容 |
| --- | --- | --- |
| oauth21 → user | `app/oauth21/services/login.service.js:29` | `import deactivationService from '../../user/services/deactivation.service.js'` |
| user → oauth21 | `app/user/dao/user.js:14` | `import { decrypt } from '../../oauth21/crypto/encryption.js'` |

**问题**：这违反 `05-firewall.js:1-24` 与 `pipeline.js:337-343` 反复强调的
"**app 之间不互相依赖**"约定。形成真实的双向边，两者无法独立演进，
也无法按 `MODULE_*` 开关单独裁剪（这正是 B-1 多服务器方案的前置条件）。

**修法**（两处都不难）：
- `login.service.js` 需要的"判断用户是否注销" → 下沉为 `framework/auth` 的能力，
  或改为查询 `db.user.UserDeactivation` 模型（而非 import user 的 service）。
- `user/dao/user.js` 需要的 `decrypt` → 下沉到 `framework/keys`（该模块已存在）
  或 `shared/utils`。加解密是通用能力，本就不属于 oauth21。

#### D-2 系统层反向依赖应用层 / 路由层

**证据**：

| 位置 | 依赖 | 判断 |
| --- | --- | --- |
| `framework/notice/services/email.js:10` → `app/notice/dao/notice.js` | framework → app | ⚠️ **真实倒挂** |
| `framework/loader/index.js` → `api/guard-config.js` | framework → api | ⚠️ 需要评估 |
| `framework/loader/registry/05-firewall.js` → `app/firewall/index.js` | framework → app | ✅ 合法（loader 的职责就是加载） |
| `framework/loader/registry/08-api.js` → `api/guard.js` | framework → api | ✅ 合法（同上） |

**问题**：
- `framework/notice/` 目录下**只有 `services/email.js` 一个文件**，
  而 `app/notice/` 才是完整的应用（dao / cli / permission / config）。
  这是历史上"通知工具"从 `framework` 迁到 `app` 时的**残留**。
- `framework/loader/index.js → api/guard-config.js`：loader 是"引擎"，不该知道具体路由模块。

**处置**：
- `framework/notice/services/email.js` 要么删（若 `app/notice` 已覆盖同一能力），
  要么把它的调用点改到 `app/notice`。**先确认无调用点再删**（用毒丸法或 grep 双重确认）。
- `guard-config.js` 的配置存储能力下沉到 `framework/config` 或 `app/guard`，
  loader 只调用其导出的 `loadGuardConfig()`。

#### D-3 DAO 跨域调用

**证据**：`app/user/dao/user.js:16` → `import IamDao from '../../admin/dao/iam.dao.js'`

**问题**：数据访问层直接编排另一个应用的 DAO。DAO 应当是**纯持久化**，
跨域编排属于 service 层职责（否则事务边界、缓存失效、审计都无处安放）。

**处置**：把需要跨域的逻辑上移到 `app/user/services/`，由 service 编排两个 DAO。

#### D-4 两套 `data/` 目录，根目录残留 428 KB 死文件

**证据**：

| 文件 | `data/`（根） | `src/data/`（实际生效） |
| --- | --- | --- |
| `firewall_config.json` | 3,301 B @ 2026-07-23 | **4,937 B @ 2026-09-15** ✅ |
| `traffic_stats.json` | 342,513 B @ 2026-07-23 | **194,833 B @ 2026-09-15** ✅ |
| `guard_config.json` | 82,567 B @ 2026-07-23 | — |

生效路径已核实：`app/firewall/config/config.js:18` → `path.resolve(__dirname, '../../../data/…')`
从 `src/app/firewall/config/` 上溯三层 = `src/`，故实际写 `src/data/`。
`framework/scheduler/index.js:25` 同理指向 `src/data/scheduler_config.json`。

> **根 `data/` 下的 3 个文件（合计 428 KB）是 7 月的遗留**，
> 其中 `guard_config.json` 更是守卫配置迁到 DB **之前**的产物，现已完全无用。

**✅ 已完成 2026-09-19**：三个文件已删除。删除前复核了全部路径引用 ——
`config.js:18`、`data/store.js:25`、`scheduler/index.js:25` 三处 `../../../data/…`
均解析到 **`src/data/`**，仓库根零代码引用（其余命中都散落在注释与 README 里，属文档文本）。
另修正 **4 处**把 `data/guard_config.json` 说成现行配置文件的文档：
`AGENTS.md:193`、`CLAUDE.md:207`、`docs/core/guard.md:150`、`src/app/firewall/README.md`。

**风险**：运维/开发看到根目录有个 `data/firewall_config.json`，
很可能去改它 —— 改了**完全不生效**，而且没有任何提示。这是典型的"陷阱文件"。

**更严重的是：文档仍在教人去改它。** 实测三处文档写着同样一句已过时的话：

| 文件 | 行 | 原文 | 实际 |
| --- | --- | --- | --- |
| `AGENTS.md` | 193 | "配置持久化到 `data/guard_config.json`" | 实为 **DB**（`GuardConfigDao.loadFromDB()`） |
| `CLAUDE.md` | 207 | 同上 | 同上 |
| `docs/core/guard.md` | 150 | "Guard 配置持久化到 `data/guard_config.json`，支持运行时动态修改" | 同上 |

也就是说：**文档描述的是已废弃的 JSON 方案，而那个废弃的 JSON 文件恰好还躺在仓库里**
—— 两者互相印证，让"改这个文件"看起来完全合理。这是文档与代码不一致造成的
**主动误导**，比单纯的"陈旧文档"危害大一档。

**处置**：
1. 修正上述 3 处文档描述（改为 DB 持久化 + 指向 `guard-config.dao.js`）。
2. 删除根 `data/`（**注意**：`.gitignore` 中无 `data` 条目，这些文件是**被 git 跟踪**的，
   删除需走正常提交流程；先确认无脚本/前端引用 —— 实测除文档外无其他引用）。
3. 或保留目录但加 `data/README.md` 标注"已废弃，生效文件在 `src/data/`"。

#### D-5 4 个模型未声明索引，其中含会话表

**证据**：32 个模型里 28 个声明了 `indexes:`，**4 个没有**：

| 模型 | 风险 |
| --- | --- |
| `models/session/UserSession.js` | ⚠️ 会话表是**最高频**的读写表之一 |
| `models/oauth21/OauthClient.js` | 客户端查询（按 client_id）频率高 |
| `models/notice/NoticeConfig.js` | 配置表，量小 |
| `models/user/UserDeactivation.js` | 按 `user_id` 查询 |

**处置**：确认这些表在 migrations 里是否通过 `addIndex` 补了索引
（36 个迁移中 25 个含索引操作 —— 需逐个核对这 4 张表）。
若确实缺失，对 `UserSession` 优先补 `(user_id, app_id)`、`(created_at)`、`(expires_at)`。

**注意**：项目历史上有 `underscored: true` 的命名陷阱 —— 写进 `attributes` 的**物理列名**会被
Sequelize 静默丢弃。加索引后必须**实测** `sequelize.options.logging` 确认查询真的用上了索引
（用 `EXPLAIN`），不能只看代码。

#### D-6 N+1 写入：角色逐个 create

**证据**：`app/user/dao/user.js:196-206`

```js
for (const rid of roleIds) {
  await getModel('UserRole').create({ user_id: user.id, role_id: rid, app_id: 'GLOBAL' },
                                    { transaction: t });
}
```

**问题**：在事务内逐个 insert，N 次往返。角色少时影响有限，但这是明确的模式问题，
且注册接口是**公开的、可被批量利用**的（结合限流）。

**处置**：改 `bulkCreate(rows, { transaction: t })` —— 一次往返，且事务语义不变。

#### D-7 临界大文件：`session.js` 995 行

**证据**：`framework/auth/session.js` 995 行，项目硬限 1000 行
（此前已因触限拆出 `session-perm.js` 87 行）。

**问题**：距离硬限只剩 5 行。任何一次小改动都会触限，**逼迫下一次拆分在压力下进行**
（而非按职责拆分）。

**处置**：主动按职责预拆（如 `session-create.js` / `session-refresh.js` / `session-revoke.js`），
不要等到触限。同目录下 `framework/auth/` 已有 20 个文件 —— 拆分时要控制**认知碎片化**，
建议按"会话生命周期阶段"拆，而非按函数拆。

#### D-8 `wb-logkit` 依赖声明与实际版本不一致（低危）

**证据**：`package.json` 声明 `"wb-logkit": "^0.2.0"`，实际 `node_modules/wb-logkit`
是**软链**到 `packages/log`（版本 **0.5.0**）；`package-lock.json` 中该条目为 `"link": true`。

**为什么现在不炸**：因为 `workspaces: ["packages/*", …]` 存在，lockfile 把它解析成本地链接，
`^0.2.0` 只是**没被使用的声明**。

**为什么仍要修**：`^0.2.0` 在 semver 下**不允许 0.5.0**（0.x 的 caret 锁次版本）。
一旦有人在**没有 workspace** 的环境里（如精简的 Docker 构建上下文，只 COPY `package.json`）
执行 `npm install`，会去 npm 装真正的 0.2.x —— 而代码里有 **345 处**使用 `logStdout`，
该 API 是 0.5.0 才有的 → **启动即失败**。

**处置**：改为 `"wb-logkit": "workspace:*"`（若使用 npm 9+ 支持）或直接写 `^0.5.0`。

#### D-9 测试有效性存量（已在进行中）

**证据**：`conventions/test-effectiveness.test.js` 的 `KNOWN_INEFFECTIVE_TESTS` 冻结了
**16 个虚假覆盖测试文件**（约 189 项），设计为"只减不增"。

**当前状态**：守卫已就位并**实测会红**（植入假违规文件会被精确点名）。存量待逐个改造。

**建议优先级**（据上一轮副本漂移核对结论）：
1. `integration/signature.test.js` —— 副本签名串因子与真身**不同**（副本 5 元组 vs 真身 7 元组），
   它在测一个**不存在的签名方案**，且掩盖了真身处"长度归一化 + `timingSafeEqual`"的修复现场。
2. `rate-limiter.test.js` —— 真身 `consumeRateWindowInMemory(keyRel, windowMs, now)` 的 `now`
   由外部传入（可确定性测试），副本内部调 `Date.now()`；真身有 `sweepMemory()` 防内存膨胀，副本无。

---

## 四、重构路线

> 原则：**每一步都独立可交付、可回滚、不改动外部契约**。
> 不要试图一次性完成"架构升级"。

### 阶段 0：止血（1~2 天，不动架构）

| # | 动作 | 文件 | 验收 |
| --- | --- | --- | --- |
| 0.1 | 修 `store.js` 非原子写入 | `app/firewall/data/store.js:119` | ✅ **已完成 2026-09-19**：tmp(pid)+rename，含关闭落盘；inode 断言 + 毒丸复验 |
| 0.2 | 角色批量写入 | `app/user/dao/user.js:196` | ✅ **已完成 2026-09-19**：改 `bulkCreate`；新增 `user-dao-register.test.js`（4 项，毒丸复验精确命中） |
| 0.3 | 补连接超时 | `src/app.js:172` | ✅ **已完成 2026-09-19**：1 项生效 + 2 项实测无效（见 C-3），核心是 WS `preClose`；含反例对照 |
| 0.4 | 修依赖声明 | `package.json` | ✅ **已完成 2026-09-19**：`^0.2.0` → `^0.5.0`，对齐 `packages/log/package.json` 实际版本 |
| 0.5 | 清理死文件 | 根 `data/` | ✅ **已完成 2026-09-19**：确认 3 处路径引用全部解析到 `src/data/`（非仓库根），删除 3 个死文件共 428KB |
| 0.6 | 文档加实现状态 | `docs/deployment/{multi-server,docker,cicd}.md`、`docs/roadmap/index.md` | ✅ **已完成 2026-09-19**：3 份部署文档加实现状态块 + 修正 Docker 误标；另修正 4 处 `data/guard_config.json` 误导描述 |
| 1.1 | 健康探针分级（原属阶段 1，已提前实施） | `api/system/v1/health.js` | ✅ **已完成 2026-09-19**：`/v1/health/live` + `/v1/health/ready`；配套修掉探针被 Bot 检测拦截的问题 |

**为什么先做这个**：成本极低、风险接近零，且 0.1 / 0.3 在**单实例**下也是真实隐患。

### 阶段 1：让单实例可运维（1 周）

这一阶段**不加任何新架构**，只补齐"能观测、能判定、能复现"三件事。

| # | 动作 | 说明 |
| --- | --- | --- |
| 1.1 | **健康探针分级** | ✅ **已完成 2026-09-19**（实施细节见阶段 0）。另补两项：探测超时 3s、错误信息脱敏（该端点是公开端点，原样回显 `sequelize` 报错会外泄内网地址） |
| 1.2 | **启动失败分级** | ✅ **已完成 2026-09-19**：`engine.js` 显式声明 `OPTIONAL_LOADERS`（4 项），**未声明者一律视为关键 → fail-fast**；可选失败经 `getLoaderStatus()` 在 `/health/ready` 暴露，总状态记 `degraded` 但仍 200（不摘流）。配套 `loader-engine.test.js`（7 项，含"未声明即关键"的反例） |
| 1.3 | **配置集中校验** | 104 个环境变量收敛到一处 schema，启动时校验并打印来源与缺省值。**同时为它写一个真实加载的测试**（替换掉 `config-validation.test.js` 的虚假覆盖） |
| 1.4 | **部署制品补齐** | Dockerfile（多阶段构建、非 root 用户、健康检查指令）+ docker-compose（app + mysql + redis） |
| 1.5 | **最小可观测** | 至少暴露：进程 uptime、活跃连接数、DB 池占用（`sequelize.connectionManager.pool`）、Redis 健康、限流降级标志 |

**验收**：`docker compose up` 一条命令起完整环境；`/health/ready` 能准确反映依赖状态；
故意配错一个环境变量，启动失败并给出可读原因。

### 阶段 2：解除横向扩展阻断（2~3 周）

前置条件：阶段 1 的健康探针就位（否则扩容后无法判断实例是否健康）。

| # | 动作 | 依赖 | 验收 |
| --- | --- | --- | --- |
| 2.1 | **调度器加分布式锁** | 复用 `redis/lock-store.js` | 两实例并行跑，任务每周期只执行一次 |
| 2.2 | **守卫配置跨实例一致** | 运行时读取改走 Redis（DB 只做持久化）；保留 `version` 做变更检测 | 实例 A 改配置，实例 B **不重启**即生效 |
| 2.3 | **遥测状态外置或明确降级** | 统计改 Redis Hash，或台账标注"本实例视角"；WS 广播改 Redis Pub/Sub | 两实例统计不互相覆写 |
| 2.4 | **并发连接计数外置或标注语义** | 改 Redis `INCR`/`DECR` + TTL；清理逻辑改按活跃时间 | 两实例下每 IP 限制语义与配置一致 |
| 2.5 | **依赖方向收敛** | 解 `oauth21` ⇄ `user` 双向边；`framework → app` 倒挂 | 加分层守卫测试（参考 `firewall-layering.test.js` 的 DFS + 反例写法） |
| 2.6 | **压测与容量基线** | 用阶段 1 的探针采集 | 给出"单实例吞吐/ P95 延迟 / DB 池饱和点"三个数，作为扩容决策依据 |

**关键**：2.4 之后，**"加实例"才第一次成为真正有效的扩容手段**。

### 阶段 3：契约化（持续）

| # | 动作 | 说明 |
| --- | --- | --- |
| 3.1 | 继续清零 `KNOWN_INEFFECTIVE_TESTS`（16 → 0） | 改完一个删一条，守卫强制校验 |
| 3.2 | 拆分 `session.js`（995 行） | 按会话生命周期阶段拆，避免触限后被动拆 |
| 3.3 | 补 4 个模型的索引 + `EXPLAIN` 验证 | 阻塞式查询上线前必须先看执行计划 |
| 3.4 | 文档实现状态成为强制项 | 文档模板里加"实现状态"字段；CI 校验徽章与文件存在性一致 |

---

## 五、明确不建议做的事

架构评审的价值一半在于**说清不该做什么**。以下这些在现阶段属于过度设计：

| 不建议 | 理由 |
| --- | --- |
| **现在就拆微服务** | 阶段 2 的 5 个阻断项都是**进程内状态**问题，拆服务只会让它们更难查。而且当前没有 Dockerfile、没有 CI、没有就绪探针 —— 拆完无法运维 |
| **引入消息队列（Kafka/RabbitMQ）** | 全仓只有 1 个定时任务、无异步任务队列需求。现有 `redis/queue-store.js`（303 行）已覆盖轻量队列场景 |
| **引入 Kubernetes** | 单实例形态下 K8s 的收益（滚动发布、自愈）都要靠 `/health/ready` 才能发挥 —— 先做 1.1 |
| **把 Session 改成 JWT 无状态** | 现在是"Redis 存会话 + JWT 对外 API"的**正确混合**。Redis 会话是主动踢下线的能力基础，改成纯 JWT 会**丢失**这个能力（`session-kick.js` / `session-governance.js` 全部失效） |
| **全面 TypeScript 迁移** | 与扩展性/稳定性无关。当前 41K 行、无构建步骤；迁移本身会引入大量风险而收益滞后。`docs/roadmap/index.md:65` 已把它列为 Phase 2，可继续延后 |
| **引入 ORM 之外的查询层** | Sequelize v6 已够用；真正的问题是**索引缺失**（D-5）和**N+1**（D-6），不是 ORM 选型 |

---

## 六、优先级总表

| 优先级 | 项 | 类别 | 工作量 | 收益 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P0 | 健康探针分级（1.1） | 🔴 A-3 | 小 | 后续一切扩容/自愈的判据 | ✅ 2026-09-19 |
| P0 | 连接超时 + WS 关闭（0.3） | 🟡 C-3 | 小 | 发布不再因半开连接拖到 30s 兜底 | ✅ 2026-09-19 |
| P0 | 遥测文件原子写入（0.1） | 🔴 A-1 | 极小 | 单实例下也会踩的数据丢失 | ✅ 2026-09-19 |
| P1 | 调度器分布式锁（2.1） | 🔴 A-2 | 小 | 解除扩容阻断 #1 | |
| P1 | 守卫配置跨实例一致（2.2） | 🟡 C-5 | 中 | 安全语义正确性 + 解除阻断 #2 | |
| P1 | 启动失败分级（1.2） | 🟡 C-1 | 小 | 消除"服务在跑但功能缺失" | ✅ 2026-09-19 |
| P1 | 部署制品补齐（1.4） | 🟡 B-2 | 中 | 扩容的前置条件 | |
| P1 | 文档实现状态标注（0.6 / B-1 / D-4） | 🟡 B | 极小 | 防止基于错误前提做决策；含修正 4 处 `data/guard_config.json` 误导描述 | ✅ 2026-09-19 |
| P2 | 遥测状态外置（2.3） | 🔴 A-1 | 中 | 解除扩容阻断 #3 | |
| P2 | 依赖方向收敛（2.5 / 2.2 守卫） | 🟢 D-1/D-2/D-3 | 中 | 可裁剪性（多服务器方案前置） | |
| P2 | 配置集中校验（1.3） | 🟡 B-3 | 中 | 消除静默失效类故障 | |
| P2 | 压测基线（2.6） | — | 中 | 让扩容决策有数据 | |
| P3 | 测试有效性清零、索引补齐、session 拆分 | 🟢 D | 持续 | 长期健康度 | |

---

## 附：本报告的证据复核方法

所有结论都可用以下命令复现：

```bash
# 统计规模
node -e "…"                                   # 见 §2.1（290 文件 / 41,405 行）

# 文档承诺 vs 代码实现
grep -rn "SERVER_ROLE\|MODULE_OAUTH21" src/ scripts/ index.js   # 期望 0，实际 0

# 部署制品
ls Dockerfile docker-compose.yml .github 2>&1                   # 均不存在

# 运行时状态载体
grep -rn "new Map()\|new Set()" src/app/firewall/ src/framework/scheduler/

# 连接超时配置
grep -rn "forceCloseConnections\|keepAliveTimeout" src/          # 空

# 跨 app 依赖
# 见 §D-1 表格中的 file:line

# 配置文件真实落点
node -e "console.log(require('path').resolve('src/app/firewall/config','../../../data/firewall_config.json'))"
```

**报告边界**：本次评估为**静态取证**，未进行压测与故障注入。
§三 中的"多实例后果"是基于代码语义的**推断**，尚未在双实例环境下实测。
建议在阶段 1 完成后，用一个双实例环境**逐条验证** A 类与 C 类结论 —— 届时这些推断会变成实测数据。
