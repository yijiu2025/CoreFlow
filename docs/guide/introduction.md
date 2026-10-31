# 项目简介 {#introduction}

CoreFlow 是一个基于 **Fastify v5 + Sequelize v6** 的后端框架，提供认证、权限、防火墙、OAuth 2.1 等基础设施，让开发者专注于业务逻辑。

> 自 2026-10-31 起本仓**只包含后端**：前端工程（`oauth21` / `posecraft` / `admin` / `poseadmin` /
> `firewall` / `phonecopy`）已迁出、各自独立维护。后端与前端之间是**线协议**（HTTP + Cookie），
> 契约见 [认证集成](/standards/auth-integration)。

## 核心特性

### 认证系统

框架内置了双模式认证：

- **Session 模式**（默认）：基于 Cookie + Redis 的服务端会话，支持自动续期、多设备管理、踢下线
- **JWT 模式**（可选）：基于 JWT 的无状态认证，适合前后端分离场景

两种模式都支持 RSA 加密登录、HMAC Cookie 签名、防重放攻击等安全特性。

### 权限系统 (PBAC)

采用 **基于策略的访问控制 (Policy-Based Access Control)**：

- 权限编码遵循 `{应用}:{资源}:{动作}` 三段式格式
- 支持通配符匹配（如 `fw:admin:*`）
- Deny 优先原则
- 角色继承与权重压制
- 应用隔离与全局可见

### 防火墙

五层安全拦截管道：

```
连接追踪 → 全局封禁 → 人机挑战 → Bot 检测 → 地理围栏/端点限频
```

### OAuth 2.1

完整的 OAuth 2.1 授权服务：

- 授权码 + PKCE 流程
- JWT Token 签发与验证
- 多客户端管理
- Scope 精细控制

## 技术栈

| 层级   | 技术                      | 版本            |
| ------ | ------------------------- | --------------- |
| 运行时 | Node.js                   | ≥24（ESM，LTS） |
| 框架   | Fastify                   | v5              |
| ORM    | Sequelize                 | v6              |
| 数据库 | MySQL                     | 8.0+            |
| 缓存   | Redis（可选）             | v5 客户端 / 6.0+ 服务端 |
| 认证   | Session + JWT             | -               |
| 迁移   | Umzug                     | v3              |

## 设计理念

1. **模块即应用**：一个目录包含应用的全部（配置、权限、模型、路由、业务逻辑）
2. **约定优于配置**：Loader 自动扫描注册，无需手动导入
3. **安全默认值**：三级守卫系统，每级可独立拦截
4. **渐进式增强**：Redis 可选（未配置时用进程内 `MapStore`，配置后要求在线的 503 语义），
   JWT 可选（默认 Session）
5. **前后端解耦**：后端只提供 HTTP 契约（Cookie 会话 / 签名 / CSRF 头），
   前端可以是任意栈 —— 本仓不再包含任何前端代码

## 下一步

- [快速上手](/guide/quick-start) — 创建你的第一个应用
- [项目结构](/guide/project-structure) — 了解目录组织方式
- [架构总览](/core/architecture) — 深入理解框架架构
