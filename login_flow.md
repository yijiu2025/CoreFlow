# 登录全流程追踪文档

> 前后端联合检查，记录登录全流程中每一个变量、函数调用和数据流转。

---

## 流程总览

```
用户点击头像
  → App.vue: handleAvatarClick()
  → 打开 LoginModal（iframe 嵌入 SSO 页面）
  → SSO 页面: MiniLogin.vue: executeLogin()
  → 后端: POST /oauth2.1/login (handleDirectLogin)
  → 签发 JWT access_token
  → postMessage 发送 LOGIN_SUCCESS 到父窗口
  → App.vue: handleLoginSuccess()
  → authStore.setLoggedIn()
  → authStore.checkSession()
  → 后端: GET /user/v1/userinfo (Bearer Token 认证)
  → authStore.fetchPermissions()
  → 后端: GET /user/v1/permissions
  → 登录完成
```

---

## 第一阶段：用户触发登录

### 1.1 点击头像

**文件**: `firewall/src/App.vue:77`



```html
<button @click="handleAvatarClick" class="user-avatar-btn ...">
```

**函数**: `App.vue:355`

```typescript
function handleAvatarClick(e: Event) {
  e.stopPropagation()
  if (authStore.isLoggedIn) {
    isUserProfileOpen.value = !isUserProfileOpen.value  // 已登录：切换下拉菜单
  } else {
    isLoginModalOpen.value = true  // 未登录：打开登录弹窗
  }
}
```

**变量**:
| 变量 | 类型 | 值 | 说明 |
|------|------|------|------|
| `isLoginModalOpen` | `Ref<boolean>` | `true` | 控制 LoginModal 显示 |

---

### 1.2 LoginModal 打开

**文件**: `firewall/src/components/modals/LoginModal.vue`

```html
<LoginModal
  :is-open="isLoginModalOpen"
  @close="isLoginModalOpen = false"
  @login-success="handleLoginSuccess"
/>
```

**关键变量**:

```typescript
const ssoUrl = SSO_URL  // 来自 config/services.ts，值如 'http://localhost:5174'
const loginUrl = `${ssoUrl}/mini-login?lang=zh_cn&appName=firewall&appEntrance=web&...`
```

**行为**: 打开一个 iframe，加载 SSO 登录页面 `http://localhost:5174/mini-login`

---

## 第二阶段：SSO 登录

### 2.1 SSO 页面加载

**文件**: `oauth21/src/view/web/login/MiniLogin.vue`

iframe 加载完成后发送消息：

```typescript
onMounted(() => {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_READY' }, '*')
  }
})
```

---

### 2.2 用户提交登录表单

**文件**: `MiniLogin.vue:105`

```typescript
const handleLogin = handleSubmit(async () => {
  if (loginType.value === 'pwd') {
    captchaPurpose.value = 'login'
    showCaptcha.value = true  // 密码登录需要图形验证码
  } else {
    executeLogin()  // 邮箱验证码登录直接执行
  }
})
```

**变量**:
| 变量 | 类型 | 说明 |
|------|------|------|
| `loginType` | `Ref<'email' \| 'pwd'>` | 登录方式 |
| `values.email` | `string` | 用户邮箱 |
| `values.code` | `string` | 邮箱验证码 |
| `values.username` | `string` | 用户名（密码登录） |
| `values.password` | `string` | 密码（密码登录） |
| `captchaKey` | `Ref<string>` | 图形验证码 key |

---

### 2.3 执行登录

**文件**: `MiniLogin.vue:164`

```typescript
const executeLogin = async () => {
  const loginPayload = {
    ...values,                    // { email, code } 或 { username, password }
    captchaKey: captchaKey.value, // 图形验证码 key
    client_id: route.query.client_id || route.query.appName  // 'firewall'
  }
  const res = await authStore.login(loginPayload)
  // ...
}
```

---

### 2.4 SSO authStore.login()

**文件**: `oauth21/src/stores/auth.ts:16`

```typescript
async function login(payload: any) {
  loading.value = true
  const data: any = await authApi.login(payload)  // 调用 API
  const accessToken = data.access_token || data.data?.accessToken
  if (accessToken) {
    token.value = accessToken  // 存储到 SSO 的 authStore
  }
  return data
}
```

---

### 2.5 authApi.login() — RSA 加密发送

**文件**: `oauth21/src/api/auth.ts:24`

```typescript
async login(payload: LoginPayload & { captchaKey?: string; client_id?: string }) {
  const { captchaKey, client_id, ...rest } = payload
  const payloadStr = JSON.stringify(rest)  // 序列化 { email, code } 或 { username, password }
  const encrypted = await rsaEncrypt(payloadStr)  // RSA 公钥加密

  return request.post('/oauth2.1/login', {
    encrypted,                    // RSA 加密后的登录信息
    timestamp: Date.now(),        // 时间戳（防重放）
    nonce: generateNonce(),       // 随机字符串（防重放）
    scope: 'openid profile email', // 请求的权限范围
    captchaKey,                   // 图形验证码 key
    client_id                     // 客户端标识 'firewall'
  })
}
```

**发送到后端的数据**:

```json
{
  "encrypted": "RSA加密字符串...",
  "timestamp": 1717000000000,
  "nonce": "a1b2c3d4...",
  "scope": "openid profile email",
  "captchaKey": "xxx",
  "client_id": "firewall"
}
```

---

## 第三阶段：后端处理登录

### 3.1 路由匹配

**文件**: `src/api/oauth21/v1/auth.js:654`

```javascript
registerSecureRoute(fastify, {
  name: 'login',
  alias: '标准登录',
  method: 'POST',
  url: '/login',
  handler: handleDirectLogin
});
```

最终 URL: `POST /oauth2.1/login`

---

### 3.2 handleDirectLogin 处理

**文件**: `src/api/oauth21/v1/auth.js:440-649`

#### 步骤 1：解密请求

```javascript
const { encrypted, timestamp, nonce, scope, captchaKey, client_id, type } = request.body;

// 验证时间戳（5 分钟内有效）
if (!validateTimestamp(timestamp)) {
  return reply.code(400).send({ error: 'invalid_request', error_description: '请求已过期' });
}

// 验证 nonce（防重放）
const store = ensureNonceStore(request);
if (await store.isUsed(nonce)) {
  return reply.code(400).send({ error: 'invalid_request', error_description: '重复请求' });
}
await store.markUsed(nonce);

// RSA 解密
const decrypted = decrypt(encrypted);
const { email, code, username, password } = JSON.parse(decrypted);
```

**变量**:
| 变量 | 来源 | 说明 |
|------|------|------|
| `encrypted` | `request.body.encrypted` | RSA 加密的登录信息 |
| `timestamp` | `request.body.timestamp` | 请求时间戳 |
| `nonce` | `request.body.nonce` | 防重放随机数 |
| `scope` | `request.body.scope` | `'openid profile email'` |
| `captchaKey` | `request.body.captchaKey` | 图形验证码 key |
| `client_id` | `request.body.client_id` | `'firewall'` |
| `decrypted` | RSA 解密结果 | JSON 字符串 |
| `email` | 解析后 | 用户邮箱 |
| `code` | 解析后 | 邮箱验证码 |
| `username` | 解析后 | 用户名 |
| `password` | 解析后 | 密码 |

#### 步骤 2：验证用户

**邮箱验证码登录** (`type === 'email'`):

```javascript
// 校验验证码
await emailDao.verifyCode(email, code, emailCodeStore);

// 查找用户
user = await UserDao.findByEmail(email);
```

**密码登录** (`type !== 'email'`):

```javascript
// 验证用户名密码
user = await authService.authenticateUser(username, password);
```

**变量**:
| 变量 | 类型 | 说明 |
|------|------|------|
| `user` | `object` | 数据库用户记录 |
| `user.id` | `string` | 用户 UUID |
| `user.username` | `string` | 用户名 |
| `user.email` | `string` | 邮箱 |
| `user.name` | `string` | 显示名称 |
| `user.avatar` | `string` | 头像 URL |
| `user.password_hash` | `string` | 密码哈希（不返回） |

#### 步骤 3：检查客户端与授权状态

```javascript
const finalClientId = client_id || 'first-party-app';
// client_id = 'firewall' → 不是 first-party-app → 查数据库
client = await ClientDao.findById(finalClientId);
```

检查用户是否已授权该应用：

```javascript
const approval = await ApprovalDao.getEffectiveApproval(user.id, client.client_id);
const hasConsent = approval !== null;
```

如果未授权 → 返回 `{ action: 'consent', ... }` 要求用户确认授权。
如果已授权 → 继续签发令牌。

#### 步骤 4：签发令牌

**函数**: `issueDirectTokens(user, client_id, scope, oidcNonce, request, reply)`

**文件**: `src/api/oauth21/v1/auth.js:298`

```javascript
// 1. 签发 Access Token (JWT)
const accessToken = issueAccessToken({
  sub: user.id,        // 用户 UUID
  client_id: 'firewall',
  scope: 'openid profile email'
});

// JWT payload 结构:
// {
//   iss: config.server.issuer,    // 签发者
//   sub: user.id,                 // 用户 ID
//   aud: 'firewall',              // 目标应用
//   client_id: 'firewall',
//   scope: 'openid profile email',
//   iat: 1717000000,              // 签发时间
//   exp: 1717000600,              // 过期时间（默认 600 秒 = 10 分钟）
//   jti: 'uuid-xxx',             // 唯一标识
//   token_type: 'access_token'
// }

// 2. 签发 Refresh Token
const refreshToken = generateToken(48);  // 48 字符随机字符串
await TokenDao.save(refreshToken, { sub, client_id, scope, expiresIn });

// 3. 设置 Cookie
reply.setCookie('access_token', accessToken, {
  httpOnly: true,
  maxAge: config.jwt.accessTokenTTL * 1000,
  path: '/',
  sameSite: 'lax'
});
```

#### 步骤 5：返回响应

```javascript
return {
  data: {
    accessToken: result.access_token,           // JWT 字符串
    accessTokenExpiredTime: String(600000),      // 过期时间（毫秒）
    refreshToken: result.refresh_token           // 刷新令牌
  },
  ret: ['SUCCESS::登录成功'],
  v: '1.0'
};
```

**后端返回的完整数据**:

```json
{
  "code": 200,
  "message": "SUCCESS::登录成功",
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 600,
    "refresh_token": "a1b2c3d4e5f6...",
    "scope": "openid profile email",
    "user": {
      "id": "uuid-xxx",
      "username": "alice",
      "name": "Alice",
      "email": "alice@example.com",
      "avatar": null
    }
  }
}
```

---

## 第四阶段：前端接收登录结果

### 4.1 SSO 页面接收响应

**文件**: `MiniLogin.vue:164`

```typescript
const res = await authStore.login(loginPayload)
// res = { code: 200, data: { accessToken, refreshToken, ... }, ... }

const token = res.access_token || res.data?.accessToken
// token = "eyJhbGciOiJSUzI1NiIs..."
```

### 4.2 postMessage 发送到父窗口

**文件**: `MiniLogin.vue:184-197`

```typescript
if (window.parent && window.parent !== window) {
  // 消息 1：SSO 成功
  window.parent.postMessage({
    type: 'SSO_SUCCESS',
    token: "eyJhbGciOiJSUzI1NiIs...",
    data: res
  }, '*')

  // 消息 2：登录成功（携带用户信息）
  window.parent.postMessage({
    type: 'LOGIN_SUCCESS',
    token: "eyJhbGciOiJSUzI1NiIs...",
    user: {
      id: userInfo?.sub || res.user?.id,              // "uuid-xxx"
      username: userInfo?.preferred_username || res.user?.username,  // "alice"
      name: userInfo?.name || res.user?.name,          // "Alice"
      email: userInfo?.email || res.user?.email,       // "alice@example.com"
      avatar: userInfo?.avatar || res.user?.avatar     // null
    },
    data: res
  }, '*')
}
```

**postMessage 数据结构**:

```typescript
{
  type: 'LOGIN_SUCCESS',
  token: string,      // JWT access_token
  user: {
    id: string,       // 用户 UUID
    username: string,  // 用户名
    name: string,      // 显示名称
    email: string,     // 邮箱
    avatar: string | null  // 头像
  },
  data: object        // 完整响应
}
```

---

### 4.3 LoginModal 接收消息

**文件**: `firewall/src/components/modals/LoginModal.vue:54`

```typescript
const handleMessage = (event: MessageEvent) => {
  if (event.data && event.data.type === 'LOGIN_SUCCESS') {
    emit('login-success', {
      user: event.data.user,
      token: event.data.token
    })
    close()  // 关闭弹窗
  }
}
```

**emit 数据**:

```typescript
{
  user: { id, username, name, email, avatar },
  token: "eyJhbGciOiJSUzI1NiIs..."
}
```

---

### 4.4 App.vue 接收事件

**文件**: `firewall/src/App.vue:351`

```typescript
function handleLoginSuccess(data: any) {
  authStore.setLoggedIn(true, data.user, data.token)
}
```

**调用参数**:
| 参数 | 值 |
|------|------|
| `status` | `true` |
| `userData` | `{ id: "uuid-xxx", username: "alice", name: "Alice", email: "alice@example.com", avatar: null }` |
| `tokenStr` | `"eyJhbGciOiJSUzI1NiIs..."` |

---

## 第五阶段：存储登录状态

### 5.1 authStore.setLoggedIn()

**文件**: `firewall/src/stores/auth.ts:34`

```typescript
function setLoggedIn(status: boolean, userData: any = null, tokenStr?: string) {
  isLoggedIn.value = status       // true
  user.value = userData           // { id, username, name, email, avatar }

  if (status && tokenStr) {
    token.value = tokenStr        // "eyJhbGciOiJSUzI1NiIs..."
    cache.set('token', tokenStr)  // localStorage: fw_token = "eyJ..."
    if (userData) {
      cache.set('user', userData) // localStorage: fw_user = { id, username, ... }
    }
  }
}
```

**存储到 localStorage 的数据**:

| Key | 前缀 | 值 |
|-----|------|------|
| `fw_token` | `fw_` | `"eyJhbGciOiJSUzI1NiIs..."` |
| `fw_user` | `fw_` | `{ id: "uuid-xxx", username: "alice", ... }` |

---

### 5.2 authStore.checkSession()

登录成功后，`App.vue:423` 的 `onMounted` 会调用 `checkSession()` 验证 token：

```typescript
async function checkSession() {
  if (!token.value) restore()  // 从 localStorage 恢复

  if (token.value) {
    try {
      const userInfo: any = await firewallApi.getUserInfo()
      // ↑ 调用 GET /user/v1/userinfo，带 Authorization: Bearer <token>

      if (userInfo && userInfo.sub) {
        setLoggedIn(true, { id, username, name, email, avatar })
        await fetchPermissions()  // 获取权限
        return true
      }
    } catch (err) {
      console.log('🔒 Token 已失效')
    }
  }

  setLoggedIn(false, null)  // 清除状态
  return false
}
```

---

## 第六阶段：后端验证 Token

### 6.1 请求到达

```
GET /user/v1/userinfo
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

### 6.2 Auth 中间件处理

**文件**: `src/auth/index.js:82`

```javascript
app.addHook('onRequest', async (request, reply) => {
  if (!request.state) request.state = {};

  // 1. 尝试 Bearer Token 认证
  const authHeader = request.headers.authorization;
  // authHeader = "Bearer eyJhbGciOiJSUzI1NiIs..."

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // token = "eyJhbGciOiJSUzI1NiIs..."

    const tokenUser = await getUserFromToken(token);
    if (tokenUser) {
      request.state.user = tokenUser;
      return;  // 认证成功
    }
  }

  // 2. 如果 Bearer Token 失败，尝试 Session Cookie
  // ...
});
```

### 6.3 getUserFromToken()

**文件**: `src/auth/index.js:54`

```javascript
async function getUserFromToken(token) {
  try {
    const { verify } = await import('../app/oauth21/crypto/jwt.js');
    const payload = verify(token);
    // payload = {
    //   iss: 'antigravity',
    //   sub: 'uuid-xxx',
    //   aud: 'firewall',
    //   client_id: 'firewall',
    //   scope: 'openid profile email',
    //   iat: 1717000000,
    //   exp: 1717000600,
    //   jti: 'uuid-xxx',
    //   token_type: 'access_token'
    // }

    if (!payload?.sub) return null;

    const userData = await UserDao.findById(payload.sub);
    // userData = { id, username, email, name, avatar, ... }

    if (!userData) return null;

    return {
      sub: userData.id,           // 'uuid-xxx'
      uid: userData.id,           // 'uuid-xxx'
      userId: userData.id,        // 'uuid-xxx'
      username: userData.username, // 'alice'
      email: userData.email,      // 'alice@example.com'
      avatar: userData.avatar,    // null
      status: userData.status,    // 'active'
      roles: payload.roles || [],           // JWT 中无 roles → []
      permissions: payload.permissions || {}, // JWT 中无 permissions → {}
      tokenType: 'bearer'
    };
  } catch (err) {
    return null  // JWT 验证失败（过期、签名错误等）
  }
}
```

**关键问题**: JWT payload 中不包含 `roles` 和 `permissions`！这些字段在 `issueAccessToken()` 时未写入 JWT。

### 6.4 userinfo 处理器

**文件**: `src/api/user/v1/user.js:39`

```javascript
handler: async (request, reply) => {
  const tokenUser = request.state?.user;
  // tokenUser = { sub, uid, username, email, avatar, roles: [], permissions: {} }

  if (!tokenUser?.sub) {
    return reply.code(401).send({ error: 'invalid_token' });
  }

  const userData = await UserDao.findById(tokenUser.sub);
  // userData = { id, username, email, name, avatar, ... }

  const scopes = (tokenUser.scope || '').split(' ');
  // 注意：tokenUser.scope 来自 JWT payload，但 getUserFromToken 没有设置 scope！
  // 所以 scopes = ['']

  const info = { sub: userData.id };
  // info = { sub: 'uuid-xxx' }

  if (scopes.includes('profile')) {
    // 不会执行！因为 scope 没有被传递到 request.state.user
    info.name = userData.name;
    info.preferred_username = userData.username;
    info.avatar = userData.avatar;
  }

  return reply.result.success('获取成功', info);
  // 返回: { code: 200, data: { sub: 'uuid-xxx' } }
}
```

**问题**: `getUserFromToken()` 没有把 JWT 的 `scope` 字段传递到 `request.state.user`，导致 `userinfo` 接口只返回 `sub`，不返回 `name`、`username`、`avatar`、`email`。

---

## 第七阶段：获取权限

### 7.1 authStore.fetchPermissions()

**文件**: `firewall/src/stores/auth.ts:57`

```typescript
async function fetchPermissions() {
  const res: any = await firewallApi.getPermissions()
  // ↑ 调用 GET /user/v1/permissions

  if (res) {
    roles.value = res.roles || []           // []
    permissions.value = res.permissions || { allows: [], denies: [] }
    cache.set('roles', roles.value)         // localStorage: fw_roles = []
    cache.set('permissions', permissions.value) // localStorage: fw_permissions = { allows: [], denies: [] }
  }
}
```

### 7.2 permissions 处理器

**文件**: `src/api/user/v1/user.js:92`

```javascript
handler: async (request, reply) => {
  const user = request.state?.user;
  // user = { sub, uid, username, email, roles: [], permissions: {} }

  return reply.result.success('获取成功', {
    roles: user.roles || [],                        // []
    permissions: user.permissions || { allows: [], denies: [] }  // { allows: [], denies: [] }
  });
}
```

**返回数据**:

```json
{
  "code": 200,
  "data": {
    "roles": [],
    "permissions": { "allows": [], "denies": [] }
  }
}
```

---

## 第八阶段：登录完成状态

### 最终 localStorage 内容

| Key | 值 |
|-----|------|
| `fw_token` | `"eyJhbGciOiJSUzI1NiIs..."` |
| `fw_user` | `{ id: "uuid-xxx", username: "alice", name: "Alice", email: "alice@example.com", avatar: null }` |
| `fw_roles` | `[]` |
| `fw_permissions` | `{ allows: [], denies: [] }` |

### 最终 authStore 状态

```typescript
{
  isLoggedIn: true,
  user: { id: "uuid-xxx", username: "alice", name: "Alice", email: "alice@example.com", avatar: null },
  token: "eyJhbGciOiJSUzI1NiIs...",
  roles: [],
  permissions: { allows: [], denies: [] },
  isAdmin: false  // computed: roles.includes('admin') → false
}
```

---

## 已知问题

### 问题 1：getUserFromToken 缺少 scope 传递

**文件**: `src/auth/index.js:65`

```javascript
return {
  sub: userData.id,
  // ...
  roles: payload.roles || [],
  permissions: payload.permissions || {},
  // ❌ 缺少: scope: payload.scope
};
```

**影响**: `userinfo` 接口的 scope 判断逻辑失效，只返回 `sub` 字段。

**修复**: 在 `getUserFromToken` 返回值中添加 `scope: payload.scope`。

### 问题 2：JWT 不包含 roles 和 permissions

**文件**: `src/app/oauth21/crypto/jwt.js:28`

```javascript
export function issueAccessToken({ sub, client_id, scope, aud }) {
  return sign({
    iss, sub, aud, client_id, scope, iat, exp, jti, token_type
    // ❌ 没有 roles 和 permissions
  });
}
```

**影响**: `getUserFromToken` 返回的 `roles` 和 `permissions` 始终为空。

**修复**: 在签发 JWT 时加入用户的 roles 和 permissions，或在 `getUserFromToken` 中从数据库/权限加载器查询。

### 问题 3：401 无限循环（已修复）

**原因**: `checkSession()` → `getUserInfo()` 401 → `handle401` → `refreshAccessToken()` → `getUserInfo()` 401 → 循环

**修复**: `handle401` 检测到请求路径是 `/user/v1/userinfo` 时直接 reject，不触发刷新。

---

## 完整调用链路图

```
[前端] firewall/src/App.vue
  ├── handleAvatarClick()           → 设置 isLoginModalOpen = true
  ├── <LoginModal>                  → iframe 加载 SSO 页面
  │
  [SSO] oauth21/src/view/web/login/MiniLogin.vue
  │   ├── executeLogin()
  │   │   ├── authStore.login()     → oauth21/src/stores/auth.ts
  │   │   │   └── authApi.login()   → oauth21/src/api/auth.ts
  │   │   │       ├── rsaEncrypt()  → 加密登录信息
  │   │   │       └── POST /oauth2.1/login
  │   │   │
  │   │   [后端] src/api/oauth21/v1/auth.js
  │   │   │   └── handleDirectLogin()
  │   │   │       ├── decrypt()           → RSA 解密
  │   │   │       ├── validateTimestamp() → 验证时间戳
  │   │   │       ├── nonceStore.isUsed() → 防重放
  │   │   │       ├── emailDao.verifyCode() 或 authService.authenticateUser()
  │   │   │       ├── UserDao.findByEmail()
  │   │   │       ├── ClientDao.findById()
  │   │   │       ├── ApprovalDao.getEffectiveApproval()
  │   │   │       └── issueDirectTokens()
  │   │   │           ├── issueAccessToken()  → 签发 JWT
  │   │   │           ├── generateToken()     → 签发 Refresh Token
  │   │   │           ├── TokenDao.save()
  │   │   │           └── reply.setCookie()
  │   │   │
  │   │   └── postMessage({ type: 'LOGIN_SUCCESS', token, user })
  │   │
  [前端] firewall/src/components/modals/LoginModal.vue
  │   └── handleMessage()
  │       └── emit('login-success', { user, token })
  │
  [前端] firewall/src/App.vue
  │   └── handleLoginSuccess(data)
  │       └── authStore.setLoggedIn(true, data.user, data.token)
  │           ├── token.value = token
  │           ├── cache.set('token', token)      → localStorage: fw_token
  │           └── cache.set('user', userData)    → localStorage: fw_user
  │
  [前端] firewall/src/stores/auth.ts
  │   └── checkSession()
  │       ├── firewallApi.getUserInfo()          → GET /user/v1/userinfo
  │       │   [后端] src/auth/index.js
  │       │   │   └── getUserFromToken(token)
  │       │   │       ├── jwt.verify(token)      → 解析 JWT
  │       │   │       └── UserDao.findById(sub)  → 查询用户
  │       │   │
  │       │   [后端] src/api/user/v1/user.js
  │       │   │   └── userinfo handler
  │       │   │       └── reply.result.success({ sub, name, username, avatar, email })
  │       │
  │       └── firewallApi.getPermissions()       → GET /user/v1/permissions
  │           [后端] src/api/user/v1/user.js
  │           │   └── permissions handler
  │           │       └── reply.result.success({ roles, permissions })
  │           │
  │           └── cache.set('roles', [])         → localStorage: fw_roles
  │               cache.set('permissions', {})   → localStorage: fw_permissions
  │
  └── 登录完成 ✅
```
