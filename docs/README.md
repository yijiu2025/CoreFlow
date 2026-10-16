# 文档地图

CoreFlow 仓库文档的总入口。**写文档前先读本文决定放哪；找文档也从本文进。**

## 三类分化

### 🟢 通用规范（适合所有项目）— `standards/`

新前端 / 新项目直接取用。master 在本目录；子项目持副本（改动双写，见文末约定）。
逐文件清单见 [standards/README.md](./standards/README.md)。

oauth-web（oauth21）另持 `theme-replacement.md` 与 `git-release-rules.md` 两份副本
—— 它是独立开源仓库，外部用户拿不到 CoreFlow，副本必须自包含。

### 🔵 CoreFlow 项目文档（只适用于本仓库）

采用**两级入口**：本文件是总入口（分类地图），每个子目录各持 `README.md` 逐文件登记用途。

| 位置 | 内容 |
| --- | --- |
| [guide/](./guide/README.md) | 入门：简介 / 快速上手 / 项目结构 / CLI / CLI 插件 / AI 辅助开发 |
| [core/](./core/README.md) | 核心概念：架构 / 请求流水线 / 认证 / 权限 / 三级守卫 |
| [development/](./development/README.md) | 开发指南：规范总纲 / 应用模块 / 数据模型 / API 路由 / 命名 / 迁移 / 代码审查 / 登录与多账号接入模板 / 设备 ID 系列 |
| [deployment/](./deployment/README.md) | 部署：Docker / 多服务器 / CI/CD（每篇开头有实现状态标注） |
| [roadmap/index.md](./roadmap/index.md) | 升级路线图（单文件，不设二级入口） |
| [oauth21-api-report.md](./oauth21-api-report.md) | OAuth 2.1 授权服务器（后端 app）对外 API 报告 |
| [test-audit-prompts.md](./test-audit-prompts.md) | 测试审计提示词集（让 AI 按固定口径审查测试有效性的提示词模板） |

### 🟡 其他项目的文档（不住本仓）

| 项目 | 位置 |
| --- | --- |
| oauth-web（oauth21 前端） | [`oauth21/docs/`](../oauth21/docs/)（入口 `README.md`；多主题实例文档 `multi-theme.md` 在此） |
| retroweb | `retroweb/docs/` |
| 模块级文档 | 与代码共置：`src/app/<模块>/docs/`（firewall 审计报告、auth 权限缓存加固设计）、`packages/log/docs/` |
| 历史报告 | `reports/`（一次性评审报告，不再维护） |

### ⚪ 归档（不再维护）— `archive/`

过期但有查证价值的历史文档，逐文件清单见 [archive/README.md](./archive/README.md)。

## 新文档放哪（决策顺序）

1. **别的前端 / 新项目也要遵守** → `standards/`（子项目常用的同步副本）
2. **CoreFlow 自己的事** → `guide/` `core/` `development/` `deployment/` `roadmap/`
3. **某个前端项目的实例文档** → 该项目仓的 `docs/`（如 oauth-web）
4. **只服务某个模块** → 与代码共置 `src/app/<模块>/docs/`
5. **一次性报告 / 已过期的计划** → `archive/`（或 `reports/`）

## 约定

- **每个 `docs/` 目录必须有 README 总入口**：本文即本仓总入口；子仓（oauth21 / retroweb 等）
  同样持 `docs/README.md`，逐文档登记「路径 + 一句话用途」。新文档**先登记进入口再提交**，
  漏登记 = 文档不可发现（完整规范：fullstack-rules → references/docs-conventions.md，
  可执行校验 `assets/docs/check-docs-index.mjs`）
- 命名：小写连字符（`theme-replacement.md`），不用下划线和全大写
- 站内互链用相对路径；跨仓引用：本仓文档用 `../../<项目>/...` 相对路径（GitHub 可点，
  VitePress 死链检查按 `ignoreDeadLinks` 放行），公开子仓（oauth-web）的文档用完整
  GitHub URL（外部用户没有 CoreFlow）
- **改通用规范 = 双写**：master（本仓 `standards/`）+ 子项目副本，防副本静默过期；
  入口索引表同样双写（新增 / 改名 / 归档同步到子仓 README）
- 本地预览 `npm run docs:dev`；构建 + 死链检查 `npm run docs:build`
