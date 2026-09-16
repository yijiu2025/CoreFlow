# 测试内联副本 vs 真身差异核对报告

> 核对日期：2026-09-16
> 背景：全仓测试有效性排查中发现一批测试**内联复制了被测逻辑**（而非 import 真身）。
> 副本与真身可能已经漂移，而测试断言的是**副本**的行为 —— 即「测试通过 ≠ 真身正确」。
> 方法：逐行对照副本实现与真身实现，记录语义差异。

## 结论摘要

核对 3 个含内联副本的测试文件，**3 个全部与真身存在实质差异**，其中 1 个连核心算法都不同。

| 测试文件 | 副本内容 | 真身位置 | 差异数 | 严重度 |
| -------- | -------- | -------- | ------ | ------ |
| `integration/signature.test.js` | `verifySignature` | `framework/auth/signature.js` | 5 | 🔴 高（签名算法不同） |
| `rate-limiter.test.js` | `memorySlidingWindow` 等 | `app/firewall/util/redis.js` | 4 | 🟡 中（签名/语义不同） |
| `integration/app.test.js` | `reply.result` 装饰器 | `framework/loader/registry/00-globals.js` | 2+ | 🟡 中（方法集不全） |

**共同结论**：内联副本不是「真身的简化版」，而是**独立演化的另一份实现**。它们固化了与真身相反的结论，属于比「零覆盖」更危险的情况 —— 零覆盖只是没测到，漂移副本会**给出错误的通过信号**。

---

## 一、`integration/signature.test.js`（🔴 高）

副本：`src/__tests__/integration/signature.test.js:56` 起的 `verifySignature`
真身：`src/framework/auth/signature.js:13`

### 差异 1：签名串因子不同（核心算法）

```js
// 副本（5 元组，无 SIGN_APP_KEY、无 query 参数）
const signString = `${h5TokenMd5}&${timestamp}&${nonce}&${url}&${bodyStr}`;

// 真身（7 元组，含 APP_KEY 与序列化后的 query）
const appKey = process.env.SIGN_APP_KEY || '';
const paramsStr = serializeQueryForSign(request.query, ['x-sign', 'x-timestamp', 'x-nonce', 'x-device-id']);
const signString = `${h5TokenMd5}&${appKey}&${timestamp}&${nonce}&${url}&${paramsStr}&${bodyStr}`;
```

**影响**：副本测的是**一个不存在的签名方案**。任何按真身算法构造的请求，在副本里都会验签失败
—— 反之亦然。该文件里所有「签名正确 → 放行」的断言，与生产行为无任何对应关系。

### 差异 2：缺少 `requireSignature` 准入门槛

真身第 1 步即判断 `if (!request.routeConfig?.requireSignature) return;`（非签名路由直接放行）。
副本无此判断，对所有请求都执行验签。

**影响**：真实系统里「公开路由不会被签名校验拦截」这一关键行为，副本完全没有表达。

### 差异 3：签名参数来源不同

真身：`request.headers['x-sign'] || request.query?['x-sign']`（**header 或 query 双通道**）。
副本：仅 `request.headers['x-sign']`。

**影响**：真身支持的 URL query 签名方式（大厂兼容）在副本里不存在。

### 差异 4：缺少 query 序列化函数

真身有 `serializeQueryForSign()`：按 key 字典序排序、`encodeURIComponent`、排除签名自身字段。
副本无此函数，query 完全不参与验签。

### 差异 5：签名比较方式不同

```js
// 副本：普通字符串比较
if (serverSign !== sign) { ... }

// 真身：长度归一化 + 恒定时间比较
const serverBuf = Buffer.from(serverSign, 'hex');
const clientBuf = Buffer.from(String(sign), 'hex');
if (clientBuf.length !== serverBuf.length || !crypto.timingSafeEqual(clientBuf, serverBuf)) { ... }
```

**影响**：真身这里正是 **AUDIT-REPORT 🔴-1 修复的现场**（非法 hex 静默截断成空 Buffer →
`timingSafeEqual` 抛 `RangeError`）。副本用 `!==` 比较，**完全掩盖了这个缺陷类**：
真身的类型/长度守卫（本仓高频缺陷类）在副本里一行都没有，因此它的测试永远不会覆盖这些路径。

### 差异 6（附带）：错误响应体字段不同

真身失败响应含 `error: 'signature_mismatch'` 等机器可读字段；副本的 `signature_mismatch` 分支
缺 `error` 字段（其余分支有，唯独最后这个没有）。

---

## 二、`rate-limiter.test.js`（🟡 中）

副本：`trackRequestCount` / `memorySlidingWindow`
真身：`src/app/firewall/util/redis.js:876` `consumeRateWindowInMemory`

### 差异 1：函数签名与语义不同

```js
// 副本：内部取 now，返回「是否超限」布尔
function memorySlidingWindow(actorId, limit, windowSec) {
  const count = trackRequestCount(actorId, windowSec * 1000);
  return count > limit;
}

// 真身：now 由外部传入，返回「窗口内计数」
function consumeRateWindowInMemory(keyRel, windowMs, now) {
  ...
  return list.length;
}
```

**影响**：真身把 `now` 设为参数是为了**可测试且可确定**（对照后文 `sweepMemory` 与限流决策）。
副本内部调 `Date.now()`，使时间不可控 —— 它测不出「窗口边界」这类真实 bug。

### 差异 2：缺少 `sweepMemory()`

真身每次调用先 `sweepMemory()` 清理过期键（防内存无界增长）；副本无任何全局清理，
仅有测试内的 `ipRequestTimestamps.clear()`（那是测试卫生，不是产品行为）。

**影响**：真身的「防止 Map 无限膨胀」这一关键资源保护，副本没有表达也没有覆盖。

### 差异 3：键的语义不同

副本：裸 IP（`'10.0.0.1'`）作为键。
真身：`keyRel` 是**相对键**（带命名空间前缀，由 `rel` 生成），最终经 `full()` 补全。

**影响**：真身的命名空间隔离（本仓曾因命名空间不匹配导致「注销清理静默零执行」）在副本里不可见。

### 差异 4：数据结构管理方式不同

副本：模块级 `Map` 独立存在。
真身：`mem.windows` 是统一的 `mem` 对象字段之一（与其它内存态共管、统一清扫）。

---

## 三、`integration/app.test.js`（🟡 中）

副本：`buildTestApp()` 内的 `app.decorateReply('result', {...})`
真身：`src/framework/loader/registry/00-globals.js:28`

### 差异 1：`fail()` 签名不同

```js
// 副本：三参，第三参叫 code
fail(message = '操作失败', data = null, code = 400)

// 真身：四参，含独立的 bizCode
fail(message = '操作失败', data = null, httpCode = 400, bizCode = null)
//     并交给 build() → code: bizCode ?? httpCode
```

**影响**：真身支持「HTTP 状态码」与「业务码」分离（`bizCode ?? httpCode`）。
副本只有单一 code，**业务码机制完全未覆盖**。

### 差异 2：方法集不全

真身提供 12 个方法：`success` / `fail` / `created` / `noContent` / `badRequest` / `unauth` /
`forbidden` / `notFound` / `conflict` / `tooManyRequests` / `internalError` / `paginated`。
副本仅提供 `success` / `fail` / `unauth`（+ 部分）。

**影响**：`paginated`（分页响应结构 `pagination.totalPages` 计算）等高价值逻辑无覆盖。

### 差异 3：`build()` 的 `bizCode` 合并逻辑缺失

真身：`code: bizCode ?? httpCode`（业务码优先于 HTTP 码）。
副本：`code` 直接等于传入的 `code`。

---

## 四、处置建议

统一方向：**改为 import 真身**，而非继续维护副本。

| 文件 | 建议 | 可行性 |
| ---- | ---- | ------ |
| `integration/signature.test.js` | 改为 import 真身 `verifySignature`，注入 `request.routeConfig.requireSignature = true`，mock `getStore('h5_token')`。**注意**：真身依赖 `SIGN_APP_KEY` 与 `getStore`，需在测试内设定。改造后应能覆盖 🔴-1 的长度守卫分支 | 中（需 mock Redis store） |
| `rate-limiter.test.js` | 改为 import `consumeRateWindowInMemory`。因真身接收 `now`，测试可**确定性地**验证窗口边界（比副本更强） | 高（纯函数、无外部依赖） |
| `integration/app.test.js` | 改为 import 真实 `globalsLoader`（包 `fastify-plugin`）。可参考本仓 `api-routes.test.js` 的做法 | 高（已验证可行） |

**优先级建议**：`signature.test.js` 最先 —— 它的副本与真身算法不同，且掩盖了 🔴-1 修复的现场，
风险最高。`rate-limiter.test.js` 次之（改造收益最大，可测确定性边界）。

## 五、参考

已完成的改造范例：`src/__tests__/api-routes.test.js`（2026-09-16）
- 改造前：18 项手写常量断言，零 import，毒丸实验下全绿
- 改造后：16 项真实 Fastify + inject 驱动，毒丸实验下**必红**（已实测验证）
- 防复发守卫：`src/__tests__/conventions/test-effectiveness.test.js`
