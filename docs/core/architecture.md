# 架构总览 {#architecture}

## 系统架构

CoreFlow 采用**分层架构**设计，从底层基础设施到顶层业务应用，每一层职责清晰：

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

引擎扫描 `src/framework/loader/registry/` 目录，按文件名数字前缀顺序加载：

```
00-globals.js     → 装饰 reply.result
01-monitor.js     → 请求监控 + 慢请求告警
02-redis.js       → Redis 连接 + 健康监控（连不上则 app.redis = null）
03-db.js          → Sequelize 连接（已配置但连不上 → 启动失败）
04-auth.js        → 认证插件
05-firewall.js    → 防火墙
06-models.js      → 自动加载模型
07-keys.js        → JWT 密钥加载 + 启动自检（KEK / 当前密钥）
08-api.js         → 自动加载路由
09-notice.js      → SMTP 配置种子数据
10-apps.js        → 应用配置 + 权限 + 角色 + OAuth 客户端
```

**失败语义**：只有 `01-monitor` / `02-redis` / `09-notice` 在 `OPTIONAL_LOADERS` 名单里
（`src/framework/loader/engine.js`），失败只降级一项附加能力；其余加载器失败即
**fail-fast** —— 缺认证 / 防火墙 / 模型 / 路由 / 应用的进程能监听端口却处理不了正确请求，
"启动成功"是最糟的失败形态。`03-db` 的判据是"**已配置但连不上**才失败"，
未配置 DB 仍允许本地与测试无库启动。

**Redis 的降级边界**（容易被写错，实测口径）：

- **未配置**（`REDIS_ENABLED` 非 `true` 或无 `REDIS_HOST`）→ `getStore()` 直接返回进程内 `MapStore`。
- **已配置但启动连不上** → `app.redis = null`，此后访问层**仍然选 Redis 实现**，
  操作抛 `RedisRequiredError`（`statusCode = 503`），**不会**自动回退内存。
- 运行期不是"降级"而是"503"：`redis-store.js` 明确不复用内存兜底，避免多实例下
  计数/限流/会话各算一套而静默失控。需要容灾的短时效数据用 `getStore(prefix, { backup: true })`
  接备用 Redis，两个都不通仍是 503。

每个 Loader 导出默认函数接收 `app` 实例，错误被捕获并记录，不阻塞其他模块。

## 模型命名空间

模型按领域子目录自动注册为 `app.db.<namespace>.<ModelName>`：

| 命名空间     | 模型                                                            | 表名                                                                          |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `db.user`    | User, UserIdentity                                              | user_user, user_identity                                                      |
| `db.iam`     | Role, UserRole, InlinePolicy, Permission                        | iam_role, iam_user_role, iam_inline_policy, permissions                       |
| `db.oauth21` | OauthClient, OauthCode, OauthToken, OauthApproval, OauthConsent | oauth_clients, oauth_codes, oauth_tokens, oauth_user_approval, oauth_consents |
| `db.notice`  | EmailCode, NoticeConfig                                         | notice_email_codes, notice_configs                                            |
| `db.session` | UserSession, SessionToken, SessionLog, AuditLog                 | session_user_session, session_tokens, session_logs, session_audit_logs        |

## 目录约定

| 目录                         | 职责       | 是否必须 |
| ---------------------------- | ---------- | -------- |
| `src/app/{name}/config.js`   | 应用配置   | ✅       |
| `src/app/{name}/permission/` | 权限定义   | 可选     |
| `src/api/{name}/system.json` | 路由域配置 | ✅       |
| `src/api/{name}/v1/*.js`     | 路由文件   | ✅       |
| `src/models/{name}/`         | 数据模型   | 可选     |

## 下一步

- [请求处理流水线](/core/request-pipeline) — 了解请求的完整处理路径
- [认证系统](/core/auth) — 深入理解认证机制
- [权限系统](/core/permission) — 了解 PBAC 权限引擎
