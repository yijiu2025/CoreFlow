# 通用规范（standards）

**适合所有项目的规范**——新前端 / 新项目直接取用。master 在本目录；子项目持副本
（改动双写，见 [总入口约定](../README.md)）。

## 规范文档

| 文档 | 内容 |
| --- | --- |
| [frontend-standards.md](./frontend-standards.md) | 前端统一规范**总纲**（目录约定 / 分层边界 / 技术栈） |
| [frontend-overview.md](./frontend-overview.md) | 前端架构总览（技术栈基线） |
| [coding-standard.md](./coding-standard.md) | 编码风格（类型闸门 / 导出位置 / 样式约定） |
| [browser-baseline.md](./browser-baseline.md) | 跨内核渲染基线（新建前端强制） |
| [auth-integration.md](./auth-integration.md) | 认证集成（auth Store 标准实现） |
| [theme-baseline.md](./theme-baseline.md) | 主题基线（CSS 变量 + 明暗 Store） |
| [theme-replacement.md](./theme-replacement.md) | **主题替换规范**（主题包 × 设备 × 页面 × 配色，换 UI 不改业务代码） |
| [theme-package-extraction.md](./theme-package-extraction.md) | 主题框架抽包立项（`packages/theme-core` 纯内核） |
| [pwa-guide.md](./pwa-guide.md) | PWA 接入规范（启用前先确认适用场景） |
| [frontend-security.md](./frontend-security.md) | 前端安全清单 |
| [frontend-data-loading-rules.md](./frontend-data-loading-rules.md) | 前端数据加载规则（分层加载 + API 文件收口） |
| [frontend-performance-rules.md](./frontend-performance-rules.md) | 前端性能工程规则（先量后改 / 懒加载判据 / 预算守门） |
| [git-release-rules.md](./git-release-rules.md) | **Git 提交 / 版本号 / 分支统一规则** |

## 最佳实践（best-practices）

跨项目通用手段沉淀，逐文件清单见 [best-practices/README.md](./best-practices/README.md)
（安全 / 性能 / 测试）。

总入口（全部文档的地图）在 [../README.md](../README.md)。
