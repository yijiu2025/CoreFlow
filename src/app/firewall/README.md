# Firewall 模块架构

# Firewall 模块架构（两层分离，2026-11-01）

> **分层约定**：关键防护引擎上移 `src/framework/firewall/`（五道管卡、封禁语义、
> 挑战 PoW），且**核心装配（bootstrap.js）由 `loader/registry/05-firewall.js` 直接启动**；
> 本目录（app 层）保留**与前端互动的部分**：策略配置与持久化、面板遥测与 WebSocket
> 广播、CLI、邮件告警通道注入。app → framework 单向依赖，framework 零依赖 app
> （由 `conventions/framework-app-isolation.test.js` 守卫）。
>
> **启动编排**（05-firewall.js，三步顺序不可换）：
> ① app 前置 `prepareAppFirewall()`（initDao 注册配置读取器 + 邮件通道，须先于核心，
> 因 registerRateLimit 注册期读 `defense.enableRateLimit`）→
> ② framework 核心 `firewallCorePlugin`（无条件启动）→
> ③ app 收尾 `firewallAppPlugin`（名单同步 + onClose 落盘）。
> 删除本目录后 ①③ 消失，② 以 framework 默认策略（`config/defaults.js`）继续防护。

## 目录结构

```
src/framework/firewall/               # 【架构层】防护引擎（始终存在）
├── block-manager.js                  # 封禁/白名单**真身**：三维度 CRUD + checkGlobalBlock + isUserManuallyBlocked
├── bootstrap.js                      # 【核心装配插件】firewallCorePlugin：限流插件 + 五阶段管道 + 观测钩子（05-firewall 直接启动）
├── challenge/                        # 【人机挑战】出题 / 难度 / 观测（三件事各一个文件，公共出口是 index.js）
│   ├── index.js                      # 门面：调用方一律从这里导入，改文件划分时只动这里
│   ├── difficulty.js                 # 挑战难度决策：基准 ± 信誉浮动（默认关闭），取代"难度写死一个值"
│   ├── metrics.js                    # 签发/通过/失败计数 + 求解耗时分位（进程内累加，热路径不写 Redis）
│   └── template.js                   # 内置挑战页 HTML 模板（页面 / CSP / 302 / Worker；PoW 能力在 verify/pow）
├── telemetry-sink.js                 # 遥测注入点：app 注册 pushRecord，引擎经此产生记录事件
├── config/
│   └── defaults.js                   # 默认安全策略矩阵（framework 单一来源；app config.js 只是 re-export）
├── interface/
│   └── config-access.js              # 配置读取器注册点（零 import，依赖图最底层，断开 util ↔ dao 环）
├── util/
│   ├── redis.js                      # Redis 访问层（key 构造、Lua、三维度封禁/白名单/计数/挑战语义、内存降级）
│   ├── shared.js                     # 共享内存状态（activeConnections、ipRequestTimestamps、getConfig）
│   ├── connection-tracker.js         # 并发连接追踪 + 僵尸清理定时任务
│   ├── fingerprint.js                # 请求指纹生成（IP+UA+Lang+Enc → SHA256 前 16 位）
│   └── pow-store.js                  # 挑战载荷存储适配器（把 writeChallenge/takeChallenge 注入 verify/pow）
└── engine/                           # 五道管卡（只做检测与响应，不含面板遥测）
    ├── index.js                      # barrel：检测器 / 自动响应 / 请求管道
    ├── pipeline.js                   # onRequest 五层拦截管道 + 登录结果观测 + 日志记录
    ├── auto-responder.js             # 攻击告警与自动响应（邮件通道由 app 注入，Webhook 直发）
    └── detectors/
        ├── first-ratelimit.js        # 第一层：@fastify/rate-limit 全局限流（enableRateLimit 开关）
        ├── rate-limiter.js           # 端点级滑窗限频（enableEndpointRateLimit 独立开关）
        ├── bot-detector.js           # Bot/僵尸网络检测 + 挑战触发
        ├── geo-filter.js             # 地理围栏 + GeoIP 解析
        ├── brute-force.js            # 登录爆破防护（IP 挑战 + 账号锁定，执行点在 oauth21 登录链）
        └── scan-trap.js              # 404/403 扫描陷阱检测

src/app/firewall/                     # 【应用层】面板/配置/遥测（可卸载；卸载后核心以默认策略运行）
├── index.js                          # app 扩展层：prepareAppFirewall（配置+邮件通道）/ firewallAppPlugin（名单+落盘）/ initFirewall（测试用组合）
├── config.js                         # 应用清单（loader 扫描约定，10-apps.js 消费）
├── config/
│   └── config.js                     # 默认安全策略矩阵、IP 解析 API 列表、常量定义
├── dao/
│   └── dao.js                        # 策略持久化（JSON）、黑白名单管理、向 framework 注册配置读取器
├── data/
│   ├── store.js                      # 面板遥测：环形缓冲、统计汇总、磁盘持久化、WebSocket 广播（注册遥测 sink）
│   └── stats-redis.js                # 遥测跨实例汇聚（自访问层拆出，随消费者留在 app）
├── services/                         # 面板编排（monitor / metrics）
│   └── challenge/                    # 人机挑战编排（门面 index.js）
│       ├── index.js                  # 门面：issueChallenge / verifyChallenge
│       ├── service.js                # 编排：取上下文 → 选 provider → 记观测 → 判题 → 签 pass
│       └── providers/                # 出题/判题实现（pow / turnstile / hcaptcha / google 同一形状）
├── cli/                              # 运维命令行
└── permission/                       # 面板权限

### 分层约定（有契约测试守卫）

依赖方向**必须单向**，越靠下越底层：

```

interface/ → config/ util/ → dao/ → engine/ → services/ cli/ data/ → index.js
零依赖 只能向下 数据访问 检测响应 应用编排 入口

```

三条硬约束，由 `src/__tests__/conventions/firewall-layering.test.js` 用 DFS 三色法守着：

1. **无循环依赖**。ESM 下循环依赖不报错，只让某些模块拿到半初始化的绑定。
   历史上出现过 `engine/index.js ↔ engine/pipeline.js`，以及更隐蔽的跨 3 文件环
   `util/shared.js → dao/dao.js → util/redis.js`。
2. **`interface/` 零内部依赖**。它是依赖倒置点：`dao` 把自己的 `getSecuritySettings`
   注册进来，`util/shared.js` 从它读取 —— 这样 util 不必 import dao，环自然断开，
   且**没有快照副本**（注册的是函数引用）。一旦它开始 import 别人，环立刻回来。
3. **`engine/` 不持有存储实现**，也不转发 dao/util 的符号。
   封禁能力请直接 `import from '../dao/block-manager.js'`。

> 配置读取器未注册时 `readSecuritySettings()` 会**抛错**，而不是返回 `undefined`。
> 这是刻意的：后者会让 `settings.defense` 变成 `TypeError`，把失败点推得离根因很远。

## 请求处理流程

```

客户端请求
│
▼
auth onRequest（先注册）
├── ALS 初始化 → request.state = {}
└── JWT 验证 → request.state.user

▼
@fastify/rateLimit onRequest（全局限流）
└── keyGenerator → 已登录用 user.id，未登录用 IP

▼
firewall onRequest（五层拦截管道） ← engine/pipeline.js
│
├── 第 1 层：连接追踪
│ └── trackConnection(+1) ← util/connection-tracker.js
│
├── 第 2 层：全局封禁
│ └── checkGlobalBlock() ← dao/block-manager.js
│ └── 挑战态分支先放行「挑战接口」与「健康探针」（否则挑战解不开 = 死锁）
│ · firewall.challengeSurface 声明 ← 路由自证
│ · defense.probePaths / PROBE_PATHS ← 配置 + 代码兜底
│
├── 第 3 层：挑战 Cookie
│ └── checkChallengeCookie() ← engine/pipeline.js
│
├── 第 4 层：Bot 检测
│ └── checkBotChallenge() ← engine/detectors/bot-detector.js
│
└── 第 5 层：地理围栏 + 端点限频
├── checkGeoReputation() ← engine/detectors/geo-filter.js
└── checkRateLimit() ← engine/detectors/rate-limiter.js
│
▼ (若触发挑战)
buildChallengePage() ← framework/firewall/challenge/template.js
│
▼ (正常放行)
业务路由处理
│
▼
firewall onSend 钩子
├── trackConnection(-1) ← util/connection-tracker.js
└── pushRecord() ← data/store.js（记录 + 广播）
│
▼
firewall onResponse 钩子
├── observeLoginOutcome() ← pipeline.js（只认声明了 firewall.credentialRoute 的路由）
└── checkNotFoundTrap() ← engine/detectors/scan-trap.js（可被 firewall.skipScanTrap 豁免）

```

### 路由级防火墙声明

「这条路由的 403 是正常业务」「这条路由消费凭证」「这条路由是挑战接口」这类
**关于路由的事实**，由路由自己在 `config.firewall` 里声明，防火墙从
`request.routeOptions.config` 读（`onRequest` / `onResponse` 阶段路由已匹配）。
**不要**在防火墙里用路径正则或路径常量去猜：

| 声明 | 作用 | 读取点 |
| --- | --- | --- |
| `config.firewall.skipScanTrap: true` | 该端点的 403/404 不计入扫描陷阱 | `scan-trap.js` |
| `config.firewall.credentialRoute: true` | 该端点的响应参与暴力破解计数（成功清零 / 失败累加） | `pipeline.js` 的 `observeLoginOutcome` |
| `config.firewall.challengeSurface: true` | 该端点是挑战接口：**任何状态下无条件可达**（深度检测跳过 + 挑战态放行） | `pipeline.js` 的 `isChallengeApiUrl` |
| `config.firewall.probeEndpoint: true` | 该端点是健康探针：**任何状态下无条件可达**（同上） | `pipeline.js` 的 `isProbeUrl` |
| `config.riskExempt: true` | 设备指纹变更时不被拦截（退出/切号/验证等） | `anomaly-detector` |

其中 `challengeSurface` **漏了就是全站死锁**，不是"少拦一点" —— 挑战态下的请求连
"签发一份载荷"都拿不到，客户端永远解不开。两个挑战路由（`/issue`、`/verify`）都必须有。
`probeEndpoint` 漏了则是**容器重启循环**（探针拿到 428 → 编排判死 → 重启 → IP 仍在挑战态）。

**健康探针是"两条腿"的例外** —— 声明 + 配置**并集**，任一条命中即放行：

| 腿 | 覆盖什么 | 会不会漂 |
| --- | --- | --- |
| 路由声明 `probeEndpoint` | 本服务注册了的探针路由（默认三条） | 不漂，随路由走 |
| `defense.probePaths`（兜底 `PROBE_PATHS`） | 部署方额外探的路径，**可能没有对应路由**（`/healthz`） | 靠人同步 |

为什么不能只留一条：只有配置 → `system.json` prefix 一改，真实路由变了而配置里的旧值没跟上，
探针就被挑战（和挑战接口常量漂移同一类 bug）；只有声明 → 覆盖不到"没有路由的探针路径"，
而那正是运营最常自定义的形态。并集方向故意选 **fail-open**（多豁免 > 少豁免）：
这里少豁免的后果是容器起不来，多豁免的代价只是在固定文案端点上少跑几条启发式判定。

**两个 flag 为什么不能合成一个**（`alwaysReachable` 之类）：
`challengeSurface` / `probeEndpoint` 说的是「这条路由**是什么**」，不是「它要豁免」。
合成一个就丢掉三样东西：对账测试的归属（哪一类归哪个文件拥有、数量钉死）、
将来语义分化的余地（探针可能还要豁免扫描陷阱，挑战接口要限流），
以及读代码时"事实 vs 机制"的分界。**机制共用在判据函数里做**
（`pipeline.js` 的 `isUnconditionallyReachable`），标记保持分开。

**`skipScanTrap` 为什么不给健康路由也加**：那个声明只影响 **403/404** 的计数
（`bootstrap.js` 里 `if ([404, 403].includes(reply.statusCode))` 才进扫描陷阱），
而健康端点只会返 200 / 503 —— 403/404 根本不存在，加了是空转。
挑战端点必须两个都有：它的 403 是**正常业务**（`Invalid Proof` / `Expired` / `Mismatch`）。

为什么不用路径正则 / 路径常量（2026-11-06 的教训）：

- 暴力破解上一版用 `/\/(mini-login|login|verify-email)$/`。它有两个**静默失效**方向 ——
  路由改名（`/login` → `/signin`）就不再计数；新增登录端点忘记同步正则，同样不计数。
  改成声明后，名字怎么写都不影响计数是否生效。迁移时还发现 `/authorize/login`
  （OAuth 授权流程里的登录提交）一直被旧正则的 `$` 后缀"侥幸"覆盖着，没人显式决定过。
- 挑战接口上一版用常量 `['/api/firewall/v1/challenge/issue', ...]`，而这两个字面量是
  `system.json` prefix + group prefix + route url **三段手拼**的。任一段改了常量不跟着变
  → 挑战接口自己被挑战 → **死锁**。现在声明和 URL 在同一个对象字面量里，改 URL 的人
  眼前就是那行声明。

对账用例：`__tests__/firewall/login-brute-force-wiring.test.js`、
`__tests__/firewall/challenge-surface-wiring.test.js`（正查 / 反查 / 数量 / 接线四向）。


## 挑战页：CSP nonce + Blob Worker（两条都是必需的）

页面是**单文件自包含**的（零外链，对任意 URL 下发），所以有两条容易踩空的细节：

| 事项 | 做法 | 不做会怎样（实测） |
| --- | --- | --- |
| 内联脚本 | 每次响应生成一个 nonce，同时写进 `<script nonce>` 与响应头 `Content-Security-Policy: script-src 'nonce-…'` | 生产全局策略是 `script-src 'self'`，浏览器直接拦掉整段脚本 → 页面永远停在 "Verifying your browser"，**连失败提示都不会出现**（`fail()` 也没执行），用户无出口 |
| PoW 求解 | 放进 Blob Worker（`worker-src blob:`），主线程同步求解只作降级 | 难度 ≥4 时主线程冻结 0.5~2s：进度条不动、点击无响应、低端机可能被判「页面无响应」 |

- 用 nonce 而不是 `'sha256-…'`：页面每次都不同（内嵌本次 challengeId / salt），哈希无法预置。
- 脚本**不放** `'unsafe-inline'`：那会把全局 XSS 防护一起削掉。
- 开发环境 `contentSecurityPolicy: false`，**这类问题本地看不见** —— 所以 `sendChallengePage` 无条件设置本页 CSP，让本地看到的就是线上行为；回归用例见 `__tests__/firewall/challenge-page-csp.test.js`（真 fastify + 真 helmet + 真 HTTP）。
- **PoW 能力不在本目录**：哈希原语 / 出题 / 判题在 `framework/verify/pow/`（验证能力库，与 captcha / recaptcha 同构）。
  本目录只负责"怎么把题呈现给用户"——页面、CSP、302、Worker。载荷的存储通过
  `util/pow-store.js` 注入（`put` / `take`，**`take` 必须是原子取走**，否则"一次性"就没了）。
- **后续加固计划**（递进难度 / provider / 边缘层 / WebAuthn）：`./docs/PLAN-2026-11-06-challenge-hardening.md`
  （PoW 提速 5.9×、观测、PoW 能力归位已完成）。

### 挑战页去哪儿：`defense.challengePageUrl`

| 请求类型 | 响应 |
| --- | --- |
| 文档请求 + **配了** `challengePageUrl` | **302** 到该地址（带 `?return=<原 URL>`），让这类流量也走前端那套 UI |
| 文档请求 + 没配（或刚从前方页回退） | 200 + 内置 HTML（自包含、零外链） |
| 非文档请求（XHR / 脚本 / 非浏览器客户端） | 428 + `X-Firewall-Challenge`，由前端拦截器按自家 `BASE_URL` 跳转 |

- 只接受**站内相对路径**（`/firewall/challenge.html`）：绝对地址会让 302 变成开放重定向，且跨站后 `fw_verified` 变第三方 cookie，`SameSite=Strict` 不发送 → 通过后又被挑战。写坏按"空"处理（回落内置页）。
- **前端页挂了怎么兜底**：`challenge.html` 里有自愈守卫（资源 error / 8s 未挂载 → 跳回 `return`），后端用 30s 的一次性 cookie `fw_chal_page` 识别这类回退，直接给内置页。这条环必须有标记 cookie 才闭合，否则"前端挂 → 回退 → 又 302 → 又挂"是死循环。

### 验证方式（`defense.challengeProvider`）

| 取值 | 出题 | 判题 | 备注 |
| --- | --- | --- | --- |
| `pow`（默认） | 服务端存载荷 → 下发 `challengeId/salt/difficulty` | 原子取走载荷 → 比绑定 → 验前导零 | 零外部依赖，**内嵌页唯一可用** |
| `turnstile` | 只回 `siteKey` | token 转给 `verify.reCAPTCHA` 上游 | Cloudflare，无感；国内可达性一般 |
| `hcaptcha` | 同上 | 同上 | |
| `google` | 同上 | 同上 | reCAPTCHA v2/v3（v3 带 score 阈值） |

provider 层在 `services/challenge/providers/`（`pow.js` / `recaptcha.js` / `index.js` 注册表），
形状统一为 `{ name, issue(ctx), verify(input) }` —— 加第四种只需在注册表登记一行。

三条必须知道的规则：

1. **判题按载荷形状选 provider，不按配置**：带 `token` → 第三方；带 `challengeId/answer` → pow。
   配置在下发与提交之间被热改（面板换 provider）时，手里拿着旧形状答案的用户仍能过 ——
   否则他们会被永远卡住。安全性不因此放松：pow 分支要求载荷能在服务端查到，而载荷只由 pow 出题时写入。
2. **切第三方必须先配 `challengePageUrl`**：内嵌挑战页是零外链单文件（CSP `default-src 'none'`），
   塞不进第三方组件，只能发 pow 题。没配时会在启动日志里警告（内嵌页仍是一条 pow 入口）。
3. **降级规则只有一处**：名字写错 / 密钥没配齐 → 回落 pow + 告警一次。绝不"谁也不验证"。

失败语义：token 不对 → 403 `Invalid Proof`；**上游不可达 → 503 `Challenge Unavailable`**（可重试）。
把基础设施故障挫成 403，运维看到的会是"用户全在失败"，真实原因却是我们的外网出口挂了。

issue 响应新增 `provider` 字段（前端据此决定"解 PoW"还是"渲染第三方组件"），
`providers/` 之外**不需要改动调用方**。

前端侧（组件挂载 / 脚本加载与卸载 / 重试时机 / 回退路径）不在本仓：
见前端 `firewall/docs/待开发流程日志.md`。本文只保留**后端要保证的**那部分 ——
下发 `provider` 与 `siteKey`、判题按载荷形状选路、失败语义可区分。

后端只有一件部署要做：`TURNSTILE_SECRET_KEY` / `RECAPTCHA_SECRET_KEY` 及其 `*_SITE_KEY`
走环境变量（**不进** `data/firewall_config.json`，那份文件会被面板整份写回）。
本地用官方测试密钥跑通过（secret `1x0000000000000000000000000000000AA` 永远通过），
**真上线前必须换** —— 测试密钥等于谁都能过。

### 递进难度（`defense.challengeReputationEnabled`，默认关闭）

难度不再是一个写死的数字，而是「基准 ± 1~2 档」，按**该 IP 近窗口内的挑战表现**浮动
（`challenge/difficulty.js`）：

| 触发 | 变化 | 区间 / 配置项 |
| --- | --- | --- |
| 顺利通过 ≥3 次、零失败 | 降 1 档 | 不低于 `challengeDifficultyMin`（默认 2）<br>次数由 `challengeReputationRelaxAfterPasses` 定 |
| 答错 ≥2 次且一次没通过 | 升 1 档 | — <br>次数由 `challengeReputationHardenAfterFails` 定 |
| 答错 ≥5 次 | 升 2 档 | 不高于 `challengeDifficultyMax`（默认 5）<br>次数由 `challengeReputationHardenStrongAfterFails` 定 |
| 已登录 | 再降 1 档 | 同上 |

三个触发阈值（2 / 5 / 3）都是 `defense` 下的配置项，可按自己的流量画像改（最小 1）：
不同站点"一次正常浏览撞几次挑战""一个误触用户会错几次"差别很大，写死在代码里等于
假设所有人一样。窗口的**下限 30s** 与**缺省 600s** 刻意留在代码里 —— 它们是给配置
兜底的东西，本身再可配就成了没有兜底，而 schema 里已经有一份（`min: 30`）。

`challengeReputationHardenStrongAfterFails` 写得比 `HardenAfterFails` 小时不会静默失效：
读配置时抬到同值，退化成"答错 N 次直接升 2 档"（见 `readThresholds`）。

三条刻意的取舍（改之前请先读 `challenge/difficulty.js` 头注释）：

1. **只有「答案不对」（`Invalid Proof`）计入升难度**。`Challenge Expired`（载荷 300s 过期）、
   `Mismatch`（切网导致 IP 变）、`Malformed` 都不计 —— 它们是客户端/网络问题，计进去就是
   这类机制最经典的自伤：用户越倒霉 → 题越难 → 更过不去 → 题更难。
2. **只按 IP 记**（`chal:fail:<ip>` / `chal:pass:<ip>`，窗口从第一次计数起算）。换设备/换指纹
   正是攻击方的常规动作，捆太细记不住；NAT 共享的副作用被「窗口 10 分钟 + 最多 ±2 档」限制住。
3. **配置写坏不变成机制失效**：`Min > Max` 自动交换、窗口 <30s 回退 600s、难度 `"abc"`/`0`
   回退基准、三个阈值写成 `0`/负数/`"abc"` 回退 2/5/3、`HardenStrong < Harden` 抬平 ——
   任何一项都不允许退化成「永远基准」或「永远上限」。

issue 响应体多一个 `reason`（`baseline` / `hardened` / `relaxed`），前端可以解释一句
"为什么这次要多算一会儿"。它**不含分数也不含计数**，不足以让攻击者反推阈值。

### 挑战链路指标（`GET /api/firewall/v1/monitor/challenge`）

回答的是「**用户能不能过验证**」，而 `/summary` 只回答「拦了多少」。2026-11-05 那次生产 CSP 把挑战页整段拦掉，
HTTP 全是 200、`/summary` 看起来一切正常 —— 因为当时**没有成功率**，事故才潜伏了一整天。

| 字段 | 含义 |
| --- | --- |
| `issued` / `verified` / `failed` | 签发 / 通过 / 失败次数 |
| `successRate` | 通过率，**分母是"真正提交过答案"的次数**（签发数会被"打开页面又关掉"放大，拿它当分母会显得永远不达标） |
| `reasons` | 失败原因分布（Expired / Mismatch / Invalid Proof / Malformed） |
| `solveMs` | 求解耗时**分位估算**（桶中点口径，不是精确值）+ 原始桶计数 |
| `bySurface` | `inline`（内置页）/ `page`（302 前端页）/ `xhr`（428）—— 用来回答"内嵌页还有多少真实流量" |
| `byDifficulty` / `byProvider` | 难度、验证方式分布 |

- 计数在 `framework/firewall/challenge/metrics.js` 里**进程内累加**（热路径只做一次 Map 自增，不写 Redis），
  由 `data/store.js` 的刷写周期取增量批量 `HINCRBY` 进 `stats:challenge`（与流量统计同一次 MULTI）。
- `solveMs` 由客户端上报，**只进统计、不参与任何判定**（客户端可伪造）。
- 告警建议：`successRate < 0.8` 或 `issued` 突增 → 链路大概率坏了，先按「页面能不能真的渲染」去查。

## 模块职责

### config/ — 配置文件

| 文件         | 职责                                              | 关键导出                                                                            |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| config.js    | 生效默认值（core 打底 + app 补自己的键）、IP 解析源、常量路径 | `DEFAULT_SECURITY_SETTINGS`, `DEFAULT_IP_APIS`, `CHALLENGE_SECRET`, `FIREWALL_FILE` |
| panel.js     | **面板层**配置：展示偏好 / 节点定位（`showTrajectory`、`activeIpApi`） | `DEFAULT_PANEL_SETTINGS`（core 不含这两个键）                                        |

### data/ — 运行中数据

| 文件                  | 职责                                                   | 关键导出                                                                          |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| store.js              | 1000 条环形缓冲区、地域/路径/IP 统计、10 秒节流持久化  | `pushRecord`, `getRecentRecords`, `getSummary`, `getChallengeStatsAggregated`, `clearAll`, `setBroadcastHandler` |
| stats-redis.js        | 遥测跨实例汇聚（自访问层拆出，随消费者留在 app）       | `summarizeChallengeFields` 的 Redis 侧装配                                        |

### services/challenge/ — 人机挑战

框架层的三件事（难度 / 观测 / 内置页）在 `framework/firewall/challenge/`，
这里只做**编排**：取上下文 → 选 provider → 记观测 → 判题 → 签 pass。

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| index.js | 门面：对外只有签发与验证两个动作 | `issueChallenge`, `verifyChallenge` |
| service.js | 编排：绑定上下文 / 观测埋点 / 通过后签 `fw_verified` | `issueChallenge`, `verifyChallenge` |
| providers/index.js | provider 注册表 + 降级 + 按载荷形状选判题方 | `resolveChallengeProvider`, `pickVerifyProvider`, `EXTERNAL_PROVIDERS` |
| providers/pow.js | 自包含 PoW（出题落载荷、判题取载荷） | `powProvider` |
| providers/recaptcha.js | turnstile / hcaptcha / google 三家共用的工厂 | `createRecaptchaProvider` |

### dao/ — 数据交互层

| 文件             | 职责                                            | 关键导出                                                                                                                                                                    |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dao.js           | JSON 文件持久化、名单同步到 Redis、节点自动定位 | `getSecuritySettings`, `updateSecuritySettings`, `getServerNode`, `refreshServerNodeAuto`, `addToBlacklist`, `removeFromBlacklist`, `addToWhitelist`, `removeFromWhitelist` |
| block-manager.js | 封禁/白名单查询（前端面板）+ API 操作封装       | `getActiveBlocks`, `getActiveWhitelist`, `setBlockFp`, `removeBlockFp`, `setWhitelist`, `removeWhitelist`, `setWhitelistFp`, `removeWhitelistFp`                            |

### util/ — 公共工具

| 文件                  | 职责                                                          | 关键导出                                                                               |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| shared.js             | 共享状态容器（内存 Map：连接数 / 请求时间戳 + 配置读取入口）  | `activeConnections`, `ipRequestTimestamps`, `getConfig`                                 |
| redis.js              | Redis 访问层：语义化读写 + 超时/降级（`eval` 调用点全在此，含门面导出） | `readAccessState`, `setBlock`, `consumeRateWindow`, `grantPass`, `takeChallenge` 等      |
| redis-keys.js         | 键命名与纯函数（零依赖）：`rel` / `HASH` / `full` / `dimOf` / `ID_BY_DIM` | `rel`, `HASH`, `full`, `dimOf`, `ID_BY_DIM`, `NS`, `KEY_SENTINEL`                       |
| redis-memory.js       | Redis 不可用时的内存降级实现（表结构 + 惰性清理 + 各域内存读写） | `mem`, `TABLES`, `sweepMemory`, `readAccessStateFromMemory`, `resetMemoryState` 等       |
| lua-scripts.js        | 全部 Lua 脚本字面量（纯字符串、零依赖，KEYS/ARGV 编号即契约） | `LUA_READ_ACCESS_STATE`, `LUA_WRITE_BLOCK`, `LUA_RATE_WINDOW`, `LUA_HAS_PASS` 等（9 个） |
| connection-tracker.js | 并发连接追踪 + 僵尸清理                                       | `trackConnection`, `getConnectionStats`, `cleanupStaleConnections`, `startCleanupTask`  |
| fingerprint.js        | 请求指纹生成                                                  | `generateFingerprint`                                                                   |

### engine/ — 防火墙核心逻辑

| 文件                      | 职责                                                              | 关键导出                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| pipeline.js               | onRequest 五层拦截管道 + onSend 日志记录                          | `shouldSkipDeepCheck`, `buildRequestContext`, `checkGlobalBlockPhase`, `checkChallengeCookie`, `runDetectionPipeline`, `recordLog` |
| detectors/rate-limiter.js | 计数交给 @fastify/rate-limit 的 createRateLimit；超限落封禁           | `trackRequestCount`, `checkRateLimit`                                                                                              |
| detectors/scan-trap.js    | 404/403 扫描行为检测                                              | `checkNotFoundTrap`                                                                                                                |
| detectors/brute-force.js  | 登录暴力破解防护                                                  | `checkLoginBruteForce`, `isAccountLocked`                                                                                          |
| detectors/geo-filter.js   | 地理围栏 + GeoIP 解析                                             | `checkGeoReputation`, `resolveGeoInfo`                                                                                             |
| detectors/bot-detector.js | Bot/僵尸网络检测                                                  | `checkBotChallenge`                                                                                                                |
| dao/block-manager.js      | IP/指纹/设备三维度封禁核心（checkGlobalBlock + CRUD，Redis 双写 + 内存缓存） | `setBlock`, `removeBlock`, `setBlockForSubject`, `checkGlobalBlock`                                                                |

## 外部依赖

- `@fastify/rate-limit` — 全局速率限制插件（onRequest 阶段，支持用户/IP 双维度）
- `geoip-lite` — IP 地理位置数据库
- `fastify-plugin` — Fastify 插件封装

## 配置校验（三处入口，**一份规则**）

配置有三条入口，规则只有一份：`framework/firewall/config/schema.js` 的 `DEFENSE_SPEC` /
`PANEL_SPEC`（工具在 `framework/config/field-spec.js`）。

| 入口 | 校验执行点 | 非法值的结果 |
| --- | --- | --- |
| `src/config/firewall_config.js`（部署静态覆盖） | 随启动加载，走下面 persisted 的同一条清洗 | 丢弃 → 回落 `defaults.js` 默认值 + 启动 warn |
| `data/firewall_config.json`（手改 / 面板落盘） | `config/persisted.js` → `sanitizeSecuritySettings()` | 同上（一次告警列全部被丢弃键） |
| 面板 `PATCH /monitor/settings` | ① 接口 schema（**由 spec 生成**，数值带 `minimum`）② `dao.updateSecuritySettings()` 写前清洗 | 明显非法 → 400；能归一化的（`"100"` → `100`、`"false"` → `false`）→ 归一化后生效 |

三条硬规则：

1. **规则只写在 spec 里**。不要在检测器里写 `settings.x || 默认值`、也不要在 API schema 里手写
   `defense` 字段 —— 那会变成第二份规则，改了这处忘那处（历史上 `enableBotChallenge` 就只在
   API schema 里存在，后端根本没有这个键）。
2. **新增一个配置项要动三处**：`defaults.js`（值）+ `schema.js` 的 `DEFENSE_SPEC`（类型/上下界）
   + 读取点。`__tests__/firewall-config-schema.test.js` 会双向比对键集合，漏一处就红。
3. **写入期会归位形状**：`{ maxConn: 100 }` 这种忘了套 `defense` 的载荷会被收回 `defense` 下
   并打 warn。历史上前端有一处这么提交，后端深合并后写成顶层死键、重启即丢。

## 开关一览（总开关 + 五道闸门）

面板「Firewall」标签页把这套开关画成「总开关 + 每道闸门一个 checkbox」，全部落在
`securitySettings.defense` 下（因此也走同一份 spec 校验、可被 `src/config` 与 JSON 覆盖）。

| 层 | 配置键 | 关掉之后 |
| --- | --- | --- |
| 总开关 | `enableFirewall` | **整套防护旁路**：不计数、不查封禁、不下挑战、不拦请求（排障用，生产别留 false） |
| 闸门① 连接数 | `enableConnLimit` | 不再统计/限制单 IP 并发连接 |
| 闸门② 封禁 | `enableGlobalBlock` | 不再执行黑名单与已封禁态拦截（挑战态也属封禁键，一并失效） |
| 闸门③ 挑战 | `enableChallenge` | 挑战态请求直接放行、不再下发挑战页；**Bot 检测一并跳过**（它只会写挑战态） |
| 闸门④ Bot | `enableBotChallenge` | `checkBotChallenge()` 直接返回未命中（三档阈值保留，重开即恢复） |
| 闸门⑤ 地理围栏 | `enableGeoFilter` | 不再按 GeoIP 做 IDC / 境外收紧 |
| 旁路 全局限流 | `enableRateLimit` | 不注册全局 `@fastify/rate-limit` |
| 旁路 扫描陷阱 | `enableAutoBlacklist` | 404/403 不再累计、不再自动封禁 |

语义边界（改代码前先确认）：

- **关闸门 = 这道闸不拦**，其余闸门照常；每道闸的关闭点都在实现处留了注释，便于排障时确认
  "是关掉的"而不是"没生效"。
- `enableFirewall=false` 时 `onSend` 的 `-1` 也跳过 —— 没有 `+1` 就不能 `-1`，否则会去减
  别的请求留下的计数。
- 挑战闸门关闭时 Bot 检测无法处置（它唯一的处置手段是写挑战态），因此一并跳过，
  避免白烧 CPU 并往库里写没人读的状态。

## 数据持久化

> ⚠️ 下表路径均相对 **`src/`**：`app/firewall/config/config.js` 与 `data/store.js` 用的是
> `path.resolve(__dirname, '../../../data/...')`，从各自文件上溯三层都落在 `src/`——
> **不是仓库根**。仓库根的 `data/` 是 7 月遗留的死文件（零代码引用），已于 2026-09-19 删除。
> ⚠️ 第三行已迁移：守卫配置现在存**数据库** `guard_configs` 表，`data/guard_config.json` 已废弃。

| 文件                        | 内容                                          | 更新频率        |
| --------------------------- | --------------------------------------------- | --------------- |
| `data/firewall_config.json` | 服务器节点信息 + 安全策略配置                 | 防抖 1 秒       |
| `data/traffic_stats.json`   | 流量记录 + 统计数据                           | 节流 10 秒      |
| **（已迁 DB）** `guard_configs` 表 | 3 级 Guard 配置（由 `src/api/guard-config.js` 管理） | 启动时 + 变更时 |
```
