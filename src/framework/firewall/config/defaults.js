/**
 * 防火墙默认安全策略矩阵（**core 保底默认值**）
 *
 * ════════════════════════════════════════════════════════════════════
 * 一、位置与分层（改之前先看清这条链）
 * ════════════════════════════════════════════════════════════════════
 * 默认值必须住在 core（本文件）：防护核心要在「没有 app 层、没有 src/config
 * 覆盖」的前提下也能以完整默认策略启动。
 *   ① 本文件                          core 保底值（改内置默认才动这里）
 *   ② src/config/firewall_config.js   可选静态覆盖（只写要改的键，文件可缺失）
 *   ③ src/data/firewall_config.json   运行时覆盖（面板热改，数组整体替换）
 * 载入顺序：① ← ② ← ③，后者逐层覆盖前者。
 *
 * ════════════════════════════════════════════════════════════════════
 * 二、为什么有 `defense` 这一层（不要试图拍平）
 * ════════════════════════════════════════════════════════════════════
 * `securitySettings.defense.*` 是**持久化文件的既有 schema**：
 *   - 磁盘：`src/data/firewall_config.json` 的 `securitySettings.defense`
 *   - 合并：initDao 时 deepMerge(默认值, 磁盘值)，逐层覆盖
 *   - 消费：52 处 `settings.defense.xxx` 读取 + 管理面板按此路径读写
 * 改名/拍平 = 破坏存量 JSON 兼容 + 面板全挂。因此**对外结构冻结**。
 *
 * ════════════════════════════════════════════════════════════════════
 * 三、组织方式：按功能分块 → 末尾拼装
 * ════════════════════════════════════════════════════════════════════
 * 功能常量块（展示 / 手动名单 / 扫描检测 / 全局限频 / 用户限频 / 暴破 /
 * 连接闸门 / 地理围栏 / Bot 检测 / 挑战难度 / 设备维度 / 匿名短路 / 告警）
 * 各自带取值理由；末尾按 `defense` 既有键名展开 —— 调某类阈值只看对应那一块。
 * 拼装处不写逻辑（不做运算、不读 env），保证「默认值 = 字面量」。
 *
 * env 兜底已退役（2026-11-03）：调优阈值不读 FW_* 环境变量；仅剩两个特例：
 * FW_RATE_LIMIT_OVERRIDE（压测纯放宽旁路）、FW_TRAFFIC_STATS_FILE（测试隔离）。
 *
 * @author yijiu2025
 * @since 2026-11-03（配置值住在 core，src/config 只做可选覆盖）
 */

import { deepMerge } from '../../config/runtime.js';
import { loadOverrides } from '../../config/overrides.js';

// ════════════════════════════════════════════════════════════════════
// 展示与手动名单
// ════════════════════════════════════════════════════════════════════

/** 公网 IP 归属查询数据源（面板「当前节点 IP」展示用）：sohu | ipify */
const ACTIVE_IP_API = 'sohu';

/** 面板是否展示访问轨迹（省份热力图） */
const SHOW_TRAJECTORY = true;

/** 手动黑/白名单（面板与 CLI 维护，此处只是出厂默认空名单） */
const MANUAL_LISTS = {
  manualBlacklistIps: [],
  manualBlacklistUsers: [],
  manualWhitelistIps: []
};

// ════════════════════════════════════════════════════════════════════
// 扫描检测：短时大量 404 视为路径爆破
// ════════════════════════════════════════════════════════════════════
const SCAN_DETECTION = {
  enableAutoBlacklist: true,
  // 同一窗口内 404 次数达到该值即封禁
  maxNotFoundAttempts: 10,
  // 404 计数窗口（秒）
  notFoundWindow: 60,
  // 封禁时长（秒）
  blacklistDuration: 3600,
  // 免检路径（健康检查 / 静态资源 / 面板自身）
  safePaths: ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'],

  // 内网网段：来自这些地址的请求视为可信代理，不做自动封禁
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
// 全局限频：每个键（已登录按 user.id，未登录按 IP）在窗口内的请求数
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
// 用户级限频：登录用户单独的桶（防单账号刷接口）
// ════════════════════════════════════════════════════════════════════
const USER_RATE_LIMIT = {
  enableUserRateLimit: true,
  userRateLimitRequests: 120,
  userRateLimitWindow: 60
};

// ════════════════════════════════════════════════════════════════════
// 暴力破解防护：同一账号 / IP 连续失败
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
// 并发连接闸门：单 IP 同时在飞的连接数
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
  connStaleAfterMs: 600000
};

// ════════════════════════════════════════════════════════════════════
// 地理围栏：海外 IP 访问敏感路径时收紧限流
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
// Bot 检测：UA 特征匹配 + 三档挑战阈值
// ════════════════════════════════════════════════════════════════════
const BOT_DETECTION = {
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
// 人机挑战：PoW 难度
// ════════════════════════════════════════════════════════════════════
// 前导十六进制零个数：期望哈希次数 = 16^difficulty（3 → 约 4096 次，浏览器 <0.1s；
// 5 → 约 100 万次，约 1~2s）。代码侧夹取到 [1, 6] 上限，防止把低端机卡死。
const CHALLENGE = {
  challengeDifficulty: 3
};

// ════════════════════════════════════════════════════════════════════
// 设备维度封禁（跨 IP）：换个 IP 重来也拦得住
// ════════════════════════════════════════════════════════════════════
// 自动封禁/挑战命中时，除 IP 外**同时**记到设备 ID 上（设备 ID 来自 auth 的结构化
// 设备 ID 流程，与 IP 无关）。这是唯一能拦住「换个 IP 重来」的维度。
// 关掉它则退回纯 IP 维度（历史上只有 IP 一个维度）。
const DEVICE_BLOCK = {
  enableDeviceBlock: true
};

// ════════════════════════════════════════════════════════════════════
// 匿名请求的深度检测短路
// ════════════════════════════════════════════════════════════════════
// 打开后：路由声明 requireLogin 且请求**一个凭据都没带**时，跳过 Bot/地理/端点限频
// 这三个深度检测（这些请求必被守卫 401，检测结果用不上）。
// 取舍：端点枚举的阻力会下降（第一层全局限流与封禁/白名单阶段仍然生效）。
// 默认关闭 —— 省下的只是 CPU 与 Redis 往返，而损失的是探测可见性。
const ANON_DEEP_CHECK = {
  skipDeepCheckForAnonymous: false
};

// ════════════════════════════════════════════════════════════════════
// 攻击告警（旁路能力）：命中封禁 / 挑战时通知
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
const FIREWALL_DEFAULTS = {
  activeIpApi: ACTIVE_IP_API,
  showTrajectory: SHOW_TRAJECTORY,

  defense: {
    ...MANUAL_LISTS,
    ...SCAN_DETECTION,
    ...GLOBAL_RATE_LIMIT,
    ...USER_RATE_LIMIT,
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
const DEFAULT_SECURITY_SETTINGS = deepMerge(FIREWALL_DEFAULTS, OVERRIDES);

export { DEFAULT_SECURITY_SETTINGS };
