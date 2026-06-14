# 认证系统 {#auth}

## 认证模式

| 模式 | 启用方式 | Token 存储 | 验证方式 |
|------|----------|------------|----------|
| Session（默认） | `JWT_ENABLED=false` | Redis (sid/sid_r Cookie) | Cookie 自动携带 |
| JWT | `JWT_ENABLED=true` | localStorage + Bearer Header | JWT 签名验证 |

## Session 双令牌机制

### 短期登录（不勾选"记住我"）

- `sid` cookie: HMAC 签名的 sessionId，HttpOnly，Max-Age=2h
- Redis: `session:<sessionId>` = JSON（用户信息+角色+权限），TTL=2h

### 长期登录（勾选"记住我"）

- `sid` cookie: Max-Age=30min
- `sid_r` cookie: refreshToken，Max-Age=30天
- sid 过期时自动用 sid_r 刷新，用户无感知

### Cookie 签名格式

```
base64url(sessionId:accessCount).hmac-sha256-signature
```

- 每次请求递增 `accessCount`，重新签名（防重放）
- `timingSafeEqual` 比较签名（防时序攻击）

## Session 数据结构（Redis）

```json
{
  "userId": 123,
  "uid": "uuid-xxx",
  "username": "alice",
  "email": "alice@example.com",
  "appId": "firewall",
  "roles": ["admin", "operator"],
  "permissions": { "allows": ["user:read", "config:*"], "denies": ["user:delete"] },
  "ip": "192.168.1.1",
  "deviceId": "device-xxx",
  "loginAt": 1717000000,
  "rememberMe": false
}
```

## JWT 认证（可选）

### JWT Payload

```json
{
  "iss": "http://localhost:3000",
  "sub": "user-uuid",
  "aud": "firewall",
  "client_id": "firewall",
  "scope": "openid profile email",
  "iat": 1717000000,
  "exp": 1717000600,
  "jti": "uuid-xxx",
  "token_type": "access_token"
}
```

### Token 刷新

```
access_token 过期（10分钟）
  → API 请求返回 401
  → 前端 handle401() 检测
  → POST /oauth2.1/token (grant_type=refresh_token)
  → 后端验证 refresh_token，签发新 access_token
  → 重放所有排队请求
```

## OAuth 2.1 授权流程

```
用户访问第三方应用
  → 重定向至 SSO /authorize
  → SSO 检查 Cookie：
    - 无登录 Cookie → 返回 { action: 'login' }
    - 已登录未授权 → 返回 { action: 'consent' }
    - 已登录已授权 → 302 重定向 redirect_uri?code=xxx
  → 用户授权确认
  → 回调 Authorization Code
  → 应用用 Code 换取 Access Token
```

## 登录方式

| 方式 | 流程 | 适用场景 |
|------|------|----------|
| 邮箱验证码 | 输入邮箱 → 图形验证码 → 邮箱验证码 → 登录 | Web 端 |
| 密码登录 | 输入账号密码 → RSA 加密 → 登录 | Web 端 |
| 扫码登录 | 生成二维码 → 手机扫码 → 确认 | PC + 移动端 |
| 设备码登录 | 生成设备码 → 用户在另一设备输入 → 授权 | IoT/TV/CLI |

## iframe 快捷登录

通过 `iframe` 嵌入认证中心的极简登录页，利用 `postMessage` 跨域通信：

```html
<iframe src="http://auth.yourdomain.com/mini-login?appName=firewall"></iframe>
```

```javascript
window.addEventListener('message', (event) => {
  if (event.origin !== 'http://auth.yourdomain.com') return;
  const { type, token, user, data } = event.data;
  if (type === 'LOGIN_SUCCESS') {
    fetch('/auth/v1/bind-session', {
      method: 'POST',
      body: JSON.stringify({ session_token: data.session_token })
    });
  }
});
```

## 获取当前用户

```js
// 方式 1：从 request.state 获取
handler: async (request, reply) => {
  const user = request.state.user;
  console.log(user.uid);          // 用户 UUID
  console.log(user.userId);       // 用户内部 ID
  console.log(user.username);     // 用户名
  console.log(user.roles);        // ['admin', 'user']
  console.log(user.permissions);  // { allows: [...], denies: [...] }
}

// 方式 2：通过 StpUtil
import StpUtil from '../../auth/StpUtil.js';

StpUtil.getLoginId();              // 获取当前用户 ID
StpUtil.check();                   // 强制登录检查（未登录抛 401）
StpUtil.checkRole('admin');        // 角色校验
StpUtil.hasPermission('user:read');// 权限判断
```

## 踢用户下线

```js
import { kickUser } from '../auth/session.js';
await kickUser(redis, userId, appId);
// 删除 Redis session + DB 标记 revoked → 立即生效
```
