# framework/auth — 认证与权限模块地图

> 按职责分 7 个子目录 + 根目录 `index.js`。**对外唯一出入口是 `index.js`**：
> 默认导出 = Fastify 插件（loader `04-auth.js` 注册），命名导出 = 全部公开能力的分类收拢。
> 业务代码（src/app、src/api）统一 `import { xxx } from '<相对路径>/framework/security/auth/index.js'`；
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
| `stp-util.js` | 权限工具类（对标 Sa-Token），同时被 `app.decorate('auth')`；方法分组：认证（getLoginId/check/checkRole 精确匹配）、权限（hasPermission/checkPermission/And/Or，Deny 优先+通配，零参显式报错）、封禁（disable 系 6 方法，⚠️ loginId 必须数字主键）、二级认证（openSafe 系 5 方法）。API 详解见文档站 `docs/core/permission.md` §StpUtil | `default` = `StpUtil` |
| `cookie.js` | Cookie HMAC 签名、双令牌 Cookie 策略与 TTL 常量 | `signCookie` `verifyCookie` `COOKIE_SID` `COOKIE_OPTIONS` `COOKIE_POLICY` |

## session/ — 会话生命周期与治理

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `session.js` | 聚合门面：创建/读取/刷新/销毁/记住我/基线更新 | `createSession` `getSession` `refreshSession` `destroySession` `switchSessionByRefreshToken` |
| `session-store.js` | Redis 底座：9 个 getStore 命名空间全集中于此（共享底座，禁依赖兄弟模块） | `sessionStore` `refreshStore` `userSessionsStore` `sidHash` `revokeFamily` `revokeDisabledSession` |
| `session-refresh.js` | 刷新令牌换新会话的核心流程（轮转 + 盗用检测 + 禁用/封禁资格检查） | `refreshSessionCore` |
| `session-saga.js` | 会话多步写操作的补偿事务 | `runSessionSaga` `withSessionTransaction` |
| `session-kick.js` | 踢人下线（单会话/全端/按设备/按 ID 列表）+ 踢出墓碑 | `kickSession` `kickAllSessions` `kickUser` `kickByDeviceId` `getKickTombstone` |
| `session-governance.js` | 会话上限、活跃设备修剪、统计与登录趋势 | `checkMaxSessions` `pruneActiveDevices` `getSessionStats` `getLoginTrend` |
| `session-api.service.js` | 登录成功后的 Cookie 绑定、记住我切换、账号切换 | `bindSessionToCookie` `clearAuthCookies` `updateRememberMeCookies` `switchAccount` |
| `session-perm.js` | 会话恢复时怎么解析权限（权限指纹改造的产物） | `resolveSessionPermissions` |

> 子模块机制地图与深度检查记录：[docs/SESSION-LIFECYCLE.md](docs/SESSION-LIFECYCLE.md)

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
| `password-policy.js` | 密码强度校验（含 bcrypt 72 字节截断防护） | `validatePasswordStrength` `BCRYPT_MAX_BYTES` |
| `totp.js` | 两步验证（TOTP） | `generateSecret` `generateTOTP` `verifyTOTP` |
| `safe.js` | 二级验证保险箱（敏感操作前的验证标记） | `openSafe` `checkSafe` `createSafePreHandler` |
| `signature.js` | H5 接口签名（防爬防篡改；cookie + `x-h5-tk` 头双通道，小程序/API 直连接入见 [docs/H5-SIGNATURE.md](docs/H5-SIGNATURE.md)） | `verifySignature` `issueH5Token` |
| `origin-guard.js` | Origin/Referer 白名单（敏感端点来源校验，生产 fail-closed） | `isAllowedOrigin` |

## audit/ — 审计 / 事件

| 文件 | 职责 | 关键导出 |
|------|------|----------|
| `audit-logger.js` | 认证审计日志（登录/登出/踢出/改密/注册） | `logAuditEvent` `getAuditLogs` `logLogin` `logLogout` `logKick` `logPasswordChange` `logRegister` |
| `events.js` | 认证事件中心（发布/订阅） | `AUTH_EVENTS` `onAuthEvent` `emitAuthEvent` |

### audit-logger.js API 详解

**双写架构**（所有便捷方法最终都汇入 `logAuditEvent`）：

```
logAuditEvent(event)
  ├── ① DB 持久化：AuditLog 表 create（完整审计数据源，永远写）
  └── ② Redis 环形缓冲：audit:security 命名空间，固定 1000 条满覆盖最旧（快查副本）
```

- ②失败/未配置 Redis 时**静默降级只写 ①**——审计是业务附属，不因 Redis 挂而阻塞或雪崩业务；
- 环形缓冲经 `createRingQueue`（统一存储层），带 3s 超时与命名空间，**禁止改回收裸 redis 客户端**。

**接线状态**（2026-11-01 核对，改代码后同步本表）：

| 接口 | 接线状态 | 实际调用方 |
|------|----------|------------|
| `logLogin` | ✅ 已接线 | `app/oauth21/services/login.service.js`（成功路径） |
| `logRegister` | ✅ 已接线 | `api/user/v1/open.js` |
| `logAuditEvent` | ✅ 已接线（直用） | `open.js` 记 `PASSWORD_RESET` |
| `logLogout` | ⚪ 预留未接线 | 登出路径目前只发 `AUTH_EVENTS.SESSION_LOGOUT` 事件总线，不落 AuditLog |
| `logKick` | ⚪ 预留未接线 | kick 路径目前只发 `AUTH_EVENTS.SESSION_KICK` 事件总线，不落 AuditLog |
| `logPasswordChange` | ⚪ 预留未接线 | 枚举已在 AuditLog 模型注释登记，无调用点 |

**事件类型对照**（AuditLog 表 `event` 列枚举，模型注释为准）：

| 便捷方法 | success=true | success=false/无 |
|----------|--------------|------------------|
| `logLogin` | `LOGIN_SUCCESS` | `LOGIN_FAILED` |
| `logLogout` | `LOGOUT` | — |
| `logKick` | `SESSION_KICK` | — |
| `logPasswordChange` | `PASSWORD_CHANGE` | — |
| `logRegister` | `REGISTER_SUCCESS` | `REGISTER_FAILED` |
| （直用 logAuditEvent） | `PERMISSION_CHANGE`、`PASSWORD_RESET` 等自定义 | — |

**逐接口说明**：

| 接口 | 参数（解构对象） | 落库字段映射 | 注意点 |
|------|------------------|--------------|--------|
| `logAuditEvent(event)` | `{ type, userId, ip, userAgent, appId, details }` | `type`→`event` 列，`userId`→`user_id`，`appId`→`app_id`，`details`→`details`（JSON） | 唯一底层写入口；`type` 透传不校验枚举（新增审计类型先在 AuditLog 模型注释登记） |
| `getAuditLogs(options)` | `{ limit=100, event, userId }` | —（读） | **从 AuditLog 表读**（不是环形缓冲）；`limit` 硬上限 500（超出静默截断）；按 `created_at` 倒序；**无 try-catch，DB 异常向上抛** |
| `logLogin(p)` | `{ userId, ip, userAgent, appId, success, reason }` | `success` 决定事件类型；`reason` 进 `details` | ⚠️ 只管**成功**路径与带 userId 的失败；无 userId 的失败（邮箱盲试）走 `logLoginFailure`（见下） |
| `logLogout(p)` | `{ userId, ip, appId }` | 无 details | 预留未接线；接线时登出路由调用即可 |
| `logKick(p)` | `{ userId, ip, targetSessionId, reason }` | `targetSessionId`/`reason` 进 `details` | 预留未接线；参数名 `userId` 语义 = **被踢用户**（发起方走操作者审计） |
| `logPasswordChange(p)` | `{ userId, ip, userAgent }` | 无 details | 预留未接线；接线时改密路由调用 |
| `logRegister(p)` | `{ userId, email, ip, userAgent, appId, success, reason }` | `success` 决定事件类型；`details.email` 脱敏 | **邮箱自动脱敏**：只留前 2 字符 + `***@域名`（`zz***@qq.com`），details 里永远不该出现完整邮箱 |

**相关但不同表的函数——`logLoginFailure`（session-governance.js）**：

- 写 **SessionLog 表**（不是 AuditLog），`event='LOGIN_FAILED'`、`user_id=null`（盲试无用户）；
- `details.email` **不脱敏原文存储**——这是刻意的：`anomaly-detector.js` 按 `details.email = email` 精确匹配做账户锁定判定，脱敏后就查不到了；
- 两表分工：**AuditLog = 有主安全事件**（成功动作/带 userId 失败），**SessionLog = 无主会话事件**（盲试失败、设备登录历史）。查"某邮箱最近登录失败"去 SessionLog，查"某用户做过什么"去 AuditLog。

**调用约束**：

- **写入型函数**（`logAuditEvent` 及 5 个便捷方法）内部全 try-catch、**不会向调用方抛错**——调用处无需包 try（但必须 await，否则进程退出前可能丢写）；
- `logLoginFailure` 无 try-catch（SessionLog 写失败会抛）；
- `AuditLog`/`SessionLog` 模型未注册时（如单测环境）写入自动跳过或抛错，以函数体为准；
- 审计落库字符串（`LOGIN_SUCCESS`/`SESSION_KICK`…）与 `AUTH_EVENTS` 事件中心的 `session:*` 命名空间是**两套独立体系**（事件总线是进程内 pub/sub，审计是持久化枚举）——不要混用，也不要"统一"它们。

## 约束（有测试钉死，改动前先看）

- `session/` 下 `session.js / session-store.js / session-kick.js / session-governance.js / session-perm.js` 五文件**各 ≤1000 行**且依赖**无环**（`auth-contract.test.js`，SESSION_FILES 已带子目录前缀）。
- `session-store.js` 是无环最底层：**禁 import 任何兄弟子模块**。
- `PERM_NAMESPACE` 在 `permission/perm-cache.js` 与 `session/session-store.js` 各有一份字面量（刻意不互 import），契约测试钉死两者逐字一致——改动任一处必须同步另一处。
- 内部模块互相 import 走具体文件；**只有 index.js 允许作为对外门面被外部 import**，内部反向 import index.js 会成环。
- 测试里 `unstable_mockModule` 与按路径读文件的断言指向**具体文件**（mock 门面不生效）；业务代码 import 走门面。
