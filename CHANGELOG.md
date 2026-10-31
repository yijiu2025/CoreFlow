# Changelog

本仓库（CoreFlow）遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：major（破坏性变更）/ minor（新增功能，向后兼容）/ patch（修复）。

> 子前端（oauth-web、retroweb、posecraft 等）各自维护独立的 CHANGELOG 与 tag 线，不在本文件内记录。
> 发版流程见 `docs/standards/git-release-rules.md` 与 fullstack-rules 技能的 `references/release-checklist.md`。

## 2.29.0 — 2026-10-31

### 修复

- **环形队列 Redis 后端丢消息**：`SHIFT_SCRIPT` 的 head 推进量写成了 `maxSize`，而
  `(head + maxSize) % maxSize === head` → head 永不前进，第一次 `shift` 之后每次都取到
  `nil` 却仍把 `count` 减 1。改为推进 1 格；Lua 的 `false` 归一化为 `null`（与 Map 版同形）。
  `queue-atomic` 补第 4 轮关卡（此前三轮都不执行 `shift`，正是缺陷能长期存活的原因）。
- **敏感接口限频规则指向不存在的路由**：`/oauth2.1/register` 全仓不存在（真实注册在 user 域），
  这条"注册 3 次/时"从未生效。规则表改为 `paths[]` 并指向真实的 `/oauth2.1/mini-register`；
  新增「规则表 ↔ 真实路由表」一致性守卫（把路由真注册进 Fastify 逐条比对）。
- **全局限流阈值形同虚设**：配置里存在两套同名限流字段，代码只读 `defense.*`，而扁平那份写着
  60（不被任何代码读取）。删除误导字段，出厂阈值 10000/60s → 600/60s，启动打印生效值并对
  「>1000」与「enableRateLimit=false」（会让 13 处端点级 `config.rateLimit` 一起失效）告警。
- **IP 维度可被 X-Forwarded-For 伪造**：`.env.docker.example` 默认给 `172.16.0.0/12`
  → 收窄为回环并写清取值方法；`src/app.js` 启动时对过宽信任网段告警。
  `isIpMatch` 通配符由 `startsWith(前缀)` 改为按段比对（`192.168.*.1` 不再放行整段），
  `BlockList` 按规则缓存（热路径不再逐请求分配）。
- **图形验证码可无限试错**：`verify` 无失败上限（4 位码在 TTL 内反复试，且限频按 IP、换 IP 即可绕）。
  加上限（默认 5，`CAPTCHA_MAX_ATTEMPTS` 可调）并作废；失败写回按剩余 TTL，不续命。
- **历史 bcrypt 校验可被用来冻结事件循环**：每次 `compare` 阻塞主线程约 68ms 且无并发上限。
  纳入 `BCRYPT_MAX_CONCURRENCY`（默认 4，与 scrypt 分开计数），超限 fail-closed。
- **CLI 可绕过密码策略**：三处自写"至少 6 位"改为统一走 `validatePasswordStrength()`。
- **CLI 工具会阻塞 Redis / 误删 key**：`scripts/lib/redis.js` 的 `KEYS` 改 SCAN 游标遍历、
  session 批读；`cleanup-test-user` 转义 glob 特殊字符、短 localPart 不通配、多表删除包进同一事务。

### 移除

- `scripts/initSuperAdmin.js`（硬编码超管 + `sync({alter:true})` + 角色 code 拼错）
- `scripts/debug-auth.js`（可向 Redis 注入 `allows:['*']` 的会话）
- `scripts/cleanup-users.mjs`（相对导入必然失败，且会选中全部非保留用户软删）

### 测试

- `test-effectiveness` 守卫由文本正则改为 **AST + 仓库内路径解析**：此前注释里写一句
  `from '../x'`、夹具字符串里的 `from './y'`、或 `await import('crypto')` 都能通关。
- 四份假覆盖测试改为真身驱动：`dao.test.js`（`TokenDao`）、`service.test.js`
  （`decryptLoginRequest`）、`integration/signature.test.js`（`verifySignature`，补上副本没有的
  nonce 重放与 query 参与验签）、`guard.test.js`（`applyGuardLogic` 权限判定）。
- `exceptions.test.js` 改为驱动真身 `createErrorHandler`，补上「生产环境 500 不回显原文、
  不返回 stack」这条此前完全没测的安全属性。
- `api-routes` 的条件空跑改为两个分支都成立断言（原来任何环境下必有一条用例空跑却 PASS）。

### 文档

- `best-practices/security.md`：「使用 bcryptjs 做密码哈希」与实现相反（已改 scrypt 并注明禁用
  bcrypt）、时间窗 5 分钟 → 2 分钟、去掉已废弃且有害的 `X-XSS-Protection`、CORS 示例补 null 安全。
- `best-practices/performance.md`：权限缓存示例用的是被明令禁止的明文键 → 改 `buildPermKey`。
- `best-practices/testing.md`：整棵测试目录树不存在、`import '../src/app.js'` 路径错、
  缺「毒丸判据」这条最重要的约定 —— 全部重写。
- `guide/quick-start.md`：`cd antigravity`、`DB_NAME`、探针响应结构（统一封装而非裸 `status`）。
- `standards/auth-integration.md`：注册限频的真实位置与数值（此前写的 3 次/时从未生效）。

## 2.29.1 — 2026-10-31

### 修复

- **CI 上真身驱动的签名/登录用例拿到 503**：`REDIS_ENABLED=true` 但没有 Fastify 插件跑过时，
  `getStore()` 按设计抛 `RedisRequiredError(503)`（fail-fast，不静默退回内存）。
  `integration/signature.test.js` 与 `service.test.js` 补上
  `isRedisConfigured() ? connectTestRedis() : 跳过建连` 引导 —— CI 里真连上 Redis 并真正
  验到 Redis 路径，本地未配置时仍走进程内实现。（仅测试代码，无运行期行为变更。）

## 2.29.2 — 2026-10-31

### 仓库

- **AI 工具目录脱库**：`.claude/`（含 `skills/fullstack-rules` 整套技能、plans、agents、
  `settings.local.json`）、`.codebuddy`、`.codegraph`、`.mimocode`、`.v2c`、`.video_agent`、
  `.zcode` 共 47 个文件移出索引。**根因是 `.gitignore` 对已跟踪文件无效** —— 规则早就写了，
  但这些文件入库在规则之前，所以一直没生效。本地文件与历史提交完整保留。
- **前端工程脱库**：`posecraft/`（162）、`admin/`（18）、`poseadmin/`（31）、`firewall/`（67）
  共 278 个文件移出索引（`oauth21/` 早于 986e34e 已脱库）。本仓只做后端，
  `ci.yml` 与 `.dockerignore` 本就把这些前端工程排除在 CI 图与镜像之外。
- **移除失效 submodule**：`phonecopy` 目录里只有一个空 `.git/`（从未真正初始化），
  却仍挂在 `.gitmodules` 上 → 别人 `clone --recurse-submodules` 会去拉一个用不上的仓库。
- `.gitignore` 补齐 `/posecraft/`、`/admin/`、`/poseadmin/`、`/firewall/`、`/phonecopy/`。

> 以上均为「只删索引」：本地目录照常可用，`git checkout <旧提交> -- <路径>` 可取回。

### 修复

- **`package-lock.json` 与 `package.json` 版本脱节**：发版脚本只 bump `package.json`，
  lock 的 `version` 落后两个版本 → 同步为当前版本（三方包 `nan@2.28.0` 不受影响）。
  同时带上一次 `npm install` 的 devDeps 刷新，使 lock 的 `workspaces` / `dependencies` /
  `devDependencies` 与 `package.json` 完全一致。
- **`packages/theme-core` submodule 指针漂移**：本地 checkout 比父仓记录点领先 1 个提交，
  属工作区漂移而非有意升级 → 复原到父仓记录点，不擅自推进主题版本线。

### 工具

- `scripts/release.mjs` 新增 `--kind <major|minor|patch>`：本次改动只有 chore 类提交
  （按规则「不发版」），但仓库结构变更需要可交付的 tag。该参数是**显式逃生门**，
  触发与提交类型不一致时会打印覆盖告警，避免变成绕过版本规则的后门。

## 2.29.3 — 2026-10-31

### 文档

- **文档体系重构（前后端分家后的收口）**：18 篇描述已迁出前端工程的规范与接入模板移入
  `docs/archive/legacy-frontend/`（带弃用横幅 + 索引），`standards/` 由 16 篇收敛到 2 篇 +
  最佳实践，侧边栏 8 组 → 7 组；归档文档的相对链接按「迁移前基准目录」重算（56 处修正、
  25 处目标已不在本仓的降级为行内代码）。
- **修掉与实现相反的事实错误**：`security.md` 的「使用 bcryptjs 做密码哈希」（实际是 scrypt，
  bcrypt 只做历史校验 + 登录后透明升级）、签名时间窗 5 分钟（实际 2 分钟）、
  `SCRYPT_CONCURRENCY`（实际 `SCRYPT_MAX_CONCURRENCY`）、不存在的 `SSO_READY` 握手名、
  `StpUtil` 导入路径、注册端点 `/user/v1/open/register`（实际 `/user/v1/register`）、
  admin 用户管理 `/admin/v1/iam/users`（实际 `/admin/iam/v1/users`）、
  roadmap 的「Docker 化未实现，仓库内没有 Dockerfile」（早已实现）。
- **文档站双语（中文为主语言，新增 `/en/` 英文站）**：`config.ts` 改为 `locales` 结构，
  中英各自的 nav / sidebar / footer / 搜索与组件文案分开；英文侧边栏只挂已翻译页面；
  新增 7 篇英文页（index / introduction / quick-start / project-structure / architecture /
  auth-integration / docker）与 [翻译状态页](https://yijiu2025.github.io/CoreFlow/en/translation-status)。
- **双语 README（英文为主）**：`README.md` 为英文主入口、`README.zh-CN.md` 为中文版，
  顶部互加语言切换；`doc-links` 关卡的扫描根补上中文版，避免其链接静默腐烂。
- `.env.example` 补「资源闸门」段：`SCRYPT_MAX_CONCURRENCY` / `BCRYPT_MAX_CONCURRENCY` /
  `CAPTCHA_MAX_ATTEMPTS`（都是代码真实读取、此前模板缺失的开关）。

### 工具

- `scripts/release.mjs` 发版时**同步 `package-lock.json` 的根版本号**（顶层 `version` 与
  `packages[""]`）。此前只 bump `package.json`，lock 会一路落后（实测脱节过两个版本，
  容易被误判成"依赖没装对"）。只做文本替换且要求上一行是 `name` 锚点，
  绝不触碰 `packages` 里同版本号的三方包。

## 2.29.4 — 2026-10-31

### 依赖安全

- **根因先修：`workspaces` 里还挂着三个已迁出的前端目录**（`oauth21` / `posecraft` / `firewall`）。
  npm 因此仍把整个前端依赖树（vue / vite / tensorflow / echarts / fabric…）算进 lock 与审计结果 ——
  Dependabot 的绝大部分告警来自这里，与本仓后端无关。移除这三个 workspace 名并重建 lock 后，
  lock 条目 1675 → 878，**审计从 296 条降到可治理的量级**。
- **生产依赖：21 条（9 high）→ 5 条（0 high，全 moderate）**：
  `fastify` 5.8.5 → 5.12.7（含 `find-my-way` / `fast-uri` 等传递依赖）、
  `@fastify/static` 9.1.3 → 10.1.8（修「Authorization Bypass via Non-Canonical URL Paths」）、
  `@fastify/multipart` → 10.1.6（含 `@fastify/busboy` 3.2.x DoS 修复）、
  `nodemailer` 8 → 10.3.1、`sharp` 0.34 → 0.35.5、`mysql2` → 3.24.6（解压炸弹 DoS）、
  `geoip-lite` → 2.0.3。
- 用 `overrides` 固定补丁级安全修复（同 major，语义兼容）：
  `@fastify/busboy ^3.2.1`、`brace-expansion ^5.0.6`、`fast-uri ^3.1.4`、`ajv ^8.18.0`
  （`$data` ReDoS）、`fast-copy ^4.1.0`、`moment ^2.31.0`。
- 🔴 **Node 版本下限抬到 20.19**（`package.json` 新增 `engines`）：`@fastify/static@10` 依赖
  ESM-only 的 `content-disposition@3`，需要 `require(esm)` 支持，Node 18 起不来。
  CI 与镜像本来就用 Node 22，行为未变；README / 快速上手 / 技术栈表已同步。
- 仍保留的 5 条 moderate 已在 roadmap 记录成因：`@fastify/static`→`glob 14` /
  `minimatch 11` 需跨 major；`sequelize`→`uuid` 的"修复建议"是降到 3.30.0（等于拆库，不采纳）。
- 测试侧：`exceptions.test.js` / `proxy-trust.test.js` 对 `@fastify/static` 用空插件替身 ——
  jest 的 CJS 运行时无法 `require(ESM)`，而这两个套件只验证错误处理器与代理信任判定；
  真实静态服务链路由 CI 的 compose 冒烟覆盖。

## 未发布（Unreleased）

## 2.28.1 — 2026-10-16

### 修复

- **tar 6.2.1 → 7.5.22**：修复 2 个 critical 漏洞告警
- **根 lock 同步 workspace 依赖**：恢复 `npm ci` 可用

### 依赖

- 新增 `dependabot.yml` 统一依赖更新策略
- posecraft 子仓依赖批量 bump：`brace-expansion` / `fast-uri` / `postcss-selector-parser` / `tailwindcss` / `@vue/server-renderer` / `source-map-js` / `axios`

## 2.28.0 — 2026-10-16

### 新增

- **retroweb 业务模块**：骨架（S0）→ 任务真实读写 → LLM 双来源（用户自建 / 系统官方）→ S3 算法中转（同步转发 + job 落库 + SSE 透传 + stale）→ LLM 双来源「选择 UI」（官方/自建可切换，偏好落服务端；官方凭据服务端注入，永不出前端）

### 修复

- CI：钉死 cookie 链版本 + 删除失效的 frontend job，修复四 job 齐红
- CI：安装路径不读 lock + submodule 精确 init
- Docker：构建期自证脚本化（修复 `RUN` 内联多行 `-e` 解析错误）；lockfile 不再进镜像（修复 E2E 冒烟 migrate 悬空软链）
- retroweb：task 表 target 索引改 191 前缀长度，修复 MySQL 迁移失败
- lint：check-browser-baseline 5 处全角空格改半角

### 文档

- 文档体系重组：通用规范收进 `docs/standards/`
- 新增前端主题替换规范、统一 Git 发版规则与通用发布脚本（子前端可复用）

### 杂项

- oauth21 拆分为独立仓库 oauth-web（各自维护版本线）
