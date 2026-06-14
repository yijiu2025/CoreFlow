# 架构总览 {#architecture}

## 系统架构

Antigravity 采用**分层架构**设计，从底层基础设施到顶层业务应用，每一层职责清晰：

```
┌─────────────────────────────────────────────────────────────┐
│                        前端层                                │
│   firewall (Vue 3)  │  oauth21 (Vue 3)  │  admin (Vue 3)   │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      请求处理管道                             │
│  Cookie → Auth → RateLimit → Firewall → Guard → Handler     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      应用层                                  │
│   oauth21 (授权) │ user (用户) │ admin (管理) │ firewall     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      系统层                                  │
│   auth (认证) │ db (数据库) │ redis (缓存) │ firewall (安全) │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      存储层                                  │
│              MySQL 8.0  │  Redis 7                          │
└─────────────────────────────────────────────────────────────┘
```

## 请求处理链路

一个 HTTP 请求的完整处理流程：

```
onRequest[0]  →  @fastify/cookie     解析 cookies
onRequest[1]  →  auth                Session 验证（sid cookie → Redis → request.state.user）
onRequest[2]  →  @fastify/rateLimit  全局限频
onRequest[3]  →  firewall            五层拦截管道
preHandler    →  guard               三级权限守卫
preHandler    →  verifySignature     H5 签名验证（仅 OAuth21 路由）
handler       →  业务路由
onSend        →  日志 + 连接释放
onResponse    →  扫描陷阱（404/403 检测）
```

## 模块加载机制

引擎扫描 `src/loader/registry/` 目录，按文件名数字前缀顺序加载：

```
00-globals.js     → 装饰 reply.result
02-redis.js       → Redis 连接（失败降级到内存）
03-db.js          → Sequelize 连接
04-auth.js        → 认证插件
05-firewall.js    → 防火墙
06-models.js      → 自动加载模型
07-api.js         → 自动加载路由
09-pbac.js        → 角色同步
11-apps.js        → 应用配置加载
```

每个 Loader 导出默认函数接收 `app` 实例，错误被捕获并记录，不阻塞其他模块。

## 模型命名空间

模型按领域子目录自动注册为 `app.db.<namespace>.<ModelName>`：

| 命名空间 | 模型 | 表名 |
|----------|------|------|
| `db.user` | User, UserIdentity | user_user, user_identity |
| `db.iam` | Role, UserRole, InlinePolicy, Permission | iam_role, iam_user_role, iam_inline_policy, permissions |
| `db.oauth21` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `db.notice` | EmailCode, NoticeConfig | notice_email_codes, notice_configs |
| `db.session` | UserSession, SessionToken, SessionLog | session_user_session, session_tokens, session_logs |

## 目录约定

| 目录 | 职责 | 是否必须 |
|------|------|----------|
| `src/app/{name}/config.js` | 应用配置 | ✅ |
| `src/app/{name}/permission/` | 权限定义 | 可选 |
| `src/api/{name}/system.json` | 路由域配置 | ✅ |
| `src/api/{name}/v1/*.js` | 路由文件 | ✅ |
| `src/models/{name}/` | 数据模型 | 可选 |

## 下一步

- [请求处理流水线](/core/request-pipeline) — 了解请求的完整处理路径
- [认证系统](/core/auth) — 深入理解认证机制
- [权限系统](/core/permission) — 了解 PBAC 权限引擎
