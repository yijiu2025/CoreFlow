# framework/auth — 认证与权限模块地图

> 按职责分 7 个子目录 + 根目录 `index.js`。**对外唯一出入口是 `index.js`**：
> 默认导出 = Fastify 插件（loader `04-auth.js` 注册），命名导出 = 全部公开能力的分类收拢。
> 业务代码（src/app、src/api）统一 `import { xxx } from '<相对路径>/framework/auth/index.js'`；
> **auth 内部模块互相 import 走具体文件，禁反向 import index.js（会成环）**。

```
auth/
├── index.js          # 纯门面（零业务逻辑）：Fastify 插件 + 141 个命名导出的分类收拢
├── plugin.js         # 插件装配：onRequest/onSend 钩子接线、ALS 包裹、StpUtil 装饰
├── bearer-auth.js    # JWT Bearer 认证流程（getUserFromToken / authenticateByJwt）
├── context/          # 请求上下文 / 权限工具类 / Cookie 载体
├── session/          # 会话生命周期 + 治理（8 个文件）
├── permission/       # PBAC 权限
├── device/           # 设备 ID / 指纹
├── risk/             # 风控（判定 + 请求生命周期接线）
├── security/         # 封禁 / 密码 / 两步验证 / H5 签名 / Origin
├── audit/            # 审计日志 / 事件中心
└── docs/             # 历史审计报告（非代码）
```

## context/ — 插件入口 / 上下文 / Cookie 载体

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `../plugin.js` | 插件装配：onRequest 认证主流程接线（JWT → Session → 风险检测）、ALS 包裹、StpUtil 装饰、日志上下文注册 | `default` 插件 |
| `../bearer-auth.js` | JWT Bearer 认证：token 校验 → 用户缓存/DB → 权限指纹快照装配 | `authenticateByJwt` |
| `request-context.js` | ALS 实例本体（零依赖，防循环依赖的解耦点） | `requestContext` |
| `accessors.js` | 请求上下文访问器（业务层任意深度取 request/db/插件实例） | `getCtx` `getDb` `getServerResource` |
| `stp-util.js` | 权限工具类（对标 Sa-Token），同时被 `app.decorate('auth')` | `default` = `StpUtil` |
| `cookie.js` | Cookie HMAC 签名、双令牌 Cookie 策略与 TTL 常量 | `signCookie` `verifyCookie` `COOKIE_SID` `COOKIE_OPTIONS` `COOKIE_POLICY` |

## session/ — 会话生命周期与治理

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `session.js` | 聚合门面：创建/读取/刷新/销毁/记住我/基线更新 | `createSession` `getSession` `refreshSession` `destroySession` `switchSessionByRefreshToken` |
| `session-store.js` | Redis 底座：6 个 getStore 命名空间全集中于此（共享底座，禁依赖兄弟模块） | `sessionStore` `refreshStore` `userSessionsStore` `sidHash` `revokeFamily` `revokeDisabledSession` |
| `session-refresh.js` | 刷新令牌换新会话的核心流程 | `refreshSessionCore` |
| `session-saga.js` | 会话多步写操作的补偿事务 | `runSessionSaga` `withSessionTransaction` |
| `session-kick.js` | 踢人下线（单会话/全端/按设备/按 ID 列表）+ 踢出墓碑 | `kickSession` `kickAllSessions` `kickUser` `kickByDeviceId` `getKickTombstone` |
| `session-governance.js` | 会话上限、活跃设备修剪、统计与登录趋势 | `checkMaxSessions` `pruneActiveDevices` `getSessionStats` `getLoginTrend` |
| `session-api.service.js` | 登录成功后的 Cookie 绑定、记住我切换、账号切换 | `bindSessionToCookie` `clearAuthCookies` `updateRememberMeCookies` `switchAccount` |
| `session-perm.js` | 会话恢复时怎么解析权限（权限指纹改造的产物） | `resolveSessionPermissions` |

## permission/ — 权限（PBAC）

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `perm-cache.js` | 权限缓存（30s TTL + 数据指纹，权限变更即时生效的唯一读取口） | `getPermissions` `invalidatePermCache` `warmPermissions` `computePermFingerprint` |
| `permission-loader.js` | 按 appId 加载用户角色与权限（allow/deny + 通配） | `loadUserPermissions` |

## device/ — 设备

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `device.js` | 设备 ID 获取/恢复、类型检测、指纹计算 | `getDeviceId` `DEVICE_TYPE` `detectDeviceType` `computeDeviceFingerprint` |
| `device-id-service.js` | 设备 ID 的服务端签发/校验/解析（服务端换发语义） | `generateServerSideDeviceId` `verifyAndNormalizeDeviceId` `parseDeviceId` |

## risk/ — 风控

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `anomaly-detector.js` | 登录/会话异常检测（指纹/IP/设备变更分级 warn/info）、人机验证令牌 | `detectSessionRisk` `detectLoginAnomaly` `hasVerifiedFlag` `confirmVerifyToken` `clearAccountLock` |
| `risk-hooks.js` | 风险检测与请求生命周期的接线：onRequest 403 拦截 + onSend 响应体注入 | `detectAndHandleRisk` `injectRiskOnSend` |

## security/ — 账号安全

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `ban.js` | 账号/设备封禁（登录与访问两档服务） | `disable` `untieDisable` `checkDisable` `checkDisableLevel` |
| `password-hash.js` | 密码哈希与校验（含旧哈希识别） | `hashPassword` `verifyPassword` `isLegacyHash` |
| `password-policy.js` | 密码强度/复用/有效期策略 | `validatePasswordStrength` `isPasswordReused` `checkPasswordAge` |
| `totp.js` | 两步验证（TOTP） | `generateSecret` `generateTOTP` `verifyTOTP` |
| `safe.js` | 二级验证保险箱（敏感操作前的验证标记） | `openSafe` `checkSafe` `createSafePreHandler` |
| `signature.js` | H5 接口签名（防爬防篡改） | `verifySignature` `issueH5Token` |
| `origin-guard.js` | Origin/Referer 白名单 | `isAllowedOrigin` |

## audit/ — 审计 / 事件

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `audit-logger.js` | 认证审计日志（登录/登出/踢出/改密/注册） | `logAuditEvent` `getAuditLogs` `logLogin` `logKick` |
| `events.js` | 认证事件中心（发布/订阅） | `AUTH_EVENTS` `onAuthEvent` `emitAuthEvent` |

## 约束（有测试钉死，改动前先看）

- `session/` 下 `session.js / session-store.js / session-kick.js / session-governance.js / session-perm.js` 五文件**各 ≤1000 行**且依赖**无环**（`auth-contract.test.js`，SESSION_FILES 已带子目录前缀）。
- `session-store.js` 是无环最底层：**禁 import 任何兄弟子模块**。
- `PERM_NAMESPACE` 在 `permission/perm-cache.js` 与 `session/session-store.js` 各有一份字面量（刻意不互 import），契约测试钉死两者逐字一致——改动任一处必须同步另一处。
- 内部模块互相 import 走具体文件；**只有 index.js 允许作为对外门面被外部 import**，内部反向 import index.js 会成环。
- 测试里 `unstable_mockModule` 与按路径读文件的断言指向**具体文件**（mock 门面不生效）；业务代码 import 走门面。
