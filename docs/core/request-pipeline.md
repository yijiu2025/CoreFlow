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
插件层 ── helmet / cors / multipart / static / cookie（rateLimit 由 firewall 内部注册）
  │
  ▼
onRequest[0] ── @fastify/cookie → 解析 cookies
onRequest[1] ── 01-monitor.js   → 记录 request.startTime（loader 01 先注册，故先执行）
onRequest[2] ── auth/index.js   → Session 验证 + ALS 初始化
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
onResponse ── 登录结果观测 + 扫描陷阱
  │
  ▼
客户端收到响应
```

> onResponse 里这两件事都**只对"自己声明过"的路由生效**，不看 URL：
> `config.firewall.credentialRoute`（参与暴力破解计数）、
> `config.firewall.skipScanTrap`（自己的 403/404 不算扫描）。
> 同一族还有 `config.firewall.challengeSurface` / `config.firewall.probeEndpoint`
> （这条路由是挑战接口 / 健康探针，任何状态下无条件可达）—— 它们在 `onRequest`
> 就被消费，因为挑战态在第一阶段就要放行。探针另有 `defense.probePaths` 配置兜底，
> 两者取并集（部署方可能探一个没有路由的路径）。
> 路由在 `onResponse` 阶段已匹配，所以读的是 `request.routeOptions.config`。
> 用声明而不用路径正则的原因见 `src/app/firewall/README.md` 的「路由级防火墙声明」。

## 详细流程

### 阶段 1：Fastify 核心

```js
request.id = crypto.randomUUID()    // genReqId 生成
request.ip = "192.168.1.100"        // trustProxy 读取
request.body = { ... }              // bodyLimit 校验 (5MB JSON)
```

### 阶段 2：插件处理

- **helmet** → 设置安全响应头 (CSP, X-Frame-Options)
- **cors** → 跨域检查
- **cookie** → 解析 Cookie 头 → `request.cookies`
- **rateLimit** → **不在这里**：由 `05-firewall` 内部的 `first-ratelimit.js` 注册（全局桶默认关闭，端点级 `config.rateLimit` 默认生效）

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
      └─（端点限频不在本管道：2026-11-02 起由路由 `config.rateLimit` + 限流插件承担）
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
  const user = request.state.user; // 已验证的用户信息
  // 业务逻辑...
  return reply.result.success('操作成功', data);
};
```

## 变量预估值

| 变量                      | 典型值                             | 说明                                        |
| ------------------------- | ---------------------------------- | ------------------------------------------- |
| `request.id`              | UUID v4                            | 请求唯一标识                                |
| `request.ip`              | `"192.168.1.100"`                  | 客户端 IP                                   |
| `request.cookies.sid`     | `"<base64url 载荷>.<hmac 签名>"`   | 两段式：`payload.signature`（`signCookie`） |
| `sessionData.roles`       | `["user_normal"]`                  | 角色数组                                    |
| `sessionData.permissions` | `{ allows: [...], denies: [...] }` | PBAC 权限                                   |
| `fingerprint`             | `"sha256:a1b2c3d4..."`             | 设备指纹哈希                                |

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
  → checkGlobalBlock → readAccessState() 一次 Lua 读 fw:block:<ip> / fw:block:fp:<fp> / fw:block:dev:<dev> → 命中
  → 403 { error: 'Security Policy Blocked', message: '...' }
  （fw:blocked:ips 只是面板列举用的索引 Hash，不参与判定）
```

### 角色权限不足

```
preHandler[0] → guard
  → allowRoles: ["admin"] → user.roles = ["user_normal"] → 不匹配
  → reply.result.forbidden("权限不足: 需要 [admin] 角色")
```
