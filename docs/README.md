# 文档地图

CoreFlow 仓库文档的总入口。**写文档前先读本文决定放哪；找文档也从本文进。**

## 三类分化

### 🟢 通用规范（适合所有项目）— `standards/`

新前端 / 新项目直接取用。master 在本目录；子项目持副本（改动双写，见文末约定）。

| 文档 | 内容 |
| --- | --- |
| [frontend-standards.md](./standards/frontend-standards.md) | 前端统一规范**总纲**（目录约定 / 分层边界 / 技术栈） |
| [frontend-overview.md](./standards/frontend-overview.md) | 前端架构总览（技术栈基线） |
| [coding-standard.md](./standards/coding-standard.md) | 编码风格（类型闸门 / 导出位置 / 样式约定） |
| [browser-baseline.md](./standards/browser-baseline.md) | 跨内核渲染基线（新建前端强制） |
| [auth-integration.md](./standards/auth-integration.md) | 认证集成（auth Store 标准实现） |
| [theme-baseline.md](./standards/theme-baseline.md) | 主题基线（CSS 变量 + 明暗 Store） |
| [theme-replacement.md](./standards/theme-replacement.md) | **主题替换规范**（主题包 × 设备 × 页面 × 配色，换 UI 不改业务代码） |
| [theme-package-extraction.md](./standards/theme-package-extraction.md) | 主题框架抽包立项（`packages/theme-core` 纯内核） |
| [pwa-guide.md](./standards/pwa-guide.md) | PWA 接入规范（启用前先确认适用场景） |
| [frontend-security.md](./standards/frontend-security.md) | 前端安全清单 |
| [frontend-data-loading-rules.md](./standards/frontend-data-loading-rules.md) | 前端数据加载规则（分层加载 + API 文件收口） |
| [frontend-performance-rules.md](./standards/frontend-performance-rules.md) | 前端性能工程规则（先量后改 / 懒加载判据 / 预算守门） |
| [git-release-rules.md](./standards/git-release-rules.md) | **Git 提交 / 版本号 / 分支统一规则** |
| [best-practices/](./standards/best-practices/security) | 安全 / 性能优化 / 测试 |

oauth-web（oauth21）另持 `theme-replacement.md` 与 `git-release-rules.md` 两份副本
—— 它是独立开源仓库，外部用户拿不到 CoreFlow，副本必须自包含。

### 🔵 CoreFlow 项目文档（只适用于本仓库）

| 位置 | 内容 |
| --- | --- |
| [guide/](./guide/introduction) | 入门：简介 / 快速上手 / 项目结构 / CLI / CLI 插件 / AI 辅助开发 |
| [core/](./core/architecture) | 核心概念：架构 / 请求流水线 / 认证 / 权限 / 三级守卫 |
| [development/](./development/development-standards) | 开发指南：规范总纲 / 应用模块 / 数据模型 / API 路由 / 命名 / 代码审查 / 迁移 |
| [development/](./development/注册登录全链路流程图)（中文文档） | 集成指南：登录流程前端开发模板 / 多账号免切接入 / 注册登录全链路流程图 / 设备 ID 梳理与评估 |
| [deployment/](./deployment/docker) | 部署：Docker / 多服务器 / CI/CD |
| [roadmap/](./roadmap/) | 升级路线图 |
| [oauth21-api-report.md](./oauth21-api-report.md) | OAuth 2.1 授权服务器（后端 app）对外 API 报告 |

### 🟡 其他项目的文档（不住本仓）

| 项目 | 位置 |
| --- | --- |
| oauth-web（oauth21 前端） | [`oauth21/docs/`](../oauth21/docs/)（入口 `README.md`；多主题实例文档 `multi-theme.md` 在此） |
| retroweb | `retroweb/docs/` |
| 模块级文档 | 与代码共置：`src/app/<模块>/docs/`（firewall 审计报告、auth 权限缓存加固设计）、`packages/log/docs/` |
| 历史报告 | `reports/`（一次性评审报告，不再维护） |

### ⚪ 归档（不再维护）— `archive/`

过期但有查证价值的历史文档：[架构评估（2026-09-19）](./archive/architecture-review-2026-09-19.md)、
[后端检查规划](./archive/backend-review-plan.md)、[测试内联副本漂移报告](./archive/test-inline-copy-drift-report.md)、
[注册登录漏洞修复计划](./archive/注册登录漏洞修复计划.md)（10 项已修 8，余 2 项 P0 应另立任务跟踪）、
[编辑器属性面板结构规范](./archive/editor-panel-structure.md)、[PoseCraft 重构计划](./archive/posecraft-redesign.md)。

## 新文档放哪（决策顺序）

1. **别的前端 / 新项目也要遵守** → `standards/`（子项目常用的同步副本）
2. **CoreFlow 自己的事** → `guide/` `core/` `development/` `deployment/` `roadmap/`
3. **某个前端项目的实例文档** → 该项目仓的 `docs/`（如 oauth-web）
4. **只服务某个模块** → 与代码共置 `src/app/<模块>/docs/`
5. **一次性报告 / 已过期的计划** → `archive/`（或 `reports/`）

## 约定

- 命名：小写连字符（`theme-replacement.md`），不用下划线和全大写
- 站内互链用相对路径；跨仓引用：本仓文档用 `../../<项目>/...` 相对路径（GitHub 可点，
  VitePress 死链检查按 `ignoreDeadLinks` 放行），公开子仓（oauth-web）的文档用完整
  GitHub URL（外部用户没有 CoreFlow）
- **改通用规范 = 双写**：master（本仓 `standards/`）+ 子项目副本，防副本静默过期
- 本地预览 `npm run docs:dev`；构建 + 死链检查 `npm run docs:build`
