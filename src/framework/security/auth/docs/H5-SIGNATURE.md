# H5 接口签名（security/signature.js）设计与客户端接入

> 机制全貌 + 非 cookie 客户端（小程序 / API 直连）接入指南。
> 代码：`src/framework/security/auth/security/signature.js`；测试：`src/__tests__/integration/signature.test.js`（真身驱动）。
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
  Redis  h5_token:{h5TokenMd5} → {v,d,u,ts}       TTL 3600s   （2026-11-10 不再存 rawToken）
  Redis  h5_dev:{sha256(x-device-id|ip)} → {md5,exp} TTL 3600s（设备指针，幂等用）
  下发：cookie _m_h5_tk = "{md5}_{expireAt}"      （httpOnly:false，前端 JS 需读取参与签名）
        响应头 x-h5-tk = "{md5}_{expireAt}"       （非 cookie 客户端通道，见第二节）
```

**值不再是 rawToken**：验签拼的是 md5，rawToken 从不参与任何计算，存它等于白占 48 字节。
现在存 `{ v: 版本, d: 设备指针, u: 归属 uid, ts: 签发时间 }` —— 体积减半，且第一次有了
"这个键属于谁"，可以按 uid 清理、按设备统计。

客户端签名所用的"会话密钥"就是 **h5TokenMd5**（cookie/头的 `_` 前段）。

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

### 引导规则（2026-11-10 修订：未登录不签发）

| 场景 | GET/HEAD | 写方法（POST/PUT/DELETE/PATCH） |
|------|----------|--------------------------------|
| **未登录** | 放行，**不签发** | 403 `login_required`，**不签发** |
| 已登录、无 token | 签发/复用 + 放行一次 | 签发/复用 + 403 `token_required`，handler 不执行 |
| 已登录、超签发限频（20 次/分/IP） | 放行 | 429 `too_many_requests` |

- 🔴 **未登录不再签发 token、不写任何键**。未登录的 `h5_token:*` 不承载身份，1h 后自然消失，
  却随请求量线性堆积（2026-11-10 实测：oauth21 每次页面加载都预取 `h5-token`，一个用户
  一小时几十个键）。未登录的访问控制本来就由登录守卫（401）+ 端点限频承担。
- 未登录写方法返回 **`login_required`** 而不是 `token_required`：后者会引导客户端"拿 token
  重试"，而匿名请求根本拿不到 token —— 那是死循环。
- **登录接口不受影响**：`/oauth2.1/login`、`/mini-login` 没有 `requireSignature`，
  `verifySignature` 第一步就返回了。用户的限制只落在"需要签名的路由"上。
- 已登录的写方法引导-重试闭环不变：从 403 响应拿到 token（cookie 或 `x-h5-tk` 响应头）→
  存储 → **同请求签名重试** → 200。
- 设计动机：引导放行若不限方法，攻击者"每次请求都不回传 token"（curl 天然如此）即可
  永久免签名打**写接口**（2026-11-01 深度检查确认，已修复）。
- 前端注意：若某页面的**第一个**签名 API 是 POST（且无先行 GET），会收到一次
  `token_required` —— 拦截器识别该错误码，存 token 后重试一次即可。

### 键的治理（键数 = 在线客户端数，不是签发次数）

四条一起才成立，缺一条都会回到"按请求量线性增长"：

| 措施 | 作用 |
|------|------|
| 未登录不签发 | 匿名流量零键 |
| **设备维度幂等**（`h5_dev` 指针） | 同一 `x-device-id`（退化到 IP）重复引导复用同一 token，不新增键 |
| **活跃续期**（剩余有效期过半时 `EXPIRE` + 重发 cookie） | 活跃设备永不重新引导；续期必须同时改 cookie `maxAge`，否则出现"cookie 还活着但 exp 已过"的 403 死循环 |
| 签发限频（20 次/分/IP） | 兜住匿名/已登录两条路径的写放大；存储故障时放行，不因限频器把业务打挂 |

排查命令：

```bash
redis-cli --scan --pattern 'h5_token:*' | wc -l   # 期望 ≈ 在线客户端数
redis-cli --scan --pattern 'h5_dev:*'   | wc -l   # 应与之同量级
redis-cli --scan --pattern 'h5_nonce:*' | wc -l   # 每成功请求一个、TTL 180s，量大属正常
```

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
   ⚠️ 2026-11-10 起**必须已登录**才会拿到 token；未登录 GET 仍 200 但没有 `x-h5-tk`，
      POST 返回 403 `login_required`（先完成登录再走签名，登录接口本身不要求签名）
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

### 🔴 执行者与作用域（2026-11-10 校正）

`requireSignature: true` **只有写在 `/oauth2.1` 作用域内才会被校验**。原因：

- 生产只有一个执行入口：oauth21 的全局 `preHandler`（`initOAuthMiddleware`，经 `rootPlugins`
  挂根作用域），它自带前缀闸门；
- 每个路由的 `preHandler` 是 `createGuard`，**不调用** `verifySignature`；
- 因此写在别的域里既不会生效、也不会报错 —— 是"看起来有防护"的死配置。

**已清理**：`src/api/user/v1/open.js` 的 5 处（注册 / 校验邮箱 / 两种重置密码 / 发重置链接）。
它们都是**未登录**端点，而 H5 token 现在只在登录后签发 —— 这两件事放在一起本来就不自洽，
接上执行者只会把注册打死。这些端点的实际防护是：人机验证（可配）+ 邮箱验证码 +
端点级 IP 限频（5/10/3/5 次/分）。

**为什么不让 guard 全局接上**：`requireLogin` 会自动把 `requireSignature` 置 true，
而实现签名拦截器的前端目前只有 oauth21 自己 —— 全局接线会让 firewall / posecraft /
retroweb / admin 的登录态请求全部 403（见 `app/oauth21/middleware/auth.middleware.js` 头注释）。

**防复发**：
- 运行时：`registerSecureRoute` 对"显式声明 requireSignature 但落在 `/oauth2.1` 之外"
  在启动时打 warn（`api.guard`，同 URL 只报一次，不阻断启动）；
- 测试：`src/__tests__/conventions/require-signature-executor.test.js` 用 AST 扫
  `src/api/**`，非 oauth21 目录里出现该声明即红（注释里提到不算）。

**若将来要恢复公开端点的签名**：不能直接接执行者，得先做"匿名签名"（无 h5 token 时用
`SIGN_APP_KEY` 单因子 + nonce），且前端 oauth21 必须在同一批次发布 —— 属破坏性变更。

### ✅ 引导绕过（已修复：引导放行收口为 GET/HEAD）

原问题：无 token 的请求一律"引导 + 放行"，攻击者永不上交 token 即可免签名打**写接口**。

修复（方案 A）：引导放行仅限 GET/HEAD；写方法下发 token + 403 `token_required`、
handler 不执行，客户端签名后重试（见第一节"引导规则"）。同时把"有签名参数但无 token"
的分支一并收口——修复前假签名头 + 无 cookie 同样能换来执行权，比"无签名参数"分支更易利用。

- 残留（有意保留）：GET/HEAD 路由首次请求仍引导放行（浏览器首访兼容，只读 + 限频）。
- 缓解史：requireSignature 路由（/register 等公开端点）均配端点级限频。

### ✅ 键数按请求量膨胀（2026-11-10 已修复）

现象：Redis 里 `h5_token:*` 一个人一小时几十个，值恒为 48 字符 hex。

成因（两条叠加，都不是"写错了"，而是缺了幂等）：

1. `issueH5Token` 每次都 `randomBytes` → 新键，没有任何复用；键数 ≈ 签发次数 × 3600s；
2. 前端 `bootstrap.ts` **每次页面加载**无条件预取 `/auth/v1/h5-token`（哪怕 cookie 已存在），
   未登录也照发。

修复：未登录不签发 + 设备指针幂等 + 活跃续期 + 签发限频（见第一节"键的治理"），
前端改为"只在缺 `_m_h5_tk` cookie 时预取"。

**安全权衡（显式记录）**：未登录请求不再有签名校验，等价于把"匿名写放大"换成"匿名可读 +
IP 限频"。这是有意的 —— H5 签名的定位是提高爬取成本，而给每个匿名请求发一份凭证恰好
达不到这个目的；未登录的写操作仍由登录守卫（401）拦截，公开端点仍由各自的
`config.rateLimit` 兜住。若将来要恢复"匿名也签名"，必须先解决幂等，否则键数立刻回到
按请求量增长。

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
11. **未登录不签发**（2026-11-10）：GET 无 token → 200 且无 cookie/无 `x-h5-tk`；
    连打 5 次后 `h5_token` 命名空间条目数不变；POST 无 token → 403 `login_required`。
12. **设备维度幂等**：同一 `x-device-id` 两次引导 → 同一 md5 且不新增键；
    不同 device id → 不同 token；存储值是 `{ v, d, u, ts }` 而不是裸 rawToken。
