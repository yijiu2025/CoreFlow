/**
 * 防火墙默认安全策略矩阵（**core 保底默认值**）
 *
 * ════════════════════════════════════════════════════════════════════
 * 一、位置与分层（改之前先看清这条链）
 * ════════════════════════════════════════════════════════════════════
 * 默认值必须住在 core（本文件）：防护核心要在「没有 app 层、没有 src/config
 * 覆盖」的前提下也能以完整默认策略启动。
 *   core 链（本文件负责）：① ← ② ← ③，后者逐层覆盖前者
 *   ① 本文件                          core 保底值（改内置默认才动这里）
 *   ② src/config/firewall_config.js   服务器后端层的静态覆盖（只写要改的键，可缺失）
 *   ③ data/firewall_config.json   运行时覆盖（面板热改，数组整体替换）
 *   ④ src/app/firewall/config/panel.js 面板层默认值（展示偏好）：由 app 层合并进来，
 *      **不属于 core 链** —— core 不认识也不读它，只在磁盘文件里遇到时原样透传。
 *
 * **只收防护策略**：一个键若没有任何 core 代码读取（例如面板开关
 * `showTrajectory`、节点定位数据源 `activeIpApi`），它就不属于这里 ——
 * 默认值归面板层（`src/app/firewall/config/panel.js`）。判据：
 * `grep -rn "defense\.<key>" src/framework/firewall` 为空 ⇒ 不该写在 core。
 *
 * **形状是硬约束**：`defense` 的键只能出现在 `defense` 下。写在 `securitySettings` 顶层的
 * 同名键**不迁移、不读取**，载入时直接剔除并在启动日志里列出来（`config/validate.js`）——
 * schema 只有一个版本，没有"历史兼容层"。
 *
 * **值也要过校验**：本文件的键集合是"有哪些配置"，每个键的类型/上下界在
 * `config/schema.js` 的 `DEFENSE_SPEC`（唯一一份规则表）。新增键时**两处都要加**，
 * 否则 `__tests__/firewall-config-schema.test.js` 会红。校验在三个边界执行：
 * 加载期清洗（非法值丢弃 → 回落本文件的默认值）、写入期清洗（面板落盘前）、
 * 面板接口 schema（由 spec 生成）。
 *
 * ════════════════════════════════════════════════════════════════════
 * 二、为什么有 `defense` 这一层（不要试图拍平）
 * ════════════════════════════════════════════════════════════════════
 * `securitySettings.defense.*` 是**持久化文件的既有 schema**：
 *   - 磁盘：`data/firewall_config.json` 的 `securitySettings.defense`
 *   - 合并：initDao 时 deepMerge(默认值, 磁盘值)，逐层覆盖
 *   - 消费：52 处 `settings.defense.xxx` 读取 + 管理面板按此路径读写
 * 改名/拍平 = 破坏存量 JSON 兼容 + 面板全挂。因此**对外结构冻结**。
 *
 * ════════════════════════════════════════════════════════════════════
 * 三、组织方式：按功能分块 → 末尾拼装
 * ════════════════════════════════════════════════════════════════════
 * 功能常量块（手动名单 / 扫描检测 / 全局限频 / 暴破 / 连接闸门 /
 * 地理围栏 / Bot 检测 / 挑战难度 / 设备维度 / 匿名短路 / 告警）
 * 各自带取值理由；末尾按 `defense` 既有键名展开 —— 调某类阈值只看对应那一块。
 * 拼装处不写逻辑（不做运算、不读 env），保证「默认值 = 字面量」。
 *
 * env 兜底已退役（2026-11-03）：调优阈值不读 FW_* 环境变量；仅剩两个特例：
 * FW_RATE_LIMIT_OVERRIDE（压测纯放宽旁路）、FW_TRAFFIC_STATS_FILE（测试隔离）。
 *
 * @author yijiu2025
 * @since 2026-11-03（配置值住在 core，src/config 只做可选覆盖）
 * @since 2026-11-04（面板展示类键下沉面板层；删除已无消费者的用户级限频三键）
 */

import { deepMerge } from '../../../config/runtime.js';
import { loadOverrides } from '../../../config/overrides.js';
import { sanitizeSecuritySettings } from './schema.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.firewall.config.defaults');

// ════════════════════════════════════════════════════════════════════
// ① 总开关 + 五道闸门各自的开关
// ════════════════════════════════════════════════════════════════════
// 面板把防火墙拆成「总开关 + 每道闸门一个开关」，全部落在 defense 下：
//   总开关            enableFirewall        false = 所有钩子直接放行（连计数都不做）
//   ① 连接数闸门      enableConnLimit       （见 CONN_LIMIT，既有关键开关）
//   ② 封禁闸门        enableGlobalBlock     false = 不再执行黑名单 / 已封禁态拦截
//   ③ 挑战闸门        enableChallenge       false = 挑战态请求直接放行，且不再下挑战
//   ④ Bot 闸门        enableBotChallenge    （见 BOT_DETECTION，既有关键开关）
//   ⑤ 地理围栏闸门    enableGeoFilter       （见 GEO_FENCE，既有关键开关）
// 另有两条不属于"五道闸门"的旁路：全局限流 enableRateLimit、扫描陷阱 enableAutoBlacklist。
//
// ⚠️ 关闸门的语义是"这道闸不再拦"，不是"这道闸失效得静默" —— 每道闸关闭时都会在
//    命中点留一条 debug/warn（见各自实现），排障时能看出是"关掉的"而不是"没生效"。
// ⚠️ enableFirewall=false 是**排障用**的核弹级开关：整套防护（含封禁、限流、扫描陷阱）
//    全部旁路。生产环境不要留 false。
const FIREWALL_SWITCHES = {
  enableFirewall: true,
  enableGlobalBlock: true,
  enableChallenge: true
};

// ════════════════════════════════════════════════════════════════════
// ② 手动名单
// ════════════════════════════════════════════════════════════════════

/**
 * 手动黑/白名单（面板与 CLI 维护，此处只是出厂默认空名单）
 *
 * 它属于 core：`block-manager` 在**每个请求**上直接读这份名单，
 * 与面板是否安装、app 是否加载无关。
 *
 * ⚠️ 这里**不放**面板展示类配置（`showTrajectory` / `activeIpApi`）——
 * 它们是 firewall 应用控制台的概念（前端开关 + 节点定位数据源），
 * 防护核心从不读取。默认值住在 `src/app/firewall/config/panel.js`（面板层），
 * 由 app 层合并进来（2026-11-04 迁移）。
 */
const MANUAL_LISTS = {
  manualBlacklistIps: [],
  manualBlacklistUsers: [],
  manualWhitelistIps: []
};

// ════════════════════════════════════════════════════════════════════
// ③ 扫描与豁免（阈值 + 路径/地址清单）：短时大量 404 视为路径爆破
// ════════════════════════════════════════════════════════════════════
const SCAN_DETECTION = {
  enableAutoBlacklist: true,
  // 同一窗口内 404 次数达到该值即封禁
  maxNotFoundAttempts: 10,
  // 404 计数窗口（秒）
  notFoundWindow: 60,
  // 封禁时长（秒）
  blacklistDuration: 3600,
  // 扫描陷阱的**路径前缀**免检名单（config 通道：默认值 → src/config → 面板热改）。
  //
  // 两类豁免别混（2026-11-04 明确边界）：
  //   ① 有路由的端点 → 在自己的路由配置里声明 `config: { firewall: { skipScanTrap: true } }`
  //      （与 `config.rateLimit` 同款，随路由走；用于「我的 403/405 是正常业务语义」，
  //      如挑战端点验签失败回 403）。core 不需要为它维护路径清单。
  //   ② 没有路由的路径 → 只能写在这里。这类请求 404 时 `routeOptions.config` 是空对象，
  //      根本无从声明：favicon/robots、老探针路径、面板调用已删端点。
  //
  // ⚠️ **不默认放前端产物前缀**（`/firewall/`、`/admin/`）：本仓前后端分离部署，前端由
  //    nginx/CDN 承担，这些路径打到本服务本来就是 404。某个部署若同域托管前端，运维在
  //    这里显式加上即可 —— 代码不替某个部署形态做假设（2026-11-04）。
  // ⚠️ `/api/firewall/` 保留：面板旧构建调用已删端点会 404，逐路由声明覆盖不到它。
  // ⚠️ 数组是**整体替换**：面板保存会写入完整清单。新增部署需要的前缀请自行补上，
  //    core 不再内置任何路径（scan-trap 只读本键）。
  safePaths: ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'],

  // 回环地址前缀：扫描陷阱**永不自动封禁**这些来源。
  // 理由（2026-11-03 实测踩到）：本机流量只可能来自"我自己" —— 开发期在 127.0.0.1 上刷
  //   前端、探针直连、SSR 自调用都会产生 404/403，一旦判成 SCANNER 就把开发机自己封 1 小时，
  //   所有接口 403，排查方向被完全带偏。
  // ⚠️ 与下面的 `internalIpPrefixes` 是两回事：那份含 RFC1918，整份豁免等于关掉扫描陷阱
  //    （代理部署在 10.x 时 request.ip 全是内网地址）。只豁免回环。
  // ⚠️ 2026-11-05：值从 scan-trap.js 的代码常量上收到这里 —— 代码侧只剩空数组，
  //    保底值住本文件。删空本键 = 连本机都不豁免，改之前想清楚。
  loopbackPrefixes: ['127.', '::1', 'localhost'],

  // 内网网段：**仅用于地理围栏判定**（geo-filter 跳过这些来源的 IDC / 境外规则）。
  // ⚠️ 扫描陷阱（自动封禁）只读上面的 `loopbackPrefixes`，不读这份列表 —— 否则代理部署
  //    在内网网段时 request.ip 全是内网地址，等于关掉陷阱。
  internalIpPrefixes: [
    '127.',
    '10.',
    '192.168.',
    '::1',
    '172.16.',
    '172.17.',
    '172.18.',
    '172.19.',
    '172.20.',
    '172.21.',
    '172.22.',
    '172.23.',
    '172.24.',
    '172.25.',
    '172.26.',
    '172.27.',
    '172.28.',
    '172.29.',
    '172.30.',
    '172.31.'
  ],

  // 机房 / 云厂商网段：地理围栏不判定这些来源（避免把自家出口当海外流量）
  idcIpPrefixes: ['100.104.', '101.37.', '47.88.', '162.14.', '101.36.', '52.82.']
};

// ════════════════════════════════════════════════════════════════════
// ③b 探针路径（与上面的豁免清单同属一类，故意紧邻放）
// ════════════════════════════════════════════════════════════════════
// 扫描陷阱的豁免一共三份清单，全在 `defense` 下，改之前先认清是哪一份：
//   · `safePaths`          路径前缀：没有路由的 404 不计数（favicon / 已删端点）
//   · `loopbackPrefixes`   地址前缀：回环来源永不自动封禁
//   · `probePaths`（本块） 探针路径：必须无条件可达（连挑战都不能拦）
//
// 探针路径与部署形态有关（编排系统的探测配置各不同），因此做成配置；`pipeline.js` 里保留
// 同名常量作为**最终兜底**（配置缺失/写空时回退），关系是
// 「代码兜底 ← 本文件默认值 ← src/config 覆盖 ← 面板热改」。
//
// ⚠️ 三类路径的处理各不相同，别把它们混成一类：
//   · 挑战接口路径 → **不进配置，也不做常量**：它是**路由的性质**，声明在路由上
//     （`config.firewall.challengeSurface`，2026-11-06 起）。原因：常量是把
//     `system.json` prefix + group prefix + route url 三段手拼的，任一段改了常量不跟着变
//     → 挑战接口自己被挑战 → 全站登录死锁。声明与 URL 在同一个对象字面量里，物理上不会漂。
//   · 健康探针路径 → **两条腿（并集）**：默认三条也声明在路由上
//     （`config.firewall.probeEndpoint`，随 prefix 走、不会漂）；本文件的 `probePaths`
//     负责**部署方额外探的路径**（k8s `httpGet.path`、nginx 健康检查，可能没有对应路由）。
//     只留配置 → prefix 一改探针就被挑战（容器重启循环）；只留声明 → 覆盖不到无路由路径。
//   · 前端产物路径（`/firewall/challenge.html` 等）→ 后端**根本不该知道** —— 后端起的是
//     API，前端由 nginx/CDN 部署；写死在 core 只会在前端改目录时变成死链（2026-11-04 已移除）。
const PROBE_PATHS = {
  // 健康探针：必须无条件可达，否则探针会被本系统的 Bot 检测判成"无 UA 高频"而拿到挑战页
  // （探针通常不带 UA，60s 窗口内 5s 一次 = 12 次 > botChallengeNoUaLimit 默认 10）。
  // 改这里的同时要确认 `api/system/v1/health.js` 确实注册了这些路径。
  probePaths: ['/v1/health', '/v1/health/live', '/v1/health/ready']
};

// ════════════════════════════════════════════════════════════════════
// ④ 全局限频：每个键（已登录按 user.id，未登录按 IP）在窗口内的请求数
// ════════════════════════════════════════════════════════════════════
// 历史默认 10000/60s ≈ 167 rps/键 —— 单 IP 打这么多请求已足以压垮进程，
// 等于没有这一层防护；600/60s ≈ 10 rps/键，面板（WebSocket + 20s 心跳）与
// 正常 SPA 交互都有 10 倍以上余量。压测需要更宽时用 FW_RATE_LIMIT_OVERRIDE
// （只放宽、且必须严格正整数，见 engine/detectors/first-ratelimit.js）。
const GLOBAL_RATE_LIMIT = {
  // 只决定「有没有全局桶」——即没有声明 config.rateLimit 的路由是否也按本组阈值限流。
  // **不再决定插件是否注册**（2026-11-02 修：此前关全局 = @fastify/rate-limit 不注册
  // = 全仓 14 处端点声明静默失效，h5-token 的 30 次/分钟与 groupId 从未生效）。
  enableRateLimit: false,
  rateLimitRequests: 600,
  rateLimitWindow: 60,

  // 端点级限频开关（默认开启）：只决定「各路由声明的 config.rateLimit / groupId 是否生效」。
  // 关掉它 = 端点级声明一律忽略；若此时 enableRateLimit 也为 false，插件完全不注册（真·不限流）。
  // 与 enableRateLimit **互不联动**：关全局不会带走端点声明（2026-11-01 拆分 + 2026-11-02 修）。
  //
  // 2026-11-02 起**不再有** defense.endpointRateLimits（防火墙管道内自研路径规则）——
  // 那套规则既匹配不到现存路由（path 写的是 /api/sms 等不存在的接口），封禁又写到了
  // 非 IP 的键上，整套空转；端点级限流统一由 @fastify/rate-limit 的路由声明承担。
  enableEndpointRateLimit: true
};

// ════════════════════════════════════════════════════════════════════
// ⑤ 暴力破解防护：同一账号 / IP 连续失败
// ════════════════════════════════════════════════════════════════════
const BRUTE_FORCE = {
  enableBruteForce: true,
  // 窗口内失败次数上限（账号维度）
  bruteLimit: 5,
  bruteWindow: 300,
  // 账号锁定时长（秒）
  accountLockTime: 900,
  // IP 封禁时长（秒）
  ipBlockTime: 600,
  // 窗口内失败次数上限（IP 维度，比账号宽松：NAT 出口会共用 IP）
  bruteIpLimit: 10
};

// ════════════════════════════════════════════════════════════════════
// ⑥ 并发连接闸门：单 IP 同时在飞的连接数
// ════════════════════════════════════════════════════════════════════
const CONN_LIMIT = {
  enableConnLimit: true,
  maxConn: 100,
  // 僵尸连接清理任务周期（毫秒），默认 5 分钟。每次清理跑完重新读配置再排下一轮，
  // 面板/磁盘配置改了无需重启，下一轮即生效。非法值（非正数）回退默认。
  connCleanupIntervalMs: 300000,
  // 连接记录静默阈值（毫秒）：超过这么久没活跃即视为泄漏残留并回收。
  // ⚠️ 必须大于单请求最长生命周期（上游 requestTimeout 默认 300s，
  // 见 src/config/app_config.js 的 http.requestTimeoutMs），
  // 否则正常长请求的 +1 会在请求结束前被回收，随后的 -1 计数失真。
  // 默认 10 分钟 = 2 × requestTimeout，且为清理周期的 2 倍。
  connStaleAfterMs: 600000,
  // 活跃 IP 表的高水位**告警**阈值（条）：超过即打一条 warn，说明"窗口内有大量不同来源 IP"。
  // 内存 ≈ 条数 × 125B（实测）。这里**不做强制淘汰** —— 按 IP 挤掉别人的记录恰好是攻击者
  // 想要的（挤掉即绕过计数），所以只观测、不驱逐。
  // 小内存实例可以调小（5000 就能提前发现异常），调大则减少日志噪音。
  connHighWater: 50000
};

// ════════════════════════════════════════════════════════════════════
// ⑦ 地理围栏：海外 IP 访问敏感路径时收紧限流
// ════════════════════════════════════════════════════════════════════
const GEO_FENCE = {
  enableGeoFilter: false,
  geoRules: {
    // 敏感路径：来自海外 IP 的访问按 overseasLimit 限流
    sensitivePaths: ['/api/admin', '/api/payment', '/api/user/delete'],
    internalPrefixes: ['/internal/'],
    overseasLimit: 10,
    overseasWindow: 60,
    overseasBlockTime: 3600
  }
};

// ════════════════════════════════════════════════════════════════════
// ⑧ 人机挑战：Bot UA 特征 + 三档频次阈值
// ════════════════════════════════════════════════════════════════════
const BOT_DETECTION = {
  // Bot 检测**总开关**（2026-11-05 补）：false 时 `checkBotChallenge()` 直接返回"未命中"，
  // 不再做 UA 匹配与三档频率判定 —— 等于把下面四个键一起旁路。
  // 为什么需要它：历史上面板有一个同名的假开关（后端没有这个键），勾掉后实际仍在检测；
  // 现在这个键是真的，关掉就是关掉（挑战与封禁都不再因 Bot 触发，但地理围栏/限流照旧）。
  // ⚠️ 关掉它会让脚本/爬虫直接拿到正常响应，只在"明确要放开自动化访问"时使用。
  enableBotChallenge: true,
  // 自定义模式：写 firewall_config.json 的 defense.botPatterns（deepMerge 对数组
  // 是**整体替换**，需写全量清单，不含下面这些内置模式）
  botPatterns: [
    'python-requests',
    'scrapy',
    'httpclient',
    'go-http-client',
    'java/',
    'libcurl',
    'wget',
    'axios',
    'node-fetch',
    'headless',
    'phantomjs',
    'selenium'
  ],
  browserPatterns: ['chrome', 'firefox', 'safari', 'edge', 'opera'],
  // 无 UA / Bot UA / 浏览器 UA 三档挑战阈值（窗口内请求数）
  botChallengeNoUaLimit: 10,
  botChallengeBotLimit: 30,
  botChallengeBrowserLimit: 120
};

// ════════════════════════════════════════════════════════════════════
// ⑧b 人机挑战：PoW 难度
// ════════════════════════════════════════════════════════════════════
// 前导十六进制零个数：期望哈希次数 = 16^difficulty（3 → 约 4096 次，浏览器 <0.1s；
// 5 → 约 100 万次，约 1~2s）。代码侧夹取到 [1, 6] 上限，防止把低端机卡死。
const CHALLENGE = {
  // 人机验证方式。取值清单在 `config/schema.js` 的 `CHALLENGE_PROVIDERS`（spec 的 enum 来源）：
  // `pow`（默认，自包含）/ `turnstile` / `hcaptcha` / `google`。
  //
  // 切到第三方前必须先配 `challengePageUrl`：内置挑战页是零外链的单文件
  // （CSP `default-src 'none'`），塞不进第三方组件，只能发 pow 题。
  // 未知取值 / 密钥没配齐 → 运行时回落 pow 并告警（见 app 的 challenge/providers/index.js）。
  challengeProvider: 'pow',
  challengeDifficulty: 3,
  // ── 递进难度（默认关闭）──
  //
  // 开起来以后，挑战难度不再是固定值，而是「基准 ± 1~2」，依据该 IP 近窗口内的
  // 挑战结果浮动（见 challenge/difficulty.js）：
  //   连续答错 → 升（最多到 challengeDifficultyMax）；连续顺利通过 → 降（最低到 Min）；
  //   登录用户整体降一档（有身份可追责，体验优先）。
  //
  // 为什么默认关：它改变的是"给用户出多难的题"，属于体验与防护的取舍，
  // 不该由升级动作替运维决定。想用就显式打开，并观察 challenge 观测里的
  // 成功率与 solveMs 分位（`GET /api/firewall/v1/monitor/challenge`）。
  //
  // ⚠️ 只把 **Invalid Proof（答案不对）** 计入升难度。`Challenge Expired`（载荷 300s
  // 过期）/ `Mismatch`（切网导致 IP 变）/ `Malformed` 都不计 —— 它们更像客户端或
  // 网络问题，拿它们加难度会把真实用户越推越死，这是这类机制最常见的自伤。
  challengeReputationEnabled: false,
  // 难度下限：连续顺利通过时最低降到这（不要低于 2，难度 1 只需 16 次哈希，等于没有成本）
  challengeDifficultyMin: 2,
  // 难度上限：连续答错时最高升到这（上限受代码侧 MAX_DIFFICULTY=5 夹取）
  challengeDifficultyMax: 5,
  // ── 三个触发阈值（"偶发"与"反复"的分界线）──
  //
  // 这不是"安全强度"旋钮，而是**流量画像**旋钮：不同站点一次正常浏览会撞几次挑战、
  // 一个误触的键盘用户会错几次，差别很大。写死在代码里等于假设了所有人的画像都一样。
  //
  // 默认值取 2 / 5 / 3 的理由：
  //   · 2 次答错还没通过 —— 已经超出"手滑"，但还够不上"在刷"（真人在难度 3 上不会连错 2 次）；
  //   · 5 次答错 —— 差不多是一次页面重试风暴的量级，这时只加 1 档已经不够；
  //   · 3 次顺利通过 —— 少于 3 次分不开"运气好"和"这台机器稳定"，多于 3 次降档太迟钝。
  //
  // ⚠️ 这三个数是**次数**，不是秒数。调小（尤其改成 1）会让正常的重试立刻顶到上限，
  // 调大则等于关掉这套机制 —— 调之前请先看 challenge 观测里的失败原因分布
  // （`GET /api/firewall/v1/monitor/challenge` 的 `reasons`）：如果 `Expired` 占大头，
  // 要修的是挑战页或网络，不是这三个数。
  //
  // `HardenStrong` 写小于 `Harden` 时不会静默失效：读配置时会抬到 `Harden` 同值
  // （见 challenge/difficulty.js 的 readThresholds），退化成"答错 N 次直接升 2 档"。
  challengeReputationHardenAfterFails: 2,
  challengeReputationHardenStrongAfterFails: 5,
  challengeReputationRelaxAfterPasses: 3,
  // 计数窗口（秒）：从**第一次**计数起算，不滑动。600s 约等于一个正常用户
  // "被挑战 → 求解 → 继续浏览"的若干个来回，够区分"偶发"与"反复"。
  // 下限 30s 由代码兜底（低于它一次页面加载就能把窗口走完，等于没有窗口）。
  challengeReputationWindowSec: 600,
  // 独立前端挑战页的地址（**空 = 用后端内置页**）
  //
  // 配了以后，**文档请求**（浏览器直接打开被挑战的 URL）会 302 到它，带上
  // `?return=<原 URL>`，让这类流量也走前端那套 UI（多语言、错误引导、将来的验证码）。
  // 非文档请求（XHR）不受影响：仍返回 428 + `X-Firewall-Challenge`，由前端拦截器跳转。
  //
  // 取值约束：只接受**站内相对路径**（如 `/firewall/challenge.html`）——
  //   · 绝对地址/协议相对地址会把 302 变成开放重定向；
  //   · 跨站后 `fw_verified` 变成第三方 cookie，`SameSite=Strict` 不再发送
  //     → 用户通过后立刻又被挑战（死循环）。
  // 非法值按"空"处理（回落内置页），不报错、不影响可用性。
  //
  // 前端页自己起不来时（chunk 404 / 超时）会跳回 `?return=` 指向的原 URL，
  // 后端用一次性标记 cookie 识别这类回退，直接给内置页 —— 见 pipeline.sendChallengeResponse。
  challengePageUrl: ''
};

// ════════════════════════════════════════════════════════════════════
// ⑨ 设备维度封禁（跨 IP）：换个 IP 重来也拦得住
// ════════════════════════════════════════════════════════════════════
// 自动封禁/挑战命中时，除 IP 外**同时**记到设备 ID 上（设备 ID 来自 auth 的结构化
// 设备 ID 流程，与 IP 无关）。这是唯一能拦住「换个 IP 重来」的维度。
// 关掉它则退回纯 IP 维度（历史上只有 IP 一个维度）。
const DEVICE_BLOCK = {
  enableDeviceBlock: true
};

// ════════════════════════════════════════════════════════════════════
// ⑩ 匿名请求的深度检测短路
// ════════════════════════════════════════════════════════════════════
// 打开后：路由声明 requireLogin 且请求**一个凭据都没带**时，跳过 Bot/地理/端点限频
// 这三个深度检测（这些请求必被守卫 401，检测结果用不上）。
// 取舍：端点枚举的阻力会下降（第一层全局限流与封禁/白名单阶段仍然生效）。
// 默认关闭 —— 省下的只是 CPU 与 Redis 往返，而损失的是探测可见性。
const ANON_DEEP_CHECK = {
  skipDeepCheckForAnonymous: false
};

// ════════════════════════════════════════════════════════════════════
// ⑪ 攻击告警（旁路能力）：命中封禁 / 挑战时通知
// ════════════════════════════════════════════════════════════════════
// email / webhookUrl 为空时 auto-responder 不做任何外部请求，等价于关闭。
// 两个地址都可被 firewall_config.json 覆盖（面板热改），因此不再走 env。
const ALERT = {
  alert: {
    enabled: true,
    email: '',
    webhookUrl: '',
    // 同一攻击源的最小告警间隔（毫秒），防告警风暴
    cooldownMs: 300000
  }
};

// ════════════════════════════════════════════════════════════════════
// 拼装：键名与层级是**持久化 schema 契约**（firewall_config.json + 面板），勿改
// ════════════════════════════════════════════════════════════════════
// 只拼**防护策略**（defense）。面板展示类配置（showTrajectory / activeIpApi）属于
// 面板层，见 src/app/firewall/config/panel.js —— core 不认识它们，
// 也不该因为「文件里碰巧有这两个键」而假装自己拥有一份默认值。
//
// 顺序 = 上面的功能块顺序 = `config/schema.js` 的 spec 分组顺序：
//   ① 开关 ② 名单 ③ 扫描与豁免 ④ 限频 ⑤ 暴破 ⑥ 连接 ⑦ 地理 ⑧ Bot 与挑战
//   ⑨ 设备维度 ⑩ 匿名短路 ⑪ 告警
// 同一类放一块的目的不是好看：这三处（本文件 / spec / 面板）任意一处顺序与分组
// 对不上，改配置的人就得在三个文件之间来回找同一个键。
const FIREWALL_DEFAULTS = {
  defense: {
    ...FIREWALL_SWITCHES,
    ...MANUAL_LISTS,
    ...SCAN_DETECTION,
    ...PROBE_PATHS,
    ...GLOBAL_RATE_LIMIT,
    ...BRUTE_FORCE,
    ...CONN_LIMIT,
    ...GEO_FENCE,
    ...BOT_DETECTION,
    ...CHALLENGE,
    ...DEVICE_BLOCK,
    ...ANON_DEEP_CHECK,
    ...ALERT
  }
};

// ════════════════════════════════════════════════════════════════════
// 可选静态覆盖（src/config/firewall_config.js，缺失即 {}）
// ════════════════════════════════════════════════════════════════════
const OVERRIDES = loadOverrides('firewall_config.js', 'DEFAULT_SECURITY_SETTINGS', 'firewall_config');

/** 生效默认值 = core 保底 ← 静态覆盖（运行时 JSON 覆盖由 persisted.js 再叠一层） */
const MERGED_DEFAULTS = deepMerge(FIREWALL_DEFAULTS, OVERRIDES);

// 静态覆盖同样要过值校验（2026-11-05）：这里若不校验，`src/config/firewall_config.js`
// 里写 `maxConn: "abc"` 会变成"默认值本身是坏的" —— 下游任何 sanitize 都把坏值当默认值
// 再合并回去，等于校验失效。校验后丢弃的键由 FIREWALL_DEFAULTS 补回。
const CLEANED_DEFAULTS = sanitizeSecuritySettings(MERGED_DEFAULTS);
if (CLEANED_DEFAULTS.problems.length > 0) {
  log.warn(
    `⚠️ [Firewall] src/config/firewall_config.js 里有 ${CLEANED_DEFAULTS.problems.length} 处配置不合法，` +
      `已按 core 默认值处理：${CLEANED_DEFAULTS.problems.map(p => `${p.key}（${p.message}）`).join('；')}`
  );
}

const DEFAULT_SECURITY_SETTINGS = deepMerge(FIREWALL_DEFAULTS, CLEANED_DEFAULTS.value);

export { DEFAULT_SECURITY_SETTINGS };
