# 挑战链路加固计划书

> 日期：2026-11-06 · 状态：**待批准**（阶段 0/1 不依赖任何决策，可先开工）
> 范围：人机挑战（PoW 提速 / 递进难度 / 边缘层 / 真实验证 / 观测）
> 相关：`AUDIT-REPORT-2026-09-15.md`（历史缺陷）、`FIX-REPORT-2026-09-15.md`（修复记录）
>
> ⚠️ **路径已归位（2026-11-06，晚于本计划定稿）**：挑战相关的三个文件已收进
> `framework/firewall/challenge/`（`difficulty.js` / `metrics.js` / `template.js`，
> 公共出口是 `index.js`），app 侧的 `services/challenge.service.js` + `challenge-providers/`
> 收进 `services/challenge/`（`service.js` + `providers/`）。
> 正文仍写作当时的路径 —— 保留原文是为了让"当时为什么这么改"可追溯；
> 查**今天**的位置请看 `src/app/firewall/README.md` 与
> `framework/firewall/challenge/index.js` 头注释。

---

## 0. 一页结论

| 问题 | 结论 |
| --- | --- |
| 单开独立前端还是继续内嵌？ | **双轨保留**：内嵌页只做"零依赖 PoW 兜底"，能力全部堆到独立前端（`firewall/challenge.html` + `packages/challenge-client`） |
| 部署形态 | **形态 A**：前端与 API 同站反代（同一个 nginx server 块、不同 location），`fw_verified` 保持 `SameSite=Strict` |
| 前端能不能挂到别的路径 / 别的域名？ | **能**。后端完全不认识前端路径（已用测试钉死）；前端有 **3 处硬编码**要先改成跟随 `import.meta.env.BASE_URL`，否则换路径会 404 |
| PoW 怎么提速？ | **不用 `crypto.subtle`**（实测比现状还慢 1.3×），改用零分配实现（实测 **5.9×**） |
| 验证码要不要自己写？ | **不用**：`framework/verify/recaptcha` 已支持 google / hcaptcha / turnstile；PoW 的"能力"也收进 `verify/pow/`（策略留在 firewall） |
| 顺序 | 护栏 → 提速 → 观测 → PoW 归 verify → 递进难度 → provider → 边缘层 →（可选）WebAuthn |
| 工期 | **7.5 人日**到"四项落地"，WebAuthn 另计 3~4 人日 |

---

## 1. 现状盘点

### 1.1 两条挑战链路（都已存在，不是新建）

| 链路 | 入口 | 实现 | 覆盖场景 |
| --- | --- | --- | --- |
| **内嵌页** | 后端文档请求 → 200 + 内联 HTML（`sendChallengePage`） | `src/framework/firewall/challenge-template.js`：单文件、零外链、专属 CSP（nonce + `default-src 'none'`）、Blob Worker 求解 | 直连 API 的浏览器、移动 WebView、非 SPA 客户端、前端产物不可用时 |
| **独立前端页** | SPA 收到 428 / `X-Firewall-Challenge` → 整页跳转 | `firewall/challenge.html` → `firewall/src/challenge/ChallengePage.vue` → `packages/challenge-client`（纯源码共享，`admin/` 复用） | 防火墙 / 管理后台等自家 SPA |

两条链路的判定、载荷、校验完全共用服务端同一份实现（`issueChallengePayload` / `verifyPow` / `takeChallenge`），**只有"谁来渲染页面"不同**。

### 1.2 配置与契约（改配置项时必须同步的点）

```
代码常量（最基础，可为空）
  → framework 默认值  src/framework/firewall/config/defaults.js      ← 必有
  → 静态覆盖（可选）  src/config/firewall_config.js
  → 持久化（磁盘）    data/firewall_config.json                      ← 面板写入
  → 清洗 spec         src/framework/firewall/config/schema.js        ← 类型/上下界/枚举
  → 面板 schema 生成  src/api/firewall/v1/schemas/monitor.js         ← 由 spec 自动生成
  → 前端键清单        firewall/src/stores/settings.ts  DEFENSE_KEYS  ← **最容易漏的一处**
```

漏最后一处的后果：面板"局部保存"会把载荷当成顶层对象提交，后端归位后写错层，**保存看着成功、重启全丢**。

### 1.3 观测现状

- 只有请求级遥测：`recordFirewallEvent` → `pushRecord`（1000 条环形缓冲）→ `stats-redis` 聚合 → 面板 `/monitor/*`
- **没有任何挑战专属指标**（签发量、成功率、失败原因、求解耗时）—— 这正是上一轮"生产 CSP 把挑战页整段拦掉"能潜伏的原因：链路全黑，没人能看出成功率是 0。

---

## 2. 关键决策

### D1 双轨保留，角色钉死

- **内嵌页**：永远只做 PoW。**不接第三方脚本、不做 WebAuthn、不引入构建产物**。它是"最后一道自救路径"，任何外部依赖都会把自救能力交给第三方可用性。
- **独立前端页**：第三方验证码、WebAuthn、多语言、可访问性、错误引导都放这里。
- 交叉规则：内嵌页遇到 `challengeProvider ≠ pow` 或"需要 WebAuthn"时不硬撑 —— 退化为 PoW，或显示"请用浏览器打开 `<challengePageUrl>`"（`challengePageUrl` 走配置，默认空 = 不提示，符合"core 不认识前端路径"的既定原则）。

### D2 部署形态 A（同站反代）

理由：

1. `fw_verified` 是 HttpOnly + `SameSite=Strict` 的**第一方 cookie**，同站部署下不受任何浏览器第三方 cookie 政策影响；
2. 同源请求不触发 CORS，挑战链路少一圈失败模式（挑战页是"最后自救路径"，不该依赖 CORS 配置正确）；
3. 后端零改动。

配套铁律（写进部署文档）：

- `VITE_API_URL` **留空**（生产默认空串 = 相对路径）。配成绝对地址就等于把形态切成 B，`Strict` 立刻失效 → 通过后又被挑战，死循环。
- 反代必须传真实 IP：`X-Forwarded-For` / `X-Real-IP` + 后端 `PROXY_TRUST_CIDR` 成对配置。否则 `request.ip` 全是反代地址，而 `generateFingerprint` 也含 IP → **一个人通过挑战，120s 内全站共享**。

**实测发现（2026-11-06，端到端跑出来的真问题）**：`firewall/.env` 原本写着 `VITE_API_URL=http://localhost:3000`，而 Vite 的 `.env` 对 **`vite build` 同样生效** → 生产产物里 API 根被烧成 `http://localhost:3000`。后果有两层：

1. 线上所有 API 调用打到 `localhost:3000`（用户机器上没有这个服务 → 前端整体不可用）；
2. 挑战页因此变成**跨站**请求：`fw_verified` 是第三方 cookie，`SameSite=Strict` 不发送 → 通过后立刻又被挑战，无限循环。

修法：`.env` 只留空值（同源相对路径），本机地址移到 `.env.development`（Vite 只在 dev 模式读它）。验证方式：`grep -rl "localhost:3000" firewall/dist/` 必须为空。


### D3 挂载路径可配置（详见第 3 节）

后端不认识 `/firewall/`（`safePaths` 默认不含它，且有测试钉死"不特例化前端目录"）。需要改的只有前端 3 处。

### D4 PoW 提速：换实现，不换 API

实测（无头 Chrome，输入 ~57 字节，逐次哈希）：

| 实现 | µs/次 | 难度 3（4096 次） | 难度 5（104.8 万次） |
| --- | --- | --- | --- |
| 现状（每次重建数组 + `toString(16).padStart`） | 2.315 | 9.5 ms | ≈ 2.4 s |
| `crypto.subtle` 逐次 `await` | 2.950 | 12.1 ms | — |
| **零分配实现**（复用 `Uint8Array`/`w` + 就地写十进制 + 只比前 N nibble） | **0.395** | **1.6 ms** | **≈ 414 ms** |

结论：`crypto.subtle` 对"海量小输入"没有优势（每次调用开销 + `TextEncoder` 主导），**提速只能靠改实现**。收益不是"更难"，而是让难度 4（现 ≈150ms）降到 ≈26ms —— 这是 D 项递进难度敢加码的前提。

### D5 观测先行

观测排在递进难度、provider 之前。没有成功率/耗时分位数，后两项的效果无法判断，也没法及时发现问题（CSP 事故的教训）。

### D6 第三方验证码只进独立前端

内嵌页当前 CSP 是 `default-src 'none'` + nonce。接 Turnstile/腾讯云要放 `script-src` / `frame-src` / `connect-src` 到第三方域 —— 不放进内嵌页。

### D7 内嵌页保留为兜底，但默认可以让位给独立前端（`challengePageUrl`）

`defense.challengePageUrl`（**空 = 用内置页**）：配了以后**文档请求**（浏览器直接打开被挑战的 URL）302 到前端页并带 `?return=<原 URL>`；XHR 不受影响（仍 428 + `X-Firewall-Challenge`，由拦截器跳转）。

"优先前端、异常兜底"的闭环**不靠后端探活**（探测在热路径上等于把可用性绑两次失败）：

```
文档请求 → 302 到前端页（同时下发 30s 的一次性标记 cookie fw_chal_page=1）
           ├─ 前端页正常 → PoW → verify → 回 return
           └─ 前端页挂了（chunk 404 / 8s 未挂载）→ challenge.html 里的自愈守卫跳回 return
                        → 这次请求带 fw_chal_page=1 → 后端**不再 302**，直接给内置页
```

四条约束：

| 约束 | 原因 |
| --- | --- |
| 只接受站内相对路径（`/x`，拒绝 `//host`、`/\host`、绝对 URL） | 否则 302 就是开放重定向；且跨站会让 `fw_verified` 变第三方 cookie，`Strict` 不发送 → 通过后又被挑战 |
| 配置写坏按"空"处理，回落内置页 | 配置错误不该让防护能力消失 |
| 302 必须带 `Cache-Control: no-store` | 被缓存就等于把所有人永久导向挑战页 |
| 回退用**一次性标记 cookie** 而不是 query 参数 | 不污染业务 URL（否则严格的 query schema 会在通过后 400） |

### D8 复用 `framework/verify`，不要在防火墙里另造一套验证码

`src/framework/verify/` 本来就是「系统级验证能力库」：`captcha`（图形）/ `slider`（滑块）/ **`recaptcha`（Google + hCaptcha + Turnstile）** / `email` / `sms` / `voice` / `qrcode`，统一 `service + dao + index`，存储走调用方注入的 store 适配器，无 API 路由、业务无关；已被 `api/verify/v1`、`api/user/v1/open`、`oauth21` 的登录/解密链路使用。

三条结论：

| 能力 | 归属 | 理由 |
| --- | --- | --- |
| 第三方验证码（④a） | **复用 `verify/recaptcha`**（已支持 Turnstile，且自带 hostname/action 校验与生产 fail-closed） | 原计划要新建 `app/firewall/services/providers/`，属重复建设 |
| PoW 的"能力"（发码/校验/一次性消费） | **新增 `verify/pow/`**，与其余子模块同构 | 它就是"另一种人机验证"，和 captcha/slider 是一类东西 |
| PoW 的"策略"（何时挑战、绑谁、给多久 pass、渲哪个页面） | **留在 firewall** | 这是访问控制语义；搬进 verify 会让工具库反向依赖防火墙的 `ip/fingerprint/deviceId/pass` 概念 |

依赖方向必须保持单向：`app/*` → `framework/verify`，`framework/firewall` → `framework/verify`，**绝不反向**。

---

## 3. 挂载路径专项（本次验证结论）

### 3.1 结论

**nginx 上完全自由**：`/firewall/`、`/`、`/console/`、甚至独立域名都可以，因为**后端从头到尾不认识这个路径**。换路径的成本只在前端构建与 3 处硬编码。

### 3.2 证据

| 检查项 | 结果 |
| --- | --- |
| 后端生产代码出现 `/firewall/` | **0 处**（仅测试里作为"通用路径样例"和"确保不特例化"的断言） |
| `defense.safePaths` 默认值 | `['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/']` —— 不含任何前端目录 |
| 后端是否托管前端产物 | 否。前端 dist 由 nginx/CDN 直出，`/firewall/*` 请求根本不进后端 |
| 前端 asset/挑战页跳转 | `firewall/src/api/firewall.ts:78` 已用 `new URL(BASE_URL + 'challenge.html', origin)` ✅ |

### 3.3 需要改的 3 处（**已于 2026-11-06 完成**）

| 位置 | 原状 | 改法 |
| --- | --- | --- |
| `firewall/vite.config.js` | `base: '/firewall/'` 写死 | `process.env.VITE_BASE \|\| '/firewall/'` |
| `firewall/src/router/index.ts` | `createWebHistory('/firewall/')` 写死 | `createWebHistory(import.meta.env.BASE_URL)` |
| `firewall/src/challenge/ChallengePage.vue` | 挑战成功默认返回 `'/firewall/'` | fallback 改为 `import.meta.env.BASE_URL` |

验证：`MSYS_NO_PATHCONV=1 VITE_BASE=/ npx vite build` → 产物引用变成 `/assets/…`；默认构建仍是 `/firewall/assets/…`。

> Windows / Git Bash 下 `VITE_BASE=/` 会被 MSYS 当成路径改写（产物里出现 `C:/Program Files/…`）。
> 用 `.env` 文件写 `VITE_BASE=/`，或加 `MSYS_NO_PATHCONV=1`。

> `resolveReturnPath` 只接受"站内相对路径"（拒 `//`、`/\`、控制字符），fallback 传 `'/'` 合法，无需改共享包。

### 3.4 nginx 三种挂法（都已验证可行）

```nginx
# ① 子路径（现状）
location /firewall/ { alias /srv/www/firewall/; try_files $uri $uri/ /firewall/index.html; }
location ^~ /api/  { proxy_pass http://127.0.0.1:3000; ... }

# ② 根路径（"这个域名专供防火墙前端"）
location /   { root /srv/www/firewall;  try_files $uri $uri/ /index.html; }
location ^~ /api/ { proxy_pass http://127.0.0.1:3000; ... }   # ^~ 保证不被上面的 try_files 吞掉

# ③ 独立域名（同主域 → 仍同站，Strict 可用）
server { server_name fw.example.com; ... 同样的两个 location ... }
```

构建命令随之变化：`VITE_BASE=/ npx vite build` 或 `VITE_BASE=https://fw.example.com/ npx vite build`。

### 3.5 换独立域名时的额外清单

| 事项 | 说明 |
| --- | --- |
| 同站判定 | `fw.example.com` 与 `api.example.com` 是**同站**（同 eTLD+1）→ `Strict` 照常工作；换成不同注册域（如 `xxx.cdn.com`）才是跨站 → `Strict` 必废，需 `SameSite=None; Secure`（另开配置项） |
| 后端 CORS | 新前端若还要调其它后端服务，需加入 `CORS_ORIGINS`（同源调 API 不需要） |
| SSO / iframe | oauth21 侧的 redirect 白名单、`frame-ancestors` 白名单按需增加 |
| 反代真实 IP | 无论哪种挂法，`X-Forwarded-For` 必须透传（见 D2） |

---

## 4. 五项详细方案

> **已落地（2026-11-06，D7 + 3.3）**：
> `defense.challengePageUrl`（defaults / spec / 面板 schema 自动生成 / 前端 `DEFENSE_KEYS`）
> + `pipeline.sendChallengeResponse` 的 302 分支（含一次性标记 cookie 打破回退环）
> + `challenge.html` 自愈守卫 + `main.ts` 挂载打点
> + 三处挂载路径硬编码改为跟随 `BASE_URL`
> + `__tests__/firewall/challenge-redirect.test.js`（11 例：开放重定向防护 / 302 / 回退环 / XHR 不受影响）
>
> 下面七项是**尚未开始**的部分。

### 阶段 0：护栏（0.5 人日｜**已完成 2026-11-06**）

**要解决的问题**：`packages/challenge-client/src/pow.ts` 注释写着"必须与服务端逐字节等价"，但**全仓没有一条测试守着它**（三份实现：服务端 JS / 内联 Worker / TS）。任何一处改动不一致，症状都是"用户永远解不出来"。

落地形式与计划略有出入：**做成 jest 用例而不是 `verify:all` 关卡** —— `scripts/verify/` 下那些关卡都要连真 Redis/DB，而这是一次纯静态对拍，放进 `npm test` 才能在 CI 上天天跑。

- `src/__tests__/firewall/challenge-solver-parity.test.js`
  - 用 **esbuild** 现场把 `pow.ts` 转成 CJS 求值（不引构建产物、不落地中间文件）
  - ① `sha256Hex` 对拍：空串 / 短串 / **padding 边界（55·56·63·64·65 字节）** / PoW 真实形状 / 200 条伪随机向量
  - ② `makePowSolver` 对拍：难度 1~4 的**首个命中答案**必须相同（含"都找不到"），并用 `verifyPow` 二次确认不是两边一起错
- **反向验证**：把 TS 里 `K[0]` 末位 +1 → **4/5 例转红**；还原后 5/5 绿

### 阶段 1：项① PoW 提速（1 人日｜**已完成 2026-11-06**）

- 新增 `makePowSolver(prefix, difficulty) → (answer) => boolean`（`util/pow-sha256.js`）
  - 复用 `Uint8Array` 缓冲与 `w`/`hv` 表；十进制就地写字节；**只比前 N 个十六进制位**，不产出字符串
  - `sha256Hex` 保留不动（`verifyPow` 与单测基准都用它）；常量表提到模块级 `SHA256_K`，两份实现共用一张表
- 三处同步：服务端（源）→ 内嵌页（`makePowSolver.toString()` + `SHA256_K` 内联进 Worker 与主线程降级）→ `packages/challenge-client/src/pow.ts`
- 内嵌页因此不再内联 `sha256Hex`（页面少一段代码，且与 Worker 共用同一内核）
- **验收**：`__tests__/firewall/pow-solver.test.js`（7 例：难度 1~6 × 答案边界 × 前缀长度、连续 2 万答案逐个对拍、难度 0/非法值、判定器可复用、`verifyPow` 闭环、常量表完整性）
- **实测**（无头 Chrome，本机）：2.315 → **0.395 µs/次**；难度 3 9.5ms → **1.6ms**，难度 5 ≈2.4s → **≈414ms**
- 端到端复验：内嵌页（自带内核 + Worker）与 SPA 页（共享包）各跑一遍完整「302 → issue → PoW → verify → 放行」，均 PASSED
- 顺手对齐一处"配了不生效"：`schema.js` 里 `challengeDifficulty` 上限是 **6**，而 `challenge-template.js`
  的 `MAX_DIFFICULTY = 5` —— 配 6 会被静默夹成 5。实测难度 6 ≈ 1670 万次哈希（浏览器 6 秒以上），
  不适合做上限，因此把 spec 收到 **5**，让"接口能配"与"运行时生效"一致。

### 阶段 2：项⑤ 观测（1.5 人日｜**已完成 2026-11-06**）

落地形态：

- `framework/firewall/challenge-metrics.js`：**进程内累加 + 增量汇出**
  - 热路径只做一次 `Map.set` 自增；字段由枚举维度拼成（`issued:pow` / `failed:Expired` / `solveMs:b2` /
    `difficulty:3` / `surface:inline`），**字段数有界**，不会被攻击撑爆
  - 只收服务端能真观测到的五种事件：`issued` / `issueRejected` / `verified` / `failed` / `surface`
    （客户端"解不出来"没有上报入口，用 `issued - verified - failed` 的差额反映，不造假计数）
- 汇出：`data/store.js` 在既有刷写周期里 `drainChallengeMetrics()` → 与流量增量**同一次 MULTI**
  写进 `stats:challenge`；刷写失败 `mergeChallengeMetrics()` 原样放回（否则一次失败丢一段统计）
- 读取：`readAggregatedStats()` 增加 `challenge`（汇总）+ `challengeFields`（原始字段）；
  `store.getChallengeStatsAggregated()` 把"Redis 全量 + 本实例未刷写增量"**先并字段表再汇总**
  （分位数不能把两个已汇总的结果相加）
- 端点：`GET /api/firewall/v1/monitor/challenge`（`registerSecureRoute` + 组级限频）
- 客户端：`solveMs` 由两端上报（`challenge-client` 的 `useChallenge` 测求解耗时；内嵌页同理），
  路由 schema 限定 `0..600000` 整数，**只统计不判定**
- 埋点：`challenge.service` 的 issue/verify 各分支 + `pipeline.sendChallengeResponse` 的三种 surface
- 测试：`challenge-metrics.test.js`（15 例：桶边界 / 只记可观测维度 / drain-merge 语义 /
  成功率分母口径 / 分位估算 / 脏输入）+ `challenge-stats.test.js`（6 例：MULTI 写入、空增量、
  读取汇总、清空覆盖）+ 跳转用例里补 `surface` 三态断言


### 阶段 2b：把 PoW 的"能力"收进 `framework/verify/pow/`（1 人日｜**已完成 2026-11-06**）

`framework/verify` 是「验证能力库」（`captcha` / `slider` / `recaptcha` / `email` / `sms` / `voice` / `qrcode`，统一 `service + dao + index`，存储走调用方注入的 store 适配器、无 API 路由、业务无关）。PoW 与它们是同一种东西，只是当年长在防火墙里。

**实际落地**：

```
framework/verify/pow/
├── service.js   buildChallenge({ difficulty, ttlSec })   → { challengeId, salt, difficulty, maxAttempts, ttlSec }
│                verifyAnswer({ challengeId, salt, answer, difficulty }) → { ok, reason }
│                clampDifficulty / attemptsForDifficulty / MAX_DIFFICULTY / DEFAULT_TTL_SEC
│                sha256Hex / makePowSolver / verifyPow / SHA256_K   ← 原 util/pow-sha256.js 整体迁入
├── dao.js       issue(store, { difficulty, ttlSec, binding }) / consume(store, id) / check(payload, { challengeId, answer })
└── index.js
```

`util/pow-sha256.js` **已删除**（不做 re-export 兼容层：全仓 4 处 import 全部改到位，
留 shim 只会让"到底该从哪 import"长期含糊）。

**不搬什么**（越界就会让 verify 反向依赖防火墙）：

| 留在 firewall | 原因 |
| --- | --- |
| `fw_verified` 的 TTL 档位（匿名 120s / 登录 1800s）与签发 | 访问控制策略 |
| 挑战态（`CHALLENGE` 封禁键）的读写与语义 | 防火墙域模型 |
| 绑定比对（ip / fingerprint / deviceId） | 策略；verify 只把它当**不透明字段**存取、原样回传 |
| 页面渲染 / CSP / 302 / 自愈守卫（`challenge-template.js`） | 与"验证能力"无关 |

**两处比原计划更严格的地方**：

1. **store 适配器只认 `put` / `take`，不接受 `get + delete`**。`take` 的"取走即消失"是
   **安全性质**而非清理优化：两次非原子调用之间，同一题号可能被两个并发请求各读一次 →
   同一份答案用两次。适配器落 `framework/firewall/util/pow-store.js`（3 行转发到
   `writeChallenge` / `takeChallenge`，含内存降级与 Lua GETDEL）。
2. **载荷里的绑定字段嵌套成 `binding`**：`{ salt, difficulty, binding: { ip, fingerprint, deviceId }, issuedAt }`。
   嵌套不是为了好看 —— 它让"verify 不认识 ip"从注释变成**结构约束**：`dao` 从头到尾
   只碰 `payload.binding` 整体，想解读它就得先拆开，一眼能看出越界。
   键空间仍是 `fw:chal:<id>`，升级瞬间的进行中挑战不受影响。

**验收**：既有挑战用例全绿且**断言不改**（只改 import 路径），firewall 相关 **321 例**通过；
新增 `__tests__/verify/pow-dao.test.js`（10 例）钉住存储契约与不透明性。

### 阶段 3：项② 递进难度（2 人日｜**已完成 2026-11-06**）

- `resolveChallengeDifficulty({ ip, loggedIn }) → { difficulty, reason }`（`framework/firewall/challenge-difficulty.js`）
  - 信号（全部现成，不新建表）：`chal:fail:<ip>` / `chal:pass:<ip>` 两个窗口计数（`bumpCounter` / `readCounter`，TTL = 窗口）+ 是否登录
  - 输出：以 `challengeDifficulty` 为基准 ±1~2 档，夹在 `[Min, Max]`
  - 返回体加 `reason`（`baseline` / `hardened` / `relaxed`，**不暴露分数也不暴露计数**）
- 新增配置：`challengeReputationEnabled`（默认 **false**）、`challengeDifficultyMin`(2)、
  `challengeDifficultyMax`(5)、`challengeReputationWindowSec`(600) —— defense 43 → **47** 键
- 契约同步（一个都没漏）：`defaults.js` → `schema.js DEFENSE_SPEC`（**顺序逐键一致**，有测试钉住）
  → `persisted.js`（自动清洗生效）→ `monitor.js`（自动生成）→ `firewall/src/stores/settings.ts` 的
  `DEFENSE_KEYS` + `DEFAULT_DEFENSE` + `types/index.ts`
- **验收**：连续通过 → 降到 Min；连续失败 → 升到 Max；`challengeReputationEnabled=false` → 恒定基准（三条都有对照用例）

**与原计划的三处偏差（都是刻意的）**：

1. **`challengeProvider` 推迟到阶段 4**。现在加它只能写 `'pow'` 一个值，属于"配了不生效"——
   刚在阶段 1 才修掉同类问题（`challengeDifficulty` 上限 6 被静默夹成 5），不该再制造一个。
2. **没用「封禁来源」当信号**。它在 `sendChallengeResponse` 那条链路上拿不到（`buildBlockError`
   不带 source），要拿就得给错误对象加字段、穿四层；而它的价值被计数覆盖了大半 ——
   首次被 Bot 判定时计数本来就是 0，复犯才会升级，那正是"递进"要的效果。
3. **升难度只认 `Invalid Proof`**（原计划写的是"近窗口失败次数"）。`Expired` / `Mismatch` /
   `Malformed` 是客户端或网络问题，计进去会把真实用户越推越死 —— 这是这类机制最经典的自伤。

### 阶段 4：项④a 复用现成验证码能力（**已完成 2026-11-06**｜默认 `pow`）

**修正**：`src/framework/verify/` 已经是一个「验证能力库」，里面 **`recaptcha/` 已支持 Google reCAPTCHA / hCaptcha / Cloudflare Turnstile**（2026-08-29 加），还自带两条这里本来要自己写的东西：

- `expectedHostname` / `expectedAction` 校验（防 token 跨域 / 跨用途挪用）
- 未配置密钥时**生产 fail-closed**、非生产放行

所以**不新建 `app/firewall/services/providers/`**（那是重复建设），改为按 `defense.challengeProvider` 在几个已有 dao 之间选：

| provider | 实现位置 | 调用形态 |
| --- | --- | --- |
| `pow`（默认） | 阶段 2 抽出的 `framework/verify/pow/` | `verifyAnswer({ challengeId, answer })` |
| `turnstile` / `hcaptcha` / `google` | `framework/verify/recaptcha/`（已在用） | `recaptchaDao.verify(token, ip)` → `{ success, score, error }` |
| `slider` / `captcha` | `framework/verify/slider/`、`captcha/`（已在用） | 同上，各自 dao |

改动只有三处：

- `challenge.service.verifyChallenge`：按 provider 分派（`pow` 走答案校验，其余走 dao），**`fw_verified` 的签发/TTL/绑定仍在这里**（访问控制语义不外移）
- `defense.challengeProvider` 走 spec；密钥**走环境变量**（`RECAPTCHA_*` / `TURNSTILE_*` 已存在，见 `framework/verify/config.js`），**不进** `data/firewall_config.json`（那份文件会被面板整份写回）
- 前端：`ChallengeCard` 增加 captcha 插槽；**只在独立前端页**放行第三方域（内嵌页保持 `default-src 'none'`，`provider ≠ pow` 时降级 pow）

**实际落地**（`src/app/firewall/services/challenge-providers/`）：

```
pow.js          issue → 复用 issueChallengePayload（难度/绑定/载荷）
                verify → 消费载荷 → 比绑定 → 验 PoW →（失败才）记一次信誉
recaptcha.js    为 turnstile / hcaptcha / google 各造一个：issue 只回 siteKey，verify 转 token
index.js        注册表 + 降级规则 + 判题选路
```

与原计划的三处加严：

1. **判题按载荷形状选 provider**（token → 第三方；challengeId/answer → pow），**不按配置**。
   配置在"出题"与"提交"之间被热改（面板换 provider）时，拿旧形状答案的用户仍能过 ——
   按配置路由会把他们永远卡住。安全性不放松：pow 分支要求载荷能在服务端查到。
2. **上游不可达回 503 `Challenge Unavailable`**，而不是 403。把基础设施故障挫成
   "验证失败"，运维看到的是"用户全在挂"，真实原因却是我们自己的外网出口。
3. **降级只有一处**：名字写错 / 密钥没配齐 → 回落 pow + 告警一次；绝不"谁也不验证"。

**前端（同日补完）**：新增 `ProviderWidget.vue`（三家共用一张"脚本地址 + 全局对象名"表，
支持 `scriptSrc` 覆盖以适配国内反代/私有化），`ChallengeCard` 在 `awaiting` 阶段渲染它并
`emit('submitToken', token)`，页面透传给状态机。

实测（无头 Chrome + 官方测试密钥 sitekey `1x00000000000000000000AA`，用本地桩脚本顶替
连不上的官方 `api.js`）：

```
issue → provider=turnstile + siteKey
→ 卡片「请在下方完成人机验证…」+ 组件渲染
→ 组件回调 token XXXX.DUMMY.TOKEN.XXXX
→ POST verify（带 solveMs=305）→ 200
→ 跳回 / → 「PASSED 业务页面（第三方验证已通过）」
```

⚠️ 切 `challengeProvider` 前仍必须配 `challengePageUrl` —— 内嵌页是零外链单文件，
塞不进第三方组件，只会发 pow 题（那条路仍是可用入口）。

**风险（需拍板）**：第三方可达性（国内）、隐私（客户端 IP 暴露给第三方）、成本、SLA。

### 阶段 5：项③ 边缘层（**已完成 2026-11-06**｜片段 + 文档）

仓库目前**没有** firewall 的 nginx 配置（只有 `oauth21/nginx.conf`），需新建：

- `deployment/nginx/firewall-edge.conf`（示例，逐行注释）
  - `limit_req_zone $binary_remote_addr zone=fw_chal:10m rate=10r/m`，只挂 `/api/firewall/v1/challenge/`
  - `limit_conn_zone` 单 IP 并发
  - `map` 明显恶意 UA/路径 → 444（默认注释掉）
  - 确认 `Cache-Control: no-store` 不被边缘缓存吞掉（`proxy_ignore_headers` 或显式 bypass）
- 原则写进文档：**边缘只做无状态粗粒度判定，语义权威永远是应用层**；并明确"边缘拒绝 = 面板没有记录"，否则排障时找不到人
- **风险**：两层阈值不一致 → 用户看到莫名 429 但面板无记录

**实际落地**：`deployment/nginx/firewall-edge.conf`（片段）+ `docs/deployment/nginx-edge.md`（说明）。

三条反向规则写进了配置注释：
1. **边缘阈值 = 应用层 2 倍**（challenge 端点 40r/m vs 应用层 10+20/min；API 1200r/m vs 600/min）。
   反过来就是"用户 429、面板查无此人"，只能靠 access_log 对账；
2. **挑战路径显式 no-store**（`proxy_ignore_headers` + `add_header`）：缓存住等于把同一份题发给所有人；
3. **`X-Forwarded-For` 必须与 `PROXY_TRUST_CIDR` 成对**：缺了它，指纹里的 IP 全是反代地址
   → 一个人通过、120s 内全站共享通过态。

恶意 UA/路径的 `map` 默认注释掉（444 完全不可观测，先观察一个月再开）。

### 阶段 6：项④b WebAuthn（3~4 人日｜建议最后，先看阶段 2/3 数据）

- 不是改造登录，而是"本设备已强认证 → 免挑战 N 天"：`credentials.create` 注册公钥 → 命中 (user, credential) 则跳过挑战
- 依赖 `@simplewebauthn/server` + 新表；需要 HTTPS + 稳定 RP ID
- **只放独立前端**；内嵌页给一句"请用浏览器打开 `<challengePageUrl>`"
- 取舍：UX 成本最高、收益是"登录用户几乎永不被打扰"。若阶段 2 观测显示"登录用户被挑战的比例很低"，这项可以直接砍掉

---

## 5. 排期与上线方式

| 阶段 | 内容 | 人日 | 独立上线 | 开关 |
| --- | --- | --- | --- | --- |
| 0 | 等价性护栏 + 链路冒烟 | 0.5 | ✅ | — |
| 1 | PoW 提速 5.9× | 1 | ✅ | 无行为变化 |
| 2 | 观测 | 1.5 | ✅ | 纯旁路 |
| 2b | PoW 能力收进 `verify/pow/` | 1 | ✅ | 无行为变化（只改 import） |
| 3 | 递进难度 | 2 | ✅ | `challengeReputationEnabled`（默认 false） |
| 4 | 复用 `verify/recaptcha` 接第三方 | 0.5 | ✅ | `challengeProvider`（默认 pow） |
| 5 | 边缘层 | 1 | ✅ | nginx 侧开关 |
| 6 | WebAuthn | 3~4 | 可选 | 按用户开关 |

合计 **7.5 人日**到"四项落地"（不含 WebAuthn）。阶段 0/1 不依赖任何决策。

---

## 6. 待拍板

1. **④a 用哪家 provider**？代码已支持 google / hcaptcha / turnstile（`verify/recaptcha`），默认仍是 `pow`。引第三方的取舍：国内可达性、隐私（IP 外发）、SLA。
2. **③ 边缘限流由谁维护**？有 nginx 写权 → 给完整 conf 片段；只有 CDN 控制台 → 改成 CDN 规则文档。
3. **挂载路径最终形态**（`/firewall/` 保持 / 换子路径 / 独立域名）—— 决定阶段 0 是否顺带做 3.3 的三处改造。
4. **是否允许用登录用户 ID 的历史做信誉信号**（涉及跨设备行为聚合）。

---

## 7. 附：每项的复核方法

| 项 | 怎么自己验 |
| --- | --- |
| ① 提速 | `node .tmp-probe/pow-bench/*`（本次实测脚本）或面板上看 `solveMs` 分位数变化 |
| ② 递进难度 | 同一 IP 连刷触发挑战 → 记 `difficulty`；通过后重复 → 观察递减 |
| ④ provider | DevTools 看页面是否加载第三方脚本；后端日志看 siteverify 调用与耗时 |
| ⑤ 观测 | `GET /api/firewall/v1/monitor/challenge` 返回成功率 / P50 / P95 / reason 分布 |
| 链路是否活着 | 无头 Chrome 打开挑战页，断言状态从 `Verifying…` 变成 `Verified`（**不要只看 HTTP 200**，CSP 事故就是 200 但页面不动） |
