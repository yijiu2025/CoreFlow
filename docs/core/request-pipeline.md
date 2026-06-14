# 请求处理流水线 {#request-pipeline}

一个 HTTP 请求从接收到响应的完整路径。

## 总览

```
客户端请求
  │
  ▼
Fastify 核心层 ── TLS 终止 / HTTP 解析 / genReqId / bodyLimit
  │
  ▼
插件层 ── helmet / cors / cookie / rateLimit
  │
  ▼
onRequest[0] ── @fastify/cookie → 解析 cookies
onRequest[1] ── auth/index.js   → Session 验证 + ALS 初始化
onRequest[2] ── 01-monitor.js   → 记录 request.startTime
onRequest[3] ── firewall        → 五层安全管道
  │
  ▼
preHandler[0] ── guard.js       → 三级权限守卫
preHandler[1] ── signature.js   → H5 签名验证（仅 OAuth21 路由）
  │
  ▼
handler ── 业务路由
  │
  ▼
onSend ── 日志 + 连接释放
onResponse ── 慢请求告警 + 扫描陷阱
  │
  ▼
客户端收到响应
```

## 详细流程

### 阶段 1：Fastify 核心

```js
request.id = crypto.randomUUID()    // genReqId 生成
request.ip = "192.168.1.100"        // trustProxy 读取
request.body = { ... }              // bodyLimit 校验 (1MB JSON)
```

### 阶段 2：插件处理

- **helmet** → 设置安全响应头 (CSP, X-Frame-Options)
- **cors** → 跨域检查
- **cookie** → 解析 Cookie 头 → `request.cookies`
- **rateLimit** → 全局限流

### 阶段 3：Session 验证 (auth)

```
sid Cookie → HMAC 验证 → Redis 查 session → request.state.user
  ├─ 命中 → 返回用户数据，续期
  └─ 未命中 → 降级查 DB → 尝试 sid_r 刷新
```

### 阶段 4：防火墙管道

```
buildRequestContext(request)
  → checkGlobalBlock (IP/指纹封禁)
  → checkChallengeCookie (人机验证)
  → runDetectionPipeline
      ├─ checkBotChallenge (UA 检测)
      ├─ checkGeoReputation (地理围栏)
      └─ checkRateLimit (端点限频)
```

### 阶段 5：三级守卫

```
System 级 (system.json) → Group 级 (registerGroupMetadata) → API 级 (registerSecureRoute)
  ├─ enabled 检查
  ├─ IP 白名单
  ├─ 登录检查
  ├─ 角色检查
  └─ 权限检查
```

### 阶段 6：业务路由

```js
handler: async (request, reply) => {
  const user = request.state.user;  // 已验证的用户信息
  // 业务逻辑...
  return reply.result.success('操作成功', data);
}
```

## 变量预估值

| 变量 | 典型值 | 说明 |
|------|--------|------|
| `request.id` | UUID v4 | 请求唯一标识 |
| `request.ip` | `"192.168.1.100"` | 客户端 IP |
| `request.cookies.sid` | `"a1b2c3.d4e5f6.g7h8i9"` | 三段式 cookie |
| `sessionData.roles` | `["user_normal"]` | 角色数组 |
| `sessionData.permissions` | `{ allows: [...], denies: [...] }` | PBAC 权限 |
| `fingerprint` | `"sha256:a1b2c3d4..."` | 设备指纹哈希 |

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
  → 尝试 sid_r → refreshToken 有效
  → 生成新 sessionId → 写入 Redis → 下发新 cookie
  → request.state.user = { ... } (用户无感知)
```

### 被防火墙拦截

```
onRequest[3] → firewall
  → checkGlobalBlock → redis.hget("fw:blocked:ips", ip) → 命中
  → reply.code(403).send({ blocked: true })
```

### 角色权限不足

```
preHandler[0] → guard
  → allowRoles: ["admin"] → user.roles = ["user_normal"] → 不匹配
  → reply.result.forbidden("权限不足: 需要 [admin] 角色")
```
