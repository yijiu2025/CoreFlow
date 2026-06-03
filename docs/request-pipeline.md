# 请求处理流水线

一个 HTTP 请求从接收到响应的完整路径。

## 总览

```
客户端请求
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fastify 核心层                                                  │
│  ├─ TLS 终止                                                    │
│  ├─ HTTP 解析                                                    │
│  ├─ genReqId: req.headers['x-request-id'] || crypto.randomUUID()│
│  └─ bodyLimit: 1MB (JSON) / 200MB (multipart)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  插件层（Fastify 内置 + 注册的插件）                               │
│  ├─ helmet         → 设置安全响应头 (CSP, X-Frame-Options)       │
│  ├─ cors           → 跨域检查 (origin → allowedHeaders)          │
│  ├─ cookie         → 解析 Cookie 头 → request.cookies            │
│  └─ rateLimit      → 全局限流 (Redis/内存 存储)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  onRequest 钩子链                                                │
│  [0] @fastify/cookie     → 解析 cookies                         │
│  [1] auth/index.js       → Session 验证 + ALS 初始化             │
│  [2] 01-monitor.js       → 记录 request.startTime               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  onRequest 钩子链（续）                                          │
│  [3] firewall/index.js   → 五层安全管道                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  preHandler 钩子链                                               │
│  [0] guard.js            → 三级权限守卫                          │
│  [1] signature.js        → H5 签名验证（仅 OAuth21 路由）         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  handler → 业务路由                                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  onSend 钩子                                                     │
│  ├─ 记录响应日志                                                 │
│  └─ 释放连接计数                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  onResponse 钩子                                                 │
│  ├─ 慢请求告警 (>2000ms)                                        │
│  └─ 扫描陷阱 (404/403 检测)                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
客户端收到响应
```

## 详细流程：以 `POST /user/v1/open/register` 为例

### 阶段 1：请求到达

```
POST /user/v1/open/register
Headers: { Cookie: "sid=abc123.def456.ghi789", Content-Type: "application/json" }
Body: { email: "alice@example.com", code: "123456", username: "alice", password: "***" }
```

### 阶段 2：Fastify 核心

```
request.id = "550e8400-e29b-41d4-a716-446655440000"   ← genReqId 生成
request.ip = "192.168.1.100"                            ← trustProxy 读取
request.body = { email, code, username, password }      ← bodyLimit 校验 (1MB)
```

### 阶段 3：插件处理

```
helmet  → reply.headers({ 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': '...' })
cors    → origin 校验 → allowedHeaders 包含 Cookie → 放行
cookie  → request.cookies = { sid: "abc123.def456.ghi789" }
```

### 阶段 4：onRequest[0] — Cookie 解析（@fastify/cookie）

```
request.cookies = {
  sid: "abc123.def456.ghi789",
  sid_r: "xyz789.0.mno456"  // 长期登录时存在
}
```

### 阶段 5：onRequest[1] — Session 验证 (auth/index.js)

```
输入: request.cookies.sid = "abc123.def456.ghi789"
      request.cookies.sid_r = "xyz789.0.mno456"

步骤 1: verifyCookie("abc123.def456.ghi789")
  ├─ 分割: payload="abc123.def456", signature="ghi789"
  ├─ 解码: Buffer.from(payload, 'base64url') → "sessionId123:5"
  ├─ 验证: HMAC-SHA256(payload, SESSION_SECRET) === signature ?
  └─ 返回: { sessionId: "sessionId123", accessCount: 5 }

步骤 2: 递增访问次数
  ├─ signCookie("sessionId123", 6) → 新 cookie 值
  └─ reply.setCookie('sid', 新值, { maxAge: 7200 })

步骤 3: Redis 查询
  ├─ redis.get("session:sessionId123")
  │   ├─ 命中 → 解析 JSON → request.state.user = { ... }
  │   │         redis.expire("session:sessionId123", 7200)  ← 续期
  │   └─ 未命中 → 降级查 DB
  │       ├─ DB: SessionToken.findOne({ token: sha256("sessionId123") })
  │       │   ├─ 找到 → loadUserPermissions(userId, appId) → 重建 Redis
  │       │   └─ 未找到 → 尝试 refreshSession()
  │       └─ refreshSession():
  │           ├─ verifyCookie(sid_r) → refreshToken
  │           ├─ Redis: get("refresh:refreshToken") → oldSessionId
  │           ├─ DB: SessionToken.findOne({ token: sha256(oldSessionId) })
  │           ├─ 生成新 sessionId → Redis 写入 → DB 更新 → 日志记录
  │           └─ reply.setCookie('sid', 新cookie)
  └─ 最终: request.state.user = {
        sub: "uuid-xxx",
        uid: "uuid-xxx",
        userId: 123,
        username: "alice",
        email: "alice@example.com",
        appId: "user",
        roles: ["user_normal"],
        permissions: { allows: ["user:base:read", "user:base:write"], denies: [] },
        sessionId: "sessionId123"
      }
```

### 阶段 6：onRequest[2] — 请求监控 (01-monitor.js)

```
request.startTime = performance.now()   ← 高精度计时器
```

### 阶段 7：onRequest[3] — 防火墙管道 (firewall/index.js)

```
步骤 1: buildRequestContext(request)
  ├─ ip = "192.168.1.100"
  ├─ ua = "Mozilla/5.0 ..."
  ├─ fingerprint = SHA256(ip + ua + lang + encoding)
  └─ request._firewallLog = { time, ip, fingerprint, method, url, ... }

步骤 2: checkGlobalBlockPhase(redis, ip, fingerprint, log, reply)
  ├─ trackConnection(ip, +1)
  ├─ checkGlobalBlock(redis, ip, fingerprint)
  │   ├─ redis.hget("fw:blocked:ips", ip) → null (未封禁)
  │   └─ redis.hget("fw:blocked:fps", fingerprint) → null
  └─ return false (放行)

步骤 3: shouldSkipDeepCheck("/user/v1/open/register") → false

步骤 4: checkChallengeCookie(redis, request, ip, fingerprint)
  ├─ 检查 challenge cookie → 不存在
  └─ return false (需要进一步检测)

步骤 5: runDetectionPipeline(redis, ip, ua, url, log, fingerprint, reply)
  ├─ checkBotChallenge(ua)
  │   └─ ua 包含 "Mozilla" → 不是 bot → 放行
  ├─ checkGeoReputation(ip, url)
  │   └─ resolveGeoInfo(ip) → { country: "CN", city: "北京" }
  │   └─ 不在黑名单 → 放行
  ├─ trackRequestCount(ip, url) → 计数 +1
  └─ checkRateLimit(redis, ip, url)
      ├─ Redis: incr("rate:ip:192.168.1.100")
      ├─ 当前计数: 15 (阈值: 100/min)
      └─ 未超限 → 放行

最终: intercepted = false → 放行到 preHandler
```

### 阶段 8：preHandler[0] — 三级权限守卫 (guard.js)

```
输入: request.state.user = { roles: ["user_normal"], ... }

System 级 (system.json):
  ├─ enabled: true → 通过
  ├─ requireLogin: false → 跳过登录检查
  └─ allowIps: [] → 跳过 IP 检查

Group 级 (registerGroupMetadata):
  ├─ enabled: true → 通过
  └─ requireLogin: false → 跳过

API 级 (registerSecureRoute):
  ├─ enabled: true → 通过
  ├─ requireLogin: false → 跳过
  └─ allowRoles: [] → 跳过

最终: 全部通过 → 放行到 handler
耗时: 0.05ms (记录到日志)
```

### 阶段 9：handler — 业务路由

```js
// src/api/user/v1/open.js
handler: async (request, reply) => {
  const { email, code, username, password } = request.body;

  // 1. 验证邮箱验证码
  await emailDao.verifyCode(email, code, emailCodeStore);
  //   → emailCodeStore.get(email) → { code: "123456", sentAt: 1717000000 }
  //   → 比对: info.code === code → 通过
  //   → emailCodeStore.delete(email) → 一次性消费

  // 2. 检查邮箱是否已注册
  const existing = await User.findOne({ where: { email } });
  //   → existing = null → 可以注册

  // 3. 创建用户
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({
    uid: crypto.randomUUID(),
    username,
    email,
    status: 1,
    delete_version: 0
  });
  //   → INSERT INTO user_user (...) VALUES (...)

  // 4. 创建身份凭证
  await UserIdentity.create({
    user_id: user.id,
    identity_type: 'password',
    identifier: email,
    credential: hashedPassword
  });
  //   → INSERT INTO user_identity (...) VALUES (...)

  // 5. 返回响应
  return reply.result.success('注册成功', { uid: user.uid, username, email });
  //   → { code: 200, message: "注册成功", data: { uid, username, email }, timestamp, requestId }
}
```

### 阶段 10：onSend — 日志记录

```
request._firewallLog.blocked = false
recordLog(request._firewallLog, 200, false)
trackConnection(request.ip, -1)
```

### 阶段 11：onResponse — 后处理

```
// 01-monitor.js
ms = performance.now() - request.startTime → 45ms
reply.header('X-Response-Time', '45ms')   // 注入响应头
ms > 2000? → 否 → 不告警

// firewall/index.js
reply.statusCode === 200 → 不是 404/403 → 跳过扫描陷阱
```

### 阶段 12：响应返回

```
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
X-Response-Time: 45ms
Set-Cookie: sid=新cookie值; Path=/; HttpOnly; SameSite=Lax
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: ...

{
  "code": 200,
  "message": "注册成功",
  "data": {
    "uid": "550e8400-e29b-41d4-a716-446655440001",
    "username": "alice",
    "email": "alice@example.com"
  },
  "timestamp": 1717000000000,
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 变量预估值

| 变量 | 典型值 | 说明 |
|------|--------|------|
| `request.id` | `"550e8400-..."` | UUID v4 |
| `request.ip` | `"192.168.1.100"` | 客户端 IP |
| `request.cookies.sid` | `"a1b2c3.d4e5f6.g7h8i9"` | 三段式 cookie |
| `sessionData.roles` | `["user_normal"]` | 角色数组 |
| `sessionData.permissions` | `{ allows: [...], denies: [...] }` | PBAC 权限 |
| `fingerprint` | `"sha256:a1b2c3d4..."` | 设备指纹哈希 |
| `request.startTime` | `1234567890.123` | performance.now() |
| `reply.statusCode` | `200 / 400 / 401 / 403 / 500` | HTTP 状态码 |
| `X-Response-Time` | `"45ms"` | 请求耗时 |

## 异常路径

### 未登录访问受保护接口

```
onRequest[1] → auth → request.state.user = null
preHandler[0] → guard → requireLogin: true → reply.result.unauth()
→ { code: 401, message: "身份验证失败" }
```

### Session 过期自动刷新

```
onRequest[1] → auth
  → sid 解析成功但 Redis 未命中
  → DB 查询 → token revoked
  → 尝试 sid_r
  → refreshToken 有效 → 生成新 sessionId → 写入 Redis → 下发新 cookie
  → request.state.user = { ... } (用户无感知)
```

### 被防火墙拦截

```
onRequest[3] → firewall
  → checkGlobalBlock → redis.hget("fw:blocked:ips", ip) → 命中
  → reply.code(403).send({ blocked: true })
  → onSend → 记录 blocked=true
  → onResponse → 扫描陷阱记录
```

### 角色权限不足

```
preHandler[0] → guard
  → requireLogin: true → request.state.user 存在 → 通过
  → allowRoles: ["admin"] → user.roles = ["user_normal"] → 不匹配
  → reply.result.forbidden("权限不足: 需要 [admin] 角色")
```

### 慢请求告警

```
onResponse → 01-monitor.js
  → ms = 3500ms > 2000ms 阈值
  → request.log.warn({ duration: "3500ms", method: "POST", url: "/api/...", statusCode: 200 })
```
