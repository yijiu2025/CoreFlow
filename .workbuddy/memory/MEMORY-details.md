# nodeServers 项目笔记（详细层）

> 这是 `MEMORY.md`（主索引，自动注入）的**细节层**：完整实测数据、踩坑过程、逐条约定原文。
> **主索引只留高频约定与指针；遇到具体模块问题来这里查对应章节。**
> 每日过程细节在 `YYYY-MM-DD.md`。维护一律用 Write / Edit 工具（**不要 `cat >>`**，会从偏移 0 覆写）。

---

## 0. 两个必须知道的仓库形态

### ⚠️ `packages/log/` 是独立的嵌套 git 仓库

remote `github.com/yijiu2025/log.git`，`.gitignore:32` 排除它，**主仓零跟踪**。改它下面**任何**文件
都要去那个仓库提交：`cd packages/log && git add -A && git commit && git push origin HEAD`

- `git add packages/log/...` 在主仓**静默不生效**（报 gitignore 警告但 **Exit Code = 0**）
  → **add 阶段出现 gitignore 警告必须停下来查，不能只看退出码**
- 该仓库**没有**主仓那个 packed-refs 失灵问题。对照：`packages/shared-device` **不是**独立仓库，由主仓跟踪
- 连带影响：框架侧文档用 `../../../packages/log/README.md#锚点` 链到包侧章节，
  改包侧**标题**会打断锚点 → 改完必须跑锚点校验

### ⚠️ 本机 git ref 失灵（会误导 `git status`）

`.git/refs/remotes/origin/main` **无法由 git 自身写入**：`update-ref`/`fetch`/`push` 都返回 0、
reflog 正常追加，但松散 ref 不落地（`GIT_TRACE_REFS` 显示旧值读成全 0）。git 为
`C:/Program Files/Code/Git`（2.52.0.windows.1），`git push` 甚至不输出任何内容。

- 手写松散 ref **当场有效，下一次 push 会连同目录一起删掉** → 只能改 **`.git/packed-refs`** 中该行 SHA，
  **每次 push 后都要重做**。修正脚本须带 4 条断言：① 头行
  `'# pack-refs with: peeled fully-peeled sorted '` **含尾空格**原样；② 待替换行命中且恰好一处；
  ③ 变化行数 = 1；④ 保持纯 LF（无 `\r`）。
- ⚠️ **`git push` 可能耗时数分钟且全程零输出**（2026-09-19 实测 5m27s 后才返回）→ **超时不代表失败**，
  重试是安全的（第二次即时成功）。并发两个 push 时后到的会被 `cannot lock ref` 拒绝（`is at X but
  expected Y`），说明前一个其实已成功 —— 别把这当成真失败。判定一律用 `git ls-remote origin main`。
- 已排除诱因：定时清理、`core.fscache`/`fsmonitor`、`reference-transaction` 钩子。
- 后果：`git status` 谎报 ahead。**同步状态一律以 `git ls-remote origin main` 为准**
  （`git fetch` 打印的 `a..b main -> origin/main` 是按远端数据谎报，不代表本地 ref 写成功）。

---

## 1. 架构约定（强制，有守卫）

### 导出位置：所有 `export` 收拢到文件末尾（2026-09-15 立）

规范见 `AGENTS.md`「导出位置（强制）」。定义处不写 `export`；default **先命名再末尾导出**；
命名惯例 api 路由 `registerXxxRoutes` / models `defineXxx` / loader `xxxLoader` / dao `xxxDao`。
双保险 = `eslint.config.js` 的 `no-restricted-syntax` + `conventions/export-placement.test.js`。

- ⚠️ 盲区：**全文件只有一个 export 语句时它天然"在末尾"**（`lastNonExportIdx = -1`）
  → 必须同时用「形式规则」（禁 `Export*Declaration > FunctionDeclaration`）兜住
- 范围仅 `src/`；`migrations/`（Umzug 的 `export async function up/down`）、`scripts/` 未纳入

### 依赖方向：`src` 不得 import `scripts`（2026-09-15 立）

**只允许 `scripts/ → src/`**（`scripts/` 是可选宿主，不一定随部署安装；反向 import 会成环且部署期解析失败）。
守卫 `conventions/no-scripts-import.test.js`（静态 + 动态 `import()` 都查）。位置对照：

| 工具 | 位置 | 应用插件写法 | 宿主写法 |
| --- | --- | --- | --- |
| CLI 工具库（`table`/`input`，桶 26 符号） | `src/framework/cli/index.js` | `'../../../framework/cli/index.js'` | `'../src/framework/...'` |
| 模型加载 / DB 工具 | `src/framework/db/models.js` | 同上 | 同上 |

`scripts/lib/{table,input,db}.js` 已删除；`scripts/lib/redis.js` 保留（scripts 自有，src 不引用）。

- **模型文件是工厂函数** `(sequelize, DataTypes) => Model`：`await import(path)` **不注册任何模型**。
  旧 `scripts/lib/db.js` 的 17 条 import 全部"成功"却注册 **0** 模型、**0** 关联（手工清单还漏了 15/32）。
  现 `scanModels()` 扫 `src/models/` 供**应用 loader 与 CLI 共用**，实测 32 模型 / 22 关联。

### 测试有效性（2026-09-16 立，有守卫）

规范见 `AGENTS.md`「测试有效性（强制）」。核心：

- **测试必须真实加载被测代码**（相对 `import` / `await import()` / `wb-*` 包）。禁止「手写常量再断言该常量」
  —— 那类测试**删除被测模块后仍全绿**（毒丸实验证实：覆写成 `throw` 后 7 文件 100 项照绿）。
- 守卫 `conventions/test-effectiveness.test.js`：零相对 import 且无动态 import 即报错。例外仅**结构守卫**
  （读文件系统做静态断言），登记进 `STRUCTURAL_GUARD_WHITELIST` 并注明理由。存量虚假覆盖冻结在
  `KNOWN_INEFFECTIVE_TESTS`（**只减不增**，改造完一个删一条），**当前 15**（原 16，`websocket.test.js`
  于 2026-09-19 改造出列），改动后必须同步 `FROZEN_SIZE`。
- ⚠️ **「零 import」≠「零覆盖」**：`export-placement` / `node-redis-v5-commands` / `terminal-colors` /
  `firewall-layering` 等读文件做静态断言，零 import 是**正当**的。必须区分。
- **禁止内联复制被测逻辑**：副本会与真身各自演化，「测试通过」≠「真身正确」，**比零覆盖更危险**。
  已核对 3 份副本全部与真身有实质差异（最严重：`signature.test.js` 的签名串因子与真身完全不同）
  → `docs/development/test-inline-copy-drift-report.md`。模拟登录态时 `reply.result` 请 import 真实装饰器
  （`loader/registry/00-globals.js`）。
- **一个测试文件只能注册一组路由**：`registerSecureRoute` 的 `_routeRegistry`（`api/guard.js:35`）
  是模块级全局状态且**无重置入口** → 重复注册同一 URL 抛错。注册集中在顶层 `beforeAll` 一次。
- 改造范例 `src/__tests__/api-routes.test.js`（18 项手写常量 → 17 项真实 Fastify + `inject()`，毒丸必红）。

### firewall 分层与无环（2026-09-16 立）

**层级（单向）**：`interface/` → `config/ util/` → `dao/` → `engine/` → `services/ cli/ data/` → `index.js`

- ⚠️ **`engine/dao` 已撤销**。真身是 **`src/app/firewall/dao/block-manager.js`**。
  **封禁能力请直接 import `dao/block-manager.js`**（存储 CRUD 属持久化层，不是"检测与响应"）。
- 曾有的环：`util/shared.js → dao/dao.js → util/redis.js`（根因：dao 无独立层级位置，要读配置只能反向够 util）。
  **修法用依赖倒置**：`interface/config-access.js` 零 import，持有可注入的**函数引用**（非配置对象 →
  无快照无缓存）。**未注册时抛错**而非返回 undefined（后者失败点离根因很远）。
  → 连带：**改动配置读取路径时 mock 目标必须跟着换**（真身改从 interface 读配置后，
  `bot-detector.test.js` 对 `dao/dao.js` 的 mock 立刻失效，10 项因「读取器未注册」全红）。
- 守卫 `conventions/firewall-layering.test.js`（12 项）：DFS 三色法查环 + **自带反例**。
  ⚠️ **"无环"结论不能来自可能写坏了的检测器** —— 结构性断言都要自带反例。
- ⚠️ **同目录同名文件搬迁 = 先写新文件校验一致，再删旧文件**（带断言的 Node 脚本：源 md5 →
  确认目标当前确是纯 shim 才允许覆盖 → 替换数守恒 → 落盘后归一化比对），否则中途失败即丢失真身。

### 📐 文档 ≠ 实现：评估/扩容前必做一致性取证（2026-09-19 立）

**教训**：`docs/` 里的设计稿与"已完成"标记**大量失真**。评估架构或规划扩容前必须先核**文档 vs 代码**，
否则会把设计稿当现状。**手法：拿文档承诺的环境变量名去 grep 代码，命中 0 = 未实现**（比读文档可靠）。

已实测失真（详见 `docs/core/architecture-review-2026-09-19.md`）：`SERVER_ROLE`+`MODULE_*` 多服务器方案
代码 0 引用；roadmap 标"Docker 化 ✅"但 `Dockerfile`/`docker-compose.yml`/`.github/` **全不存在**；
`/health/live` `/health/ready` 原本不存在（现已补）；`AGENTS.md`/`CLAUDE.md`/`core/guard.md` 都写
"守卫配置持久化到 `data/guard_config.json`"，实际已迁 **DB**（`GuardConfigDao.loadFromDB()`）
→ 文档在**主动教人改废弃文件**。

另：`npm run docs:build` 因 **10 条历史死链**长期失败（全部指向 docs **之外**的源码/根文档，
vitepress 只能解析 docs 内路由）—— **文档站此前从未构建成功过**。2026-09-19 在 `config.ts` 用
**按前缀精确的** `ignoreDeadLinks`（`./{,../}(AGENTS|oauth21|posecraft|packages)`）放行后首次构建成功。
⚠️ 不要写成 `ignoreDeadLinks: true` 一刀切：同一轮里正是死链检查拦下了我写错的报告链接
（漏了文件名日期后缀）。**长期亮红灯的检查等于没有检查。**

**另一处陷阱**：根 `data/` 是 7 月遗留（428KB 死文件），生效文件在 **`src/data/`**
（`app/firewall/config/config.js:18` 的 `../../../data/` 从 `src/app/firewall/config/` 上溯三层 = `src/`，
不是仓库根 —— 算路径时别数错）。

### ⚠️ 单实例假定集中在三处（横向扩展的阻断点，2026-09-19 实测）

加实例前必须先修这三处，否则统计/限流/定时任务行为全部错乱：

1. **防火墙遥测全在进程内** — `app/firewall/data/store.js`（RingBuffer + 3 个 Map + 模块级 let）。
   其中"落盘非原子"已于 2026-09-19 修为 tmp+rename，但**跨实例共享状态问题仍在**。
2. **调度器无分布式锁** — `framework/scheduler/index.js:93-103`（`run()` 启动即跑 + `setInterval`）→ N 实例 N 倍
   副作用。`redis/lock-store.js` 已存在可直接复用。
3. **guard 配置是模块级单例** — `api/guard-config.js` 的 `mergeDbConfig` 只在启动跑 → A 实例改配置 B 实例
   不生效（**安全语义问题**，同一路由不同实例鉴权结果不同）。

对照：**会话/权限层已完全 Redis 化**（`auth/session-store.js` 7 个 `getStore` 命名空间，无进程内 Map）
→ 认证层**已具备横向扩展能力**，不要动它。

---

## 2. firewall 业务事实

### 三维度封禁（ip / fingerprint / device）

- `fingerprint = sha256(ip|ua|lang|enc)` 前 16 位 —— **输入含 IP** → 换 IP 即变、改任一请求头也变。
  README 那句"更换 IP 后仍可追踪"与实现**相反**。**`deviceId` 是栈里唯一与 IP 无关的身份**，取值用
  `framework/auth/device.js` 的 **`getClientDeviceId()`**：只认客户端自报且校验通过的值、**不补发**
  （补发的 ID 每请求都可能不同，拿它封禁等于没封）。
- 自动封禁/挑战走 `block-manager.setBlockForSubject({ip, deviceId}, meta)` → **同时**写两个维度；
  `enableDeviceBlock=false`（`FW_DEVICE_BLOCK`）退回纯 IP。访问层读写统一走 `util/redis.js` 的 `DIMS`
  分派表 + `dimOf()` 优先级（device > fingerprint > ip），**不要**再散落 `isFp ? A : B` 三元。
- **强度边界（写代码/写宣称时都要守）**：`device_id` 由客户端携带且**不是凭证**，清 localStorage + cookie
  即可换新身份 → 这是**提高攻击成本**，不是屏障。
- 匿名短路 `defense.skipDeepCheckForAnonymous`（默认关闭）：路由 `requireLogin === true` 且**一个凭据都没带**
  才跳过深度检测（前提「Fastify 在 onRequest 前完成路由匹配」已用真实用例钉死）。
- 挑战机制 = **SHA-256 PoW**（`util/pow-sha256.js` 内联 `sha256Hex.toString()` 保证前后端同一份算法
  + `LUA_TAKE_CHALLENGE` 原子 GET+DEL）。
- **探针路径豁免（2026-09-19 加）**：`engine/pipeline.js` 的 `PROBE_PATHS`（`/v1/health`、
  `/v1/health/live`、`/v1/health/ready`）在 `shouldSkipDeepCheck` 里直接放行。**原因**：探针通常不带 UA
  → 命中 `checkBotChallenge` 的 `requestCount > botChallengeNoUaLimit`（默认 10）→ 返回**挑战页 HTML 且 200**，
  探针"看起来通过却完全失效"。改动检测管道时要复核该豁免仍生效。

### 审计修复落点

`src/app/firewall/docs/` 的 `AUDIT-REPORT-2026-09-15.md`（4🔴/15🟡/17🔵）+ `FIX-REPORT-2026-09-15.md`
（含复验新发现的 N-1/N-2/N-3）。**遗留**：🟡-7（3 个测试仍是内联副本）、🔵-17（401 也走完整检测管道，
属性能取舍）。`scripts/sync-guard-config.js` 剥离 `guard_configs` 里覆盖代码声明的运行时字段，默认 dry-run。

### 已实施的基础设施修复（2026-09-19，勿重复实施）

- **遥测原子写**（`app/firewall/data/store.js`）：`persistNow()` = tmp(pid) + `rename`；
  `persistData()` 防抖调它；`stopPersistTimer()` + `flushPersist()` 供优雅关闭落盘
  （带"有待写变更才写"前置判断，否则空跑会把统计算成全零）。`DATA_FILE` 可被
  `FW_TRAFFIC_STATS_FILE` 覆盖（默认文件**被 git 跟踪**，测试必须覆盖）。
  `firewall/index.js` 的 `onClose` 已接 `flushPersist()`。
- **健康探针分级**（`api/system/v1/health.js`）：`/v1/health/live`（恒 200，只反映进程存活）/
  `/v1/health/ready`（关键依赖不可用时 503）/ `/v1/health`（兼容端点，恒 200 不改既有契约）。
  两条关键判据：**只判"已配置"的依赖**（`REDIS_ENABLED!=true` 时走 MapStore 降级是合法模式而非故障，
  判 not-ready 会误摘流）；**探测必须带超时（3s）**（否则 `sequelize.authenticate()` 等 pool.acquire
  30s，会被编排探针自身 1~5s 超时掐断、掩盖根因）。
- **连接超时 + WS 优雅关闭**：见 §6。
- **启动失败分级**（`framework/loader/engine.js`，2026-09-19）：`OPTIONAL_LOADERS` 显式声明 4 个
  可降级加载器（`01-monitor` / `02-redis` / `03-db` / `09-notice`），**未声明者默认关键 → fail-fast**
  （默认严格：新增加载器忘声明时会拦住启动，而不是被静默放过）。失败错误带
  `loaderFile` / `loaderCritical` 上下文；`getLoaderStatus()` 供 `/health/ready` 暴露明细，
  有降级时 `status: 'degraded'` 但**仍 200**（降级 ≠ 不可服务，不该被摘流）。
  测试经 `runEngine(app, { registryDir })` + `__tests__/__fixtures__/` 驱动。
- **`/health/ready` 错误脱敏**（2026-09-19）：该端点是公开端点，原先把 `sequelize` 的原始报错
  回显出去（含 `ECONNREFUSED 10.0.0.5:3306` 这类内网拓扑）。现 `detail` 只给
  `err.code || err.name`，完整错误进日志。**新增任何进 body 的字段前先问"给未登录的人看合适吗"。**

---

## 3. 框架层陷阱（实测确认，改代码前必读）

- **`getModel(name)` 未命中抛 `TypeError`**（非返回 null，`db/index.js:77`）→ `if (!Model) return null`
  是死代码，调用点应放进 `try`。点号写法 `'a.B'` 只取最后一段，与 `'B'` **完全等价** → 统一写 `'SessionToken'`。
- **`getStore(prefix, opts)` 按 prefix 隔离命名空间**（键 = `prefix+timeout+backup`）。
  `'user_sessions'` ≠ `'userSessions'`（曾致注销清理静默零执行）。**命名空间字符串全仓必须逐字一致。**
  Redis 未配置时走 **MapStore，不支持 `zAdd`/`zRangeByScore`**。`getMapStore(prefix)` **不做实例缓存**
  → 断言"数据共享"而非"对象同一"。
- **`underscored: true` 命名陷阱**：时间戳**属性名**是 `createdAt`/`updatedAt`（物理列才是 `created_at`）。
  写进 `attributes: [..., 'created_at']` 会被 Sequelize **静默丢弃** → 读 `x.created_at` 得 undefined
  → `new Date(undefined)` = `Invalid Date`（CLI 时间列全花）。但 `order`/`where` 用物理列名**可用**。
- **`AsyncLocalStorage` 单例放独立零依赖模块**（`framework/auth/request-context.js`）。重构时必须验证
  re-export 与源模块是**同一实例**（`m.x === src.x`），两个 ALS 实例会让上下文穿透**静默失效**。
- **`crypto.timingSafeEqual` 要求两 Buffer 字节长度相等**，否则抛 `RangeError`；`Buffer.from(str,'hex')`
  遇非法 hex **静默截断成空 Buffer** → 「比字符串长度」≠「比字节长度」。
- **`bcryptjs` 只取前 72 字节**；密码长度上限按 `Buffer.byteLength` 判断，`maxLength:128`（字符）会漏尾巴。
- **⚠️ 高频缺陷类「守卫未防御非预期输入」**（cookie.js / totp.js / signature.js / perm-cache.js 各 1 例）：
  外部可控值直接进 `timingSafeEqual` / `.length` / `Buffer.from(x,'hex')` / **`new Date(x)`** →
  必须先做类型 + 长度归一化，并把函数体包进 try 兜底到声明的失败返回值。
  注意 **`new Date(Symbol())` / `new Date(1n)` 都会抛 TypeError**，只有 string/number/Date 能进。
- **⚠️ 改完导出面必须 `import` 一次上层入口模块**（单测跑不到那里）。ESM **链接期**抛
  `does not provide an export named ...`，整个入口注册失败。两次实战：`willBeRejectedAsAnonymous`、
  `startCleanupTask`。**还要查所有 `unstable_mockModule` 替身是否镜像了新导出**
  （2026-09-19：`store.js` 加 `flushPersist` 后 `firewall.test.js` 整套件 `failed to run`）。
- **裸 `export { x }` 只导出本模块绑定**，跨模块会抛 `SyntaxError` → 跨模块 re-export 必须带 `from` 子句。
- **⚠️ 模块级 `process.exit` 是会伪装的绿色**：`framework/db/index.js` 缺 DB 环境变量时
  `setTimeout(() => process.exit(1), 100)` → jest worker 跑一半被强杀。症状：**用例总数每次都不一样**
  而**汇总恒 0 失败**；`--runInBand` 中途死掉。修法 `!isTestEnv`。
  **看到"用例总数不稳定"先查模块级 exit，别当成 jest 抽风。**
- **⚠️ 插件"双重注册"会让整条钩子链翻倍**：同一个 `init` 既被 `loader/registry/NN-*.js` 注册、
  又被 `10-apps.js` 通过 `appConfig.init` 注册一次。**新 app 接入前先确认 `init` 只被一个位置注册。**
- **注释里不要写 `from './xxx.js'` 字面量**：依赖图脚本正则会误判成真实依赖，造出假环。

---

## 4. CLI / 脚本

- **非 Fastify 进程（CLI / 脚本）**：`globalRedis` 恒为 null（插件不执行）→ `getStore()` 抛
  `RedisRequiredError`。用 `connectStandalone()` / `disconnectStandalone()`（`framework/redis/index.js` 导出）
  引导；**不释放 socket 会让一次性进程挂住**。`globalRedis` **没**从 `index.js` 导出，取裸客户端要
  import `plugin.js`。
- **CLI 写配置前必须先 `initDao()`**（否则用 `DEFAULT_SECURITY_SETTINGS` 覆盖线上配置文件）。
  管道一次喂入多行交互输入会**漏行**（`rl.question` 注册晚于已缓冲的 `line` 事件）→ 行间加延迟。
  CLI 运行**不启动 Fastify**，所以任何走 `req.server.redis` 的路径在 CLI 下都不存在。
- 临时脚本一律 `.tmp-*.mjs`，**先写文件再跑**（heredoc 里 `${...}` 会被 bash 展开；`/tmp` 会被路径转换搞坏）。
  `.gitignore` 只忽略 `.tmp-probe/` → 用 `.tmp-probe/` 存探针，跑完 `rm -rf .tmp-probe`。
  **判断根目录有无散落文件用 `find . -maxdepth 1 -name ".tmp*" -type f`，不要用 `ls .tmp-*`**
  （shell glob 会把目录展开成内容，看起来像有几十个散落文件）。

---

## 5. Redis / node-redis v5（动 redis 代码前必读）

- **node-redis v5 只有驼峰命令**。全小写 `client.hset/hgetall/hdel/zadd/smembers/pttl/expire` 全是 undefined
  → 调用即 `TypeError`（ioredis 写法移植过来必炸，且往往落在 `try` 里被静默吞掉）。`dbSize` 不是 `dbsize`
  （`redis status` 整条命令炸）；`client.info('server')` 取不到 `connected_clients`（属 clients section）
  → 改 `client.info()` 一次取全量。守卫 `conventions/node-redis-v5-commands.test.js`（裸客户端标识符 +
  小写多词命令，且不得误伤框架自己的 `store().hgetall`）。**无 `pipeline()`**（只有 `multi()`）；
  `eval` 必须 `client.eval(script, { keys, arguments })`；`scan(cursor)` 的 cursor **必须传字符串**。
- **框架 store 语义**：key 自动加 `prefix:`；`store().get()` 会 **safeParse**（JSON 串→对象），要原始串
  必须 `store().call(c => c.get(full))`；`store().hexists` 返回 **1/0 而非布尔**（判真用 `Boolean()`）。
- **`withTimeout` 的孤儿 promise（已修，缺陷类要记住）**：`result.finally(clear)` 会派生一个**被丢弃**的
  promise，主 promise reject 时孤儿也 reject 且无处理者 → 默认 `--unhandled-rejections=throw` **直接杀进程**
  （一次普通 Redis 命令错误升级为**整个服务崩溃**）。修法 `result.then(clear, clear)`。
  守卫 `framework/redis/utils-timeout.test.js`。
- **成对代码**：`pipeline.js` 有两个 `Security Policy Blocked` 回包点，只一处透传 `err.headers`
  → `Retry-After` 从未下发。改这类代码必须两端一起改并各测一次。
- **firewall 的 Redis 访问已收敛**到 `src/app/firewall/util/redis.js`（语义化 API + Lua 单往返 + 内存降级）。
  **不要再往调用点塞裸 redis 客户端 / 各自拼命令**。守卫 `firewall-redis-adapter.test.js`。
  **封禁必须同时写「键」与「索引 hash」**，只写键 → 封禁生效但管理端列表永远空。

---

## 6. Fastify：插件顺序 + 运行时选项（改 app.js / loader / 停机逻辑前必读）

### 插件 / 钩子注册顺序

- **`loader/registry/NN-*.js` 的数字前缀就是执行顺序**，路由注册在 `08-api`。钩子分两类，**回不回溯差别巨大**：
  `addHook('onRequest'|'onPreHandler'|...)` **后加也生效**；`addHook('onRoute', ...)`
  **只对「钩子注册之后」注册的路由触发，不回溯**（`@fastify/rate-limit` v10 的 `global: true` 正是靠它）。
- **推论（踩过的坑）**：防火墙插件放在 `10-apps`（`08-api` 之后）时，全局限流"注册成功但永不触发"——
  `printPlugins` 能看到、`hasPlugin` 也是 true，但 `max=2` 连打 6 次全部 200。
  **修法：`initFirewall` 的唯一注册点是 `loader/registry/05-firewall.js`**（早于 08-api）。
- **`errorResponseBuilder` 必须带 `statusCode`**：插件是 `throw errorResponseBuilder(...)`，
  Fastify 只认抛出对象上的 `statusCode`。只返回 `{ code: 429, ... }` → **限流命中返回 500**。
- **`app.register(x)` 的 body 在 `ready()` 才按队列执行**；只有 `await app.register(x)` 才**当场**执行。
- **`app.register(config.init)` 会新开封装作用域**：`oauth21/config.js` 的 `init()` 内注册的 CSRF 钩子、
  敏感接口限频器，以及从未被任何地方注册的 `initOAuthMiddleware` **全部不会执行**。
  修法：用 `fastify-plugin` 包住 `init`，或直接在根实例上注册钩子。

### 运行时选项实测真相（2026-09-19 逐项实测，别照抄网上方案）

| 选项 | 实测 | 结论 |
| --- | --- | --- |
| `connectionTimeout` | **空旋钮**：传入后 `server.connectionTimeout` 仍 `undefined`、socket 上无计时器，建连后发字节 10s 也不断 | **不设** |
| `headersTimeout` | 被 Fastify **静默丢弃**（schema 外键走 removeAdditional 语义）；慢 header 由 Node 内建 60s 兜底 | 不设 |
| `keepAliveTimeout` | `72000` 是 Fastify **默认内置值**，显式声明 = 零行为变更 | 显式声明（可 env 覆盖）便于可读 |
| `requestTimeout` | Fastify 默认 **0（关闭）**；打开可封慢速发 body（RUDY）——防火墙 6 个检测器里**无**慢连接检测 | 设 300s（给 200MB multipart 余量） |
| `forceCloseConnections` | 对普通 keep-alive 连接**有效**（close 从"等超时"变 1ms）；对**已 upgrade 的 WS 完全无效**（`closeAllConnections()`/`closeIdleConnections()` 后 `server._connections` 仍为 1、`close()` 回调不触发） | 设 true（管普通连接），WS 另修 |

**WS 优雅关闭**：`@fastify/websocket` 11.2.0 默认 `preClose` 只 `client.close()` 等对端回应 →
半开连接让 `app.close()` 永不返回（会被 `index.js:45` 的 30s 兜底 `process.exit(1)` 收掉）。修法 =
`src/framework/websocket/preclose.js` 的 `createWsPreClose(graceMs=1000)`：广播 `1001 going away`
→ 宽限期（unref 定时器）后 `terminate()` 残留 → `wss.close(); done()` **立即返回**。
**只有 `socket.destroy()` / `ws.terminate()` 能解卡**（实测），且 `done()` 不能与 `wss.close()` 回调耦合。
`app.js` 顶部用 `resolveTimeoutMs(raw, fallback)` 解析环境变量（非数字/负数回退默认，避免静默关掉保护）。

---

## 7. Guard / 授权（勿回退）

- **`api/guard-config.js` 的 `registerApiMetadata` 曾静默丢弃 `requirePermission`**（三级都漏），
  而 `createGuard → applyGuardLogic` 恰恰**从配置对象读**它 →
  **全仓 HTTP 路由上 `registerSecureRoute({requirePermission})` 一直是空操作**。
  三重教训：① 传了参数≠存下来了，配置类函数要回读断言；② 修 🔴 时必须先确认新守卫真的生效，
  否则**把有效保护换成空操作**；③ `permission` 是 `requirePermission` 的短别名。
- **`requirePermission` 属代码级授权声明**（与 name/url/method 同类），**不入 `RUNTIME_FIELDS`**：
  它必须由代码决定并每次启动刷新，若可被 DB / 热更新接口改写 = 运维改一次就能永久提权。
  `RUNTIME_FIELDS` 只有 `['enabled','requireLogin','allowIps','allowRoles']`。
- **守卫热更新接口（`PATCH /:system/:group`）必须有字段白名单**：`updateConfig` 曾把请求体原样
  `Object.assign` 进配置 → 可把 `enabled` 置 false 或把 `requirePermission` 置 null。现为
  `PATCHABLE_FIELDS`，未知字段**显式 400**。
- 级联守卫是 **system → group → api，任一层为真即生效**。所以系统级 `requireLogin: true` 会让组级声明的
  `false` 形同虚设。防火墙系统级现为 `false`，由各组自声明。
- **`allowRoles` 只在 `length > 0` 时才校验**（`api/guard.js:189`）：写 `allowRoles: ['admin']` 而
  `iam_role` 里并无 `code='admin'` 的角色（超管实为 `{appId}_admin`）→ **永不匹配**，等于路由裸奔到
  "只要求登录"。`allowRoles: []` 的语义是**「不限角色」而不是「禁止」** —— 想收紧必须用 `requirePermission`。
  `fw_admin` 的动作是 **`fw:*`**；`fw:admin:*` 覆盖不到任何有效权限码。
- **敏感操作回源校验（第 4 层）**：路由声明 `freshPermission: true` → `applyGuardLogic` 以
  `getPermissions(..., {fresh: true})` 强制回源，并用结果覆盖 `request.state.user`。已用于
  `POST /admin/iam/v1/roles/assign`、`POST /admin/iam/v1/policies`。**回源失败必须 fail-closed（403）
  而不是放行**。该标志与 `requirePermission` 同为代码级声明，**不得进 `RUNTIME_FIELDS`**。
  `applyGuardLogic` 经 `__test__applyGuardLogic` 导出供测试驱动。

---

## 7.5 权限缓存（四层防御，2026-09-16 立）

**唯一读入口** `framework/auth/perm-cache.js` 的 `getPermissions(userId, appId, {fresh})`。
**任何地方不要再自行 `getStore('perm')` 或直调 `loadUserPermissions`**（后者无失效机制，会让长 TTL
掩盖权限变更）。完整设计 + 4 个守卫测试清单见 `src/framework/auth/docs/PERM-CACHE-HARDENING.md`。

- **命名空间 `auth:perm`** + sha256 截 16 位键（`\u0000` 分隔防 `('1','23')`/`('12','3')` 撞键）。
  `PERM_NAMESPACE` 字面量**在两处声明**（`session-store.js` 受"零兄弟模块依赖"约束不能 import
  `perm-cache.js`），故用契约测试钉死逐字一致。
- **第 3 层指纹是核心，零 schema 改动**：`sha256(UserRole[id,updatedAt,deletedAt] + Role[...] +
  InlinePolicy[...])`；`Role` 行必须纳入（角色策略变更影响该角色下**所有**用户）；行按 id **排序后**拼接
  （SQL 不保证顺序，依赖顺序会让指纹无谓抖动→每次都判失效）。不用 `users.perm_version`（绕开 DAO 的写入
  不记得递增，必然漏）。会话路径统一走 `session-perm.js` 的 `resolveSessionPermissions`，
  **降级方向永远是"保守回源"**。
- **主动失效** `invalidatePermCache(userId, appId)`，已接 `iam.dao.js` 的 `assignRole`/`updateInlinePolicy`；
  **失效失败不抛错**（变更已提交，不能因缓存层故障回滚，指纹兜底）。`token-issuer.service.js` 的预热
  曾是**长期无效写**（写侧裸 `getStore('perm')` + 明文键，与读侧对不上 → 丢黑洞），现走 `warmPermissions`。
- **强度边界**：hash 键 + 命名空间提高的是**误写/枚举成本**，不是屏障。能连 Redis 仍可直接写缓存 ——
  但**指纹会在下次请求时自动覆盖它（自愈）**；指纹的作用是**检测数据变化**而非防篡改。

---

## 8. 日志系统（wb-logkit）

- **唯一日志出口** `src/framework/log/index.js`（`export * from 'wb-logkit'`）；业务代码禁 `console.*`。
  **禁止深层路径导入 `packages/log/src/*`**。包是本地 workspace 软链，**不要写进 `dependencies`**；
  改它下面的文件要去那个仓库提交（见第 0 节）。包名 **`wb-logkit`** 最新 **0.5.0**。
- **文档分工（别写串）**：`packages/log/README.md` = 环境变量/配置/API/文件规则的**权威源**；
  `src/framework/log/README.md` = 宿主接入约定（app.js 调用时机、全局 log 注册、ESLint 约束、
  `initLogErrorTraps`），**不复制**包的细节。改环境变量或 `config()` 行为 → **只改包侧 README**。
- 入口约束：`createLogger(tag, asGlobal)` **只有两个参数**（其余走 `log.config({...})`）；
  `configureLog` 全项目只在 `src/app.js` 调一次；文件输出默认关闭；`file` 配置是**替换而非叠加**；
  通道独立级别**优先于全局 `level` 门槛**。**故障不静默**：`src/degraded.js` 是唯一"库自身故障留痕"
  出口（stderr + 限流），stderr 出现 `❌/⚠️ [wb-logkit] ...` 是**预期行为，不是 bug**。
- **`logStdout(text)`（别名 `stdout`）是顶层导出，不是 logger 实例方法**：直写 `process.stdout`、
  **不受 LOG_LEVEL 门控且完全不落盘**。给**人**看 → `logStdout`；给**排查留档**看 → `log.info/warn/error`。
  实测 `LOG_LEVEL=warn` 时 `log.info` 被**整条丢弃**而 `logStdout` 照常 → 脚本结果输出绝不能用
  `log.info`，否则是**静默失败**。历史事故：`migrate-console-to-log.js` 把 `console.log` 映射成不存在的
  `'log.stdout'`，全仓 **324 处 / 30 文件**运行到输出即抛 `TypeError`。守卫 `log-usage-contract.test.js`。
- **⚠️ 终端颜色只有一处出处：`src/utils/colors.js`**（有守卫）。日志库**只给自己生成的「前缀」上色**；
  `record.msg` 是**原样拼接**的 → 消息体颜色码由调用方负责。**不得自建颜色表、不得自行判断 `isTTY`**；
  全仓 `process.stdout.isTTY` 读取点**只允许 1 处**，非颜色类终端能力判断须 `import { IS_TTY }` 复用。
  守卫 `conventions/terminal-colors.test.js`（10 项含 4 项反例）。例外 `cli/table.js`。
- `packages/log/docs/` 索引在 `docs/README.md`；`AUDIT-PROMPT.md` 是可复用模板（含 10 条「有意为之、
  勿当 bug 报」约束）。**「基线过期」是报告的属性，不等于该删** —— 判断依据是问题是否闭合。
- **发布速查**：`cd packages/log && git add -A && git commit && git push origin main` →
  `npm publish --access public`（含 `/` 的配置项 → `--userconfig ./.npmrc.tmp`，用完即删）。用户 `qirly`。
  `publish` **PUT 404 = 无写权限**；`~/.npmrc` 的 `_authToken` CRLF/BOM 会**伪装成 token 失效**。
  **超时 ≠ 失败**（`SENSITIVE_APPROVAL=TIMED_OUT` 别重试，先 `npm view wb-logkit version`）。
  发布后**从 npm 真实安装回归**（本地软链会掩盖问题）。

---

## 9. 手法 / 缺陷类

### 通用手法（跨项目可复用）

- **大文件拆分**：**不要手工复制**几百行。写 Node 脚本**按行号切片**，四条断言：① 每段声明
  `[start,end,期望首行]`，不符立即退出不写文件；② 覆盖性断言（切片 + 未迁走部分的并集覆盖源文件全部非空行）；
  ③ 语义改写片段断言**恰好命中 1 次**；④ 写完校验「每个函数名定义恰好 1 次」+ 运行时 `import` 一次。
- **⚠️ 毒丸实验**（验证测试是否真有效的最强手法）：把被测生产文件覆写成 `throw new Error('__QUARANTINE__')`
  再跑测试 —— **变红 = 测试真的加载了被测代码；照绿 = 测试完全失效**。比读代码判断可靠得多，能一次筛出
  整批虚假覆盖。实验后**必须恢复文件并跑全量复验**（备份放 `.probe-quarantine/`，用完即删）。
  **注入用正则替换，别用字面量拼接**（CRLF 会让 `\n` 拼接失配）。
- **inode 断言法**（判定"是否真的原子写"）：`rename` 落到新 inode，原地 `writeFile` 覆写 inode 不变
  → 断言 `fs.statSync(f).ino` 发生变化。比"写完能读回来"强得多（后者对非原子写同样成立）。
- **"修复有效"要给反例对照**：只证明"现在能过"不足以证明是对修复起效 —— 同时跑一条**不做修复**的同场景
  对照（2026-09-19 WS：挂 `preClose` 的 1.2s 内 close() 返回；注释掉后同场景 1.2s 内不返回）。
- **测「动态 `import()`」类代码 → 用 fixture 目录，别用 mock**：`unstable_mockModule` 对
  `await import(pathToFileURL(file))` **无效**（mock 注册的是模块说明符，不是运行时拼出的 URL）。
  给被测函数开一个 `options.registryDir` 这类参数，测试用 fixture 目录喂进去 →
  走的是与生产**完全相同**的「读目录 → 排序 → 逐个 import → 调 register」路径，只是内容可控；
  比 mock 更接近真实，还顺带覆盖了排序与目录扫描逻辑。
  ⚠️ fixtures 必须放在 `src/__tests__/` **里面**（jest 的 `testMatch` 只匹配 `.test.js`，
  fixtures 不会被当测试文件）；放到 `os.tmpdir()` 会因不在项目 `"type": "module"` 作用域内
  被当 CommonJS 解析，`export default` 直接语法报错。
- **同一条消息里对同一文件发多个 Edit 会静默丢失**（工具仍报成功）→ 同文件多处改动必须串行或合并一次
  Edit；改完 import/export 后跑一次真实 `import` 比读 diff 可靠。
- **成对改动必须两端都验证**（`throw err` 与 `err.code === ...`）：只改一端会让分支永不命中。
- **验证要"读 + 跑"**：光读代码会漏真 bug。可用 `app.inject()` + `sequelize.options.logging` 统计真实查询次数。
- **结构性断言要自带反例**："无环/无违规"这类结论不能来自可能写坏了的检测器 —— 内存构造一个反面样本
  确认它真会红，再报正常结果。

### 测试（本仓约定）

- **jest 里测真身**：无 `.env` 时访问层自动走内存实现 → **不必 mock Redis**；只替换"配置来源"（注入
  `DEFAULT_SECURITY_SETTINGS.defense` 的可写副本），零策略复制，且避开 `triggerSave` 1s 防抖覆写被 git
  跟踪的配置文件；落盘副作用用 `unstable_mockModule` 换桩 —— **替身必须镜像真身全部导出**。测 `store.js`
  真身落盘要覆盖 `FW_TRAFFIC_STATS_FILE` 到 os.tmpdir（默认文件**被 git 跟踪**）。
- **多个 `describe` 的 `beforeAll`/`afterAll` 按声明顺序执行**：共享临时目录/计时器要提到**顶层**，
  否则先声明的 `afterAll` 会提前清掉后一个 describe 的依赖（症状：ENOENT 噪声 + jest 不退出）。
- **jest ESM 下 mock 的 store 实例有"身份"**：`beforeEach` 里 `storeCache.clear()` 换新实例会导致被测代码
  仍用旧实例 → 测试间状态泄漏。给桩加 `reset()`（清内容、保实例身份）。
- **`registerSecureRoute` 用 Fastify 对象形式**（handler 在 `opts.handler`）；用假 Fastify 捕获 `(url, opts)`
  即可离线跑真身 handler（实测 6 模块 20 条路由全部可离线注册，不依赖 DB 初始化）。
- **`printRoutes()` 的树形渲染会拆路径段**：`/sessions/devices` → `sessions` + `/devices`；`kick-all` →
  `kick(POST)` + `-all(POST)`。断言要按**路径段**而非完整路径，且先去掉 `│├└─` 与空白再 `toContain`。
- **lint**：`jest/no-conditional-expect`（分支内 `expect`）→ 拆成两个用例、各自提前 `return` 后断言；
  `jest/expect-expect`：用 `throw new Error(...)` 代替 `expect` 也报 warning → 补一条真断言。
- **`.env` 的 `REDIS_ENABLED=true` 指向局域网 Redis**，测试时不可达 → `getStore` 走 Redis →
  `RedisUnavailableError`（`statusCode = 503`）。这不是测试写错，是**真实基础设施行为**。

### 审查命令（Windows Git Bash）

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"
```

直接 `npx jest` 会丢 ESM 标志；jest 30 里 `--testPathPattern` 已更名 `--testPathPatterns`。
**不可用的命令**：`grep -P`；`sort -u` / `wc -l *.js | sort -rn` 会报「系统找不到指定的文件」→ 用 Node 脚本
做遍历与统计（本仓既定手法），或 `for f in *.js; do printf "%6d %s\n" "$(wc -l < "$f")" "$f"; done`。
`ls .tmp-*` 的 glob 展开有误导性（见第 4 节）。审查模板 `framework/auth/docs/AUDIT-PROMPT.md`，
样例 `AUDIT-REPORT-2026-09-12.md`。**审查只读，不改产品代码。**

### 审计修复类任务

- **⚠️「读 + 跑」缺一不可**：4 个 🔴 里有两个（`initDao` 未调用、`requirePermission` 被丢弃）只看代码
  都像"已经修好了"，必须用 `app.inject()` 端到端 + 回读配置实体才能戳穿。
- **在 `app.inject()` 上做"上限压低"决定性实验**：把 `rateLimitRequests` 临时设成 2 再连打 6 次，
  比断言响应头更有说服力。**结束必须还原**并 diff 配置文件确认没写脏。
- **同一个缺陷在"死代码"里也存在**：`permission/seeder.js` 零调用但内含旧的坏值 `fw:admin:*`，
  谁把它接线回来就会把角色权限改回坏的。**零调用的重复定义应删除，而不是留着。**
