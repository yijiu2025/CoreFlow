# nodeServers 长期项目笔记

> 每日过程细节在 `YYYY-MM-DD.md`；本文件只留**跨会话仍有价值的事实与强制约定**。
> 维护：不要用 `cat >>` 追加（会从偏移 0 覆写），一律用 Write / Edit 工具。

---

## 0. 两个必须知道的仓库形态

### ⚠️ `packages/log/` 是独立的嵌套 git 仓库

remote `github.com/yijiu2025/log.git`，`.gitignore:32` 排除它，**主仓零跟踪**。
改它下面**任何**文件都要去那个仓库提交：

```bash
cd packages/log && git add -A && git commit && git push origin HEAD
```

- `git add packages/log/...` 在主仓**静默不生效**（报 gitignore 警告但 **Exit Code = 0**）
  → **add 阶段出现 gitignore 警告必须停下来查，不能只看退出码**
- 这个仓库**没有**主仓那个 packed-refs 失灵问题，push 后 ref 正常
- 对照：`packages/shared-device` **不是**独立仓库，由主仓跟踪
- 连带影响：框架侧文档用 `../../../packages/log/README.md#锚点` 链到包侧章节，
  改包侧**标题**会打断这些锚点 → 改完必须跑锚点校验（扫包侧标题生成 GitHub slug 比对）

### ⚠️ 本机 git ref 失灵（会误导 `git status`）

`.git/refs/remotes/origin/main` **无法由 git 自身写入**：`git update-ref` / `fetch` / `push`
都返回 0、reflog 正常追加，但松散 ref 文件不落地（`GIT_TRACE_REFS` 显示旧值读成全 0）。
git 为 `C:/Program Files/Code/Git`（2.52.0.windows.1），`git push` 甚至不输出任何内容。

- 手写松散 ref **当场有效，但下一次 `git push` 会连同目录一起删掉** → 只能改
  **`.git/packed-refs`** 中该行 SHA（保留 `# pack-refs with: peeled fully-peeled sorted ` 头行含尾空格，纯 LF）。
  **每次 push 后都要重做。**
- 已排除：定时清理、`core.fscache`/`fsmonitor`、`reference-transaction` 钩子。
- 后果：解析回退到旧值 → `git status` 谎报 ahead。**同步状态一律以 `git ls-remote origin main` 为准**
  （`git fetch` 打印的 `a..b main -> origin/main` 是**按远端数据谎报**，不代表本地 ref 写成功）。

---

## 1. 架构约定（强制，有守卫）

### 导出位置：所有 `export` 收拢到文件末尾（2026-09-15 立）

定义处不写 `export`。`src/` 全仓 204 个文件已改造完成。

- 具名 `function foo() {}` → 末尾 `export { foo };`（换行按 120 宽度决定）
- default **先命名再末尾导出**：`const defineUser = (s,d) => {...}; export default defineUser;`
- re-export 也放末尾
- 命名惯例：api 路由 `registerXxxRoutes`、models `defineXxx`、loader `xxxLoader`、dao `xxxDao`
- 双保险：`eslint.config.js` 的 `no-restricted-syntax`（`files: src/**/*.js`，含 `:has()` 兜底内联 default）
  + 契约测试 `src/__tests__/conventions/export-placement.test.js`
- ⚠️ 盲区：**全文件只有一个 export 语句时它天然"在末尾"**（`lastNonExportIdx = -1`），
  必须同时用「形式规则」（禁 `Export*Declaration > FunctionDeclaration`）兜住
- 范围仅 `src/`；`migrations/`（Umzug 的 `export async function up/down`）、`scripts/` 未纳入

### 依赖方向：`src` 不得 import `scripts`（2026-09-15 立）

- **只允许 `scripts/ → src/`**。`scripts/` 是可选宿主，不一定随部署安装；反向 import 会成环且部署期解析失败。
  守卫 `src/__tests__/conventions/no-scripts-import.test.js`（静态 + 动态 `import()` 都查）。
- **CLI 工具库位置**：`src/framework/cli/{table,input}.js`（桶 `index.js`，26 个符号）；
  模型加载与 DB 工具 `src/framework/db/models.js`。`scripts/lib/{table,input,db}.js` 已删除。
  应用插件写 `'../../../framework/cli/index.js'`；宿主写 `'../src/framework/...'`。
  `scripts/lib/redis.js` 保留（scripts 自有，src 不引用）。
- **模型文件是工厂函数** `(sequelize, DataTypes) => Model`：`await import(path)` **不注册任何模型**。
  旧 `scripts/lib/db.js` 的 17 条 import 全部"成功"却注册 **0** 个模型、**0** 条关联（手工清单还漏了 15/32）。
  现 `scanModels()` 扫 `src/models/` 供**应用 loader 与 CLI 共用**（06-models.js 也用它），实测 32 模型 / 22 关联。

### firewall 分层与无环（2026-09-16 立）

**层级（越靠下越底层，必须单向）**：
`interface/` → `config/ util/` → `dao/` → `engine/` → `services/ cli/ data/` → `index.js`

- ⚠️ **`engine/dao` 已撤销**。真身是 **`src/app/firewall/dao/block-manager.js`**。
  `engine/` 语义是"检测与响应"，存储 CRUD 属持久化层。放错位置的后果是 `engine/index.js`
  被迫 re-export 一整组封禁函数当后门 —— 现已移出「封禁核心」「util 工具」两段转发。
  **封禁能力请直接 `import '../dao/block-manager.js'`**，`engine/index.js` 只留检测器/自动响应/请求管道。
- ⚠️ **同目录同名文件搬迁 = 先写新文件校验一致，再删旧文件**。用带断言的 Node 脚本
  （源 md5 → 确认目标当前确是纯 shim 才允许覆盖 → 替换数守恒 → 落盘后归一化比对），
  否则中途失败即丢失几百行真身。
- **环的形态（跨 3 文件，肉眼看不出来）**：`util/shared.js → dao/dao.js → util/redis.js`。
  根因是 dao 没有独立层级位置，要读配置只能反向够到 util。**修法用依赖倒置，不是搬代码**：
  `interface/config-access.js` 零 import，持有可注入的**函数引用**（不是配置对象 → 无快照无缓存），
  dao 加载时 `registerSettingsReader(() => securitySettings)` 注册，util 的 `getConfig()` 从它读。
  未注册时**抛错**而非返回 undefined —— 后者会让 `settings.defense` 变 TypeError 且失败点离根因很远。
- **改动配置读取路径时，mock 目标必须跟着换**。真身改从 interface 读配置后，
  `bot-detector.test.js` 原先对 `dao/dao.js` 的 mock 立刻完全失效（真身根本不加载 dao），
  10 项用例因「读取器未注册」全红 —— 这是「未注册就抛错」设计**没有骗过测试**的直接证据。
- 守卫 `src/__tests__/conventions/firewall-layering.test.js`（12 项）：DFS 三色法查环 +
  **自带反例**（内存构造 3 节点环确认检测器真会红，无环图报 0 防误报）。
  ⚠️ "无环"这个结论**不能来自可能写坏了的检测器** —— 每条结构性断言都要自带反例。
  分层方向：interface 零依赖 / util 不得依赖上层 / config 不得依赖 dao / engine 不得依赖 services。

---

## 2. firewall 业务事实

### 三维度封禁（ip / fingerprint / device）

- `fingerprint = sha256(ip|ua|lang|enc)` 前 16 位 —— **输入含 IP → 换 IP 即变、改任一请求头也变**。
  所以 README 那句"同一攻击者更换 IP 后仍可追踪"与实现**相反**；指纹只能表达
  「这台机器 + 这个 IP + 这组请求头」。
- **`deviceId` 是栈里唯一与 IP 无关的身份**（auth 结构化 ID `WEB-<Base62ts>-<6位>`）。
  跨 IP 追踪只能靠它。取值用 `framework/auth/device.js` 的 **`getClientDeviceId()`**：
  只认客户端自报且校验通过的值、**不补发**（补发的 ID 每请求都可能不同，拿它封禁等于没封）。
- 自动封禁/挑战走 `block-manager.setBlockForSubject({ip, deviceId}, meta)` → **同时**写两个维度；
  `enableDeviceBlock=false`（`FW_DEVICE_BLOCK`）退回纯 IP。
- 访问层读写统一走 `util/redis.js` 的 `DIMS` 分派表 + `dimOf()` 优先级（device > fingerprint > ip），
  **不要**再散落 `isFp ? A : B` 三元。
- **强度边界（写代码/写宣称时都要守）**：`device_id` 由客户端携带且**不是凭证**，
  清 localStorage + httpOnly cookie 即可换新身份 → 这是**提高攻击成本**，不是屏障。
- 匿名短路 `defense.skipDeepCheckForAnonymous`（默认关闭）：路由 `config.requireLogin === true`
  且**一个凭据都没带**才跳过深度检测。`requireLogin` 由 `registerSecureRoute` 写进路由 config ——
  前提是「Fastify 在 onRequest 前完成路由匹配」（已用真实 Fastify 用例钉死，勿假定永久成立）。
- 挑战机制已从「HMAC 明文内嵌」换成 **SHA-256 PoW**：`util/pow-sha256.js`（页面内联
  `sha256Hex.toString()` 保证浏览器/服务端同一份算法）+ 服务端单次载荷（`LUA_TAKE_CHALLENGE` 原子 GET+DEL）。

### 审计修复落点

- 报告 `src/app/firewall/docs/AUDIT-REPORT-2026-09-15.md`（4🔴/15🟡/17🔵）+
  `FIX-REPORT-2026-09-15.md`（含复验中新发现的 N-1/N-2/N-3）。
- 已修 4🔴 / 14🟡 / 15🔵，🔵-7（本次撤销 `engine/dao` 后已解决）。
  **遗留**：🟡-7（3 个测试仍是内联副本，已加警示注记）、🔵-17（401 也走完整检测管道，属性能取舍）。
- `scripts/sync-guard-config.js`：剥离 `guard_configs` 里覆盖代码声明的运行时字段，默认 dry-run。

---

## 3. 框架层陷阱（实测确认，改代码前必读）

- **`getModel(name)` 未命中抛 `TypeError`**（非返回 null，`db/index.js:77`）→ `if (!Model) return null` 是死代码，
  调用点应放进 `try`。点号写法 `'a.B'` 只取最后一段，与 `'B'` **完全等价** → 全仓统一写 `'SessionToken'`。
- **`getStore(prefix, opts)` 按 prefix 隔离命名空间**（`redis/get-store.js:80`，键 = `prefix+timeout+backup`）。
  `'user_sessions'` ≠ `'userSessions'`（曾致注销清理静默零执行）。**命名空间字符串全仓必须逐字一致。**
  Redis 未配置时走 **MapStore，不支持 `zAdd`/`zRangeByScore`**。
  `getMapStore(prefix)` **不做实例缓存**（每次返回新包装对象），底层静态存储按 prefix 共享
  → 断言"数据共享"而非"对象同一"。
- **`underscored: true` 命名陷阱**：时间戳**属性名**是 `createdAt`/`updatedAt`（物理列才是 `created_at`）。
  写进 `attributes: [..., 'created_at']` 会被 Sequelize **静默丢弃** → 读 `x.created_at` 得 undefined
  → `new Date(undefined)` = `Invalid Date`（CLI 时间列全花）。但 `order`/`where` 用物理列名**可用**（raw 透传）。
- **`AsyncLocalStorage` 单例放独立零依赖模块**（`framework/auth/request-context.js`）。重构时必须验证
  re-export 与源模块是**同一实例**（`m.x === src.x`），两个 ALS 实例会让上下文穿透**静默失效**。
- **`crypto.timingSafeEqual` 要求两 Buffer 字节长度相等**，否则抛 `RangeError`；`Buffer.from(str,'hex')`
  遇非法 hex **静默截断成空 Buffer** → 「比字符串长度」≠「比字节长度」。
- **`bcryptjs` 只取前 72 字节**；密码长度上限按 `Buffer.byteLength` 判断，`maxLength:128`（字符）会漏尾巴。
- **⚠️ 高频缺陷类「守卫未防御非预期输入」**（cookie.js / totp.js / signature.js 各 1 例）：外部可控值
  直接进 `timingSafeEqual` / `.length` / `Buffer.from(x,'hex')` → 必须先做类型 + 长度归一化，
  并把函数体包进 try 兜底到声明的失败返回值。
- **⚠️ 改完导出面必须 `import` 一次上层入口模块**（单测跑不到那里）。ESM **链接期**抛
  `does not provide an export named ...`，整个入口注册失败。两次实战：`willBeRejectedAsAnonymous`
  （engine/index.js → app/firewall/index.js）、`startCleanupTask`（撤销 engine/dao 时）。
- **裸 `export { x }` 只导出本模块绑定**，跨模块会抛 `SyntaxError: Export 'x' is not defined in module`
  （只有运行时导入才暴露）→ 跨模块 re-export 必须带 `from` 子句。
- **⚠️ 模块级 `process.exit` 是会伪装的绿色**：`framework/db/index.js` 缺 DB 环境变量时
  `setTimeout(() => process.exit(1), 100)` → jest worker 跑一半被强杀。
  症状：**用例总数每次都不一样**而**汇总恒 0 失败**；`--runInBand` 中途死掉。
  修法 `!isTestEnv`。**看到"用例总数不稳定"先查模块级 exit，别当成 jest 抽风。**
- **⚠️ 插件"双重注册"会让整条钩子链翻倍**：同一个 `init` 既被 `loader/registry/NN-*.js` 注册、
  又被 `10-apps.js` 通过 `appConfig.init` 注册一次。firewall 实例：`totalRequests` 每次 +2、
  404 扫描陷阱阈值 10 实际 5、Redis 命令数翻倍。**新 app 接入前先确认 `init` 只被一个位置注册。**
- **注释里不要写 `from './xxx.js'` 字面量**：依赖图脚本正则会误判成真实依赖，造出假环。

---

## 4. CLI / 脚本

- **非 Fastify 进程（CLI / 脚本）**：`globalRedis` 恒为 null（插件不执行）→ `getStore()` 抛 `RedisRequiredError`。
  用 `connectStandalone()` / `disconnectStandalone()`（`framework/redis/index.js` 导出）引导；
  **不释放 socket 会让一次性进程挂住**。`globalRedis` **没**从 `index.js` 导出，取裸客户端要 import `plugin.js`。
- **CLI 写配置前必须先 `initDao()`**（否则用 `DEFAULT_SECURITY_SETTINGS` 覆盖线上配置文件）。
  管道一次喂入多行交互输入会**漏行**（`rl.question` 注册晚于已缓冲的 `line` 事件）→ 行间加延迟。
  CLI 运行**不启动 Fastify**，所以任何走 `req.server.redis` 的路径在 CLI 下都不存在。
- 临时脚本一律 `.tmp-*.mjs`，**先写文件再跑**（heredoc 里 `${...}` 会被 bash 展开；
  `/tmp` 会被路径转换搞坏）。`.gitignore` 只忽略 `.tmp-probe/`，`.tmp-*.mjs` 跑完必须 rm。

---

## 5. Redis / node-redis v5（动 redis 代码前必读）

- **node-redis v5 只有驼峰命令**。全小写 `client.hset/hgetall/hdel/zadd/smembers/pttl/expire` 全是 `undefined`
  → 调用即 `TypeError`（ioredis 写法移植过来必炸，且往往落在 `try` 里被静默吞掉）。
- `dbSize` 不是 `dbsize`（`redis status` 整条命令炸）；`client.info('server')` 取不到 `connected_clients`
  （属 clients section）→ 改 `client.info()` 一次取全量，顺带把 3 次往返收敛成 1 次。
  守卫 `src/__tests__/conventions/node-redis-v5-commands.test.js`（裸客户端标识符 + 小写多词命令，
  且不得误伤框架自己的 `store().hgetall` 这类小写 store API）。
- **无 `pipeline()`**（只有 `multi()`）；`eval` 必须 `client.eval(script, { keys, arguments })`；
  `scan(cursor)` 的 cursor **必须传字符串**。
- **框架 store 语义**：`getStore(prefix)` 的 key 自动加 `prefix:`；`store().get()` 会 **safeParse**
  （JSON 串→对象），需要真正原始字符串时必须 `store().call(c => c.get(full))`；
  `store().hexists` 返回 **1/0 而非布尔**（判真用 `Boolean()`）。
- **`withTimeout` 的孤儿 promise（已修，缺陷类要记住）**：`result.finally(clear)` 会派生一个**被丢弃**的
  promise，主 promise reject 时孤儿也 reject 且无处理者 → 默认 `--unhandled-rejections=throw` **直接杀进程**。
  表现：一次普通 Redis 命令错误（如对 hash 键 GET 的 WRONGTYPE）升级为**整个服务崩溃**，
  崩溃栈指向 node-redis 解码器、与本项目代码毫无关联。修法 `result.then(clear, clear)`。
  守卫 `src/__tests__/framework/redis/utils-timeout.test.js`（含「禁止 `x.finally(`」源码守卫）。
- **firewall 的 Redis 访问已收敛**到 `src/app/firewall/util/redis.js`（语义化 API + Lua 单往返 + 内存降级）。
  **不要再往调用点塞裸 redis 客户端 / 各自拼命令**，否则回退成「同一个存储层在 app 里能用、在 CLI 里全废」。
  守卫 `src/__tests__/firewall-redis-adapter.test.js`（源码级 + 行为级）。
  **封禁必须同时写「键」与「索引 hash」**，只写键 → 封禁生效但管理端列表永远空。
- **对称缺陷类**：`pipeline.js` 有两个 `Security Policy Blocked` 回包点，只有一处透传 `err.headers`
  → `Retry-After` 从未下发（全局封禁阶段漏了）。改这类「成对」代码必须两端一起改并各测一次。

---

## 6. Fastify 插件 / 钩子注册顺序（改 loader 前必读）

- **`loader/registry/NN-*.js` 的数字前缀就是执行顺序**，路由注册在 `08-api`。钩子分两类，**回不回溯差别巨大**：
  - `addHook('onRequest'|'onPreHandler'|...)`：**后加也生效**（即使路由注册在别的子作用域、注册得更早）。
  - `addHook('onRoute', ...)`：**只对「钩子注册之后」注册的路由触发，不回溯**。
    `@fastify/rate-limit` v10 的 `global: true` **正是靠 `onRoute`**。
- **推论（踩过的坑）**：防火墙插件放在 `10-apps`（`08-api` 之后）时，全局限流"注册成功但永不触发"——
  `printPlugins` 能看到、`hasPlugin` 也是 true，但 `max=2` 连打 6 次全部 200。
  **修法：`initFirewall` 的唯一注册点是 `loader/registry/05-firewall.js`**（早于 08-api），
  `app/firewall/config.js` 里不要再写 `init`（同时消除双注册）。
- **`errorResponseBuilder` 必须带 `statusCode`**：插件是 `throw errorResponseBuilder(...)`，
  Fastify 只认抛出对象上的 `statusCode`。只返回 `{ code: 429, ... }` → **限流命中返回 500**。
- **`app.register(x)` 的 body 在 `ready()` 才按队列执行**；只有 `await app.register(x)` 才会**当场**执行
  （这也是"后加钩子"能否在路由注册前生效的关键）。
- **`app.register(config.init)` 会新开封装作用域**：`oauth21/config.js` 的 `init()` 内注册的 CSRF 钩子、
  敏感接口限频器，以及从未被任何地方注册的 `initOAuthMiddleware`（H5 签名校验）**全部不会执行**
  （实测：登录路由连打 7 次无 429；带 `_csrf` cookie 无 header 仍 401 而非 403）。
  修法：用 `fastify-plugin` 包住 `init`，或直接在根实例上注册钩子。

---

## 7. Guard / 授权（勿回退）

- **`api/guard-config.js` 的 `registerApiMetadata` 曾静默丢弃 `requirePermission`**（system/group/api 三级都漏），
  而 `createGuard → applyGuardLogic` 恰恰**从配置对象读**它 →
  **全仓 HTTP 路由上 `registerSecureRoute({requirePermission})` 一直是空操作**。
  三重教训：① 传了参数≠存下来了，配置类函数要回读断言；② 修 🔴 "把 allowRoles 换成 requirePermission"
  时必须先确认后者真的生效，否则**把有效保护换成空操作**；③ `permission` 是 `requirePermission` 的短别名。
- **`requirePermission` 属代码级授权声明**（与 name/url/method 同类），**不入 `RUNTIME_FIELDS`**：
  它必须由代码决定并每次启动刷新，若可被 DB / 热更新接口改写 = 运维改一次就能永久提权。
  `RUNTIME_FIELDS` 只有 `['enabled','requireLogin','allowIps','allowRoles']`。
- **守卫热更新接口（`PATCH /:system/:group`）必须有字段白名单**：`updateConfig` 曾把请求体原样
  `Object.assign` 进配置 → 可把 `enabled` 置 false 或把 `requirePermission` 置 null。现为
  `PATCHABLE_FIELDS`（enabled/requireLogin/allowIps/allowRoles/description），未知字段**显式 400**。
- 级联守卫是 **system → group → api，任一层为真即生效**。所以系统级 `requireLogin: true` 会让
  组级声明的 `false` 形同虚设（挑战验证接口曾因此被 401 拦死）。防火墙系统级现为 `false`，由各组自声明。
- **`allowRoles` 只在 `length > 0` 时才校验**（`api/guard.js:189`）：写 `allowRoles: ['admin']` 而
  `iam_role` 里并无 `code='admin'` 的角色（超管实为 `{appId}_admin`）→ **永不匹配**，等于路由裸奔到
  "只要求登录"。`allowRoles: []` 的语义是**「不限角色」而不是「禁止」** —— 想收紧必须用 `requirePermission`。
- `fw_admin` 的动作是 **`fw:*`**；`fw:admin:*` 这种写法只能匹配 `fw:admin:` 前缀，**覆盖不到任何有效权限码**。

---

## 8. 日志系统（wb-logkit）

- **唯一日志出口** `src/framework/log/index.js`（`export * from 'wb-logkit'`）；业务代码禁 `console.*`。
  **禁止深层路径导入 `packages/log/src/*`**。`packages/log` 是本地 workspace 包（内嵌独立 git 仓库），
  靠软链生效，**不要写进 `dependencies`**。改它下面的文件要去该仓库提交（见第 0 节）。
- **两份文档已分工**（2026-09-16）：`packages/log/README.md` = 环境变量/配置/API/文件规则的**权威源**；
  `src/framework/log/README.md` = **宿主接入约定**（app.js 调用时机、全局 log 注册、ESLint 约束、
  `initLogErrorTraps`），**不复制**包的配置细节。改环境变量或 `config()` 行为 → 只改包侧 README。
  框构侧原先三张重复表（环境变量 21 行 + file 字段表 + 目录布局表 + 产出规则表，合计 51 行）已删，改为 9 条锚点链接。
- 已开源 https://github.com/yijiu2025/log ；npm 包名 **`wb-logkit`**，最新 **0.5.0**
  （另有 scoped 备份 `@qirly/wb-log@0.1.0`）。`createLogger(tag, asGlobal)` 只有两个参数，
  其余配置走 `log.config({...})`。
- **文件输出默认关闭**：给 `file: {…}` 即开启，`file: false` 关闭；`configureLog` 全项目只在 `src/app.js` 调一次。
- **通道独立级别**：`'info'`/`'all'`/`['info','error']`/`'warn,error'`/`'off'`；**显式通道配置优先于全局
  `level` 门槛**（`file.level='all'` 连 trace 也落盘）。实例 `file` 配置是**替换而非叠加**。
- 目录 `logs/<日期>/<模块>/app.log`；清理只整块删过期 `YYYY-MM-DD` 目录，非日期目录与当天目录永不触碰。
- **故障不静默**（0.5.0 起）：`packages/log/src/degraded.js` 是唯一"库自身故障留痕"出口（stderr + 限流）。
  stderr 出现 `❌/⚠️ [wb-logkit] ...` 是**预期行为，不是 bug**。
- **logger 实例上没有 `stdout` 方法**。CLI/脚本面向用户的裸输出用**顶层导出** `logStdout(text)`（别名 `stdout`），
  直写 `process.stdout`、无时间戳装饰，**不受 LOG_LEVEL 门控**，且**完全不落盘**
  （`transports.js:160` 的 `stdout()` 只碰 `process.stdout`，从不经过 `fileTransport`）。
  守卫用例 `wb-log.test.js`「logStdout：不写文件，也不受控制台/文件开关门控」。
  判定准则：输出给**人**看（表格、进度、结果）→ `logStdout`；给**排查留档**看 → `log.info/warn/error`。
  实测 `LOG_LEVEL=warn` 时 `log.info` 被**整条丢弃**而 `logStdout` 照常输出 ——
  迁移/脚本的结果输出绝不能用 `log.info`，否则生产收敛后是**静默失败**（什么都没发生，而不是报错）。
- 历史事故（2026-09-15 修复）：`scripts/migrate-console-to-log.js` 的 `REPLACEMENTS_CLI` 曾把
  `console.log/info` 映射成不存在的 `'log.stdout'`，导致全仓 **324 处 / 30 文件**运行到输出即抛 `TypeError`。
  修正后按**实际用到的符号**注入 import。守卫 `src/__tests__/framework/log/log-usage-contract.test.js`
  全仓禁 `log.stdout`。正确范例 `src/__tests__/test-db.js:7`：`import { logStdout as stdout }`。
- `packages/log/docs/` 三份审计报告基线 0.4.1，包已 0.5.0，属**过期历史快照**（已向用户提示，未动）。

### 发布速查

`cd packages/log && git add -A && git commit && git push origin main` → `npm publish --access public`
（含 `/` 的配置项 → `--userconfig ./.npmrc.tmp`，用完即删）。当前用户 `qirly`。

- 先 `npm whoami`：401 ⇒ token 失效；`publish` 返回 **PUT 404 = 无写权限**；`~/.npmrc` 需
  `//registry.npmjs.org/:_authToken=<40位>`（CRLF/BOM 会**伪装成 token 失效**）。
- **超时 ≠ 失败**：`SENSITIVE_APPROVAL=TIMED_OUT` 别重试，先 `npm view wb-logkit version` 确认。
- 发布后**从 npm 真实安装回归**（本地软链会掩盖问题）。

---

## 9. 手法 / 缺陷类

### 大文件拆分 / 重构（1409 行一次成型验证有效）

**不要手工复制**几百行。写 Node 脚本**按行号切片**，四条断言：
① 每段声明 `[start,end,期望首行]`，不符立即退出不写文件；
② 覆盖性断言——切片 + 未迁走部分的并集覆盖源文件全部非空行；
③ 语义改写片段断言**恰好命中 1 次**；④ 写完校验「每个函数名定义恰好 1 次」+ 运行时 `import` 一次。

- **同一条消息里对同一文件发多个 Edit 会静默丢失**（工具仍报成功）→ 同文件多处改动必须串行或合并一次 Edit。
- **成对改动必须两端都验证**（`throw err` 与 `err.code === ...`）：只改一端会让分支永不命中。
- **验证要"读 + 跑"**：光读代码会漏真 bug。可用 `app.inject()` + `sequelize.options.logging` 统计真实查询次数。

### 测试

- **jest 里测真身的手法**：无 `.env` 时访问层自动走内存实现 → **不必 mock Redis**；
  只替换"配置来源"（注入 `DEFAULT_SECURITY_SETTINGS.defense` 的可写副本），零策略复制，
  且避开 `triggerSave` 1s 防抖覆写被 git 跟踪的配置文件；落盘副作用（`data/store.js` 10s 防抖写
  `traffic_stats.json`）用 `unstable_mockModule` 整体换成可断言桩。
- **jest ESM 下 mock 的 store 实例有"身份"**：`beforeEach` 里 `storeCache.clear()` 换新实例会导致
  被测代码仍用旧实例 → 测试间状态泄漏。给桩加 `reset()`（清内容、保实例身份）。
- **`registerSecureRoute` 用 Fastify 对象形式**（handler 在 `opts.handler`，非第 3 个位置参数）；
  用假 Fastify 捕获 `(url, opts)` 即可离线跑真身 handler。守卫的 `_routeRegistry` 有重复注册
  检测 → **一个测试文件只能注册一组路由**，须模块顶层注册一次共享。测试里
  `getGuardConfig().prefix` 为空，真实 URL 是 `/v1/monitor/...` 而非 `/api/firewall/v1/...`。
- **内联副本测试会固化与真身相反的结论**（不只是覆盖不到）：旧 `bot-detector.test.js` 副本
  把 `curl` 当 bot 模式，真身默认只有 `libcurl` —— 裸 `curl` 请求 10 万次也只走 PASS。
  识别特征：文件里出现 `function 同名()` 且**没有任何 `import ... from '../app/...'`**。
  子 Agent 产物 / `__tests__` 里出现"无 import 的纯本地函数再断言"一律视为未覆盖。
  历史：auth 曾 4 套 `verifyCookie` 副本掩盖 🔴-1 → 跨模块被解构的符号应加契约测试固化。

### 审查命令（Windows Git Bash）

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"
```

直接 `npx jest` 会丢 ESM 标志；jest 30 里 `--testPathPattern` 已更名 `--testPathPatterns`。
`grep -P` 不可用；`wc -l *.js | sort -rn` 报错 → 用
`for f in *.js; do printf "%6d %s\n" "$(wc -l < "$f")" "$f"; done`。
审查模板 `framework/auth/docs/AUDIT-PROMPT.md`，样例 `AUDIT-REPORT-2026-09-12.md`。**审查只读，不改产品代码。**

### 审计修复类任务

- **⚠️「读 + 跑」缺一不可**：4 个 🔴 里有两个（`initDao` 未调用、`requirePermission` 被丢弃）
  只看代码都像"已经修好了"，必须用 `app.inject()` 端到端 + 回读配置实体才能戳穿。
  可用 `app.inject()` + `sequelize.options.logging` 统计真实查询次数。
- **在 `app.inject()` 上做"上限压低"决定性实验**：把 `rateLimitRequests` 临时设成 2 再连打 6 次，
  比断言响应头更有说服力。**结束必须还原**并 diff 配置文件确认没写脏。
- **同一个缺陷在"死代码"里也存在**：`permission/seeder.js` 零调用但内含旧的坏值 `fw:admin:*`，
  谁把它接线回来就会把角色权限改回坏的。**零调用的重复定义应删除，而不是留着。**
