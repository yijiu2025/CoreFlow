# 参与贡献 CoreFlow

感谢你愿意为 CoreFlow 出一份力。本指南覆盖本地开发、代码规范、提交与 PR 流程。开始之前，请先阅读[行为守则](CODE_OF_CONDUCT.md)。

> **安全漏洞请勿提交公开 Issue** —— 报告方式见 [SECURITY.md](SECURITY.md)。
> **无障碍相关问题**的报告方式见 [ACCESSIBILITY.md](ACCESSIBILITY.md)。

## 项目一览

CoreFlow 是一个企业级全栈安全平台：Fastify 后端（`src/`）加若干 Web 前端应用。

| 部分               | 位置                | 说明                                          |
| ------------------ | ------------------- | --------------------------------------------- |
| 后端服务           | `src/`              | Fastify v5 + Sequelize v6 + MySQL 8 + Redis 5 |
| OAuth 2.1 授权中心 | `src/oauth21/`      | 授权码 + PKCE、JWT、OIDC                      |
| 防火墙引擎         | `src/app/firewall/` | 五层拦截管道                                  |
| 防火墙前端         | `firewall/`         | Vue 3                                         |
| 管理后台前端       | `admin/`            | Vue 3                                         |
| 数据库迁移         | `migrations/`       | Umzug                                         |
| 文档站             | `docs/`             | VitePress                                     |

**相关独立仓库**（不在本仓库提交，改动请去对应仓库）：

| 仓库                                                          | 内容                                           |
| ------------------------------------------------------------- | ---------------------------------------------- |
| [yijiu2025/oauth-web](https://github.com/yijiu2025/oauth-web) | SSO 登录前端（原 `oauth21/`，2026-10-14 拆分） |
| [yijiu2025/log](https://github.com/yijiu2025/log)             | `packages/log/` 日志包（嵌套独立仓库）         |
| [yijiu2025/theme](https://github.com/yijiu2025/theme)         | `packages/theme-core/`（git submodule）        |
| [yijiu2025/phonecopy](https://github.com/yijiu2025/phonecopy) | `phonecopy/`（git submodule）                  |

## 本地开发

### 环境要求

- **Node.js 24+**（LTS），npm 10+
- **MySQL 8.0+**
- **Redis 5+**（可选：不可用时自动降级为内存模式，功能受限）
- Windows 下 `npm run dev` 已内置 UTF-8 代码页切换，无需手动设置

### 快速开始

```bash
# 克隆（必须带 --recurse-submodules，否则 submodule 目录为空）
git clone --recurse-submodules https://github.com/yijiu2025/CoreFlow.git
cd CoreFlow

npm install
cp .env.example .env        # 编辑 .env 填入数据库、Redis、密钥等配置
npm run migrate             # 执行数据库迁移
npm run setup:admin -- --email admin@example.com   # 初始化超级管理员
npm run dev                 # 启动开发服务器
```

### 常用命令

| 命令                                           | 用途                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                                  | 启动开发服务器（nodemon + `.env`）                        |
| `npm start`                                    | 生产启动（`.env.production`）                             |
| `npm run migrate`                              | 执行数据库迁移                                            |
| `npm run setup:admin` / `npm run revoke:admin` | 初始化 / 撤销超级管理员                                   |
| `npm run lint`                                 | ESLint 自动修复                                           |
| `npm run format`                               | Prettier 格式化                                           |
| `npm test`                                     | Jest 全量测试（ESM 模式）                                 |
| `npm run verify:all`                           | 全量验证脚本（分布式锁、WS 扇出、遥测聚合等跨进程不变量） |
| `npm run audit`                                | 生产依赖安全审计                                          |
| `npm run docs:dev`                             | 本地文档站                                                |

单跑某个测试：

```bash
node --experimental-vm-modules npx jest --testPathPattern <pattern>
```

## 代码规范

完整标准（**必读**，与仓库的静态关卡一一对应）：

- `docs/standards/coding-standard.md` — 编码标准
- `docs/development/development-standards.md` — 开发标准
- `docs/development/api-routes.md` — API 路由规范
- `docs/development/migrations.md` — 迁移规范
- `docs/development/code-review.md` — 代码审查标准
- `docs/standards/frontend-standards.md` — 前端标准（改前端时）

最容易踩的几条（违反会被 CI 或审查打回）：

1. **ESM only**：仓库为 `"type": "module"`，禁止 CommonJS 写法。
2. **export 收拢**：`src/` 下定义处不写 `export`，统一在文件末尾导出；类型必须用 `export type`。
3. **分层红线**：`src/` 禁止 import `scripts/`；`src/app/<A>` 禁止 import `src/app/<B>`。
4. **路由必须注册**：API 一律走 `registerSecureRoute()`，响应统一走 `reply.result`，`schema` 要齐。
5. **数据库改动必须写迁移**：模型与迁移保持同步，提交前评估可回滚性。
6. **测试必须有效**：真实加载被测代码，禁止手写常量自测；守卫类测试须做毒丸试验（把被测模块改为抛错后，相关测试必须变红）。
7. **提交前自检**：`npm run lint` 与 `npm test` 全绿再推送。

## 提交规范

采用 Conventional Commits：`type(scope): 描述`

**type 取值**：`feat` / `fix` / `perf` / `refactor` / `style` / `test` / `docs` / `chore` / `ci`

- **破坏性变更**：标题加 `!`（如 `feat!:`），或在 footer 行首写 `BREAKING CHANGE: 说明`（只认行首加冒号的形式）
- **关联 Issue**：footer 写 `Closes #123` / `Refs #456`

### 发版判据

| 本次推送包含的提交                               | 是否发版 | 版本递增 |
| ------------------------------------------------ | -------- | -------- |
| 破坏性变更                                       | 发       | major    |
| 含 `feat`                                        | 发       | minor    |
| 仅 `fix` / `perf`                                | 发       | patch    |
| 仅 `chore` `docs` `test` `style` `ci` `refactor` | 不发     | —        |

发版由维护者执行：`node scripts/release.mjs` 预览三条通道（git tag / GitHub Release / npm）的决策，确认后加 `--apply`。完整规则见 `docs/standards/git-release-rules.md`。**贡献者不需要自行发版。**

## Pull Request 流程

1. **开分支**：从 `main` 切出 `feat/xxx`、`fix/xxx` 等分支，一个 PR 只做一件事。
2. **小步提交**：提交信息符合上文规范。
3. **自验**：`npm run lint`、`npm test` 全绿；触及验证脚本时加跑 `npm run verify:all`。
4. **填模板**：按 `.github/PULL_REQUEST_TEMPLATE.md` 逐项填写，「验证证据」为必填，空着会被直接打回。
5. **等 CI**：`.github/workflows/ci.yml`（lint / test / verify）全绿才会进入审查，红灯不审。
6. **接受审查**：审查标准见 `docs/development/code-review.md`；高危面（认证、权限、迁移等，见 `CODEOWNERS`）需维护者明确批准。
7. **合并**：由维护者合并，之后按发版判据处理发布。

## Issue 指南

- 缺陷报告、功能建议请使用对应的 Issue 模板（中文即可）。
- 提交前先搜索现有 Issue，避免重复。
- **日志、截图务必脱敏**：不要包含密钥、Token、Cookie、个人数据。
- 安全漏洞走 [SECURITY.md](SECURITY.md) 的私密渠道，不要开公开 Issue。

## 文档

文档站在 `docs/`（VitePress），本地预览 `npm run docs:dev`。文档与代码同仓库管理，改文档同样走 PR；发现文档与实现不符，欢迎直接修正并在 PR 中说明。

## 许可证

本项目采用 [GPL-3.0](LICENSE)。你提交的贡献将按 GPL-3.0 进行许可与分发。
