# 归档（archive）

**不再维护**但保有查证价值的历史文档。新文档不要放这里；过期文档移入时在本表登记。

## 已迁出本仓的前端文档 — `legacy-frontend/`

2026-10-31 起，本仓不再包含任何前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` /
`firewall` / `phonecopy` 全部移出索引、改为独立维护）。原先放在 `standards/` 与
`development/` 下、描述这些前端工程的 18 篇文档整体移入
[legacy-frontend/](./legacy-frontend/)，每篇顶部都有「已迁出、路径失效」横幅。

| 分组 | 文档 |
| --- | --- |
| 前端规范（13） | [frontend-standards](./legacy-frontend/frontend-standards.md) · [frontend-overview](./legacy-frontend/frontend-overview.md) · [coding-standard](./legacy-frontend/coding-standard.md) · [browser-baseline](./legacy-frontend/browser-baseline.md) · [frontend-security](./legacy-frontend/frontend-security.md) · [frontend-data-loading-rules](./legacy-frontend/frontend-data-loading-rules.md) · [frontend-performance-rules](./legacy-frontend/frontend-performance-rules.md) · [pwa-guide](./legacy-frontend/pwa-guide.md) · [theme-baseline](./legacy-frontend/theme-baseline.md) · [theme-replacement](./legacy-frontend/theme-replacement.md) · [theme-onboarding](./legacy-frontend/theme-onboarding.md) · [theme-package-extraction](./legacy-frontend/theme-package-extraction.md) · [theme-view-component-design](./legacy-frontend/theme-view-component-design.md) |
| 前端接入（4） | [登录流程前端开发模板](./legacy-frontend/登录流程前端开发模板.md) · [多账号免切接入模板](./legacy-frontend/多账号免切接入模板.md) · [设备ID全链路梳理](./legacy-frontend/设备ID全链路梳理.md) · [设备ID稳定性评估与架构图](./legacy-frontend/设备ID稳定性评估与架构图.md) |
| 主题计划（1） | [theme-routerless-overlay](./legacy-frontend/theme-routerless-overlay.md) |

> 需要这些内容请到对应前端仓，例如 `oauth21` → <https://github.com/yijiu2025/oauth-web>。

## 历史快照 — 本目录

| 文档 | 内容 | 状态 |
| --- | --- | --- |
| [architecture-review-2026-09-19.md](./architecture-review-2026-09-19.md) | 2026-09-19 架构评估 | 已归档 |
| [backend-review-plan.md](./backend-review-plan.md) | 后端检查规划（当时的目录结构已大幅变化，路径不可信） | 已归档 |
| [test-inline-copy-drift-report.md](./test-inline-copy-drift-report.md) | 测试内联副本漂移报告（其结论已固化为 `conventions/test-effectiveness` 守卫） | 已归档 |
| [注册登录漏洞修复计划.md](./注册登录漏洞修复计划.md) | 注册登录漏洞修复计划 | 部分未闭环，查证时注意 |
| [editor-panel-structure.md](./editor-panel-structure.md) | 编辑器属性面板结构规范（前端，已随前端迁出） | 已归档 |
| [posecraft-redesign.md](./posecraft-redesign.md) | PoseCraft 重构计划（前端，已随前端迁出） | 已归档 |

总入口（全部文档的地图）在 [../README.md](../README.md)。
