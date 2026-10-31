# 已迁出的前端文档（legacy-frontend）

> **⚠️ 这里的 18 篇文档描述的前端工程已不在本仓库。**
>
> 2026-10-31 起，`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`
> 六个前端工程全部移出本仓索引、改为独立维护（`oauth21` → <https://github.com/yijiu2025/oauth-web>）。
> 本目录保留原文档作历史参考，每篇顶部都有「路径已失效」横幅。
>
> **不要在这里新增文档**；后端相关内容请写回 `docs/standards/` 或 `docs/development/`。

## 前端规范（原 `docs/standards/`）

| 文档 | 原主题 |
| --- | --- |
| [frontend-standards.md](./frontend-standards.md) | 前端统一规范总纲（目录约定 / 分层边界 / 技术栈） |
| [frontend-overview.md](./frontend-overview.md) | 前端架构总览 |
| [coding-standard.md](./coding-standard.md) | 前端编码规范（类型闸门 / 导出位置 / 样式约定） |
| [browser-baseline.md](./browser-baseline.md) | 跨内核渲染基线 |
| [frontend-security.md](./frontend-security.md) | 前端安全清单（XSS / CSP / 上报） |
| [frontend-data-loading-rules.md](./frontend-data-loading-rules.md) | 数据加载分层规则 |
| [frontend-performance-rules.md](./frontend-performance-rules.md) | 性能工程规则（预算守门 / 懒加载判据） |
| [pwa-guide.md](./pwa-guide.md) | PWA 接入规范 |
| [theme-baseline.md](./theme-baseline.md) | 主题基线（CSS 变量 + 明暗） |
| [theme-replacement.md](./theme-replacement.md) | 主题替换规范（主题包 × 设备 × 页面） |
| [theme-onboarding.md](./theme-onboarding.md) | 新前端接入 skinsuite 主题库 |
| [theme-package-extraction.md](./theme-package-extraction.md) | 主题框架抽包立项（`packages/theme-core`） |
| [theme-view-component-design.md](./theme-view-component-design.md) | 主题化视图组件设计 |

## 前端接入模板（原 `docs/development/`）

| 文档 | 原主题 |
| --- | --- |
| [登录流程前端开发模板.md](./登录流程前端开发模板.md) | 新应用接入 SSO 登录（iframe + postMessage + bind-session） |
| [多账号免切接入模板.md](./多账号免切接入模板.md) | 抖音式多账号免密切换 |
| [设备ID全链路梳理.md](./设备ID全链路梳理.md) | 设备 ID / 指纹的生成·存储·传递·消费（六端） |
| [设备ID稳定性评估与架构图.md](./设备ID稳定性评估与架构图.md) | 设备 ID 稳定性分析与收敛方案 |

## 主题计划（原 `docs/plans/`）

| 文档 | 原主题 |
| --- | --- |
| [theme-routerless-overlay.md](./theme-routerless-overlay.md) | 无路由覆盖式主题方案立项 |

## 后端仍保留的对应内容

| 主题 | 现在看哪里 |
| --- | --- |
| 认证 / 会话 / 签名 / CSRF 的前后端契约 | [standards/auth-integration](../../standards/auth-integration.md) |
| 设备 ID 的**后端**参与部分（`X-Device-Id` 头、`session_tokens` 幂等键、风险基准） | 源码：`src/framework/auth/device*.js`、`src/api/auth/v1/` |
| 后端性能（缓存 / 连接池 / 热路径） | [standards/best-practices/performance](../../standards/best-practices/performance.md) |
