# 项目长期约定

## 目录分层（判断代码该放哪的准绳）

- `src/framework/` = 跨业务基础设施，零业务语义：`log`/`db`/`redis`/`jwt`/`auth`/`verify`/`loader`。
- `src/app/` = 业务应用：`oauth21`/`user`/`admin`/`firewall`/`posecraft`/`notice`/`guard`。
- **`oauth21` 只是一个业务 app**（OIDC/OAuth 2.1 授权服务器），不是"认证层本身"。认证基础设施是
  `framework/auth`，由 `registry/04-auth.js` 独立注册。**app 之间不应互相依赖。**
- 归属三问：① 多 app 潜在共用 ② 零业务语义 ③ 零依赖纯逻辑 —— 三者全中才放 `framework/`。
- `password-policy.js` 放 auth 合理，**不要迁 oauth21**（论证见 `framework/auth/docs/PLACEMENT-password-policy.md`）。
- `framework/auth` 分工：`password-policy`(强度)/`totp`(2FA，全仓零引用但已 RFC 6238 6/6 验证正确)/
  `signature`(请求签名)/`origin-guard`/`anomaly-detector`/`audit-logger`/`permission-loader`。
  `audit-logger` 的 `logLogout`/`logKick`/`logPasswordChange`/`getAuditLogs` **4 个导出无生产调用方**（待决策）。
- **会话子模块已拆 4 文件**（原 session.js 1409 行超限）。改动前先定位：`session-store.js`（底座：6 个
  getStore / MAX_* / sidHash / revokeFamily，不 import 兄弟模块）→ `session-kick.js` / `session-governance.js`
  → `session.js`（生命周期 10 函数，末尾 re-export 24 项保持兼容）。回归守卫
  `__tests__/framework/auth/auth-contract.test.js`（行数硬限/无环/导出面/去重计数）+ `session-kick.test.js`。

## 请求链路与数据库（2026-09-14 实测，Sequelize 查询日志）

- **每个请求最少查 0 次库**。全局钩子链（monitor / auth onRequest / firewall / Guard preHandler）全走
  Redis + 内存，只有 `framework/auth` 的 4 个条件落点会碰 MySQL：
  ① `index.js:153 findUserById`（Bearer JWT + 用户缓存 30s 未命中）
  ② `index.js:191 loadUserPermissions`（JWT 无 claim + 权限缓存 5min 未命中）
  ③ `session.js:370 SessionToken.findOne({include User})` + `:424 loadUserPermissions`（sid 在 Redis 未命中降级）
  ④ `session.js:894 SessionToken.findOne`（经 `device.js:186 loadFromDb`；**触发条件：客户端无有效
  device id 且 Redis session.deviceId 非法/缺失**）
- 实测：无 Cookie / 无效 Cookie / 未登录 401 / 404 → **0**；已登录 + 合法 `x-device-id` → **0**；
  已登录 + 无 device id 但 session.deviceId 合法 → **0**；session.deviceId 非法 → **1**；
  Redis 会话丢失降级 → **1(含 JOIN User) + 3(loadUserPermissions) = 4**。业务 handler 自己的查询另算。
- **`app.register(config.init)` 会新开封装作用域**：`oauth21/config.js` 的 `init()` 内注册的 CSRF 钩子、
  敏感接口限频器，以及从未被任何地方注册的 `initOAuthMiddleware`（H5 签名校验）**全部不会执行**
  （实测：登录路由连打 7 次无 429；带 `_csrf` cookie 无 header 仍 401 而非 403）。
  修法：用 `fastify-plugin` 包住 `init`，或直接在根实例上注册钩子。

## 导出位置（全仓强制，2026-09-15 立）

**所有 `export` 收拢到文件末尾**，定义处不写 `export` 关键字。`src/` 全仓 204 个文件已一次性改造完成。

- 具名：`function foo() {}` → 末尾 `export { foo };`（是否换行按 120 宽度决定）
- default：**先命名再末尾导出** —— `const defineUser = (s, d) => {...}; export default defineUser;`
- re-export（`export * from` / `export { default as x } from './y.js'`）同样放末尾
- 生成新标识符的命名惯例：api 路由插件 `registerXxxRoutes`、models `defineXxx`、loader `xxxLoader`、dao `xxxDao`
- **双保险**：`eslint.config.js` 的 `no-restricted-syntax`（`files: src/**/*.js`，含 `:has()` 兜底内联 default）
  + 契约测试 `src/__tests__/conventions/export-placement.test.js`。完整规范见 `AGENTS.md`「导出位置（强制）」
- ⚠️ 位置判定有盲区：**全文件只有一个 export 语句时它天然"在末尾"**（`lastNonExportIdx = -1`），
  所以必须同时用"形式规则"（禁 `Export*Declaration > FunctionDeclaration` 等行内形式）兜住
- 强制范围目前仅 `src/`；`migrations/`（Umzug 的 `export async function up/down`）、`scripts/` 未纳入

## 框架层通用陷阱（实测确认，改代码前必读）

- **`getModel(name)` 未命中抛 `TypeError`**（非返回 null，`db/index.js:77`）→ `if (!Model) return null` 是死代码；
  所有调用点应放进 `try` 内。点号写法 `'a.B'` 只取最后一段，与 `'B'` **完全等价** → 全仓统一写 `'SessionToken'`。
- **`getStore(prefix, opts)` 按 prefix 隔离命名空间**（`redis/get-store.js:80`，键 = `prefix+timeout+backup`）。
  `'user_sessions'` ≠ `'userSessions'`（曾致注销清理静默零执行）。**命名空间字符串全仓必须逐字一致。**
  Redis 未配置时走 **MapStore，不支持 `zAdd`/`zRangeByScore`**。
- **`AsyncLocalStorage` 单例放独立零依赖模块**（`framework/auth/request-context.js`）。重构时必须验证
  re-export 与源模块是**同一实例**（`m.x === src.x`），两个 ALS 实例会让上下文穿透**静默失效**。
- **框架不应有循环依赖**：查环用 DFS 三色脚本（比肉眼可靠）。改 auth 目录结构后要复验"无环"。
- **`crypto.timingSafeEqual` 要求两 Buffer 字节长度相等**，否则抛 `RangeError`；`Buffer.from(str,'hex')`
  遇非法 hex **静默截断成空 Buffer** → 「比字符串长度」不等于「比字节长度」（auth 审查 🔴-1 根因）。
- **`bcryptjs` 只取前 72 字节**；密码长度上限按 `Buffer.byteLength` 判断，`maxLength:128`（字符）会漏掉尾巴。
- **「守卫未防御非预期输入」是本仓高频缺陷类**（cookie.js / totp.js / signature.js 各 1 例）：外部可控值
  直接进 `timingSafeEqual` / `.length` / `Buffer.from(x,'hex')` → 必须先做类型 + 长度归一化，
  并把函数体包进 try 兜底到声明的失败返回值。
- **测试里出现 `function 同名()` 而非 import 时高度警惕**：内联副本会与真身漂移（auth 曾 4 套
  `verifyCookie` 副本掩盖 🔴-1）。跨模块被解构的符号应加契约测试固化。

## 大文件拆分 / 重构手法（1409 行一次成型验证有效）

- **不要手工复制**几百行。写 Node 脚本**按行号切片**，四条断言：① 每段声明 `[start,end,期望首行]`，
  不符立即退出不写文件；② 覆盖性断言——切片 + 未迁走部分的并集覆盖源文件全部非空行；③ 语义改写片段
  断言**恰好命中 1 次**；④ 写完校验「每个函数名定义恰好 1 次」+ 运行时 `import` 一次。
- **跨模块 re-export 必须带 `from` 子句**：裸 `export { x }` 只导出本模块绑定，跨模块会抛
  `SyntaxError: Export 'x' is not defined in module`（只有运行时导入才暴露）。
- **注释里不要写 `from './xxx.js'` 字面量**：依赖图脚本正则会误判成真实依赖，造出假环。
- **jest ESM 下 mock 的 store 实例有"身份"**：`beforeEach` 里 `storeCache.clear()` 换新实例会导致
  被测代码仍用旧实例 → 测试间状态泄漏。给桩加 `reset()`（清内容、保实例身份）。
- **成对改动必须两端都验证**（`throw err` 与 `err.code === ...`）：只改一端会让分支永不命中。
- **同一条消息里对同一文件发多个 Edit 会静默丢失**（工具仍报成功）。同文件多处改动必须串行或合并一次
  Edit；改完 import/export 后跑一次真实 `import` 比读 diff 可靠。
- **验证要"读 + 跑"**：光读代码会漏真 bug。临时探针脚本用 Write 写文件（heredoc 里 `${...}` 会被 bash 展开；
  `/tmp` 会被路径转换搞坏）。可用 `app.inject()` + `sequelize.options.logging` 统计真实查询次数。

## 测试 / 审查命令（Windows Git Bash）

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"
```

直接 `npx jest` 会丢 ESM 标志；jest 30 里 `--testPathPattern` 已更名为 `--testPathPatterns`。
`grep -P` 不可用；`wc -l *.js | sort -rn` 报错 → 用 `for f in *.js; do printf "%6d %s\n" "$(wc -l < "$f")" "$f"; done`。
审查模板 `framework/auth/docs/AUDIT-PROMPT.md`，样例 `AUDIT-REPORT-2026-09-12.md`。**审查只读，不改产品代码。**

## 日志系统（wb-logkit）

- **唯一日志出口** `src/framework/log/index.js`（`export * from 'wb-logkit'`）；业务代码禁 `console.*`。
  **禁止深层路径导入 `packages/log/src/*`**。`packages/log` 是本地 workspace 包（内嵌独立 git 仓库），
  靠软链生效，**不要写进 `dependencies`**。
- 已开源：https://github.com/yijiu2025/log ；npm 包名 **`wb-logkit`**，最新 **0.5.0**（另有 scoped 备份
  `@qirly/wb-log@0.1.0`）。`createLogger(tag, asGlobal)` 只有两个参数，其余配置走 `log.config({...})`。
- **文件输出默认关闭**：给 `file: {…}` 即开启，`file: false` 关闭；`configureLog` 全项目只在 `src/app.js` 调一次。
- **通道独立级别**：`'info'`/`'all'`/`['info','error']`/`'warn,error'`/`'off'`；**显式通道配置优先于全局
  `level` 门槛**（`file.level='all'` 连 trace 也落盘）。实例 `file` 配置是**替换而非叠加**。
- 目录：`logs/<日期>/<模块>/app.log`；清理只整块删过期 `YYYY-MM-DD` 目录，非日期目录与当天目录永不触碰。
- **故障不静默**（0.5.0 起）：`packages/log/src/degraded.js` 是唯一"库自身故障留痕"出口（stderr + 限流）。
  stderr 出现 `❌/⚠️ [wb-logkit] ...` 是**预期行为，不是 bug**。
- **logger 实例上没有 `stdout` 方法**。CLI/脚本面向用户的裸输出用**顶层导出** `logStdout(text)`
  （别名 `stdout`），直写 `process.stdout`、无时间戳装饰，且**不受 LOG_LEVEL 门控**。
  判定准则：输出给**人**看（表格、进度、结果）→ `logStdout`；给**排查留档**看 → `log.info/warn/error`。
  实测 `LOG_LEVEL=warn` 时 `log.info` 被**整条丢弃**而 `logStdout` 照常输出 —— 迁移/脚本的结果输出
  绝不能用 `log.info`，否则生产收敛后是**静默失败**（什么都没发生，而不是报错）。
- 历史事故（**已于 2026-09-15 修复**）：`scripts/migrate-console-to-log.js` 的 `REPLACEMENTS_CLI` 曾把
  `console.log/info` 映射成 `'log.stdout'`，而该符号从不存在（`git log -S "stdout:"` 全历史为空），
  导致全仓 **324 处 / 30 文件**运行到输出语句即抛 `TypeError`。修正后脚本按**实际用到的符号**注入 import
  （纯输出文件不再生成 `createLogger`/`const log`）。守卫测试
  `src/__tests__/framework/log/log-usage-contract.test.js` 全仓禁 `log.stdout`。
  正确范例见 `src/__tests__/test-db.js:7`：`import { logStdout as stdout }`。

## wb-logkit 发布速查

`cd packages/log && git add -A && git commit && git push origin main` → `npm publish --access public`
（含 `/` 的配置项 → `--userconfig ./.npmrc.tmp`，用完即删）。当前用户 `qirly`。

- 先 `npm whoami`：401 ⇒ token 失效；`publish` 返回 **PUT 404 = 无写权限**；`~/.npmrc` 需
  `//registry.npmjs.org/:_authToken=<40位>`（CRLF/BOM 会**伪装成 token 失效**）。
- **超时 ≠ 失败**：`SENSITIVE_APPROVAL=TIMED_OUT` 别重试，先 `npm view wb-logkit version` 确认。
- 发布后**从 npm 真实安装回归**（本地软链会掩盖问题）。`git push` 可能静默成功但本地 ref 残留旧值 →
  用 `git ls-remote origin main` 核对远端 SHA。
