# 设备 ID / 设备指纹全链路梳理

> 整理前后端所有项目的设备标识生成、存储、传递、消费链路，并指出存在的问题。
> 范围：后端 `src/` + 前端 `oauth21/`、`posecraft/`、`firewall/`、`admin/`、`poseadmin/`、`phonecopy/`（六端全覆盖，接入状态见 §2.2）。
> 最近更新：2026-09-03（补齐 admin/poseadmin/phonecopy 覆盖 + 扩充问题清单）。

---

## 0. 概念区分

| 名称 | 性质 | 绑定 | 格式 | 用途 |
|---|---|---|---|---|
| **device_id** | 设备级稳定标识 | 跨账号共用（同设备登录 A/B 用同一个） | 结构化 `WEB-DaBOSbNdSuc-8s4T`（平台-11字符加密时间戳-随机后缀） | 设备识别、session_tokens 幂等键、风险基准定位 |
| **deviceFingerprint** | 复合哈希 | 绑定"设备+账号"（换设备或换账号都会变） | `sha256(device_id｜uid｜UA｜platformHint)` 前 32 位 | 风险检测基准，突变 → 账号被盗/换设备 |
| **x-device-fp**（前端 canvas/WebGL 指纹） | 浏览器特征哈希 | 绑定浏览器实例 | `sha256(canvas｜webgl)` 前 32 位 | 增强 consentKey/验证码的客户端绑定，**默认不启用**（`VITE_DEVICE_FINGERPRINT=true` 才开） |

后端定义见 [device.js:148-163](src/framework/auth/device.js#L148-L163)。

### 0.1 易混淆概念（与设备 ID 体系无关）

| 名称 | 实际是什么 | 位置 |
|---|---|---|
| 防火墙请求指纹 | `sha256(ip｜ua｜lang｜enc)` 前 16 位，用于**精准封禁**的独立实现，不进 session_tokens | [src/app/firewall/util/fingerprint.js](src/app/firewall/util/fingerprint.js) |
| OAuth Device Authorization Grant | device_code 授权流（电视/无浏览器设备登录），是"设备授权协议"不是"设备ID" | [src/app/oauth21/services/device.service.js](src/app/oauth21/services/device.service.js) |
| 路由元信息 `device?: 'mobile'\|'desktop'\|'all'` | 页面端型适配标记（移动/桌面布局路由），与设备标识无关 | [oauth21/src/router/index.ts:17](oauth21/src/router/index.ts#L17) |

---

## 1. 后端链路

### 1.1 生成点

| 位置 | 函数 | 说明 |
|---|---|---|
| [device-id-service.js:150](src/framework/auth/device-id-service.js#L150) | `generateServerSideDeviceId(UA)` | 后端兜底生成：`detectPlatform(UA)` + `encodeTimestamp(now)` + `base62随机6位` |
| [device-id-service.js:119](src/framework/auth/device-id-service.js#L119) | `verifyAndNormalizeDeviceId(id, UA)` | 验证前端传的 ID 格式/有效性，无效则 `shouldReplace=true` 并重生（触发条件：格式不符、时间戳段超 365 天） |
| [device.js:78](src/framework/auth/device.js#L78) | `getDeviceId(request)` | 读取总入口，优先级：`x-device-id` 头 → `device_id` cookie → 服务端兜底 |
| [device.js:113](src/framework/auth/device.js#L113) | `getDeviceIdAndWrapResponse(request, reply)` | 登录时调：`getDeviceId` + 写 `X-Device-Id` 响应头 + 写 `device_id` cookie（统一 `COOKIE_OPTIONS.DEVICE`） + 首次设 `X-Device-Id-Updated` 头 |
| [device.js:160](src/framework/auth/device.js#L160) | `computeDeviceFingerprint({deviceId,ua,uid,platformHint})` | 计算复合指纹（非 device_id） |

### 1.2 存储点

**Cookie（名 `device_id`，统一选项）**

[device.js:126](src/framework/auth/device.js#L126) `getDeviceIdAndWrapResponse` 和 [session-api.service.js:123](src/framework/auth/session-api.service.js#L123) `bindSessionToCookie` **都**用 [cookie.js:172 `COOKIE_OPTIONS.DEVICE`](src/framework/auth/cookie.js#L172)：
- `httpOnly: true`（前端 JS 不可读，靠 `x-device-id` 头 + localStorage 持久化）
- `secure: process.env.NODE_ENV === 'production'`
- `sameSite: 'lax'`
- `maxAge: 10 年`

> 改造前登录主路径用内联选项（httpOnly:false / secure 硬编码 false / 1 年），与 bind-session 不一致，**已统一修复**。

**Redis session（store 名 `session`，TTL = rememberMe?30d:30min）**
- [session.js:299](src/framework/auth/session.js#L299) `createSession` 写入 `deviceId` + `deviceFingerprint`。
- [session.js:584-595](src/framework/auth/session.js#L584) DB 降级重建时从 `session_tokens` 表查最新 `device_fingerprint` 补进 sessionData（**已修复**，改造前丢失指纹导致风险检测降级）。
- [session.js:1079](src/framework/auth/session.js#L1079) `updateSessionBaseline`：人机验证通过后把新 deviceId/fingerprint/ip/UA 刷回 Redis + DB。

**Redis 临时 session_token（store 名 `session_token`，TTL 300s）**
- [token-issuer.service.js:197](src/app/oauth21/services/token-issuer.service.js#L197) Session 模式登录存入 deviceId/deviceType/UA，供父窗口 bind-session 消费。

**DB `session_tokens` 表（[SessionToken.js](src/models/session/SessionToken.js)）**
- 字段：`device_id`（跨账号稳定设备码）、`device_fingerprint`（复合指纹）、`token`=sha256(sessionId)、`ip`、`user_agent`、`last_active`、`revoked`。
- 索引：`device_id`、`[user_id,app_id,device_id]`（多端互踢高频查询）。
- [session.js:364-417](src/framework/auth/session.js#L364) 写入：`deviceId` 存在时按 `user_id+device_id` findOrCreate/upsert（**设备幂等**，同设备只一条行）。
- 迁移：[20260527000005](migrations/session/20260527000005-create-session-tables.js)（建表+索引）、[20260824000002](migrations/session/20260824000002-session-tokens-add-fingerprint.js)（补 fingerprint 列+索引）。

### 1.3 传递通道（前端 → 后端）

| 通道 | 后端读取 | 用途 |
|---|---|---|
| 请求头 `x-device-id` | [device.js:80](src/framework/auth/device.js#L80)；[token-issuer.service.js:50](src/app/oauth21/services/token-issuer.service.js#L50) | 前端主动传结构化 ID，**最高优先级**（三主前端统一注入） |
| Cookie `device_id` | [device.js:81](src/framework/auth/device.js#L81) | 向后兼容/同域自动携带 |
| 请求头 `x-device-fp` | [login.service.js:46](src/app/oauth21/services/login.service.js#L46) `clientFingerprint`；[context.js:21](src/framework/verify/context.js#L21) | consentKey/验证码客户端指纹，`VITE_DEVICE_FINGERPRINT` 启用时并入 |
| 请求头 `x-verify-token` | [verify-challenge.js:38](src/api/auth/v1/verify-challenge.js#L38) | 人机验证 token，绑定 userId+deviceId |
| CORS exposedHeaders | [app.js:231-232](src/app.js#L231) 允许跨域暴露 `x-device-id`/`X-Device-Fp`/`x-verify-token` |
| H5 签名 | [signature.js:81](src/framework/auth/signature.js#L81) | 头与 query 双通道都携带 `x-device-id`，但**两层验签都排除**该字段（防循环依赖，已核实无矛盾） |
| JWT claims | [token-issuer.service.js:95,138](src/app/oauth21/services/token-issuer.service.js#L98) | deviceId 写入 access_token claims（**当前全仓无消费方**，见问题 §3-8） |

> **`x-device-id` 头完全客户端可控**：伪造他人 deviceId 无法冒充其设备（指纹含 uid、session 基准绑定 userId，伪造只会让自己指纹与基准不匹配 → 自伤触发人机验证），但可无限撑大自己名下的 `session_tokens` 行数（幂等键失效），见问题 §3-7。

### 1.4 消费点

| 场景 | 位置 | 怎么用 |
|---|---|---|
| 密码登录环境检测 | [login.service.js:206-241](src/app/oauth21/services/login.service.js#L206) | `getDeviceIdAndWrapResponse` 拿 deviceId + 写 cookie；`detectLoginEnvironmentAnomaly` 查用户最近 session_tokens 的 fingerprint 做基准比对 → warn 邮箱二次验证 / info 放行 |
| JWT 令牌签发 | [token-issuer.service.js:98,138](src/app/oauth21/services/token-issuer.service.js#L98) | deviceId 塞入 access_token claims |
| Session 令牌签发 | [token-issuer.service.js:197-208](src/app/oauth21/services/token-issuer.service.js#L197) | deviceId 存入临时 session_token 给 bind-session |
| bind-session | [session-api.service.js:99-123](src/framework/auth/session-api.service.js#L99) | 消费临时 session_token 的 deviceId → `createSession` → 写业务域 device_id cookie（`COOKIE_OPTIONS.DEVICE`） |
| 访问时风险检测（每个已登录请求） | [auth/index.js:258-280](src/framework/auth/index.js#L258) | `getDeviceId` 取当前 deviceId → `computeDeviceFingerprint` 算当前指纹 → `detectSessionRisk` 比对 Redis session 基准 → warn+写操作 403 拦截返 verify token / info 放行注 `__risk__`；**发现与基准不一致时回写 `X-Device-Id` 头 + cookie**（加速旧格式 ID 收敛，81350f1） |
| 人机验证端点 | [verify-challenge.js:43-65](src/api/auth/v1/verify-challenge.js#L43) | 校验 x-verify-token（Redis `vtoken:` 比对 userId+deviceId）→ 写 `verified:${userId}:${deviceId}` 30min 免验 → `updateSessionBaseline` 刷新基准 |
| session_tokens 设备幂等 | [session.js:367-405](src/framework/auth/session.js#L367) | 同 `user_id+device_id` upsert，防登录次数堆积 |
| 踢下线（按设备类型） | [session.js:90 `kickByDeviceType`](src/framework/auth/session.js#L90) | 按 `deviceType` 批量踢同类型旧会话（单设备单登录） |
| 踢下线（按设备 ID） | [session.js:118 `kickByDeviceId`](src/framework/auth/session.js#L118) | 按 `user_id+device_id` **精准踢单设备**（**新增**，公共 `_kickSession` 复用） |

**Redis 风险标记：**
- `verified:${userId}:${deviceId}`（30min 免验，[anomaly-detector.js:233,298](src/framework/auth/anomaly-detector.js#L233)）
- `vtoken:${token}` → `{userId, deviceId}`（一次性 verify token）

---

## 2. 前端链路（六端覆盖）

### 2.1 共享包

[packages/shared-device/](packages/shared-device/)（npm workspace 包，主前端 `package.json` 依赖 `"stable-deviceid": "*"`，vite alias + tsconfig paths 解析）：

| 文件 | 导出 | 说明 |
|---|---|---|
| [device-id.ts](packages/shared-device/src/device-id.ts) | `getStableDeviceId` / `parseDeviceId` | 从 localStorage（key `cf_device_id`）取/生成结构化 ID（平台-加密时间戳-随机后缀），**跨账号复用**（localStorage 不随退出清除）；localStorage 不可用（隐私模式）降级为会话内临时 ID |
| [device-fingerprint.ts](packages/shared-device/src/device-fingerprint.ts) | `getDeviceFingerprint` / `isDeviceFingerprintEnabled` | canvas + WebGL 特征 SHA-256（32 位），`VITE_DEVICE_FINGERPRINT=true` 或 `<meta name="device-fp">` 才启用 |
| [device-sync.ts](packages/shared-device/src/device-sync.ts) | `handleDeviceSyncInResponse` / `initDeviceSync` / `syncDeviceFromHeaders` | 从响应头 `X-Device-Id`/`X-Device-Id-Updated` 同步 device_id 到 localStorage；`initDeviceSync` 注册跨标签页 storage 监听 |
| [sha256.ts](packages/shared-device/src/sha256.ts) | `sha256` | Web Crypto API 哈希 |

### 2.2 六端接入状态总表

| 前端 | 请求工具 | 设备ID 接入 | 说明 |
|---|---|---|---|
| oauth21 | [request.ts](oauth21/src/utils/request.ts) | ✅ 完整 | 请求拦截注入 `x-device-id` + 启用时注入 `X-Device-Fp`；响应拦截同步；H5 签名路径 `x-device-id` 还拼 query |
| posecraft | [utils/request.ts](posecraft/src/utils/request.ts) | ✅ 完整 | 请求拦截注入 `x-device-id` + `X-Device-Fp`；响应拦截同步（与 oauth21 对齐） |
| firewall | [api/firewall.ts](firewall/src/api/firewall.ts) | ✅ 完整 | 同 posecraft（含 `createHttp` 工厂创建的独立实例） |
| admin | [utils/request.ts](admin/src/utils/request.ts) | ❌ 未接入 | localStorage Bearer token 模式（401 刷新是 `TODO_NEW_TOKEN` 占位，面板疑似未完工），完全不在 session/设备体系内 |
| poseadmin | [api/banner.ts](poseadmin/src/api/banner.ts) 等 | ❌ 未接入 | 裸 axios 直调 `/posecraft/v1/admin/*`，无任何鉴权头，依赖同源 cookie 自动携带 sid/device_id；无 `x-device-id` 头 |
| phonecopy（web 源码） | [utils/auth.js](phonecopy/src/utils/auth.js) | ❌ 未接入 | fetch + Bearer token，无设备ID逻辑 |
| phonecopy（Android 壳） | Capacitor | ⚠️ 间接接入 | `capacitor.config.json` 实为 posecraft 工程（appId `com.posecraft.ai`，webDir `dist`），`android/app/src/main/assets/public/` 打包的是 **posecraft 构建产物**（含 shared-device 编译代码）——壳内运行时实际带着 `cf_device_id` 逻辑，但 phonecopy 自有 web 源码没接 |

三主前端入口（main.ts/bootstrap.ts）调 `initDeviceSync()` 激活跨标签页同步。全仓**没有** Pinia store / composable 管理设备ID，全部靠共享包模块级缓存 + localStorage。

### 2.3 iframe 登录握手（SSO_READY）

**oauth21 登录页**（[index.vue:67-71](oauth21/src/view/web/login/index.vue#L67)）onMounted 后发 `SSO_READY`（统一入口，子组件不再重复发）——表示 Vue 应用已 mount、主题监听器就绪。

**父窗口 posecraft/firewall LoginModal**（[LoginModal.vue handleMessage](posecraft/src/components/modals/login/LoginModal.vue)）：
- 监听 `SSO_READY` → 关 loading + 同步主题（posecraft）+ 清兜底超时
- `@load` 改为启动 3s 兜底超时（防 `SSO_READY` 丢失导致永久 loading）

> 这套握手比单纯 `@load` 可靠：`@load` 只保证 HTML 拉取完，不保证 Vue app 已 mount；`SSO_READY` 在 onMounted 发（此时 `useParentThemeSync` 的监听器已就绪，因父组件 onMounted 先于子），父窗口收到再发主题，消息不丢，消除首屏主题闪烁竞态。

### 2.4 风险验证带 device id

[oauth21/src/api/auth.ts:77](oauth21/src/api/auth.ts#L77)、[posecraft/src/api/auth.ts:57](posecraft/src/api/auth.ts#L57) 调 `verify-challenge` 时显式带 `x-device-id` 头，与 `verified:${userId}:${deviceId}` 标记一致（防拦截器跳过）。

### 2.5 全链路时序（正常 iframe 登录）

```
前端（oauth21 登录页，iframe 嵌入 posecraft/firewall）
  ① getStableDeviceId() 从 localStorage 取/生成结构化 ID
  ② POST /oauth21/v1/auth/login  带 x-device-id 头
  ③ onMounted 发 SSO_READY → 父窗口关 loading + 同步主题
        ↓
后端 directLogin
  ④ getDeviceIdAndWrapResponse：验证前端 ID，无效则重生，写 X-Device-Id 响应头 + device_id cookie（COOKIE_OPTIONS.DEVICE）
  ⑤ detectLoginEnvironmentAnomaly：查 session_tokens 历史指纹基准比对
  ⑥ Session 模式：签发临时 sessionToken（Redis session_token store，含 deviceId）返前端
        ↓
前端（posecraft/firewall 父窗口）
  ⑦ 收到 LOGIN_SUCCESS（带 sessionToken）→ POST /auth/v1/bind-session
        ↓
后端 bind-session
  ⑧ 消费临时 session_token 的 deviceId → createSession（写 Redis session + DB session_tokens）
  ⑨ 写业务域 device_id cookie（COOKIE_OPTIONS.DEVICE）
        ↓
后续业务请求
  ⑩ 三主前端 request 拦截器自动带 x-device-id 头 + cookie
  ⑪ 后端 auth 插件 getDeviceId → computeDeviceFingerprint → detectSessionRisk
     → 基准匹配放行 / warn+写操作 403 返 verify token
```

---

## 3. 存在的问题

### 🟡 P1（遗留 / 可优化）

1. **`notLoadSsoView` 是死开关**
   - [login/index.vue:99-100](oauth21/src/view/web/login/index.vue#L99)、[StandardLogin.vue](oauth21/src/view/web/login/StandardLogin.vue)、[MiniLogin.vue](oauth21/src/view/web/login/MiniLogin.vue) 里 `notLoadSsoView` 只控制是否发 `SSO_READY`，但 `SSO_READY` 本身已是必发的握手信号（父窗口靠它关 loading）。
   - 设 `notLoadSsoView=true` 会让父窗口收不到 `SSO_READY` → 靠 3s 兜底超时关 loading（有竞态、丢主题同步），但仍能登录。
   - 原设计意图是"完整页 vs 嵌入式组件"双模式开关，但**未落实到 UI**（不控制任何外壳元素显隐）。
   - **建议**：要么删掉它（让 `SSO_READY` 永远发），要么真正落实双模式 UI（`notLoadSsoView=true` 时隐藏品牌 header/背景装饰/底部协议等外壳，只留核心表单）。当前已确认后续按需做。

2. **`x-device-fp`（canvas/WebGL 指纹）默认不启用**
   - 三主前端都注入 `X-Device-Fp`，但 `isDeviceFingerprintEnabled()` 默认 false（需 `VITE_DEVICE_FINGERPRINT=true`）。生产未启用时，consentKey/验证码只靠 IP+UA 指纹，抵制代理池换 IP+UA 绕过的能力弱。
   - **建议**：高安全场景（注册/登录并发码）考虑启用，需评估隐私合规。

3. **`kickByDeviceId` 已实现但未接入管理端 API**
   - [session.js:118](src/framework/auth/session.js#L118) 新增了按 device_id 精准踢单设备，提取了公共 `_kickSession`，但 `/auth/v1/sessions` 等端点还没暴露"按设备踢单点"的接口。
   - **建议**：在 session 管理 API 加端点 `POST /auth/v1/sessions/kick-by-device`，供前端"设备管理"页踢单设备。

4. **admin / poseadmin 完全不在设备 ID 体系内**
   - [admin/src/utils/request.ts](admin/src/utils/request.ts)：localStorage Bearer token 模式，且 401 刷新是 `TODO_NEW_TOKEN` 占位（面板未完工），不走 session/bind-session，设备ID、风险检测、设备幂等全部不生效。
   - poseadmin：裸 axios 直调 `/posecraft/v1/admin/*`，无 `x-device-id` 头。同源部署时靠 httpOnly `device_id` cookie 兜底问题不大；但若**跨域部署或 cookie 被清**，[device.js:78](src/framework/auth/device.js#L78) 每次都服务端随机生成新 ID → 设备指纹每请求都变 → `detectSessionRisk` 与 session 基准不匹配，**写操作会反复 403 要求人机验证**。
   - **建议**：admin 转正时接入 `stable-deviceid`；poseadmin 确定部署形态（同源/跨域）后决定是否接头注入，至少要保证 `device_id` cookie 稳定存在。

5. **`x-device-id` 头客户端可控，可无限膨胀 session_tokens**
   - 伪造**他人** deviceId 不可行（指纹含 uid，session 基准绑定 userId，伪造自伤触发人机验证）。
   - 但同一用户每次传**随机新 deviceId** 可绕过设备幂等（`user_id+device_id` upsert 键不同），无限新增 `session_tokens` 行 → 设备数统计失真、DB 膨胀。
   - **建议**：对同 user 的活跃 device 行数设上限（如 20），超限清理最旧或强制人机验证。

### 🟢 P2（可维护性）

6. **JWT claims 中的 deviceId 是"死数据"**
   - [token-issuer.service.js:95](src/app/oauth21/services/token-issuer.service.js#L98) 把 deviceId 写入 access_token claims，但全仓（oauth21 crypto/middleware/services）**没有任何代码读 `claims.deviceId`**，子服务器拿到也没用它做校验。
   - **建议**：要么下游消费（资源服务器做设备绑定校验），要么从 claims 移除减小 token 体积、避免"以为有校验"的错觉。

7. **deviceId 重生/过期后残留孤儿数据**
   - `verifyAndNormalizeDeviceId` 对老格式 UUID、时间戳段超 365 天的 ID 会重生。重生后：旧 `device_id` 的 `session_tokens` 行、`verified:${userId}:${旧ID}` 免验标记成为孤儿，无任何清理任务。
   - **建议**：定期清理长期不活跃的 session_tokens 行（如 90 天），或重生时迁移复用。

8. **隐私模式下 localStorage 降级为临时 ID**
   - [device-id.ts](packages/shared-device/src/device-id.ts) 在 localStorage 不可用（Safari 隐私模式等）时降级为会话内内存 ID，**每次刷新页面都变** → 每次请求指纹都与基准不匹配 → 频繁触发人机验证，用户体验差。
   - **建议**：评估对该场景放宽（如仅 UA+IP 指纹比对）或前端提示用户退出隐私模式。

9. **phonecopy 自有 web 源码未接入共享包**
   - phonecopy 是 Hybrid（Capacitor + fetch，无 axios），web 源码（[utils/auth.js](phonecopy/src/utils/auth.js)）未接 `stable-deviceid`。其 Android 壳因打包 posecraft 产物而**间接**带了设备ID逻辑（见 §2.2），但壳内跑的是 posecraft 的页面而非 phonecopy 自有页面时才生效。
   - **建议**：phonecopy 自有页面若需要风险检测/设备幂等，用 capacitor 的 localStorage 存 device_id + fetch 拦截注入头。

10. **`isEmbedded`（iframe 检测）与 `notLoadSsoView`（显式开关）语义重叠**
    - [StandardLogin.vue:139](oauth21/src/view/web/login/StandardLogin.vue#L139) `isEmbedded = window.self !== window.top`，[AuthContainer.vue:55](oauth21/src/components/common/AuthContainer.vue#L55) 同算法，控 ThemeToggle 显隐。
    - 两套信号（iframe 检测 vs 显式开关）并存，若落实双模式 UI 需统一（推荐 `notLoadSsoView + iframe 双条件`，避免误传 true 在独立页变裸表单）。

---

## 4. 已修复的问题（对比早期版本）

| 问题 | 状态 | 修复方式 |
|---|---|---|
| 设备ID 校验自相矛盾（时间戳段 8/11 字符不一致）→ 所有 ID 校验失败 → 每请求重生、指纹每请求变、验证死循环 | ✅ 已修复（81350f1） | [device-id-service.js:19](src/framework/auth/device-id-service.js#L19) `ENCODED_TS_LENGTH` 对齐 11 + 删除数学上不可达的熵值检查 |
| 旧格式 UUID 设备ID 收敛慢 | ✅ 已修复（81350f1） | [auth/index.js:262-265](src/framework/auth/index.js#L262) 风险检测路径发现基准不一致时回写 `X-Device-Id` 头 + cookie，一次请求即迁移 |
| Cookie 选项两套不一致（httpOnly/secure/maxAge 冲突） | ✅ 已修复 | [device.js:126](src/framework/auth/device.js#L126) 统一用 `COOKIE_OPTIONS.DEVICE` |
| posecraft/firewall 完全依赖 cookie，跨域 iframe 失效 | ✅ 已修复 | 抽共享包，三主前端统一注入 `x-device-id` 头 + 响应同步 |
| DB 降级恢复 session 丢 fingerprint 基准 | ✅ 已修复 | [session.js:584-595](src/framework/auth/session.js#L584) 从 session_tokens 表补 |
| 踢下线只按 deviceType，粒度粗 | ✅ 已修复 | 新增 `kickByDeviceId`，公共 `_kickSession` 复用 |
| 死代码 `resolveDeviceId` / `generateDeviceCookie` | ✅ 已清理 | 已删，全仓无引用 |
| `secure:false` 硬编码 | ✅ 已修复 | 随 cookie 选项统一解决 |
| 三主前端设备逻辑分散不共享 | ✅ 已修复 | 抽 `stable-deviceid` npm workspace 包 |
| `initDeviceSync` 定义未调用 | ✅ 已修复 | 三主前端入口调 `initDeviceSync()` |
| 风险验证 modal 不带头，cookie 缺失时免验标记不一致 | ✅ 已修复 | `verifyChallenge` 显式带 `x-device-id` |
| SSO_READY 重复发送（dispatcher + 子组件） | ✅ 已修复 | 统一由 index.vue 发，子组件删 |
| SSO_READY 无人消费（死消息） | ✅ 已修复 | 父窗口 LoginModal 监听它做可靠握手，`@load` 改兜底超时 |

---

## 5. 一句话总结

设备 id 体系在**三主前端（oauth21/posecraft/firewall）+ 后端**已基本打通：结构化 ID + 统一 cookie + 双通道读取 + 风险基准 + 设备幂等 + 按 device 精准踢，81350f1 修复了校验自相矛盾的死循环。当前主要缺口：**admin/poseadmin 完全不在体系内**（P1-4）、`x-device-id` 可控导致 session_tokens 可被撑大（P1-5）、JWT claims 的 deviceId 无消费方（P2-6），以及 `notLoadSsoView` 死开关、`kickByDeviceId` 未暴露管理端点等遗留项。
