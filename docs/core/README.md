# 核心概念（core）

框架**内置能力**的原理说明：架构怎么分层、请求怎么流动、认证 / 权限 / 守卫怎么协作。
改这些机制前必读对应文档；接入新前端先读 [认证](../standards/auth-integration.md)。

| 文档 | 内容 |
| --- | --- |
| [architecture.md](./architecture.md) | 架构总览：分层架构图，从基础设施到业务应用的职责划分 |
| [request-pipeline.md](./request-pipeline.md) | 请求处理流水线：一个 HTTP 请求从接收到响应的完整路径 |
| [auth.md](./auth.md) | 认证系统：Session / JWT 双模式对比表、启用方式、Token 存储与验证 |
| [permission.md](./permission.md) | 权限系统（PBAC）：RBAC + ABAC 混合模型、通配符匹配、Deny 优先、权重压制 |
| [guard.md](./guard.md) | 三级守卫：级联访问控制的层级与判定顺序 |

总入口（全部文档的地图）在 [../README.md](../README.md)。
