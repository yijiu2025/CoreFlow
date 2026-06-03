# 登录流程审查报告

> 对当前登录全流程进行评分、问题诊断和优化建议。

---

## 一、流程评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **登录体验** | 8/10 | iframe 嵌入 SSO，用户无感知切换，体验流畅 |
| **安全性** | 7/10 | RSA 加密传输 + nonce 防重放 + 图形验证码，但 Token 生命周期管理薄弱 |
| **状态持久化** | 4/10 | Token 存 localStorage 但无刷新机制，10 分钟后必掉线 |
| **错误处理** | 5/10 | 401 死循环已修复，但刷新后 checkSession 覆盖不完整数据 |
| **权限系统** | 3/10 | 后端签发 JWT 不含 roles/permissions，getUserFromToken 不加载权限 |
| **代码质量** | 7/10 | 模块化清晰，但关键路径存在数据断裂 |
| **综合评分** | **5.5/10** | 基本能登录，但刷新必掉线是致命问题 |

---

## 二、刷新后登录状态丢失的根因链

```
页面刷新
  → restore() 从 localStorage 恢复 token ✅
  → checkSession() 调用 getUserInfo() 带 Bearer Token
  → 后端 getUserFromToken(token)
  → jwt.verify(token)
  → JWT 已过期（exp = iat + 600 秒 = 10 分钟）
  → verify() 抛出异常 → getUserFromToken 返回 null
  → request.state.user 未设置
  → userinfo 处理器检查 tokenUser.sub → undefined
  → 返回 401
  → 前端 catch → setLoggedIn(false, null)
  → 清除所有缓存 → 登录状态丢失
```

**核心原因**: JWT access_token 有效期只有 10 分钟，且没有实现 refresh_token 无感刷新。

---

## 三、逐环节问题诊断

### 问题 1：JWT 不包含 roles 和 permissions ⚠️ 严重

**位置**: `src/app/oauth21/crypto/jwt.js:28`

```javascript
export function issueAccessToken({ sub, client_id, scope, aud }) {
  return sign({
    iss, sub, aud, client_id, scope, iat, exp, jti, token_type
    // ❌ 没有 roles、permissions
  });
}
```

**影响**:
- `getUserFromToken` 返回的 `roles: []`, `permissions: {}`
- `/user/v1/permissions` 返回空权限
- `v-auth`、`v-role` 指令全部失效
- `isAdmin` 始终为 false

---

### 问题 2：getUserFromToken 缺少 scope 传递 ⚠️ 严重

**位置**: `src/auth/index.js:65`

```javascript
return {
  sub: userData.id,
  username: userData.username,
  email: userData.email,
  avatar: userData.avatar,
  // ❌ 缺少 scope: payload.scope
};
```

**影响**: `userinfo` 处理器中 `(tokenUser.scope || '').split(' ')` 得到 `['']`，`scopes.includes('profile')` 为 false，只返回 `{ sub }`，不返回 name、username、avatar、email。

---

### 问题 3：getUserFromToken 不从数据库加载权限 ⚠️ 严重

**位置**: `src/auth/index.js:54`

```javascript
async function getUserFromToken(token) {
  const payload = verify(token);
  const userData = await UserDao.findById(payload.sub);
  return {
    // ...
    roles: payload.roles || [],           // JWT 中没有 → []
    permissions: payload.permissions || {} // JWT 中没有 → {}
    // ❌ 没有调用 loadUserPermissions(userId, appId)
  };
}
```

**影响**: 即使用户在数据库中有 admin 角色，Bearer Token 认证路径也无法获取。

---

### 问题 4：refresh_token 未被前端使用 ⚠️ 严重

**后端已签发 refresh_token**:

```javascript
// src/api/oauth21/v1/auth.js:333
const refreshToken = generateToken(48);
await TokenDao.save(refreshToken, { sub, client_id, scope, expiresIn });
```

**前端未存储**:

```typescript
// firewall/src/App.vue:351
function handleLoginSuccess(data: any) {
  authStore.setLoggedIn(true, data.user, data.token)
  // ❌ 没有存储 data.data?.refreshToken
}
```

**前端未使用**:

```typescript
// firewall/src/stores/auth.ts:103
async function refreshAccessToken(): Promise<string> {
  throw new Error('Token 已过期，请重新登录') // ❌ 直接抛出，没有调用 refresh API
}
```

---

### 问题 5：checkSession 覆盖不完整数据 ⚠️ 中等

**位置**: `firewall/src/stores/auth.ts:78`

```typescript
const userInfo: any = await firewallApi.getUserInfo()
// 由于问题 2，userInfo 只有 { sub: "uuid-xxx" }

setLoggedIn(true, {
  id: userInfo.sub,
  username: userInfo.preferred_username || userInfo.name, // undefined
  name: userInfo.name,    // undefined
  email: userInfo.email,  // undefined
  avatar: userInfo.avatar // undefined
})
```

**影响**: 刷新后 `user` 对象中 `username`、`name`、`email`、`avatar` 全部变成 undefined，UI 显示异常（头像区域崩溃、用户名消失）。

---

### 问题 6：checkSession 调用过早 ⚠️ 低

**位置**: `firewall/src/App.vue:422`

```typescript
onMounted(() => {
  authStore.checkSession()  // 异步但未 await
  fetchData()               // 与 checkSession 并行执行
  dashboardStore.connectWS()
})
```

`checkSession` 是异步的但没有 await，`fetchData` 和 `connectWS` 可能在认证完成前就开始执行，导致未认证状态下的请求。

---

## 四、优化方案

### 方案 A：实现 refresh_token 无感刷新（推荐）

**改动范围**: 前端 auth store + 后端 token 端点

**流程**:

```
access_token 过期（10 分钟）
  → API 请求返回 401
  → handle401 检测到非 userinfo 请求
  → 调用 refreshAccessToken()
  → POST /oauth2.1/token (grant_type=refresh_token)
  → 后端验证 refresh_token，签发新 access_token
  → 前端更新 localStorage 中的 token
  → 重放所有排队请求
  → 用户无感知
```

**优点**: 用户体验最佳，完全无感刷新
**缺点**: 需要前后端联调

---

### 方案 B：延长 JWT 有效期（快速修复）

**改动范围**: 仅后端环境变量

```bash
# .env
ACCESS_TOKEN_TTL=86400  # 从 600 秒改为 86400 秒（24 小时）
```

**优点**: 一行改动，立即生效
**缺点**: 安全性降低，token 泄露风险窗口变大

---

### 方案 C：getUserFromToken 修复 + 权限加载（必须做）

**改动范围**: 后端 `src/auth/index.js`

```javascript
async function getUserFromToken(token) {
  const { verify } = await import('../app/oauth21/crypto/jwt.js');
  const payload = verify(token);
  if (!payload?.sub) return null;

  const { default: UserDao } = await import('../app/oauth21/dao/user.dao.js');
  const userData = await UserDao.findById(payload.sub);
  if (!userData) return null;

  // ✅ 加载权限（与 Session 路径一致）
  const { loadUserPermissions } = await import('./permission-loader.js');
  const { roles, permissions } = await loadUserPermissions(
    userData.id,
    payload.client_id || 'GLOBAL'
  );

  return {
    sub: userData.id,
    uid: userData.id,
    userId: userData.id,
    username: userData.username,
    email: userData.email,
    avatar: userData.avatar,
    status: userData.status,
    scope: payload.scope,  // ✅ 传递 scope
    roles,                  // ✅ 从数据库加载
    permissions,            // ✅ 从数据库加载
    tokenType: 'bearer'
  };
}
```

---

### 方案 D：checkSession 增量更新（避免覆盖）

**改动范围**: 前端 `firewall/src/stores/auth.ts`

```typescript
async function checkSession() {
  if (!token.value) restore()

  if (token.value) {
    try {
      const userInfo: any = await firewallApi.getUserInfo()
      if (userInfo && userInfo.sub) {
        // ✅ 增量合并，不覆盖已有数据
        user.value = {
          ...user.value,               // 保留缓存的完整数据
          id: userInfo.sub || user.value?.id,
          username: userInfo.preferred_username || userInfo.name || user.value?.username,
          name: userInfo.name || user.value?.name,
          email: userInfo.email || user.value?.email,
          avatar: userInfo.avatar || user.value?.avatar
        }
        isLoggedIn.value = true
        cache.set('user', user.value)
        await fetchPermissions()
        return true
      }
    } catch (err) {
      console.log('🔒 Token 已失效')
    }
  }

  setLoggedIn(false, null)
  return false
}
```

---

### 方案 E：SSO 登录存储 refresh_token

**改动范围**: 前端 LoginModal + auth store

```typescript
// App.vue: handleLoginSuccess
function handleLoginSuccess(data: any) {
  authStore.setLoggedIn(true, data.user, data.token)
  // ✅ 存储 refresh_token
  if (data.data?.refreshToken) {
    cache.set('refresh_token', data.data.refreshToken, { exp: 86400 })
  }
}

// auth.ts: refreshAccessToken
async function refreshAccessToken(): Promise<string> {
  const refreshToken = cache.get<string>('refresh_token')
  if (!refreshToken) throw new Error('无 Refresh Token')

  const res: any = await apiClient.post('/oauth2.1/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })

  const newToken = res.access_token
  token.value = newToken
  cache.set('token', newToken)

  if (res.refresh_token) {
    cache.set('refresh_token', res.refresh_token, { exp: 86400 })
  }

  return newToken
}
```

---

## 五、优化优先级

| 优先级 | 方案 | 改动量 | 效果 |
|--------|------|--------|------|
| P0 立即 | B: 延长 JWT 有效期 | 1 行 | 刷新不再掉线（临时方案） |
| P0 立即 | C: getUserFromToken 修复 | ~20 行 | 权限系统生效 + userinfo 返回完整数据 |
| P0 立即 | D: checkSession 增量更新 | ~15 行 | 刷新后 UI 不崩溃 |
| P1 尽快 | E: 存储 refresh_token | ~30 行 | 为无感刷新做准备 |
| P1 尽快 | A: 实现无感刷新 | ~80 行 | 完整的 Token 生命周期管理 |

---

## 六、修复后的预期评分

| 维度 | 当前 | 修复后 |
|------|------|--------|
| 登录体验 | 8/10 | 9/10 |
| 安全性 | 7/10 | 8/10 |
| 状态持久化 | 4/10 | 9/10 |
| 错误处理 | 5/10 | 8/10 |
| 权限系统 | 3/10 | 9/10 |
| 代码质量 | 7/10 | 9/10 |
| **综合** | **5.5/10** | **8.7/10** |
