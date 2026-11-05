# 挑战链路加固计划书

> 日期：2026-11-06 · 状态：**待批准**（阶段 0/1 不依赖任何决策，可先开工）
> 范围：人机挑战（PoW 提速 / 递进难度 / 边缘层 / 真实验证 / 观测）
> 相关：`AUDIT-REPORT-2026-09-15.md`（历史缺陷）、`FIX-REPORT-2026-09-15.md`（修复记录）

---

## 0. 一页结论

| 问题 | 结论 |
| --- | --- |
| 单开独立前端还是继续内嵌？ | **双轨保留**：内嵌页只做"零依赖 PoW 兜底"，能力全部堆到独立前端（`firewall/challenge.html` + `packages/challenge-client`） |
| 部署形态 | **形态 A**：前端与 API 同站反代（同一个 nginx server 块、不同 location），`fw_verified` 保持 `SameSite=Strict` |
| 前端能不能挂到别的路径 / 别的域名？ | **能**。后端完全不认识前端路径（已用测试钉死）；前端有 **3 处硬编码**要先改成跟随 `import.meta.env.BASE_URL`，否则换路径会 404 |
| PoW 怎么提速？ | **不用 `crypto.subtle`**（实测比现状还慢 1.3×），改用零分配实现（实测 **5.9×**） |
| 顺序 | 护栏 → 提速 → 观测 → 递进难度 → provider → 边缘层 →（可选）WebAuthn |
| 工期 | **8~9 人日**到"四项落地"，WebAuthn 另计 3~4 人日 |

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

### 3.3 需要改的 3 处（换路径前必须做）

| 位置 | 现状 | 换路径后会怎样 | 改法 |
| --- | --- | --- | --- |
| `firewall/vite.config.js` | `base: '/firewall/'` | 构建期设定，本身可改 | 改为 `process.env.VITE_BASE \|\| '/firewall/'`，便于不改代码切路径 |
| `firewall/src/router/index.ts:57` | `createWebHistory('/firewall/')` **硬编码** | 所有路由 404 | `createWebHistory(import.meta.env.BASE_URL)` |
| `firewall/src/challenge/ChallengePage.vue:19` | `resolveReturnPath(params.get('return'), '/firewall/')` **硬编码** | 挑战成功后跳回不存在的路径 | fallback 改 `import.meta.env.BASE_URL` |

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

### 阶段 0：护栏（0.5 人日｜纯测试，可立即开工）

**要解决的问题**：`packages/challenge-client/src/pow.ts` 注释写着"必须与服务端逐字节等价"，但**全仓没有一条测试守着它**（三份实现：服务端 JS / 内联 Worker / TS）。任何一处改动不一致，症状都是"用户永远解不出来"。

- [ ] `scripts/verify/challenge-solver-parity.mjs`
  - 固定向量 + 随机向量，对拍 `pow-sha256.js` 与 `packages/challenge-client/src/pow.ts`（现场编译 TS）
  - 覆盖 `difficulty 1..6`
  - 对拍"优化版 solver"与参考 `sha256Hex`：**逐答案比较布尔结果**，而非只比命中值
- [ ] 挂进 `npm run verify:all`
- **验收**：故意改坏 TS 里任一个常量 → 脚本红（反向验证）。

### 阶段 1：项① PoW 提速（1 人日｜可独立上线）

- 新增 `makePowSolver(prefix, difficulty) → (answer) => boolean`
  - 复用 `Uint8Array` 缓冲与 `w` 表；十进制就地写字节；只比前 N 个十六进制位（不产出十六进制串）
  - `sha256Hex` **保留不动**（服务端 `verifyPow` 与单测基准都用它，动它风险最大）
- 三处同步：`src/framework/firewall/util/pow-sha256.js`（源）→ 内嵌页 `buildSolverSource()`（`toString()` 内联）→ `packages/challenge-client/src/pow.ts`
- 顺手修口径不一致：`config/schema.js` 里 `challengeDifficulty` 是 `1~6`，而 `challenge-template.js` 的 `MAX_DIFFICULTY = 5` —— 配置 6 会被静默夹成 5。提速后把代码上限提到 6，并用测试钉住"spec 上限 == 代码夹取上限"。
- **验收**：阶段 0 对拍绿；难度 3 ≤ 2ms、难度 5 ≤ 500ms（实测基线 9.5ms / 2.4s）

### 阶段 2：项⑤ 观测（1.5 人日｜可独立上线）

- 事件：`challenge.issued / solved / verified / failed{reason} / unsolvable`
- 字段：`provider`、`difficulty`、`surface`（`inline` | `page`）、`solveMs`、`reason`
- 落点：
  - 新增 `src/framework/firewall/challenge-metrics.js`：内存累加 + 定时 flush，**不进** `store.js` 的 1000 条环形缓冲（否则把流量记录冲掉）
  - `src/app/firewall/data/stats-redis.js`：delta 增加 `challenge` 分片 → 新 `STATS_KEY.challenge`（用直方图桶统计 `solveMs`，不要存原始数组）
  - 新端点 `GET /api/firewall/v1/monitor/challenge`（`registerSecureRoute` + `registerGroupMetadata` 上限频）
- 客户端：verify 请求体加可选 `solveMs`（schema 加字段）。**只用于统计，不参与任何判定**（客户端可伪造）。
- 告警：成功率 < 80% 或 `issued` 突增 → 复用现有 `alert` 通道（`enabled/email/webhookUrl/cooldownMs`）
- **验收**：跑一次挑战，面板能看到 issued/verified 各 1 次 + 耗时分位数；手动关掉 CSP（模拟事故）→ 成功率掉到 0 并能触发告警

### 阶段 3：项② 递进难度（2 人日｜默认关闭上线）

- `resolveChallengeDifficulty({ ip, fingerprint, deviceId, loggedIn }) → { difficulty, reason }`
  - 信号（全部现成，不新建表）：封禁来源（bot/scan/brute）、近窗口失败次数、该设备 pass 历史、UA 是否命中 `botPatterns`、是否登录
  - 存储：复用 `bumpCounter` / `readCounter`（`util/redis.js`），TTL = 窗口
  - 输出：以 `challengeDifficulty`（现有键）为基准 ±n，夹在 `[Min, Max]`
  - 返回体加 `reason`（粗粒度原因，**不暴露分数**），前端可显示"为什么被挑战"
- 新增配置（42 → **47** 个 defense 键）：`challengeProvider`、`challengeDifficultyMin`、`challengeDifficultyMax`、`challengeReputationEnabled`、`challengeReputationWindowSec`
- 契约同步（一个都不能漏）：`defaults.js` → `schema.js DEFENSE_SPEC` → `persisted.js`（自动清洗生效）→ `monitor.js`（自动生成）→ **`firewall/src/stores/settings.ts` 的 `DEFENSE_KEYS`**
- **验收**：连续通过 → 降到 Min；连续失败 → 升到 Max；`challengeReputationEnabled=false` → 恒定基准（三条都要有对照用例）

### 阶段 4：项④a 匿名真实验证 provider（2~3 人日/每个｜默认 `pow`）

- 接口：`{ name, issue(ctx), verify(ctx, answer) }`，落 `src/app/firewall/services/providers/`
  - `pow`（默认，现有逻辑搬进来）、`turnstile`、`tencent-captcha`、`cap`（先做其一）
- 配置：`defense.challengeProvider` 走 spec；**密钥走环境变量**（`CHALLENGE_TURNSTILE_SECRET` 等），**不进** `data/firewall_config.json`（那份文件会被面板整份写回）
- 校验失败策略：外部超时 → **fail-closed 但返回可重试的 503**，同时计入观测；**不要**静默放行
- 前端：`ChallengeCard` 增加 captcha 插槽；前端页 CSP 放行对应第三方域
- 内嵌页：`provider ≠ pow` 时降级为 pow（不接第三方）
- **风险（需拍板）**：第三方可达性（国内）、隐私（客户端 IP 暴露给第三方）、成本、SLA

### 阶段 5：项③ 边缘层（1 人日 + 运维协作）

仓库目前**没有** firewall 的 nginx 配置（只有 `oauth21/nginx.conf`），需新建：

- `deployment/nginx/firewall-edge.conf`（示例，逐行注释）
  - `limit_req_zone $binary_remote_addr zone=fw_chal:10m rate=10r/m`，只挂 `/api/firewall/v1/challenge/`
  - `limit_conn_zone` 单 IP 并发
  - `map` 明显恶意 UA/路径 → 444（默认注释掉）
  - 确认 `Cache-Control: no-store` 不被边缘缓存吞掉（`proxy_ignore_headers` 或显式 bypass）
- 原则写进文档：**边缘只做无状态粗粒度判定，语义权威永远是应用层**；并明确"边缘拒绝 = 面板没有记录"，否则排障时找不到人
- **风险**：两层阈值不一致 → 用户看到莫名 429 但面板无记录

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
| 3 | 递进难度 | 2 | ✅ | `challengeReputationEnabled`（默认 false） |
| 4 | provider + 1 个第三方 | 2~3 | ✅ | `challengeProvider`（默认 pow） |
| 5 | 边缘层 | 1 | ✅ | nginx 侧开关 |
| 6 | WebAuthn | 3~4 | 可选 | 按用户开关 |

合计 **8~9 人日**到"四项落地"（不含 WebAuthn）。阶段 0/1 不依赖任何决策。

---

## 6. 待拍板

1. **④a 是否引入第三方验证码**（Turnstile / 腾讯云 / Cap）？只做 pow + WebAuthn 则零外部依赖。
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
