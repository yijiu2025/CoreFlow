# 认证系统 {#auth}

## 认证模式

| 模式            | 启用方式            | Token 存储                                              | 验证方式        |
| --------------- | ------------------- | ------------------------------------------------------- | --------------- |
| Session（默认） | `JWT_ENABLED=false` | Redis (sid/sid_r Cookie，HttpOnly)                      | Cookie 自动携带 |
| JWT             | `JWT_ENABLED=true`  | **HttpOnly Cookie 优先**；跨域/CLI 才用 Bearer（内存态） | JWT 签名验证    |

> 🔴 **不要把长期 token 放 `localStorage`**：同源任何 XSS 都能读走并长期重放。
> 浏览器端优先 `HttpOnly` Cookie（`oauth21` 已按此实现）；确实需要 Bearer 的场景（跨域 API、
> 命令行）把 access_token 只放**内存**，refresh_token 放 HttpOnly Cookie，页面刷新时静默续期。

## 密码存储

密码用 Node 内置 `crypto.scrypt`（`src/framework/auth/password-hash.js`，异步、跑在 libuv 线程池），
并对历史 bcrypt 哈希（`$2a$` / `$2b$` / `$2y$`）保留**只校验**能力，登录成功后按需重写为 scrypt。
**新代码不得再引入 `bcrypt` / `bcryptjs`**：同步版本会冻结事件循环，异步版本同样是纯 JS 计算，
实测 10 次 `bcrypt.hash` 会让事件循环最长冻结 649ms，而 scrypt 为 22ms。
scrypt 并发有全局上限（`SCRYPT_MAX_CONCURRENCY`，默认 16），超限排队而不是堆满线程池；
历史 bcrypt 校验单独限流（`BCRYPT_MAX_CONCURRENCY`，默认 4），因为它每次会阻塞主线程约 68ms。

## Session 双令牌机制

### 短期登录（不勾选"记住我"）

- `sid` cookie: HMAC 签名的 sessionId，HttpOnly，Max-Age=**30 分钟**（`SHORT_SESSION_TTL = 1800`）
- Redis: `session:<sessionId>` = JSON（用户信息+角色+权限），TTL 同 `sid`

### 长期登录（勾选"记住我"）

- `sid` cookie: Max-Age=**30 天**（`LONG_SESSION_TTL = 2592000`）
- `sid_r` cookie: refreshToken，Max-Age=**30 天**（`REFRESH_TOKEN_TTL`）
- Redis 里 `sid_r` → sessionId 的映射 TTL 为 **180 天**（`USER_COOKIE_TTL`，随每次活跃续期）
- sid 过期时自动用 sid_r 刷新，用户无感知；刷新是**原子领取**，同一 refreshToken 只成功一次

> 以上四个常量都在 `src/framework/auth/cookie.js`。会话在 Redis 被驱逐后，DB 里
> `session_tokens` 仍留有 `last_active`：短期 TTL 内重建缓存，超过长期 TTL 直接吊销。

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
  "avatar": "https://...",
  "status": 1,
  "appId": "firewall",
  "roles": ["admin", "operator"],
  "permissions": { "allows": ["user:read", "config:*"], "denies": ["user:delete"] },
  "permFingerprint": "sha256-前16位",
  "ip": "192.168.1.1",
  "deviceId": "WEB-DaBOSbNdSuc-8s4T",
  "deviceFingerprint": "sha256(device_id|uid|UA) 前32位",
  "deviceType": "browser",
  "userAgent": "Mozilla/5.0 ...",
  "familyId": "hex-16字节",
  "loginAt": 1717000000,
  "lastActiveAt": 1717000000,
  "rememberMe": false
}
```

- `permFingerprint`：会话恢复（Redis 驱逐重建 / sid_r 刷新）时比对，未变就沿用会话里的
  权限，变了回源查三张权限表 —— 避免"权限改了但长 TTL 会话还在用旧权限"。
- `familyId`：同一登录链的标识。sid_r 轮转时若检测到旧 token 被重放，只吊销同 family，
  不影响该用户其他设备。
- `loginAt` / `lastActiveAt` 是**秒**级时间戳。

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

| 方式       | 流程                                      | 适用场景    |
| ---------- | ----------------------------------------- | ----------- |
| 邮箱验证码 | 输入邮箱 → 图形验证码 → 邮箱验证码 → 登录 | Web 端      |
| 密码登录   | 输入账号密码 → RSA 加密 → 登录            | Web 端      |
| 扫码登录   | 生成二维码 → 手机扫码 → 确认              | PC + 移动端 |
| 设备码登录 | 生成设备码 → 用户在另一设备输入 → 授权    | IoT/TV/CLI  |

## iframe 快捷登录

通过 `iframe` 嵌入认证中心的极简登录页，利用 `postMessage` 跨域通信：

```html
<iframe id="sso" src="http://auth.yourdomain.com/mini-login?appName=firewall"></iframe>
```

🔴 **必须做 `origin` + `source` 双校验**。只比 `event.origin` 不够：同源页面里的任意
iframe（广告位、第三方预览、用户上传的 HTML）都能给父窗口发消息，配上正确的 `type`
就能把攻击者的 `session_token` 塞进来，形成**登录劫持**（受害者被登进攻击者账号）。

```javascript
const AUTH_ORIGIN = 'http://auth.yourdomain.com';
const frame = document.getElementById('sso');

window.addEventListener('message', event => {
  // ① 来源必须是认证中心（精确比较，禁用 startsWith / includes）
  if (event.origin !== AUTH_ORIGIN) return;
  // ② 发送者必须是我们自己嵌进去的那个窗口
  if (event.source !== frame.contentWindow) return;

  const { type, data } = event.data || {};
  if (type === 'LOGIN_SUCCESS') {
    // ③ bind-session 失败要中断流程，不能当成功继续
    fetch('/auth/v1/bind-session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_token: data.session_token })
    }).then(r => {
      if (!r.ok) throw new Error('bind-session failed');
      location.assign('/');
    });
  }
});
```

完整的 iframe 握手（父窗口 ↔ 登录页的消息往来、兜底超时）见
[docs/standards/auth-integration.md](../standards/auth-integration.md)。

## 获取当前用户

```js
// 方式 1：从 request.state 获取
handler: async (request, reply) => {
  const user = request.state.user;
  console.log(user.uid); // 用户 UUID
  console.log(user.userId); // 用户内部 ID
  console.log(user.username); // 用户名
  console.log(user.roles); // ['admin', 'user']
  console.log(user.permissions); // { allows: [...], denies: [...] }
};

// 方式 2：通过 StpUtil（权限判断的推荐入口）
import StpUtil from '../../framework/auth/stp-util.js';

StpUtil.getLoginId(); // 获取当前用户 ID
StpUtil.check(); // 强制登录检查（未登录抛 401）
StpUtil.checkRole('admin'); // 角色校验
StpUtil.hasPermission('user:read'); // 权限判断（fail-closed：权限缺失即 false）
```

## 踢用户下线

```js
import { kickUser } from '../framework/auth/session-kick.js';
await kickUser(userId, appId); // appId 传 null = 踢掉该用户全部应用
// 删 Redis session（整个 family）+ DB 标记 revoked → 下一请求立即失效
```
