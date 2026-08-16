# OAuth 2.1 授权服务器 API 报告

> 授权服务器（Authorization Server + OIDC Provider）对外 API 总览。
> 所有端点挂在 `/oauth2.1` 前缀下（system.json `prefix`），issuer = `http://localhost:3000/oauth2.1`。
> 两种认证模式：**JWT 模式**（`JWT_ENABLED=true`）签发 JWT access/refresh token；**Session 模式**（默认）创建 sid/sid_r Cookie。
> 守卫三级：System（oauth21 `requireLogin:false`，公开授权端点）→ Group → API（每条路由可设 requireLogin/permission/allowRoles）。

## 模块总览

| 模块 | 文件 | 端点数 | 职责 |
|---|---|---|---|
| 认证（登录/注册/扫码） | `v1/auth/` | 11 | 用户身份认证与直接登录 |
| 授权码流程 | `v1/auth/authorize.js` | 3 | 标准 OAuth 2.1 授权码 + PKCE |
| 令牌端点 | `v1/token.js` | 2 | 令牌签发与撤销 |
| OIDC 发现 | `v1/oidc.js` | 2 | 发现文档 + JWKS |
| 加密工具 | `v1/crypto.js` | 1 | 前端加密公钥 |
| 设备授权 | `v1/device.js` | 4 | RFC 8628 设备码流程 |
| 登出 | `v1/logout.js` | 2 | OIDC RP-initiated logout |
| **合计** | | **25** | |

---

## 1. 认证模块（`v1/auth/`）

### 1.1 登录（`auth/login.js`）

业务逻辑：[`app/oauth21/services/login.service.js`](../src/app/oauth21/services/login.service.js)（`directLogin` / `confirmDirectConsent`）。

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| POST | `/oauth2.1/login` | 公开 | 标准直接登录 |
| POST | `/oauth2.1/mini-login` | 公开 | 快捷登录（允许 iframe 嵌入，`X-Frame-Options:ALLOWALL`） |
| POST | `/oauth2.1/login/consent/confirm` | 公开 | 第三方客户端首次登录的授权确认 |

**请求体**（密码登录）：
```json
{
  "encrypted": "<RSA-OAEP 密文，含 username/password>",
  "kid": "<RSA 公钥 kid>",
  "timestamp": 1717000000000,
  "nonce": "<随机串>",
  "keepLogin": true,
  "client_id": "可选，第三方客户端",
  "scope": "openid profile email",
  "oidcNonce": "OIDC nonce",
  "captchaKey": "可选，验证码 key"
}
```

**请求体**（邮箱验证码登录）：
```json
{ "type": "email", "email": "a@b.com", "code": "123456" }
```

**响应**（已授权，直接签发令牌）：
```json
{
  "code": 200, "message": "登录成功",
  "data": {
    "accessToken": "...", "refreshToken": "...", "tokenType": "Bearer",
    "expiresIn": 600, "scope": "...", "user": { "id":1, "username":"...", ... },
    "session_token": "<iframe SSO 场景父窗口用此调 /auth/v1/bind-session>"
  }
}
```

**响应**（第三方客户端首次，需授权确认）：
```json
{ "code": 200, "message": "需要授权确认",
  "data": { "action": "consent", "consentKey": "...", "client_id":"...", "scope":"...", "user":{...} } }
```

**用法**：
- 一方应用（firewall/posecraft）：前端 iframe 嵌 `/mini-login`，登录成功后 oauth21 `postMessage('LOGIN_SUCCESS', {sessionToken, user})`，父窗口调 `POST /auth/v1/bind-session` 换 sid/sid_r Cookie。
- 第三方客户端：带 `client_id`，首次需走 consent 确认。

### 1.2 注册（`auth/register.js`）

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| POST | `/oauth2.1/mini-register` | 公开 | iframe 嵌入式注册 |

> 当前为 stub，注册主逻辑在 `user` 域 `POST /user/v1/open/register`。oauth21 仅提供嵌入入口。

### 1.3 扫码登录（`auth/qr.js`）

业务逻辑：[`app/oauth21/services/qr.service.js`](../src/app/oauth21/services/qr.service.js)。

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| GET | `/oauth2.1/qr/generate` | 公开 | PC 端生成二维码（返回 qrKey，TTL 120s） |
| POST | `/oauth2.1/qr/scan` | 公开 | 移动端扫码标记 SCANNED |
| POST | `/oauth2.1/qr/confirm` | **requireLogin** | 移动端确认登录（用已登录态绑定 userId） |
| GET | `/oauth2.1/qr/status` | 公开 | PC 端轮询状态；CONFIRMED 时签发令牌 |

**状态机**：`PENDING → SCANNED → CONFIRMED（签发令牌）/ EXPIRED`

---

## 2. 授权码流程（`auth/authorize.js`）

业务逻辑：[`app/oauth21/services/authorization.service.js`](../src/app/oauth21/services/authorization.service.js)。

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| GET | `/oauth2.1/authorize` | 公开（已登录则静默签发） | 授权请求入口，校验 PKCE/redirect_uri |
| POST | `/oauth2.1/authorize/login` | 公开 | 授权页内用户登录验证 |
| POST | `/oauth2.1/authorize/consent` | 公开 | 用户 approve/deny 授权 |

**标准流程**：
1. 客户端 `GET /authorize?response_type=code&client_id=X&redirect_uri=Y&code_challenge=Z&code_challenge_method=S256&scope=openid&state=S`
2. 未登录 → 返回 `{action:'login', sessionId}`；已登录且已授权 → 302 重定向 `redirect_uri?code=...&state=...`
3. 未授权 → 返回 `{action:'consent', sessionId, user}`
4. `POST /authorize/consent {sessionId, user_id, action:'approve'}` → 存授权记录 + 302 重定向带 code
5. 客户端用 code 调 `POST /token`（grant_type=authorization_code + code_verifier）换令牌

---

## 3. 令牌端点（`token.js`）

业务逻辑：[`app/oauth21/services/token.service.js`](../src/app/oauth21/services/token.service.js)（`handleTokenGrant` / `handleRevoke`）。

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| POST | `/oauth2.1/token` | 公开（客户端凭据认证） | 令牌签发（3 种 grant_type） |
| POST | `/oauth2.1/revoke` | 公开（客户端凭据认证） | 令牌撤销（RFC 7009） |

**`/token` 请求体**（按 grant_type）：
- `authorization_code`：`{grant_type, code, redirect_uri, code_verifier, client_id, client_secret?}`
- `client_credentials`：`{grant_type, client_id, client_secret, scope?}`（M2M，无用户）
- `refresh_token`：`{grant_type, refresh_token, scope?, client_id?}`（一方应用可无 secret）

**响应**：
```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 600,
  "refresh_token": "...", "scope": "openid profile email",
  "id_token": "（scope 含 openid 时）" }
```

**JWT 模式**额外把 access_token/refresh_token 写入 HttpOnly Cookie（refresh_token path 收窄到 `/oauth2.1/token`）。

---

## 4. OIDC 发现（`oidc.js`）

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| GET | `/oauth2.1/.well-known/openid-configuration` | 公开 | OIDC 发现文档 |
| GET | `/oauth2.1/.well-known/jwks.json` | 公开 | JWKS 公钥集（验 JWT 签名） |

**发现文档关键字段**：`issuer`、`authorization_endpoint`、`token_endpoint`、`userinfo_endpoint`、`jwks_uri`、`revocation_endpoint`、`device_authorization_endpoint`、`end_session_endpoint`、`grant_types_supported`、`code_challenge_methods_supported: ['S256']`。

**用法**：标准 OIDC 客户端按发现文档自动发现所有端点，无需硬编码路径。JWKS 缓存 1 小时。

---

## 5. 加密工具（`crypto.js`）

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| GET | `/oauth2.1/crypto/public-key` | 公开 | 获取前端加密用 RSA 公钥（JWK + kid） |

**响应**：`{ key: {kty,n,e}, kid: "<key_id>", alg: "RSA-OAEP", cache_hint: "Cache for 5 minutes" }`

**用法**：前端登录/注册前调此端点拿公钥+kid，RSA-OAEP 加密密码等敏感数据，请求体带 `{encrypted, kid}`，后端用 kid 查私钥解密（kid 完整回传链路）。

---

## 6. 设备授权（`device.js`，RFC 8628）

业务逻辑：[`app/oauth21/services/device.service.js`](../src/app/oauth21/services/device.service.js)。

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| POST | `/oauth2.1/device_authorization` | 公开 | 发起设备授权（返回 device_code + user_code + verification_uri） |
| POST | `/oauth2.1/device/token` | 公开 | 设备端轮询获取令牌（pending 时返回 authorization_pending） |
| GET | `/oauth2.1/device` | 公开 | 用户验证页面（HTML，输入 user_code） |
| POST | `/oauth2.1/device/authorize` | **requireLogin** | 用户输入 user_code 并授权 |

**流程**：输入受限设备（电视/CLI）调 `/device_authorization` → 显示 `verification_uri` + `user_code` → 用户浏览器打开 `/device?user_code=X` 确认 → 设备轮询 `/device/token` 拿令牌。

---

## 7. 登出（`logout.js`）

业务逻辑：`destroySession`（[`framework/auth/session.js`](../src/framework/auth/session.js)）。

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| POST | `/oauth2.1/logout` | 公开 | 前端显式登出 |
| GET | `/oauth2.1/logout` | 公开 | RP-initiated logout（end_session_endpoint） |

**行为**：销毁当前会话（Redis session + sid_r 映射 + DB token revoke）+ 清 sid/sid_r Cookie。未登录也幂等。

---

## 8. 管理端（已迁出至 `admin` 域）

oauth21 域**不再含管理端点**（已迁至 admin 域，安全边界清晰）：

| 方法 | 路径 | 守卫 | 用途 |
|---|---|---|---|
| POST | `/admin/oauth21/v1/permissions/sync` | requireLogin + allowRoles:admin | 子应用上报权限点 |
| POST | `/admin/oauth21/v1/client` | requireLogin + allowRoles:admin | 创建 OAuth 客户端 |

> 用户列表管理在 `/admin/user/v1/list`（user 域管理端）。

---

## 目录结构

```
src/api/oauth21/v1/          # 路由层（只放 registerSecureRoute + handler 调 service）
├── auth/
│   ├── index.js             # 聚合器（4 子模块 + iframe 安全头钩子）
│   ├── login.js             # 登录路由
│   ├── authorize.js         # 授权码路由
│   ├── qr.js                # 扫码登录路由
│   └── register.js          # 注册路由
├── token.js                 # 令牌端点
├── oidc.js                  # OIDC 发现
├── crypto.js                # 加密公钥
├── device.js                # 设备授权
├── logout.js                # 登出
└── schemas/                 # fastify schema（login/token/authorize）

src/app/oauth21/             # 应用层（业务逻辑）
├── services/
│   ├── login.service.js     # 直接登录编排
│   ├── authorization.service.js  # 授权码流程
│   ├── token.service.js     # 令牌签发/撤销
│   ├── token-issuer.service.js   # 令牌签发引擎（JWT/Session/SSO）
│   ├── qr.service.js        # 扫码登录状态机
│   ├── device.service.js    # 设备授权
│   ├── decrypt.service.js   # RSA 解密+nonce+验证码
│   └── cookies.service.js   # Cookie 设置+响应构建
├── crypto/                  # jwt/encryption/pkce/tokens
├── dao/                     # client/code/token/approval/consent/permission/user
├── middleware/              # csrf/rate-limiter/auth
├── config/                  # config.js/constants.js/csrf-exclude.js
└── templates/               # device.html
```

## 对接新应用（app）的步骤

1. **注册客户端**：admin 调 `POST /admin/oauth21/v1/client` 创建 client（含 redirect_uris、grant_types）。
2. **一方应用登录**：前端 iframe 嵌 `/mini-login?appName=X`，监听 `postMessage('LOGIN_SUCCESS')`，父窗口调 `POST /auth/v1/bind-session` 换 Cookie。
3. **第三方授权码**：重定向到 `/authorize?client_id=X&redirect_uri=Y&code_challenge=Z&...`，拿 code 换 token。
4. **验 JWT**：客户端从 `/.well-known/jwks.json` 取公钥，按 token header 的 kid 验签。
5. **加密敏感数据**：调 `/crypto/public-key` 拿公钥+kid，RSA-OAEP 加密，请求体带 kid 回传。
