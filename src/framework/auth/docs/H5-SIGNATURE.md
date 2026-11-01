# H5 接口签名（security/signature.js）设计与客户端接入

> 机制全貌 + 非 cookie 客户端（小程序 / API 直连）接入指南。
> 代码：`src/framework/auth/security/signature.js`；测试：`src/__tests__/integration/signature.test.js`（真身驱动）。
>
> @author yijiu2025
> @since 2026-11-01

---

## 一、机制全貌

### 适用范围

- 路由声明 `routeConfig.requireSignature: true` 才校验（`registerSecureRoute` 写入 config）。
- oauth21 应用由 `initOAuthMiddleware` 全局挂载 `verifySignature`（经 `rootPlugins` 注册进根作用域，
  见 DB-QUERIES-PER-REQUEST.md 第五节的历史问题存档）；未声明该字段的请求直接跳过，也不下发 token。

### token 生命周期

```
issueH5Token：
  rawToken = randomBytes(24).hex                  （24 字节随机）
  h5TokenMd5 = sha256(rawToken).hex               （名字沿用历史，实为 sha256）
  Redis  h5_token:{h5TokenMd5} → rawToken         TTL 3600s
  下发：cookie _m_h5_tk = "{md5}_{expireAt}"      （httpOnly:false，前端 JS 需读取参与签名）
        响应头 x-h5-tk = "{md5}_{expireAt}"       （非 cookie 客户端通道，见第二节）
```

客户端签名所用的"会话密钥"就是 **h5TokenMd5**（cookie/头的 `_` 前段）；Redis 里的 rawToken
仅作存储，不参与验签拼接。

### 校验流程（verifySignature 六步）

1. 路由未声明 `requireSignature` → 直接放行；
2. 读取签名三参数（头为主、query 兜底）：`x-sign` / `x-timestamp` / `x-nonce`；
   **token 双通道读取：cookie `_m_h5_tk` → `x-h5-tk` 请求头**。
   无签名参数时：无 token → 引导（见下方"引导规则"）；已有 token → 403 `signature_required`；
3. 时间窗：`|now - timestamp| ≤ 120s`，越窗 403 `request_expired`；
4. 解析 token（`md5_expireAt`），本地过期 403 `token_expired`；
5. Redis 校验 token 存在性，不存在 403 `invalid_token`；
   随后 nonce 原子 check-and-mark（TTL 180s > 120s 时间窗），重放 403 `replay_detected`；
6. 重算签名并恒定时间比对：
   `signString = md5 & SIGN_APP_KEY & timestamp & nonce & url & paramsStr & bodyStr`，
   `url` = **具体请求路径**（`request.url` 去 query —— 前端签的是它实际请求的路径；
   Fastify 5 已移除 `request.routerPath`，且不能改用 `routeOptions.url`：那是 `/user/:id`
   模板形态，前端无从得知）；
   `paramsStr` = query 剔除 `x-sign/x-timestamp/x-nonce/x-device-id` 后按 key 字典序
   `encodeURIComponent(k)=encodeURIComponent(v)` 以 `&` 连接（与前端 serializeParamsForSign 逐字对齐）。

### 引导规则（2026-11-01 收口：仅 GET/HEAD 放行）

| 场景 | GET/HEAD | 写方法（POST/PUT/DELETE/PATCH） |
|------|----------|--------------------------------|
| 无 token（无论带不带签名参数） | 下发 token（cookie + `x-h5-tk` 头）并**放行一次** | 下发 token + **403 `token_required`，handler 不执行** |
| 有 token 但不签名 | — | — 403 `signature_required`（各方法一致） |

- 写方法的引导-重试闭环：客户端从 403 响应拿到 token（cookie 或 `x-h5-tk` 响应头）→
  存储 → **同请求签名重试** → 200。无需额外的 GET 引导调用。
- 设计动机：引导放行若不限方法，攻击者"每次请求都不回传 token"（curl 天然如此）即可
  永久免签名打**写接口**（2026-11-01 深度检查确认，已修复）。
- 残留暴露（有意保留）：GET/HEAD 路由的首次请求仍引导放行 —— 这是浏览器首访兼容
  （页面的第一个签名 API 通常是 GET，如 `/qr/generate`、`/check-email`）。GET 端点
  本身只读 + 配限频，风险可接受；若要彻底封死需改为"引导不执行 handler + 前端统一
  重试"契约，属破坏性变更，暂不做。
- 前端注意：若某页面的**第一个**签名 API 是 POST（且无先行 GET），会收到一次
  `token_required` —— 拦截器识别该错误码，存 token 后重试一次即可。

### 防重放三要素

| 要素 | 参数 | 说明 |
|------|------|------|
| 时间窗 | ±120s | 服务器与客户端时钟偏差容忍 |
| nonce | TTL 180s | Redis Lua 原子 check-and-mark，多实例安全；略大于时间窗保证全覆盖 |
| 双因子 | md5 + SIGN_APP_KEY | 会话密钥（每客户端不同）+ 全局常量，单钥泄露不即全破 |

⚠️ nonce 在**验签前**被消耗：签名算错后用同一 nonce 重试会判 `replay_detected`——
客户端每次请求必须生成新 nonce（这是标准做法，前端已如此）。

---

## 二、非 cookie 客户端接入（x-h5-tk 双通道，2026-11-01 新增）

### 背景

浏览器端 token 走 `_m_h5_tk` cookie 自动携带；但以下客户端不便（或不应）依赖 cookie：

- **微信小程序**：`wx.request` 不自动管理 cookie，手工维护 Set-Cookie 脆弱且易踩域名校验；
- **服务端 API 直连 / 开放 API**：无 cookie 语义，也不应共享浏览器的凭证通道。

### 实现

token 读取顺序：**cookie 优先 → `x-h5-tk` 请求头兜底**；引导（首次无 token 的请求）时
`issueH5Token` 同时以 **`x-h5-tk` 响应头**下发，值与 cookie 完全同构（`md5_expireAt`）。
两条通道的 token 形态、Redis 存储、验签逻辑完全一致，对服务端无状态分叉。

### 小程序客户端流程

```
1. 调用任意 requireSignature 路由（推荐首个业务调用前先发一次 GET 引导，
   如 GET /qr/generate；或直接发业务请求）
   → GET：200 + 响应头 x-h5-tk；POST：403 token_required + 响应头 x-h5-tk
2. 从响应头取 token 值（md5_expireAt），存入 wx.setStorageSync
3. 后续请求带四个头：
   x-h5-tk:     存储的完整值
   x-timestamp: Date.now()
   x-nonce:     每次新生成（uuid）
   x-sign:      sha256(`${md5}&${SIGN_APP_KEY}&${timestamp}&${nonce}&${路径}&${query串}&${body串}`)
4. 收到 403 token_expired / invalid_token / token_required → 清除存储（或更新为
   本次下发的 token），重新引导后重试
```

### 安全性说明

- 与 cookie 通道**等价**：cookie 本就是 `httpOnly:false`（前端 JS 必须能读它参与签名），
  XSS 面相同；header 方式反而没有 CSRF 面（浏览器不会自动附带）。
- `SIGN_APP_KEY` 是前后端共享常量，防的是爬虫脚本拼接成本，不是机密——真正的访问控制
  仍由登录态（Session/Bearer）与限频承担。
- 服务端间调用（B2B/开放 API）**不要**走 H5 签名：为对端签发长期 API key 或 Bearer token，
  配独立限频与 scope；H5 签名的定位是"公开端点的防爬/防篡改成本"，不是身份认证。

### 与 origin-guard 的边界（小程序注意）

`origin-guard.js`（一次性凭证消费等敏感端点的来源白名单）生产环境 **fail-closed**：
无 Origin 且无 Referer 的请求（小程序 `wx.request` 正是如此）一律拒绝。因此：

- 小程序直连**敏感端点**（如 bind-session 类一次性凭证消费）会被拒——这类流程应经
  自有后端代理（服务端间调用），或待登录态建立后走 Bearer；
- H5 签名路由不经过 origin-guard，`x-h5-tk` 通道不受影响。

---

## 三、已知问题与决策项（2026-11-01 深度检查）

### ✅ 引导绕过（已修复：引导放行收口为 GET/HEAD）

原问题：无 token 的请求一律"引导 + 放行"，攻击者永不上交 token 即可免签名打**写接口**。

修复（方案 A）：引导放行仅限 GET/HEAD；写方法下发 token + 403 `token_required`、
handler 不执行，客户端签名后重试（见第一节"引导规则"）。同时把"有签名参数但无 token"
的分支一并收口——修复前假签名头 + 无 cookie 同样能换来执行权，比"无签名参数"分支更易利用。

- 残留（有意保留）：GET/HEAD 路由首次请求仍引导放行（浏览器首访兼容，只读 + 限频）。
- 缓解史：requireSignature 路由（/register 等公开端点）均配端点级限频。

### 其他次要项

- nonce 消耗先于验签（见第一节 ⚠️，客户端规范已覆盖）；
- token 引导响应同时下发 cookie + 响应头，浏览器端多一个无害响应头。

---

## 四、测试覆盖（integration/signature.test.js）

1. 引导：无签名无 token（GET）→ 放行一次 + 下发 cookie；
2. 带 token 不签名 → 403 `signature_required`；
3. 签名对/错、非法 hex（恒定时间比较长度守卫）；
4. nonce 重放 → 403 `replay_detected`；
5. query 参与验签（改参数失配）；
6. 时间窗越界 / 非数字时间戳；
7. 伪造 token / 过期 token；
8. 未声明 requireSignature 的路由零影响；
9. **非 cookie 双通道**：`x-h5-tk` 响应头下发 → 请求头回传签名 200；带头不签名 403；伪造 403；
10. **引导收口**：POST 无 token → 403 `token_required` + 下发 token、handler 不执行；
    假签名头换不来执行权；凭下发 token 签名重试 → 200；GET 带签名无 token 仍引导放行。
