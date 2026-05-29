# 多服务器部署架构设计

## 背景

当前项目是单体架构，所有模块（oauth21、user、iam、notice、session、firewall）运行在同一个 Fastify 进程中。需求是将同一套后端框架部署到多台服务器上：

- **主服务器（Auth Server）**：OAuth2.1 授权、用户管理、IAM 权限
- **子服务器（App Server）**：各自承载业务数据，依赖主服务器做身份验证

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          客户端 (SPA / App)                         │
└──────┬──────────────────────────┬───────────────────────────────────┘
       │                          │
       ▼                          ▼
┌──────────────┐          ┌──────────────┐
│  主服务器     │          │  子服务器 A   │
│  (Auth)      │          │  (业务A)      │
│              │          │              │
│  OAuth2.1    │◄────────►│  业务 API    │
│  User/IAM    │  验证Token│  应用数据    │
│  Session     │          │  本地权限     │
│  Notice      │          │              │
└──────┬───────┘          └──────────────┘
       │
       ▼
┌──────────────┐          ┌──────────────┐
│  共享数据库    │          │  子服务器 B   │
│  MySQL/Redis │          │  (业务B)      │
│              │          │              │
│  user_*      │          │  业务 API    │
│  oauth_*     │          │  应用数据    │
│  iam_*       │          │  本地权限     │
│  session_*   │          │              │
└──────────────┘          └──────────────┘
```

---

## 核心设计决策

### 1. oauth21 和 user 模块不移入 app 子文件夹

**建议：保持当前 `src/` 目录结构不变，通过配置控制模块加载。**

原因：

- 模块已经是按领域分目录的（`src/oauth21/`、`src/user/`、`src/iam/`）
- 移入 `app/` 子文件夹会破坏现有的加载器扫描逻辑（`07-api.js` 递归扫描 `src/api/`）
- 更好的方案是用**配置开关**控制哪些模块在当前服务器启用

### 2. Token 验证方式：JWT 公钥分发

**主服务器签发 JWT（RS256），子服务器用公钥验证，无需回调主服务器。**

```
主服务器:  私钥签名 → Access Token (JWT)
子服务器:  公钥验证 → 解析出 sub, role, scope 等 claims
```

优势：

- 子服务器验证 Token 是本地操作，零网络开销
- 公钥可以安全分发（不含私钥信息）
- 即使主服务器临时不可用，已签发的 Token 仍可被子服务器验证

### 3. 授权码存储位置

**授权码保存在主服务器，子服务器不存储授权码。**

流程：

```
1. 用户访问子服务器 A → 重定向到主服务器 /oauth/authorize
2. 主服务器验证用户身份 → 生成授权码 → 重定向回子服务器 A 的 callback
3. 子服务器 A 用授权码向主服务器 /oauth/token 换取 Access Token
4. 子服务器 A 用公钥验证 Token → 建立本地会话
```

子服务器只需存储自己的业务数据和用户访问记录，不存储 OAuth 授权码。

---

## 实施方案

### 方案 A：配置开关（推荐，改动最小）

在 `.env` 中增加模块开关，Loader 根据配置决定加载哪些模块。

**主服务器 `.env`：**

```env
SERVER_ROLE=auth          # 服务器角色标识
MODULE_OAUTH21=true       # 启用 OAuth 授权服务
MODULE_USER=true          # 启用用户管理
MODULE_IAM=true           # 启用权限管理
MODULE_NOTICE=true        # 启用通知服务
MODULE_SESSION=true       # 启用会话管理

# 共享数据库（所有服务器连接同一个数据库）
DB_HOST=shared-db-host
DB_NAME=auth_db
```

**子服务器 A `.env`：**

```env
SERVER_ROLE=app           # 服务器角色标识
APP_ID=business-a         # 应用唯一标识
MODULE_OAUTH21=false      # 不加载 OAuth 模块
MODULE_USER=false         # 不加载用户模块
MODULE_IAM=false          # 不加载 IAM 模块
MODULE_NOTICE=false       # 不加载通知模块
MODULE_SESSION=true       # 本地会话管理仍需启用

# 主服务器配置（用于 Token 验证和用户信息查询）
AUTH_SERVER_URL=https://auth.example.com
AUTH_SERVER_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----

# 子服务器自己的数据库（业务数据）
DB_HOST=app-a-db-host
DB_NAME=app_a_db
```

**需要改动的文件：**

1. `src/loader/registry/07-api.js` — 扫描路由时检查 `MODULE_*` 开关
2. `src/loader/registry/06-models.js` — 按需加载模型（不加载未启用模块的模型）
3. 新增 `src/auth/jwt-verify.js` — 支持从环境变量读取公钥验证 Token

### 方案 B：独立部署包（改动较大，适合完全拆分）

将项目拆分为多个独立部署包，每个包只包含需要的模块：

```
packages/
├── auth-server/          # 主服务器包
│   ├── src/oauth21/
│   ├── src/user/
│   ├── src/iam/
│   └── src/notice/
├── app-server/           # 子服务器基础包
│   ├── src/auth/         # Token 验证（公钥模式）
│   ├── src/session/
│   └── src/firewall/
└── shared/               # 共享代码
    ├── src/db/
    ├── src/redis/
    └── src/loader/
```

此方案改动量大，需要重构为 monorepo，**不建议现阶段采用**。

---

## 子服务器 Token 验证流程

### 当前流程（单体）

```
onRequest → 从 cookie/header 提取 JWT → 用 app.jwtSecret 验证 → request.state.user
```

### 多服务器流程

```
onRequest → 从 cookie/header 提取 JWT
          → 用 AUTH_SERVER_PUBLIC_KEY 验证签名
          → 解析 claims: { sub, uid, role, scope, client_id }
          → request.state.user = { ...claims, source: 'auth-server' }
          → 本地业务逻辑使用 request.state.user
```

**子服务器不需要调用主服务器的 API 来验证 Token**，公钥验证是纯本地操作。

### 子服务器需要的用户信息

JWT claims 中已包含：

- `sub` — 用户唯一标识（UUID）
- `uid` — 用户内部 ID
- `role` — 用户角色
- `scope` — 授权范围
- `client_id` — 客户端标识
- `app_id` — 应用标识

如果子服务器需要更多用户信息（如头像、昵称），有两种方式：

**方式 1：JWT Claims 扩展（推荐）**
在主服务器签发 Token 时，将必要信息嵌入 claims：

```js
const payload = {
  sub: user.uid,
  role: user.role,
  name: user.username, // 新增
  avatar: user.avatar, // 新增
  email: user.email // 新增
};
```

**方式 2：用户信息 API**
子服务器通过 HTTP 调用主服务器获取用户详情：

```js
// 子服务器代码
const userInfo = await fetch(`${AUTH_SERVER_URL}/api/user/profile`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

---

## 子服务器本地数据模型

每个子服务器维护自己的业务数据，通过 `sub`（用户 UUID）关联到主服务器的用户：

```sql
-- 子服务器 A 的数据库
CREATE TABLE app_a_user_data (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub VARCHAR(36) NOT NULL,           -- 关联主服务器用户的 UUID
  app_id VARCHAR(64) NOT NULL,        -- 应用标识
  -- 业务字段...
  preferences JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sub (sub)
);

CREATE TABLE app_a_user_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sub VARCHAR(36) NOT NULL,
  event VARCHAR(50) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sub_event (sub, event)
);
```

**关键设计：子服务器用 `sub`（UUID）作为用户标识，不用自增 ID。** 这样：

- 不同子服务器的用户数据可以独立演进
- 可以安全地跨服务器关联用户数据
- 用户在主服务器注销后，子服务器的 `sub` 引用自然失效

---

## 授权码流程（跨服务器）

```
用户 ──────────────────────────────────────────────────────────────────────
  │
  │  1. 访问子服务器 A 的受保护资源
  │     GET https://app-a.example.com/api/data
  │
  ▼
子服务器 A ────────────────────────────────────────────────────────────────
  │
  │  2. 检查本地会话 → 无有效 Token
  │  3. 返回 302 重定向到主服务器授权端点
  │     Location: https://auth.example.com/oauth/authorize
  │       ?response_type=code
  │       &client_id=app-a-client
  │       &redirect_uri=https://app-a.example.com/callback
  │       &scope=openid profile
  │       &state=random-state
  │       &code_challenge=xxx
  │       &code_challenge_method=S256
  │
  ▼
主服务器 ──────────────────────────────────────────────────────────────────
  │
  │  4. 用户登录（如果未登录）
  │  5. 用户同意授权
  │  6. 生成授权码，重定向回子服务器
  │     Location: https://app-a.example.com/callback
  │       ?code=AUTH_CODE_XXX
  │       &state=random-state
  │
  ▼
子服务器 A ────────────────────────────────────────────────────────────────
  │
  │  7. 收到回调，用授权码向主服务器换 Token
  │     POST https://auth.example.com/oauth/token
  │       grant_type=authorization_code
  │       &code=AUTH_CODE_XXX
  │       &redirect_uri=https://app-a.example.com/callback
  │       &client_id=app-a-client
  │       &client_secret=xxx
  │       &code_verifier=xxx
  │
  ▼
主服务器 ──────────────────────────────────────────────────────────────────
  │
  │  8. 验证授权码、PKCE、客户端凭证
  │  9. 签发 Access Token + Refresh Token
  │     返回 { access_token, refresh_token, id_token }
  │
  ▼
子服务器 A ────────────────────────────────────────────────────────────────
  │
  │  10. 用公钥验证 Access Token 签名
  │  11. 建立本地会话（cookie 或 session）
  │  12. 重定向到原始请求的受保护资源
  │
  ▼
用户 ──────────────────────────────────────────────────────────────────────
  │
  │  13. 携带本地会话访问业务 API
  │
```

---

## 共享数据库 vs 独立数据库

### 方案 1：共享数据库（简单，适合初期）

所有服务器连接同一个 MySQL 实例，通过表名前缀区分数据：

```
主服务器读写:  user_*, oauth_*, iam_*, session_*, notice_*
子服务器 A:    app_a_*（自己的业务表）
子服务器 B:    app_b_*（自己的业务表）
```

**优点：** 部署简单，数据一致性有保障
**缺点：** 数据库成为单点，扩展受限

### 方案 2：独立数据库 + 共享用户库（推荐）

```
主服务器:     auth_db（user_*, oauth_*, iam_*, session_*）
子服务器 A:   app_a_db（app_a_*）
子服务器 B:   app_b_db（app_b_*）
```

**优点：** 各服务器数据隔离，可独立扩展
**缺点：** 需要维护多个数据库连接

### 方案 3：微服务架构（未来扩展）

当业务规模增长、团队扩大、需要独立部署和弹性伸缩时，可演进为微服务架构。

#### 架构总览

```
                         ┌─────────────────┐
                         │   API Gateway   │
                         │   (Nginx/Kong)  │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
     │  Auth 服务    │    │  业务服务 A   │    │  业务服务 B   │
     │  (OAuth2.1)  │    │  (App A)     │    │  (App B)     │
     │              │    │              │    │              │
     │  User/IAM    │    │  业务逻辑    │    │  业务逻辑    │
     │  Token 签发  │    │  数据处理    │    │  数据处理    │
     └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
            │                   │                   │
            ▼                   ▼                   ▼
     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
     │  auth_db     │    │  app_a_db    │    │  app_b_db    │
     │  (MySQL)     │    │  (MySQL)     │    │  (MySQL)     │
     └──────────────┘    └──────────────┘    └──────────────┘
            │
            ▼
     ┌──────────────┐
     │  Auth Redis  │
     │  (共享缓存)   │
     └──────────────┘
```

#### 服务职责划分

| 服务        | 职责                                                         | 数据库   | 对外端口  |
| ----------- | ------------------------------------------------------------ | -------- | --------- |
| Auth 服务   | OAuth2.1 授权、用户管理、IAM 权限、Token 签发/验证、通知服务 | auth_db  | 公网      |
| App A 服务  | 业务 A 的 CRUD、本地权限、数据统计                           | app_a_db | 公网/内网 |
| App B 服务  | 业务 B 的 CRUD、本地权限、数据统计                           | app_b_db | 公网/内网 |
| API Gateway | 路由分发、限流、CORS、SSL 终止                               | 无       | 公网      |

#### 子服务器分类（是否需要用户授权）

**不是所有子服务器都需要用户授权和状态同步。** 根据业务特性，子服务器分为三类：

| 类型       | 用户授权     | 用户数据            | 状态同步 | 典型场景                             |
| ---------- | ------------ | ------------------- | -------- | ------------------------------------ |
| **用户型** | 需要         | 有（通过 sub 关联） | 需要     | 用户后台、SaaS 应用、社交平台        |
| **服务型** | 不需要       | 无用户数据          | 不需要   | 定时任务、数据同步、日志处理         |
| **混合型** | 部分接口需要 | 部分数据关联用户    | 部分需要 | 电商（用户下单需要，商品查询不需要） |

**用户型子服务器：**

```env
SERVER_ROLE=app
MODULE_SESSION=true          # 需要会话管理
AUTH_SERVER_URL=https://auth.example.com
AUTH_SERVER_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
# 必须订阅 user:state:changed 事件
```

**服务型子服务器（无用户上下文）：**

```env
SERVER_ROLE=service
MODULE_SESSION=false         # 不需要会话管理
MODULE_USER=false
# 不订阅用户状态事件
# 使用 API Key 或服务间 Token 做身份验证
```

**混合型子服务器：**

```env
SERVER_ROLE=app
MODULE_SESSION=true
AUTH_SERVER_URL=https://auth.example.com
AUTH_SERVER_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
# 公开接口不需要 Token 验证
# 用户接口需要 Token 验证 + 状态同步
```

**状态同步只对用户型和混合型子服务器生效，服务型子服务器完全不参与。**

#### 服务间通信

**同步调用（HTTP/gRPC）：**

```
App A 服务 ──HTTP──► Auth 服务
  │                   │
  │  POST /oauth/introspect    ← 验证 Token 有效性
  │  GET  /api/user/{sub}      ← 获取用户详情
  │  POST /oauth/token         ← 用授权码换 Token
  │
  ▼
响应: { active: true, sub: "uuid", role: "user", scope: "..." }
```

**定向通知（推荐）：**

用户状态变更时，Auth 服务查询该用户授权了哪些应用，只通知对应的应用服务器，不广播给所有子服务。

```
Auth 服务:
  用户封禁
    → 查询 oauth_user_approval 表: 该用户授权了 App A、App B
    → 查询 oauth_clients 表: App A 的 webhook_url、App B 的 webhook_url
    → POST https://app-a.example.com/internal/webhook/user-state
    → POST https://app-b.example.com/internal/webhook/user-state
    → 不通知 App C（该用户未授权过 App C）
```

**数据模型支撑：**

```sql
-- oauth_clients 表新增 webhook_url 字段
ALTER TABLE oauth_clients ADD COLUMN webhook_url VARCHAR(500) DEFAULT NULL COMMENT '用户状态变更通知地址';
ALTER TABLE oauth_clients ADD COLUMN webhook_secret VARCHAR(255) DEFAULT NULL COMMENT 'Webhook 签名密钥';

-- 查询用户授权了哪些应用
SELECT c.client_id, c.client_name, c.webhook_url, a.app_id, a.scopes, a.status
FROM oauth_user_approval a
JOIN oauth_clients c ON a.app_id = c.client_id
WHERE a.sub = 'user-uuid' AND a.status = 1 AND c.webhook_url IS NOT NULL;
```

**oauth_clients 配置示例：**

```sql
-- 注册子服务器时配置 webhook
INSERT INTO oauth_clients (client_id, client_name, client_secret, redirect_uris, webhook_url, webhook_secret, grant_types, scope, token_endpoint_auth_method)
VALUES (
  'app-a-client',
  '业务系统 A',
  'hashed_secret',
  '["https://app-a.example.com/callback"]',
  'https://app-a.example.com/internal/webhook/user-state',
  'hmac-secret-key-for-signature',
  '["authorization_code", "refresh_token"]',
  'openid profile email',
  'client_secret_basic'
);
```

#### Token 验证方式（微服务版）

**方式 A：本地公钥验证（推荐，零延迟）**

```js
// 子服务启动时获取公钥
const jwks = await fetch('https://auth.example.com/.well-known/jwks.json');
const publicKey = jwks.keys[0];

// 请求时本地验证
const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

**方式 B：Token Introspection（RFC 7662，实时性最强）**

```js
// 子服务每次请求都调用 Auth 服务验证
const response = await fetch('https://auth.example.com/oauth/introspect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `token=${accessToken}&client_id=${clientId}&client_secret=${clientSecret}`
});
const { active, sub, scope } = await response.json();
```

**两种方式对比：**

| 维度      | 本地公钥验证        | Token Introspection      |
| --------- | ------------------- | ------------------------ |
| 延迟      | 0ms（本地计算）     | 50-200ms（网络调用）     |
| 实时性    | 依赖 Token 过期时间 | 实时（可立即吊销）       |
| Auth 依赖 | 启动时获取公钥即可  | 每次请求都依赖           |
| 适用场景  | 高并发、低延迟      | 需要实时吊销的高安全场景 |

**推荐：默认用本地公钥验证，对安全敏感的接口用 Introspection。**

#### API Gateway 配置

```nginx
# Nginx 示例配置
upstream auth_service {
    server auth-1:3000;
    server auth-2:3000;
}

upstream app_a_service {
    server app-a-1:3001;
    server app-a-2:3001;
}

upstream app_b_service {
    server app-b-1:3002;
}

server {
    listen 443 ssl;
    server_name api.example.com;

    # Auth 服务路由
    location /oauth/ {
        proxy_pass http://auth_service;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Request-ID $request_id;
    }

    location /api/user/ {
        proxy_pass http://auth_service;
    }

    # 业务服务 A 路由
    location /api/business-a/ {
        proxy_pass http://app_a_service;
        # 子服务内部自行验证 Token，Gateway 不做鉴权
    }

    # 业务服务 B 路由
    location /api/business-b/ {
        proxy_pass http://app_b_service;
    }

    # 限流配置
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
    location /api/ {
        limit_req zone=api burst=200 nodelay;
    }
}
```

#### 数据一致性策略

微服务架构下，每个服务拥有独立数据库，跨服务事务需要特殊处理：

**模式 1：Saga 模式（推荐）**

```
注册流程（跨 Auth + App A）：
  1. Auth 服务创建用户 → 成功
  2. App A 服务创建用户档案 → 成功
  3. Auth 服务标记注册完成 → 成功

如果步骤 2 失败：
  1. Auth 服务回滚用户创建（补偿操作）
```

**模式 2：最终一致性**

```
用户更新头像：
  1. Auth 服务更新 user 表 → 发布事件 user.updated
  2. App A 服务监听事件 → 更新本地用户缓存
  3. App B 服务监听事件 → 更新本地用户缓存
```

**模式 3：共享只读副本**

```
子服务连接 Auth 服务的只读副本：
  - Auth 服务读写 auth_db（主库）
  - App A/B 服务只读 auth_db_replica（从库）
  - 通过 MySQL 主从复制保证数据最终一致
```

#### 用户状态同步方案

主服务器的用户状态变更（封禁、角色变更、权限修改、资料更新、密码修改、注销等）需要及时同步到对应的子服务器。

**核心原则：只通知该用户授权过的应用，不广播给所有子服务。**

```
Auth 服务:
  用户 uuid-123 被封禁
    → 查询 oauth_user_approval: 该用户授权了 App A、App B（未授权 App C）
    → 查询 oauth_clients: App A 的 webhook_url、App B 的 webhook_url
    → POST https://app-a.example.com/internal/webhook/user-state  ✓ 通知
    → POST https://app-b.example.com/internal/webhook/user-state  ✓ 通知
    → App C 不通知（该用户未授权过）
```

**需要同步的用户状态变更类型：**

| 变更类型              | 紧急程度 | 影响                                 |
| --------------------- | -------- | ------------------------------------ |
| 用户封禁/冻结         | 立即     | 必须立即终止该用户在已授权应用的访问 |
| 用户注销              | 立即     | 必须立即终止访问并清理数据           |
| 角色/权限变更         | 尽快     | 影响接口级权限控制                   |
| Token 吊销            | 立即     | 必须立即拒绝该 Token                 |
| 密码修改              | 尽快     | 应使旧 Token 失效                    |
| 资料更新（头像/昵称） | 最终一致 | 不影响安全性，延迟可接受             |

---

**方案 1：定向 Webhook 通知（推荐）**

原理：用户状态变更时，Auth 服务查询该用户授权了哪些应用（`oauth_user_approval`），获取对应应用的 Webhook 地址（`oauth_clients.webhook_url`），只通知这些应用。

```js
// === Auth 服务端：定向通知 ===
// src/user/services/user-state-sync.js

/**
 * 用户状态变更时，定向通知该用户授权过的所有应用
 * @param {string} sub 用户 UUID
 * @param {string} event 事件类型: user.disabled / user.deleted / role.changed / token.revoked
 * @param {object} data 事件附加数据
 */
async function notifyAuthorizedApps(sub, event, data = {}) {
  // 1. 查询该用户授权了哪些应用（且应用配置了 webhook_url）
  const approvals = await OauthApproval.findAll({
    where: { sub, status: 1 },
    include: [{
      model: OauthClient,
      as: 'client',
      where: { webhook_url: { [Op.ne]: null } },
      required: true
    }]
  });

  if (approvals.length === 0) return; // 该用户未授权任何应用，无需通知

  // 2. 构造事件 payload
  const payload = {
    event,
    sub,
    data,
    timestamp: Date.now()
  };
  const body = JSON.stringify(payload);

  // 3. 并行通知所有已授权的应用
  const results = await Promise.allSettled(
    approvals.map(async (approval) => {
      const { webhook_url, webhook_secret } = approval.client;
      const signature = signHmac(body, webhook_secret);

      const res = await fetch(webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event
        },
        body,
        signal: AbortSignal.timeout(10_000) // 10 秒超时
      });

      if (!res.ok) {
        throw new Error(`Webhook ${webhook_url} 返回 ${res.status}`);
      }
      return { client_id: approval.app_id, status: res.status };
    })
  );

  // 4. 记录失败的投递，后续重试
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const failedApp = approvals[index];
      console.warn(`[StateSync] Webhook 投递失败: ${failedApp.app_id}`, result.reason?.message);
      // 写入 Redis List 待重试
      await redis.lPush('webhook:retry:queue', JSON.stringify({
        url: failedApp.client.webhook_url,
        secret: failedApp.client.webhook_secret,
        body,
        retries: 0,
        nextRetryAt: Date.now() + 30_000 // 30 秒后重试
      }));
    }
  });
}

// === 在用户状态变更时调用 ===
async function disableUser(uid) {
  await User.update({ status: 0 }, { where: { uid } });

  // 定向通知该用户授权过的应用
  await notifyAuthorizedApps(uid, 'user.disabled', { status: 0 });

  // Token 黑名单（共享 Redis，所有子服务验证时检查）
  const tokens = await SessionToken.findAll({ where: { user_id: uid } });
  const pipeline = redis.multi();
  for (const t of tokens) {
    pipeline.set(`blacklist:${t.token}`, '1', { EX: 86400 });
  }
  pipeline.set(`user:${uid}:revoked`, String(Date.now()), { EX: 86400 });
  await pipeline.exec();
}
```

```js
// === 子服务端：接收 Webhook ===
// src/auth/webhook-handler.js

/**
 * 注册 Webhook 接收路由
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 * @param {string} webhookSecret 本应用的 Webhook 签名密钥（与 oauth_clients.webhook_secret 一致）
 */
export function registerWebhookHandler(app, webhookSecret) {
  app.post('/internal/webhook/user-state', async (request, reply) => {
    // 1. 验证签名
    const signature = request.headers['x-webhook-signature'];
    const body = JSON.stringify(request.body);
    if (!verifyHmac(body, signature, webhookSecret)) {
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    const { event, sub, data } = request.body;

    // 2. 处理事件
    switch (event) {
      case 'user.disabled':
      case 'user.deleted':
        // 清除该用户的本地会话和缓存
        await clearUserSessions(sub);
        await clearUserCache(sub);
        break;
      case 'role.changed':
        // 清除权限缓存，下次请求重新从 Token claims 读取
        await clearPermissionCache(sub);
        break;
      case 'token.revoked':
        // 将指定 Token 加入本地黑名单
        if (data.token) {
          await addToLocalBlacklist(data.token);
        }
        break;
      case 'profile.updated':
        // 清除用户资料缓存
        await clearUserCache(sub);
        break;
    }

    return reply.code(200).send({ received: true });
  });
}
```

**Webhook 失败重试机制：**

```js
// Auth 服务端：定时重试失败的 Webhook
async function processWebhookRetries() {
  while (true) {
    const item = await redis.brPop('webhook:retry:queue', 5); // 阻塞 5 秒
    if (!item) continue;

    const task = JSON.parse(item.element);

    // 超过最大重试次数则放弃
    if (task.retries >= 5) {
      console.error(`[StateSync] Webhook 最终失败，放弃重试: ${task.url}`);
      continue;
    }

    // 检查是否到了重试时间
    if (Date.now() < task.nextRetryAt) {
      await redis.lPush('webhook:retry:queue', JSON.stringify(task));
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    try {
      const res = await fetch(task.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signHmac(task.body, task.secret)
        },
        body: task.body,
        signal: AbortSignal.timeout(10_000)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // 指数退避重试：30s, 60s, 120s, 240s, 480s
      const delay = 30_000 * Math.pow(2, task.retries);
      task.retries++;
      task.nextRetryAt = Date.now() + delay;
      await redis.lPush('webhook:retry:queue', JSON.stringify(task));
    }
  }
}
```

优点：精准投递（只通知授权过的应用），不浪费网络资源，无共享 Redis 依赖
缺点：需要在 `oauth_clients` 表新增 `webhook_url` 和 `webhook_secret` 字段

---

**方案 2：Token 黑名单（即时生效，与 Webhook 配合使用）**

原理：对安全敏感的操作，直接将 Token 加入共享 Redis 黑名单。子服务验证 Token 时实时检查黑名单，无需等待 Webhook 投递。

```
Auth 服务:
  用户封禁 → 获取该用户所有活跃 Token
           → SET blacklist:token1 1 EX 86400
           → SET blacklist:token2 1 EX 86400
           → SET user:uuid:revoked <timestamp> EX 86400

子服务验证 Token:
  1. GET blacklist:${token} → 存在则拒绝
  2. jwt.verify(token, publicKey) → 验证签名
  3. GET user:${sub}:revoked → 比较 iat，过期则拒绝
```

优点：立即生效，不依赖 Webhook 投递成功
缺点：需要共享 Redis 实例

---

**方案 3：短 Token + 自动刷新（最简单）**

原理：将用户状态嵌入 JWT claims，Token 过期后刷新时重新读取最新状态。

```
Token 签发时嵌入状态:
  { sub: "uuid", role: "admin", status: "active", version: 42 }

Token 过期 → 子服务用 Refresh Token 向 Auth 服务换新 Token
           → Auth 服务读取最新 user 状态 → 签发新 Token
```

优点：实现最简单，无需额外基础设施
缺点：存在时间窗口（Token 过期前状态未同步）

适用场景：资料更新等非安全敏感场景

---

#### 方案对比

| 方案          | 实时性       | 可靠性       | 实现复杂度 | 基础设施要求 | 特点                         |
| ------------- | ------------ | ------------ | ---------- | ------------ | ---------------------------- |
| 定向 Webhook  | 高（秒级）   | 高（含重试） | 中         | 无共享要求   | 精准投递，只通知授权过的应用 |
| Token 黑名单  | 最高（立即） | 最高         | 低         | 共享 Redis   | 即时生效，配合 Webhook 使用  |
| 短 Token 刷新 | 低（分钟级） | 高           | 低         | 无           | 最简单，适合非安全场景       |

#### 推荐组合策略

**根据变更类型选择不同方案：**

```
用户封禁/注销/密码修改
  → Token 黑名单（即时生效）+ 定向 Webhook（通知授权应用清理缓存）
  → 双保险：黑名单确保立即拒绝，Webhook 确保应用清理本地状态

角色/权限变更
  → 定向 Webhook 通知
  → 授权应用收到事件后清除权限缓存

资料更新（头像/昵称/邮箱）
  → 短 Token 自动刷新
  → Token 过期后自然刷新，无需额外通知

Token 吊销
  → Token 黑名单
  → 共享 Redis SET，子服务验证时实时检查
```

**各类型子服务器的同步策略：**

| 子服务器类型 | Token 验证             | 状态同步               | 说明               |
| ------------ | ---------------------- | ---------------------- | ------------------ |
| 用户型       | 公钥验证 + 黑名单检查  | 接收 Webhook           | 完整实现           |
| 混合型       | 仅用户接口验证         | 仅用户接口接收 Webhook | 按需实现           |
| 服务型       | API Key / 服务间 Token | 不接收                 | 不配置 webhook_url |

#### 服务注册与发现

**方式 A：静态配置（简单）**

```env
# 子服务 .env
AUTH_SERVICE_URL=https://auth.example.com
APP_A_SERVICE_URL=https://app-a.example.com
```

**方式 B：Consul/etcd 服务发现（适合大规模）**

```js
// 服务启动时注册
await consul.agent.service.register({
  name: 'auth-service',
  address: '10.0.1.1',
  port: 3000,
  check: { http: 'http://10.0.1.1:3000/health', interval: '10s' }
});

// 调用时动态发现
const authUrl = await consul.health.service('auth-service');
```

#### 容器化部署

```yaml
# docker-compose.yml（开发环境）
version: '3.8'
services:
  auth-service:
    build: .
    environment:
      - SERVER_ROLE=auth
      - MODULE_OAUTH21=true
      - MODULE_USER=true
      - MODULE_IAM=true
    ports:
      - '3000:3000'
    depends_on:
      - auth-db
      - redis

  app-a-service:
    build: .
    environment:
      - SERVER_ROLE=app
      - APP_ID=business-a
      - MODULE_OAUTH21=false
      - MODULE_USER=false
      - AUTH_SERVER_URL=http://auth-service:3000
    ports:
      - '3001:3000'
    depends_on:
      - app-a-db

  auth-db:
    image: mysql:8.0
    volumes:
      - auth-data:/var/lib/mysql

  app-a-db:
    image: mysql:8.0
    volumes:
      - app-a-data:/var/lib/mysql

  redis:
    image: redis:7-alpine

volumes:
  auth-data:
  app-a-data:
```

```yaml
# Kubernetes Deployment 示例
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    spec:
      containers:
        - name: auth
          image: your-registry/auth-server:latest
          env:
            - name: SERVER_ROLE
              value: 'auth'
            - name: MODULE_OAUTH21
              value: 'true'
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

#### 微服务方案优缺点

| 维度       | 评价                                                |
| ---------- | --------------------------------------------------- |
| 独立部署   | 每个服务可独立发布，不影响其他服务                  |
| 弹性伸缩   | 可按服务独立扩容（Auth 服务压力大就多部署 Auth）    |
| 技术栈自由 | 不同服务可用不同语言/框架（但当前项目统一 Node.js） |
| 故障隔离   | 业务 A 服务崩溃不影响业务 B 和 Auth                 |
| 数据隔离   | 每个服务独立数据库，无耦合                          |
| 运维复杂度 | 需要容器编排（K8s）、服务发现、链路追踪、集中日志   |
| 调试难度   | 跨服务调用链路长，需要分布式追踪（Jaeger/Zipkin）   |
| 一致性挑战 | 跨服务事务需要 Saga/最终一致性，比单体复杂          |

#### 微服务实施前提

| 条件     | 说明                                        |
| -------- | ------------------------------------------- |
| 团队规模 | 3+ 人，各服务可由不同人维护                 |
| 部署频率 | 每周多次发布，需要独立部署能力              |
| 流量规模 | 单服务 QPS > 1000，需要独立扩容             |
| 运维能力 | 有 K8s/Docker 运维经验，能搭建 CI/CD 流水线 |

**如果以上条件不满足，建议先用方案 A（配置开关）或方案 B（独立数据库），待业务规模增长后再演进到微服务。**

#### 三方案对比

| 维度       | 方案 A：配置开关 | 方案 B：独立数据库 | 方案 C：微服务   |
| ---------- | ---------------- | ------------------ | ---------------- |
| 改动量     | 小（改配置）     | 中（拆分数据库）   | 大（拆分服务）   |
| 部署复杂度 | 低               | 中                 | 高               |
| 数据隔离   | 无（共享数据库） | 有（独立数据库）   | 有（独立数据库） |
| 独立扩缩容 | 不支持           | 不支持             | 支持             |
| 运维成本   | 低               | 中                 | 高               |
| 适用阶段   | 初期/中期        | 中期               | 成长期/大规模    |

---

## 服务器注册与客户端管理

每个子服务器需要在主服务器注册为 OAuth 客户端：

```sql
-- 在主服务器的 oauth_clients 表中注册子服务器
INSERT INTO oauth_clients (client_id, client_name, client_secret, redirect_uris, grant_types, scope, token_endpoint_auth_method, application_type)
VALUES (
  'app-a-client',
  '业务系统 A',
  'hashed_secret',
  '["https://app-a.example.com/callback"]',
  '["authorization_code", "refresh_token"]',
  'openid profile email',
  'client_secret_basic',
  'web'
);
```

---

## 安全考虑

### 1. 公钥分发

**方式 A：静态配置（简单）**
子服务器 `.env` 中直接配置公钥：

```env
AUTH_SERVER_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMIIBI...\n-----END PUBLIC KEY-----
```

**方式 B：JWKS 端点（标准）**
主服务器暴露 `/.well-known/jwks.json`，子服务器动态获取公钥：

```js
// 子服务器启动时获取公钥
const jwks = await fetch('https://auth.example.com/.well-known/jwks.json');
const publicKey = jwks.keys[0]; // 缓存，定期刷新
```

### 2. 跨域 Cookie

如果主服务器和子服务器在同一父域下（如 `auth.example.com` 和 `app-a.example.com`），可以设置 Cookie 的 `Domain=.example.com` 实现跨子域共享会话。

如果不在同一父域，子服务器需要独立的会话管理。

### 3. Token 刷新

子服务器收到过期 Token 时，用 Refresh Token 向主服务器换取新 Token：

```js
const response = await fetch('https://auth.example.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=refresh_token&refresh_token=xxx&client_id=xxx&client_secret=xxx'
});
```

---

## 建议的实施步骤

| 阶段 | 内容                                              | 工作量 |
| ---- | ------------------------------------------------- | ------ |
| 1    | 在 `.env` 中增加 `SERVER_ROLE` 和 `MODULE_*` 开关 | 小     |
| 2    | 修改 `07-api.js` 和 `06-models.js` 按开关加载模块 | 中     |
| 3    | 新增 `src/auth/jwt-public-verify.js` 支持公钥验证 | 小     |
| 4    | 子服务器注册为 OAuth 客户端                       | 配置   |
| 5    | 子服务器实现 OAuth 回调 + Token 换取逻辑          | 中     |
| 6    | 子服务器实现本地会话管理                          | 小     |

**推荐先从阶段 1-3 开始，验证 Token 公钥验证方案可行后，再推进后续阶段。**

---

## 总结

| 问题                                 | 答案                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| oauth21/user 是否移入 app 子文件夹？ | 不需要，用配置开关控制加载即可                                        |
| 授权码保存在哪？                     | 主服务器，子服务器不存储授权码                                        |
| 子服务器如何验证用户？               | JWT 公钥验证，零网络开销                                              |
| 子服务器需要哪些用户数据？           | JWT claims 已包含基本信息，需要更多时可扩展 claims 或调用主服务器 API |
| 数据库如何设计？                     | 主服务器存用户/授权数据，子服务器存业务数据，通过 `sub`（UUID）关联   |
