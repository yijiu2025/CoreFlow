# 审查报告：framework/auth

> 依据 `.claude/skills/fullstack-rules`（v2.5.0）+ `.workbuddy/memory/MEMORY.md`
> 执行方式：按 `src/framework/auth/docs/AUDIT-PROMPT.md` 流程；**只审查不修改代码**
> 审查范围：`src/framework/auth/`（14 个文件 / 4240 行）+ 2 层调用方
> 审查时间：2026-09-12
> **所有结论均已实测**（依赖图脚本 + 运行时探针 + 边界注入），证据附命令与输出

---

## ⚠️ 修复进展（2026-09-14）

**批次 A 已完成**：🔴-1 / 🔴-2 / 🔴-3 + 🟡-5 四个问题已修复并验证。

| 编号 | 状态 | 改动 |
| ---- | ---- | ---- |
| 🔴-1 | ✅ 已修复 | `cookie.js` — 长度守卫改为比 Buffer 字节长度，整个函数体包进 try 兜底 |
| 🔴-2 | ✅ 已修复 | `session.js` — export 块补 `sidHash`（+ JSDoc 说明为何对外导出） |
| 🔴-3 | ✅ 已修复 | `deactivation.service.js:290` — `'userSessions'` → `'user_sessions'` |
| 🟡-5 | ✅ 已修复 | 4 套测试（`crypto`/`logic`/`session-flow`/`session.test.js`）改为 import 真身，各补 🔴-1 回归用例 |
| 🟡-5 | ✅ 新增 | `__tests__/framework/auth/auth-contract.test.js` — 固化导出契约 + 命名空间一致性 |

**验证结果（批次 A 后）**：`npx eslint` 0 警告；全量测试 **682 passed / 11 skipped / 0 failed**（修复前 673 passed）。

---

**批次 B 已完成**（"清理类"）：🟡-1 / 🟡-2 / 🟡-3 / 🟡-4 + 5 个 🔵 项。

| 编号 | 状态 | 改动 |
| ---- | ---- | ---- |
| 🟡-1 | ✅ 已修复 | 新增 `request-context.js`（零依赖 ALS 单例）；`index.js` 与 `stp-util.js` 均从它导入 → **环已消除**（依赖图脚本复验：无环） |
| 🟡-1 | ✅ 已修复 | `stp-util.js` 对 `session.js` 改**惰性导入**（仅 `login()` 需要）→ 导入该工具类**不再有任何 DB/Redis 副作用**（实测前后对比见下） |
| 🟡-2 | ⚠️ 批次 B 只改了一半 | `session-api.service.js:219` 已改判 `err.code`，但 `session.js:1042` 仍 `throw new Error('SESSION_NOT_FOUND')`（`err.code === undefined`）→ **401 分支永不命中，退化成 500**。批次 C 已补齐（见下） |
| 🟡-3 | ✅ 已修复 | 按推荐方案 (b)：新增 `__tests__/framework/auth/totp.test.js`（34 用例），并用 **RFC 6238 官方测试向量 6/6 命中**验证实现 |
| 🟡-3 | ✅ 额外修复 | `totp.js` 的 `verifyTOTP` 入参防御 —— 修复前 `code=undefined` 会在内部 `timingSafeEqual` 读 `b.length` 时抛 `TypeError`（与 🔴-1 **同类缺陷**：守卫未防御非预期输入，2FA 端点会 500 而非返回"验证失败"） |
| 🟡-4 | ✅ 已修复 | `session.js` — `getSessionStats` 空 `catch {}` → `log.warn`，与 wb-logkit 0.5.0「故障不静默」对齐 |
| 🔵-1 | ✅ 已修复 | `StpUtil.js` → **`stp-util.js`**（类名 `StpUtil` 保留），全目录命名统一为 kebab-case |
| 🔵-2 | ✅ 已修复 | `session.js` — 被夹在常量声明之间的 2 条 import 上移到顶部 import 区 |
| 🔵-4 | ✅ 已修复 | `session.js` — `getModel('session.SessionToken')` → `'SessionToken'`（2 处）。**实测澄清：`getModel` 的点号写法只取最后一段做 `sequelize.models[name]` 查找，命名空间前缀根本不参与解析**，故两种写法等价，纯可读性问题 |
| 🔵-6 | ✅ 已修复 | `signature.js` — `serverSign !== sign` → 先比 Buffer 字节长度再 `timingSafeEqual`（`sign` 客户端可控且长度任意，直接比会重现 🔴-1 的 `RangeError`） |
| 🔵-9 | ✅ 已修复 | `async_hooks` → `node:async_hooks`（随 `request-context.js` 迁移一并统一） |

**🟡-1 修复效果实测**（导入模块的顶层副作用对比）：

```
修复前  $ node -e "await import('.../StpUtil.js')"
        ERROR [framework.db.index] ❌ [DB] 缺少必要环境变量: DB_HOST, DB_NAME, DB_USER
        WARN  [framework.auth.cookie] ⚠️ [Auth] SESSION_SECRET 未配置...

修复后  $ node -e "await import('.../stp-util.js')"
        （无任何输出）

对照    $ node -e "await import('.../index.js')"      # 插件入口，本应有建连告警
        ERROR [framework.db.index] ❌ [DB] 缺少必要环境变量: DB_HOST, DB_NAME, DB_USER
        WARN  [framework.auth.cookie] ⚠️ [Auth] SESSION_SECRET 未配置...
```

**`requestContext` 单例完整性**：确认 `index.js` 的 re-export 与 `request-context.js` 导出的是**同一实例**（`===` 为 true）——若变成两个实例，ALS 上下文穿透会静默失效，这是本次重构最需守住的不变量。

**验证结果（批次 B 后）**：`npx eslint src/framework/auth/ src/__tests__/framework/auth/` **0 警告**；全量测试 **716 passed / 11 skipped / 0 failed**（批次 A 后 682，+34 为新增 totp 用例）；依赖图脚本复验 **无环**。

---

**批次 C 已完成**（结构重构）：`session.js` **1409 行 → 拆为 4 个文件**，并按 🔵-3 抽出 `_revokeOneSession()`。

| 编号 | 状态 | 改动 |
| ---- | ---- | ---- |
| **§2.3** | ✅ 已拆分 | `session.js` 1409 行 → `session.js`(945) + `session-store.js`(131) + `session-kick.js`(249) + `session-governance.js`(268)。**4 文件全部低于 1000 行硬限** |
| **兼容性** | ✅ 零感知 | `session.js` 末尾 re-export 三个子模块的公开符号；**导出集合与拆分前逐字一致（24 项）**，未新增、未泄漏内部符号。11 处外部 import + 契约测试**无需改动** |
| **🔵-3** | ✅ 已修复 | 6 条踢出路径重复的「删 Redis → 失效 sid_r → 清索引」收敛为 `session-kick.js` 的 `_revokeOneSession()`（1 处定义 + 4 处调用）；`_kickSession` / `kickSession` 各从 ~8 行降到 2 行 |
| **🟡-2** | ✅ 已补齐 | `updateRememberMe` 的 `throw new Error('SESSION_NOT_FOUND')` → `err.code = 'SESSION_NOT_FOUND'` + 人类可读 message。实测 `e.code === 'SESSION_NOT_FOUND'` → **401 分支命中** ✅（批次 B 只改了调用方，漏了抛出方） |
| **依赖图** | ✅ 无环 | 脚本复验：`session-store.js` 无任何内部依赖（最底层）；`session-kick`/`session-governance` 只依赖 store；`session.js` 单向依赖另三者 |
| **测试** | ✅ 新增 | 新增 `__tests__/framework/auth/session-kick.test.js`（11 用例）——**踢出路径原本零覆盖**，用内存 store 桩 + DB 模型桩固化每条路径的清理集合与筛选语义 |

**拆分映射（计划 → 实际落地）**：

| 文件 | 职责 | 行数 | 迁入函数 |
| ---- | ---- | ---- | -------- |
| `session-store.js` | 共享底座 | 131 | 6 个 `getStore` 实例、`MAX_REFRESH_TOKENS`/`MAX_ACTIVE_DEVICES`、`sidHash`、`revokeFamily`、`deleteRefreshTokensForSession` |
| `session-kick.js` | 踢出/吊销 | 249 | `_revokeOneSession`(新)、`_kickSession`、`kickByDeviceType`、`kickByDeviceId`、`kickSession`、`kickAllSessions`、`kickUser` |
| `session-governance.js` | 治理/统计 | 268 | `checkMaxSessions`、`pruneActiveDevices`、`pruneStaleSessionTokens`、`logLoginFailure`、`getSessionStats`、`getLoginTrend` |
| `session.js` | 会话生命周期 | 945 | `createSession`、`getSession`、`refreshSessionCore`、`refreshSession`、`switchSessionByRefreshToken`、`destroySession`、`revokeRememberMe`、`updateRememberMe`、`updateSessionBaseline`、`getSessionTokenDevice` |

**依赖方向（单向，无环）**：

```
cookie.js / device.js / db / redis           基础设施
        ↑
  session-store.js         ← 谁都能依赖它，它不依赖谁
        ↑         ↑
session-kick.js  session-governance.js
        ↑         ↑
      session.js           ← createSession 查配额 + 踢旧会话
```

**测试基线守卫**（`auth-contract.test.js` 新增「拆分回归」组 4 项）：四文件 ≤1000 行、子模块无环、底座不反向依赖、`_revokeOneSession` 调用数=4 且「删 Redis / 失效 sid_r」各只出现 1 处。

**验证结果（批次 C 后）**：`npx eslint src/framework/auth/ src/__tests__/framework/auth/` **0 警告**；全量测试 **732 passed / 11 skipped / 0 failed**（批次 B 后 716，+5 契约回归、+11 踢出路径）。

**待办**：
- **批次 D（可选优化）**：🔵-7（循环内串行 await 优化）、🔵-8（timeout 常量统一）
- **需产品决策**：🔵-5（`audit-logger` 的 `logLogout`/`logKick`/`logPasswordChange` 无生产调用方——登出/踢人路径只写 `SessionLog`、不写 `AuditLog`；是否补审计留痕属产品/合规口径）

---

## 一、结论摘要

| 等级 | 数量 | 说明 |
| ---- | ---- | ---- |
| 🔴 严重 | **3** | 认证钩子可被构造 cookie 打崩、跨模块调用必抛、注销清理静默失效 |
| 🟡 中等 | **5** | 循环依赖/职责倒挂、错误码控制流、静默失败、命名空间不一致、测试副本失真 |
| 🔵 低 | **9** | 命名、注释、可读性、重复代码、死导出 |

**总体判断**：auth 模块的**安全设计本身是扎实的**（签名/时序比较/Cookie 属性/风险检测/防重放经实测全部正确，详见 §6 无问题清单）。真正的问题集中在**健壮性与可维护性**三处：

1. 一个**用户可控输入**能打穿认证钩子的类型守卫（🔴-1）；
2. `session.js` 对外契约与实际导出**不一致**，调用方必崩（🔴-2）；
3. 跨模块**命名空间大小写不一致**，导致清理逻辑静默失效（🔴-3）。

外加 `session.js` **1393 行**超 1000 行硬限，且是全模块 3 个被依赖最多的文件之一，需拆分。

---

## 二、文件组织审查（本次重点）

> 本节为 **2026-09-12 审查时的原貌快照**（修复前）。当前状态见顶部「修复进展」：
> `StpUtil.js` 已改名 `stp-util.js`，新增 `request-context.js`，循环依赖已消除。

### 2.1 依赖图（脚本实测）

```
anomaly-detector.js  ->  device.js
audit-logger.js      ->  (无内部依赖)
cookie.js            ->  (无内部依赖)          ← 入度 4，核心基础层
device-id-service.js ->  (无内部依赖)
device.js            ->  device-id-service.js, cookie.js
index.js             ->  session.js, cookie.js, permission-loader.js, StpUtil.js, device.js, anomaly-detector.js
origin-guard.js      ->  (无内部依赖)
password-policy.js   ->  (无内部依赖)
permission-loader.js ->  (无内部依赖)
session-api.service.js -> session.js, cookie.js
session.js           ->  cookie.js, permission-loader.js, device.js   ← 入度 3
signature.js         ->  (无内部依赖)
StpUtil.js           ->  index.js, session.js                         ← 反向依赖入口！
totp.js              ->  (无内部依赖)

=== 循环依赖检测 ===
index.js -> StpUtil.js -> index.js        ← 有环
```

**分层是清晰的**：`cookie/device-id-service/password-policy/totp/signature/origin-guard/permission-loader/audit-logger` 8 个文件零内部依赖，构成稳定基础层；`device → session` 单向递进；`session-api.service` 是 HTTP 编排层。**分层形态无需改动**。

### 2.2 逐文件判定

| 文件 | 行数 | 职责是否单一 | 建议 | 优先级 |
| ---- | ---- | ------------ | ---- | ------ |
| `session.js` | **1393** | ✗ **否**，混装 6 类职责 | **必须拆为 4 个文件**（方案见 §2.3） | 🔴 P0 |
| `anomaly-detector.js` | 450 | ✓ 是 | 保留。三套检测结构差异已在注释说明，但建议拆 store 初始化（见 🔵-4） | 🔵 |
| `index.js` | 447 | ✓ 是（插件入口） | 保留。但 `getUserFromToken` 116 行偏重，可下沉 | 🔵 |
| `session-api.service.js` | 313 | ✓ 是 | 保留 | — |
| `device-id-service.js` | 297 | ✓ 是 | 保留（依赖 npm 共享包做单源，设计正确） | — |
| `device.js` | 297 | ✓ 是 | 保留 | — |
| `cookie.js` | 282 | ✓ 是 | 保留（宏观设计正确，仅 🔴-1 一处实现 bug） | 🟡 |
| `StpUtil.js` | 221 | ✓ 是 | **改名为 `stp-util.js`** + 去掉对 `index.js` 的反向依赖（见 🟡-1） | 🟡 P1 |
| `audit-logger.js` | 185 | ✓ 是 | 保留，但 4 个便捷方法无调用方（见 🔵-5） | 🔵 |
| `totp.js` | 149 | ✓ 是 | **保留但需确认**：全仓零引用（见 🟡-3） | 🟡 |
| `signature.js` | 138 | ✓ 是 | 保留 | — |
| `permission-loader.js` | 134 | ✓ 是 | 保留 | — |
| `password-policy.js` | 106 | ✓ 是 | 保留 | — |
| `origin-guard.js` | 62 | ✓ 是 | 保留 | — |

**命名一致性**：`StpUtil.js` 是全目录唯一 PascalCase，其余 13 个均为 kebab-case。`StpUtil` 作为**类名/导出标识符**沿用 sa-token 术语没问题（AUDIT-PROMPT §2.5 已确认），但**文件名仍应随目录约定**改为 `stp-util.js` —— 二者不冲突：文件名 kebab-case，类名保持 `StpUtil`。

### 2.3 `session.js` 可执行拆分方案

**当前 25 个函数的职责聚类**（函数体行数为实测值）：

| 聚类 | 函数（行数） | 合计 |
| ---- | ------------ | ---- |
| **A. 会话生命周期** | `createSession`(246) `getSession`(157) `refreshSessionCore`(147) `refreshSession`(36) `switchSessionByRefreshToken`(24) `destroySession`(34) `updateRememberMe`(52) `updateSessionBaseline`(63) `getSessionTokenDevice`(45) `revokeRememberMe`(34) | ~838 || **B. 踢出/吊销** | `_kickSession`(22) `kickByDeviceType`(28) `kickByDeviceId`(25) `kickSession`(31) `kickAllSessions`(45) `kickUser`(47) `revokeFamily`(36) | ~234 |
| **C. 数据治理** | `pruneActiveDevices`(48) `pruneStaleSessionTokens`(27) | 75 |
| **D. 查询/统计** | `checkMaxSessions`(62) `getSessionStats`(31) `getLoginTrend`(36) `logLoginFailure`(22) | 151 |
| **E. 共享底座** | `sidHash`(16) `deleteRefreshTokensForSession`(21) + 6 个 store 实例 + 2 个常量 | ~60 |

**建议拆为 4 个文件（+ 1 个 store 模块）**：

| 新文件 | 装什么 | 预估行数 | 迁移函数 |
| ------ | ------ | -------- | -------- |
| `session-store.js`（新建） | 6 个 `getStore(...)` 实例、`MAX_REFRESH_TOKENS`/`MAX_ACTIVE_DEVICES`、`sidHash`、`deleteRefreshTokensForSession`、`revokeFamily` | ~110 | 共享底座（消除 A/B 对 store 的重复获取） |
| `session.js`（保留同名，收窄为"生命周期"） | 建/取/刷新/销毁/切换/记住我/基准更新 | ~850 | A 组 |
| `session-kick.js`（新建） | 全部踢出与吊销入口 | ~250 | B 组 |
| `session-governance.js`（新建） | 设备裁剪 + 陈旧行清理 + 统计/趋势 + 失败日志 | ~230 | C + D 组 |

**关键收益**：
- 拆分后**最大文件 ~850 行**，低于 1000 硬限；
- `sidHash` 放进 `session-store.js` 后**顺带修复 🔴-2**（见下）；
- `_kickSession`/`kickByDeviceType`/`kickByDeviceId`/`kickSession`/`kickAllSessions`/`kickUser` **6 个函数高度重复**（都是"遍历索引 → 删 Redis → 失效 sid_r → revoke DB → 清索引 → 写日志"），归到同一文件后可抽公共 `_revokeOne()`（见 🔵-3）。

**兼容性**：为不破坏 35 处外部 import，`session.js` 应**继续 re-export** 拆分出去的函数（`export * from './session-kick.js'` 等），使本次拆分对调用方零感知。

---

## 三、🔴 严重问题（3 个）

### 🔴-1 `verifyCookie` 类型守卫比错长度，攻击者可用构造 cookie 打崩认证钩子

**位置**：`cookie.js:224-225`

```js
const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

if (signature.length !== expected.length) return null;                    // ← 第224行：比较【字符串】长度 = 64
if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'),               // ← 第225行：比较【字节】长度 = 32
                            Buffer.from(expected, 'hex'))) return null;
```

**问题**：守卫用**字符串长度**（64）把关，但 `timingSafeEqual` 比较的是**字节长度**（`Buffer.from(hex)` 长度为一半 = 32）。当 `signature` 是 64 个**非 hex 字符**时，字符串长度恰好 64 通过守卫，而 `Buffer.from('zzz…','hex')` 遇到非法 hex 直接返回**空 Buffer（0 字节）**，于是 `0 !== 32` → `timingSafeEqual` 抛 `RangeError`。

`verifyCookie` 的 `try-catch` **只包住后面的 base64 解码**（第230-247行），**不包这段**，异常直接冒泡。

**证据**（实测）：

```
$ node verifycookie-crash.mjs
正常签名串长度 = 64，Buffer 字节数 = 32

=== 直接调用 verifyCookie（模拟攻击者构造的 cookie）===
CRASH!!  64 个 z（非 hex）        -> RangeError: Input buffers must have the same byte length
         代码: ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
CRASH!!  64 个 g                  -> RangeError: ...
CRASH!!  64 个 -                  -> RangeError: ...
CRASH!!  63 个 a + 1 个 z         -> RangeError: ...
CRASH!!  30 个合法 hex + 34 个 z  -> RangeError: ...
OK       全 0（合法 hex，长度对）  -> null（安全拒绝）
OK       大小写混合合法 hex        -> null（安全拒绝）

结论：5/7 个构造输入导致 verifyCookie 抛异常。
```

**端到端可达性**（实测，走真实调用链）：

```
$ node reachability.mjs
构造的恶意 sid cookie = c29tZXNlc3Npb246MA.zzzzzzzzzzz...zzzzzzzzzz
调用 getSession({ cookies: { sid: evil }, reply }) ...
!!! 抛出异常：RangeError: Input buffers must have the same byte length
    code = ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH
    reply.clearCookie 被调用：false（期望 true，实际 false —— 坏 cookie 没被清掉）
```

调用链：`onRequest`（`index.js:383-428`，**无 try-catch**）→ `getSession`（`session.js:615`，**无 try-catch**）→ `verifyCookie` 抛出。

**影响**：
- `getSession` 未按设计返回 `null`，而是抛 `RangeError`；
- 异常冒泡到 Fastify 全局错误处理器（`app.js:302`）→ 该请求被拦截为错误响应；
- **坏 `sid` 永不被清除**（`reply.clearCookie` 未执行），客户端每次请求都重复触发同一路径 → **带毒 cookie 死循环**；
- `SID_R` 路径（`session.js:917`）同样受影响；
- 攻击者无需密钥，仅需构造一个 64 个非 hex 字符的 cookie 值即可让该用户所有请求持续失败（**拒绝服务**，且可对任意访客触发）。

**建议**：守卫改为直接比较 **Buffer 字节长度**，并把整段包进 try-catch。最小修复：

```js
const expectedBuf = Buffer.from(expected, 'hex');
const sigBuf = Buffer.from(signature, 'hex');
if (sigBuf.length !== expectedBuf.length) return null;   // 先比字节长度
if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
```

更稳的写法是整段 `try-catch` 兜底返回 `null`（`verifyCookie` 的契约本就是"失败统一返回 null，不区分原因"，注释已如此声明，实现却没做到）。

---

### 🔴-2 `sidHash` 未导出却被外部解构调用，注销流程必抛

**位置**：`session.js:1369-1393`（export 块）/ `src/app/user/services/deactivation.service.js:288,302`

```js
// deactivation.service.js:288
const { deleteRefreshTokensForSession, sidHash } = await import('../../../framework/auth/session.js');
// ...
hashes.push(sidHash(sid));     // ← 第302行
```

`session.js` 的 export 块**共 23 项，不含 `sidHash`**（`sidHash` 定义在第58行，是模块私有函数）。

**证据**（实测）：

```
$ node -e "const m = await import('.../session.js'); console.log(typeof m.sidHash)"
sidHash 是否被导出: undefined
调用 sidHash("x") -> TypeError: sidHash is not a function

导出列表: DEVICE_TYPE, checkMaxSessions, createSession, deleteRefreshTokensForSession,
destroySession, detectDeviceType, getLoginTrend, getSession, getSessionStats,
getSessionTokenDevice, kickAllSessions, kickByDeviceId, kickSession, kickUser,
logLoginFailure, pruneActiveDevices, pruneStaleSessionTokens, refreshSession,
refreshSessionCore, revokeRememberMe, switchSessionByRefreshToken, updateRememberMe,
updateSessionBaseline                                    ← 无 sidHash
```

**影响**：`deactivation.service.js` 的 `kickRedisSessionsByApp()` 是**账号注销流程**的关键步骤（清理该用户的 Redis 会话 + revoke DB token）。执行到 `sidHash(sid)` 时抛 `TypeError: sidHash is not a function`：
- 若外层 `try-catch` 兜住（该函数确实有 `try`）→ **会话清理静默失败**，注销用户仍可能在 Redis 中残留可用会话；
- 若循环第一次迭代就抛 → 整批 sid **一条都没处理**（`hashes` 为空，DB revoke 也不执行）。

这是**契约不一致**：调用方按 `session.js` 提供 `sidHash` 来写，实现方从未导出。属于"跨模块 API 未对账"。

**建议**：二选一——
1. 在 `session.js` export 块补上 `sidHash`（最简，1 行）；或
2. 若认为 `sidHash` 属内部实现细节，则在调用方改为 `crypto.createHash('sha256').update(sid).digest('hex')`（`src/api/user/v1/sessions.js:88` 已有同样写法，可对齐）。

**推荐方案 1**，并配合 §2.3 把 `sidHash` 落入 `session-store.js` 统一导出，杜绝再次漂移。

---

### 🔴-3 `userSessions` 与 `user_sessions` 命名空间不一致，注销清理静默失效

**位置**：`session.js:55` vs `deactivation.service.js:287`

```js
// session.js:55        —— 全模块统一的写入方
const userSessionsStore = getStore('user_sessions');

// deactivation.service.js:287  —— 读取方，键名不同
const userSessionsStore = getStore('userSessions', { timeout: 3000 });
```

`getStore` 按 prefix 隔离命名空间（`get-store.js:80`：`getRedisStore(resolvedPrefix, …)` / `getMapStore(resolvedPrefix)`）。

**证据**（实测）：

```
$ node store-isolation2.mjs
从 user_sessions 读 k: "v-from-user_sessions"
从 userSessions  读 k: null            ← 写进去的数据读不到
```

全仓 `getStore(...)` 命名空间清单比对后确认：**这是唯一一处大小写不一致**（其余如 `session`/`refresh`/`email_code` 均全仓一致）。

**影响**：`deactivation.service.js` 的 `kickRedisSessionsByApp()` 执行
`userSessionsStore.zRangeByScore(...)` 时读到的是**空集合** → `for (const sid of sids)` **循环零次**：

```js
const sids = await userSessionsStore.zRangeByScore(String(userId), '-inf', '+inf');
//             ↑ 读 'userSessions'，而数据在 'user_sessions' → sids 恒为 []
for (const sid of sids) { ... }        // 永不执行
if (hashes.length && SessionToken) { ... }   // hashes 恒为空 → 也不执行
```

于是"注销时按 app 清理 Redis 会话 + revoke DB token"**完全失效且无任何日志**。用户注销后，其会话在 Redis 中继续有效直到 TTL（记住我场景最长 30 天）。叠加 🔴-2（`sidHash` 抛错），该函数**双重失效**。

**建议**：统一为 `'user_sessions'`（下划线风格，与全仓其余命名一致，且 `session.js` 是数据写入方、改动风险更低）。同时建议在 `get-store.js` 增加"命名空间注册表 + 启动期校验"（或对形近命名如 `user_sessions`/`userSessions` 打 warning），从机制上防止同类漂移。

---

## 四、🟡 中等问题（5 个）

> **状态：🟡-1 ~ 🟡-5 已于 2026-09-14 全部修复**（🟡-5 属批次 A，其余属批次 B）。
> 以下保留问题原貌与证据，便于回溯；修复内容见顶部「修复进展」。

### 🟡-1 `index.js ↔ StpUtil.js` 循环依赖 + 职责倒挂

**位置**：`index.js:35` / `StpUtil.js:19`

```js
// index.js:35   —— 只为 app.decorate('auth', StpUtil)
import StpUtil from './StpUtil.js';

// StpUtil.js:19  —— 只为拿 requestContext
import { requestContext } from './index.js';
```

依赖图脚本实测输出：`index.js -> StpUtil.js -> index.js`（**有环**）。

**证据**（实测，ESM 提升下暂未崩，但副作用已实证）：

```
$ node -e "await import('.../StpUtil.js')"
ERROR [framework.db.index] ❌ [DB] 缺少必要环境变量: DB_HOST, DB_NAME, DB_USER
WARN  [framework.auth.cookie] ⚠️ [Auth] SESSION_SECRET 未配置，开发环境使用默认值...

$ node -e "await import('.../totp.js')"      # 对照组：真正独立的工具
（无任何输出）
```

**只需一个纯权限工具类，却拉起了整条 auth 插件链**（`cookie.js` 的 `SESSION_SECRET` 顶层校验、`session.js` → `db`/`redis` 建连）。

**影响**：
- `StpUtil` 的加载成本 = 整个 auth 模块 + DB/Redis 副作用，单元测试与工具脚本被无辜牵连；
- 循环依赖在 ESM 下"恰好没炸"是**依赖顺序的幸运**（`StpUtil.js` 顶层只解构引用、不在顶层调用），换打包器 / 改导入顺序 / 加顶层调用即可能触发 TDZ `ReferenceError`；
- `index.js` 作为插件入口却依赖一个工具类，**依赖方向与分层相反**（基础层不应依赖入口层）。

**建议**：把 `requestContext` 抽到独立的 `request-context.js`（零依赖，仅 `export const requestContext = new AsyncLocalStorage()`），`index.js` 与 `StpUtil.js` 都从它导入，环即消失。

### 🟡-2 用 `err.message` 字符串做控制流判断

**位置**：`session-api.service.js:218` / `session.js:1032`

```js
// session.js:1032
throw new Error('SESSION_NOT_FOUND');

// session-api.service.js:218
if (err.message === 'SESSION_NOT_FOUND') { ... }     // ← 应判 err.code
```

违反 fullstack-rules 明确规则「禁止用 `err.message.includes()` 做控制流，须用 `err.code`」。虽此处为 `===` 精确比较（非 `includes`），风险等级低于典型违规，但**语义上仍是脆弱的字符串契约**：改文案 → 控制流静默失配。

**证据**：全目录 `message ===` 仅此 1 处（`grep -n "message ===" *.js`），其余错误码均用 `err.code`（如 `INTERNAL_CONTEXT_ERROR`/`INVALID_PARAM`/`MAX_SESSIONS_EXCEEDED`），**属孤例违约**。

**影响**：`SESSION_NOT_FOUND` 文案变更后，`updateRememberMeCookies` 会把「会话已失效」当成未知异常抛出 → 500 而非 401，前端拿不到「请重新登录」信号。

**建议**：`session.js:1032` 改为 `const err = new Error('会话不存在'); err.code = 'SESSION_NOT_FOUND'; throw err;`，调用方判 `err.code`。

### 🟡-3 `totp.js` 全仓零引用（149 行未启用代码）

**证据**（实测）：全仓检索 `totp|TOTP|otpauth|2FA|twoFactor`（含 `.js/.ts/.vue/.json`，覆盖 `src/` + 全部前端目录 `oauth21/ firewall/ admin/ posecraft/ poseadmin/`）——**除 `totp.js` 自身外零命中**；`__tests__/framework/auth/` 下也无 totp 测试。文件头注释写「用于二次验证（2FA），用户绑定后每次登录需要输入 6 位验证码」，但**无任何绑定/校验端点或登录分支调用它**。

**影响**：149 行未被执行的安全敏感代码长期无人验证（TOTP 实现正确性、Base32 边界、时间窗口），是**认知负债**；同时给人「系统已有 2FA」的错觉。若未来接入，缺乏使用反馈会掩盖实现缺陷。

**建议**：三选一——(a) 明确标记为「预留能力」并在 README 记录；(b) 补齐单测后保留（当前 `__tests__/framework/auth/` 下**无 totp 测试**）；(c) 若不计划启用则删除。**推荐 (b)**：我已实测其核心行为正确（见 §6），补测试成本低。

### 🟡-4 `getSessionStats` 静默吞掉 Redis 异常

**位置**：`session.js:1234-1239`

```js
let redisSessions = 0;
try {
  redisSessions = await sessionStore.size();
} catch {
  // Redis 故障时忽略
}
```

`catch {}` 无日志。违反 fullstack-rules「所有跳过路径必须记日志」+ 与 `wb-logkit@0.5.0` 刚建立的「**故障不静默**」原则直接冲突。

**影响**：运维看板上 `redisSessions` 恒为 0 时，**无法区分**「真的没有会话」与「Redis 挂了」——排障时误判方向。

**建议**：`catch (err) { log.warn('[Session] sessionStore.size() 失败，redisSessions 降级为 0:', err); }`。全目录空 `catch {}` 共 5 处，`index.js:370`（非 JSON 响应）、`origin-guard.js:54`（Referer 格式异常）、`permission-loader.js:37`（策略 JSON 解析失败）、`session-api.service.js:65`（token 校验失败返回 401）四处**语义上属"预期失败路径"，可不记日志**；仅此处属真·故障静默。

### 🟡-5 4 套测试内嵌了 `verifyCookie` 的**副本实现**，与真身已漂移

**位置**：`__tests__/crypto.test.js:91`、`logic.test.js:101`、`session-flow.test.js:23`、`session.test.js:23`

四个测试文件各自**内联复制**了一份 `verifyCookie`，而非 import 真身：

```js
// crypto.test.js:91  —— 复制实现，且与真身不同（用 base64url 签名、无长度守卫）
const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
```

**影响**：
- 副本与真身算法不同（真身用 hex 摘要 + 长度守卫），测试"通过"**不能证明生产代码正确**；
- **这正是 🔴-1 未被任何测试发现的原因**——副本连 `timingSafeEqual` 的输入长度守卫都没有，构造输入根本走不到；
- 未来改真身，需同步改 4 处副本，极易漏改。

**建议**：4 个测试文件统一改为 `import { signCookie, verifyCookie } from '../../../framework/auth/cookie.js'`（真身无 DB/Redis 依赖，可安全直接导入——本报告全部实测就是这么跑的）。并补充 🔴-1 的回归用例：

```js
it('64 个非 hex 字符的签名段应返回 null 而非抛异常', () => {
  const payload = Buffer.from('sid:0').toString('base64url');
  expect(() => verifyCookie(payload + '.' + 'z'.repeat(64))).not.toThrow();
  expect(verifyCookie(payload + '.' + 'z'.repeat(64))).toBeNull();
});
```

---

## 五、🔵 低优先级（9 个）

> **状态（2026-09-14）**：🔵-1 / 🔵-2 / 🔵-3 / 🔵-4 / 🔵-6 / 🔵-9 已修复（🔵-3 随批次 C 拆分一并抽 `_revokeOneSession()`）；
> 🔵-5 / 🔵-7 / 🔵-8 待定（🔵-5 需产品决策）。

| # | 位置 | 问题 | 建议 |
| - | ---- | ---- | ---- |
| 🔵-1 | `StpUtil.js`（文件名） | 全目录唯一 PascalCase | 改 `stp-util.js`（类名 `StpUtil` 保留） |
| 🔵-2 | `session.js:40` | `import device.js` 夹在第29-38行的常量声明之间 | 移至顶部 import 区（第26行后） |
| 🔵-3 | `session.js:74-140,286-341,972-1184` | 6 个踢出函数重复「遍历索引→删 Redis→失效 sid_r→revoke DB→清索引→写日志」 | 归入 `session-kick.js` 后抽 `_revokeOne()` |
| 🔵-4 | `session.js:1310,1350` | `getModel('session.SessionToken')` 与 `getModel('SessionToken')`（649/781/974行）两种键名并存 | 统一为 `'SessionToken'`；`getModel` 未命中会 **throw `TypeError`**（实测），非返回 null，故必须确保键名正确 |
| 🔵-5 | `audit-logger.js:134,147,160,99` | `logLogout`/`logKick`/`logPasswordChange`/`getAuditLogs` **4 个导出在业务代码中零调用**（`getAuditLogs` 仅被自身测试 `audit-logger.test.js` 引用 9 次，无生产调用方） | 确认后删除，或补入调用点（登出/踢人路径当前只写 `SessionLog`，未写 `AuditLog`） |
| 🔵-6 | `signature.js:87` | `serverSign !== sign` 明文比较，非 `timingSafeEqual` | SHA-256 摘要比较实际风险低（需先猜中 32 字节摘要），如要严格可换恒定时间比较 |
| 🔵-7 | `session.js:99,128,175,324,455,976,1010,1157` | 8 处循环体内串行 `await`（N 次 DB/Redis 往返） | 分批 `Promise.all`（注意 DB 连接池上限）；当前规模可接受，属优化项 |
| 🔵-8 | `session-api.service.js:19`/`session.js:14` | 与 `deactivation.service.js:286` 对同一 `'session'` 前缀用了不同 `timeout`（默认 5000 / 3000） | 无功能缺陷（缓存键含 timeout，各自独立），但建议统一常量 |
| 🔵-9 | `index.js:29` | 用 `async_hooks` 而非更惯用的 `node:async_hooks` | 统一 `node:` 前缀（同文件其他 import 已用 `node:crypto` 风格） |

---

## 六、已确认无问题清单（检查过但确认正常，勿重复排查）

### 安全设计（**实测全部正确**，`auth-security-probe.mjs` 共 47 项断言）

| 检查项 | 结果 |
| ------ | ---- |
| HMAC 签名可正常签发/验证、`accessCount` 正确往返 | ✅ |
| 篡改签名段 / 篡改 payload / 空签名（`alg:none` 式）/ 无点分隔 / 空值 / 非字符串 | ✅ 全部返回 `null` |
| 等长但错误的 **合法 hex** 签名 → 安全拒绝且不抛 | ✅（🔴-1 仅命中非法 hex 分支） |
| 签名长度不等时不进 `timingSafeEqual` 的常规路径 | ✅ |
| `accountKeyForUid` 确定性 / 不同 uid 不同 / 形如 `k_<16hex>` / 空 uid 抛 `INVALID_PARAM` | ✅ |
| `SID` `httpOnly=true`、`sameSite` 默认 `lax` | ✅ |
| `SID_R` `path` 收窄至 `/auth/v1/refresh-session`、`sameSite` 默认 `strict` | ✅ |
| `DEVICE` `httpOnly=true` | ✅ |
| 设备 ID 自校验通过、伪造平台段拒绝、未来时间戳（超容差）拒绝、超长/空/非字符串拒绝 | ✅ |
| 平台不匹配（ID 声称 IOS 但 UA 为 web）仅告警不拒绝 | ✅ 有意设计 |
| `parseDeviceId` 对非法/非字符串返回 `null` | ✅ |
| 高风险操作判定：GET/HEAD/OPTIONS 非高风险、POST 高风险、小写 method 正确识别、无 method 按 GET | ✅ |
| 风险豁免路径 7 条生效，含带 query、含子路径；**形近名前缀 `/auth/v1/logout-evil` 不误豁免** | ✅ |
| 密码策略：弱密码拒、合规通过、129 字符拒、空/非字符串拒 | ✅ |
| TOTP：6 位数字、当前码通过、错码拒绝、前 1 窗口容错、窗口外拒绝、URI 格式正确 | ✅ |
| `origin-guard` 开发环境放行 / 生产 `fail-closed`（未配白名单拒绝） | ✅ 设计正确 |

### 有意设计（AUDIT-PROMPT §2 已声明，不作为缺陷）

| 检查项 | 结果 |
| ------ | ---- |
| `framework/log` 不反向依赖 `auth`，改用 `setLogContextProvider` 注入 `requestId`/`userId` | ✅ 避免循环依赖，设计正确 |
| `AsyncLocalStorage` 在非请求场景返回 `undefined` → 不打 `requestId` | ✅ 正常 |
| `JWT_ENABLED` 等环境开关关闭时分支不执行 | ✅ |
| `StpUtil` 沿用 sa-token 术语体系（非拼写错误） | ✅ |
| 多令牌/多端并存（`multiDevice`）不互踢 | ✅ 有意行为 |
| `session.js` 对 `device_id` 三级兜底恢复（header → cookie → 登录链） | ✅ 设计完备，`getDeviceId` 优先级注释与实现一致 |
| `refreshSessionCore` 的 refreshToken 轮转 + family 盗用检测 + `rotatedStore` 一次性标记 | ✅ 三源 `familyId` 兜底逻辑与注释一致 |
| 全局 superadmin 自动获得 `{appId}_admin` | ✅ `permission-loader.js:103-114` 实现正确 |

### 工程质量

| 检查项 | 结果 |
| ------ | ---- |
| 14 个文件**全部**有文件头块注释，**全部**含 `@author` + `@since`（`@since` 多版本演进记录最多 5 条） | ✅ 优于项目平均水平 |
| `npx eslint src/framework/auth/` | ✅ **0 警告**（exit 0） |
| auth 相关测试套件 | ✅ **10 suites / 137 tests 全部通过** |
| 依赖图分层清晰，8 个文件零内部依赖构成稳定基础层 | ✅ 除 🟡-1 一处外无环 |
| `index.js` 导出的 `getCtx`/`getDb`/`getServerResource`/`requestContext` 与注释一致 | ✅ 实测 `typeof === 'function'`，且当前无外部调用方（属预留 API，非死代码） |
| `session.js` 的 `checkMaxSessions`/`pruneActiveDevices`/`pruneStaleSessionTokens` 治理逻辑（防 device-id 膨胀、过期会话回收） | ✅ 注释与实现一致，裁剪策略（按 `last_active` 升序删最旧）正确 |
| `getModel` 未命中会抛 `TypeError`（非静默 null） | ✅ 已实测确认，调用方应知晓此契约 |
| 参数防御（`INVALID_PARAM`）覆盖 `signCookie`/`getDeviceId`/`computeDeviceFingerprint`/`validateDeviceId`/`clearAccountLock`/`clearIpLock`/`accountKeyForUid` 等公共 API | ✅ 完备 |

---

## 七、优先级排序（按 危害 / 修复成本）

| 顺序 | 编号 | 问题 | 危害 | 修复成本 | 说明 |
| ---- | ---- | ---- | ---- | -------- | ---- |
| **1** | 🔴-1 | `verifyCookie` 守卫比错长度 → 构造 cookie 打崩认证钩子 | 高（DoS + 坏 cookie 永不清除） | **极低**（改 2 行 + 加 1 条测试） | 用户可控输入直达，**最高性价比** |
| **2** | 🔴-2 | `sidHash` 未导出却被解构 → 注销清理必抛 | 高（注销残留会话） | **极低**（export 加 1 行） | 1 行修复 |
| **3** | 🔴-3 | `userSessions` 命名空间错位 → 清理静默零次执行 | 高（同 🔴-2，且无日志） | **极低**（改 1 处字符串） | 两者叠加使注销清理双重失效，建议同批修 |
| **4** | 🟡-5 | 4 套测试用副本实现 → 🔴-1 未被发现 | 中（测试失去防护能力） | 低（改 import + 补用例） | 修完 🔴-1 立即做，防止回归 |
| **5** | 🟡-1 | `index ↔ StpUtil` 循环依赖 + 职责倒挂 | 中（加载副作用、脆弱） | 低（抽 `request-context.js`） | 与 🔴-2 同属 `session.js` 契约问题，可同批 |
| **6** | 🟡-3 | `totp.js` 零引用 | 中（认知负债） | 低（补测试或标记） | 需用户决策是否启用 |
| **7** | 🟡-2 | `err.message` 做控制流 | 中低 | 极低（补 `err.code`） | 孤例，随其他修复顺手做 |
| **8** | 🟡-4 | `getSessionStats` 静默吞异常 | 中低 | 极低（加 1 行 log） | 与 `wb-logkit` 0.5.0「故障不静默」对齐 |
| **9** | 🔴 前置 | `session.js` 拆分为 4 文件（§2.3） | —（可维护性） | **高**（1393 行重构 + 35 处 import 兼容） | 建议**前 8 项修完并验证通过后**再动，避免重构与修复混在一个批次 |
| 10+ | 🔵-1..9 | 命名/注释/重复/死导出 | 低 | 低 | 可随拆分一并处理 |

**建议的执行批次**：

- **批次 A（建议立即，4 处小改动）**：🔴-1 + 🔴-2 + 🔴-3 + 🟡-5。三处严重问题合计改动 **< 10 行**，却是全部问题中危害最高、成本最低的。修完必须补测试并跑 `npx eslint`（0 警告）+ 全量测试。
- **批次 B（清理类）**：🟡-1 + 🟡-2 + 🟡-4 + 🔵-9。
- **批次 C（可维护性）**：`session.js` 拆分 + 🟡-3 决策 + 其余 🔵。
- **批次 D（可选优化）**：🔵-6 + 🔵-7 + 🔵-8。

---

## 八、审查者自检

```
[x] 已完整读取所有 14 个文件（非只读片段）—— session.js 1393 行全文已读
[x] 已用依赖图脚本确认循环依赖（index.js -> StpUtil.js -> index.js，已脚本输出）
[x] 已实测签名/令牌校验的边界行为（47 项断言 + 5 类构造输入注入）
[x] 已核对 index.js 导出与内部实现一致（23 项 export 与运行时 Object.keys 比对）
[x] 已区分「有意设计」与「缺陷」（§6 列 9 项有意设计）
[x] 每个问题都有 文件:行号 + 实测证据（无"我觉得"）
[x] 已给出可执行的拆分方案（4 文件 + 函数级迁移表 + 兼容策略）
[x] 已输出「已确认无问题清单」（安全设计 16 项 + 有意设计 8 项 + 工程质量 7 项）
[x] 未使用无依据的模糊表述（"可能/也许"均替换为实测结论，仅 🔵-6 标注了实际风险评级）
[x] 未修改任何产品代码（仅创建临时探针脚本于系统临时目录，审查结束后清理）
```

---

## 附：本次审查的实测脚本

| 脚本 | 用途 | 关键输出 |
| ---- | ---- | -------- |
| `depcheck.mjs` | 依赖图 + 环检测 + 入度统计 | 确认 `index ↔ StpUtil` 有环 |
| `cycle-check.mjs` | 循环依赖运行时验证 | ESM 下暂不崩，但脆弱 |
| `stputil-sideeffect.mjs` | StpUtil 连带副作用 | 导入工具类拉全链 |
| `auth-security-probe.mjs` | 安全边界 47 项断言 | 🔴-1 首次暴露 |
| `verifycookie-crash.mjs` | `verifyCookie` 崩溃复现 | 5/7 构造输入抛异常 |
| `reachability.mjs` | 端到端可达性 | 坏 cookie 未被清除 |
| `auth-misc-probe.mjs` | 其余边界 17 项 | 全 PASS |
| `store-isolation2.mjs` | 命名空间隔离 | 🔴-3 确认 |
