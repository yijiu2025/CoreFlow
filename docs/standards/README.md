# 规范（standards）

本目录只放**后端相关**规范。2026-10-31 起，本仓不再包含任何前端工程
（`oauth21` / `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy` 均已迁出、
独立维护），因此原先前端与主题类规范已整体移入
[archive/legacy-frontend/](../archive/legacy-frontend/)。

## 规范文档

| 文档 | 内容 |
| --- | --- |
| [git-release-rules.md](./git-release-rules.md) | **Git 提交 / 版本号 / 分支 / 发版统一规则**（`npm run` 脚本、tag 与 Release 的判定依据） |
| [auth-integration.md](./auth-integration.md) | 认证集成：`/oauth2.1` 作用域、CSRF 与签名契约、接口清单、限频阈值（前后端共同遵守的线协议） |

## 最佳实践（best-practices）

跨项目通用的**后端**手段沉淀，逐文件清单见 [best-practices/README.md](./best-practices/README.md)：

| 文档 | 内容 |
| --- | --- |
| [security.md](./best-practices/security.md) | 密码哈希（scrypt）、防重放、CSRF、限频、失败锁定、Cookie、安全响应头、代理信任 |
| [performance.md](./best-practices/performance.md) | 缓存（含权限缓存键的正确形态）、连接池、优雅关闭、慢请求告警 |
| [testing.md](./best-practices/testing.md) | 测试铁律（毒丸判据）、目录结构、分层优先级、覆盖率口径、Redis 套件写法 |

## 已迁出的前端规范

原 `frontend-*` / `theme-*` / `coding-standard` / `browser-baseline` / `pwa-guide` 共 13 篇，
现位于 [archive/legacy-frontend/](../archive/legacy-frontend/) 且已标注「路径失效」。
需要前端规范请到对应前端仓：

- `oauth21` → <https://github.com/yijiu2025/oauth-web>
- 其余前端（`posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy`）各自维护

总入口（全部文档的地图）在 [../README.md](../README.md)。
