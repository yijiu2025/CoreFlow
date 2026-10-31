# 文档地图

CoreFlow **后端仓库**的文档总入口。**写文档前先读本文决定放哪；找文档也从本文进。**

> 📌 本仓自 2026-10-31 起**只包含后端**。前端工程（`oauth21` / `posecraft` / `admin` /
> `poseadmin` / `firewall` / `phonecopy`）已全部移出、改为独立维护，
> 原先描述它们的 18 篇文档已归档到 [archive/legacy-frontend/](./archive/legacy-frontend/)。
> 在线站点：<https://yijiu2025.github.io/CoreFlow/>

## 结构约定

采用**两级入口**：本文件是总入口（分类地图），每个子目录各持 `README.md` 逐文件登记用途。
新增文档时必须同时更新所在目录的 `README.md`，否则视为未完成。

| 位置 | 内容 | 入口 |
| --- | --- | --- |
| `guide/` | 入门：简介 / 快速上手 / 项目结构 / CLI / CLI 插件 / AI 辅助开发 | [guide/README.md](./guide/README.md) |
| `core/` | 核心概念：架构 / 请求流水线 / 认证 / 权限（PBAC）/ 三级守卫 | [core/README.md](./core/README.md) |
| `development/` | 开发指南：规范总纲 / 应用模块 / 数据模型 / API 路由 / 命名 / 迁移 / 代码审查 / 全链路流程图 | [development/README.md](./development/README.md) |
| `standards/` | 后端规范：Git 与发版规则 / 认证集成契约 / 最佳实践（安全·性能·测试） | [standards/README.md](./standards/README.md) |
| `deployment/` | 部署：Docker / 多服务器 / CI·CD / 私钥信封加密（每篇开头有实现状态标注） | [deployment/README.md](./deployment/README.md) |
| `roadmap/` | 升级路线图（单文件，不设二级入口） | [roadmap/index.md](./roadmap/index.md) |
| `archive/` | 归档：历史快照 + 已迁出的前端文档 | [archive/README.md](./archive/README.md) |

### 不设二级入口的单文件

| 文档 | 内容 |
| --- | --- |
| [oauth21-api-report.md](./oauth21-api-report.md) | `/oauth2.1` 授权服务器的对外 API 报告（端点 / 参数 / 响应，按真实路由整理） |
| [test-audit-prompts.md](./test-audit-prompts.md) | 测试审计提示词集（让 AI 按固定口径审查测试有效性，配合 `conventions/test-effectiveness` 守卫使用） |

## 与其他仓库的关系

| 项目 | 位置 |
| --- | --- |
| `oauth21` 前端（SSO 登录 / 授权确认） | 独立仓 <https://github.com/yijiu2025/oauth-web> |
| 其他前端（`posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`） | 各自独立维护，不在本仓 |
| 模块级文档 | 与代码共置：`src/app/<模块>/docs/`、`packages/log/docs/` |
| 一次性审查报告 | `reports/`（**已 gitignore**，不入库） |

## 写文档的三条约定

1. **路径必须真实存在**：`scripts/verify/doc-links.mjs` 会校验 `docs/` 内的相对链接；
   指向本仓之外的路径（已迁出的前端、`packages/*`、根 `AGENTS.md`）会被当作外部指针跳过，
   但**不要**用它来掩盖失效链接 —— 指向本仓内已删除的文件就是错。
2. **状态要标注**：设计稿 / 未实现的能力，在文档开头写「📐 设计稿·未实现」；
   已落地写「✅ 已落地」。部署类文档尤其如此（见 `deployment/README.md`）。
3. **示例可执行**：命令、路径、环境变量必须能直接复制运行；改了接口或脚本时同步改文档，
   只写「示意」而不标注的示例，下一个人会当成真的。
