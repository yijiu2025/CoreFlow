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
