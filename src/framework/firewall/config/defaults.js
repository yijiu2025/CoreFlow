/**
 * 防火墙默认安全策略矩阵（framework 层单一来源）
 *
 * 为什么住在 framework（2026-11-02）：`05-firewall.js` 现在直接启动
 * `framework/firewall/bootstrap.js`（防护核心），app/firewall 只是可选扩展
 * （配置持久化 / 面板 / 遥测）。app 被卸载时核心仍要能以默认策略运行，
 * 而配置读取器（interface/config-access.js）在没有 dao 时需要一个兜底来源 ——
 * 兜底默认值必须住在 framework，否则 framework 就得反向 import app（违反隔离契约）。
 *
 * 单一来源：app/firewall/config/config.js 只是 re-export 本文件，
 * dao 的磁盘配置（firewall_config.json）在 initDao 时 deepMerge 进内存单例。
 *
 * 阈值参数支持环境变量覆盖，格式: FW_<大写参数名>
 *
 * @author yijiu2025
 * @since 2026-11-02（自 app/firewall/config/config.js 原样迁入）
 */

const DEFAULT_SECURITY_SETTINGS = {
  activeIpApi: process.env.FW_ACTIVE_IP_API || 'sohu',
  showTrajectory: true,

  defense: {
    manualBlacklistIps: [],
    manualBlacklistUsers: [],
    manualWhitelistIps: [],

    // --- 扫描检测 ---
    enableAutoBlacklist: true,
    maxNotFoundAttempts: parseInt(process.env.FW_SCAN_THRESHOLD || '10'),
    blacklistDuration: parseInt(process.env.FW_BLACKLIST_DURATION || '3600'),
    notFoundWindow: parseInt(process.env.FW_SCAN_WINDOW || '60'),
    safePaths: ['/health', '/favicon.ico', '/robots.txt', '/__fw/', '/api/firewall/'],

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

    idcIpPrefixes: ['100.104.', '101.37.', '47.88.', '162.14.', '101.36.', '52.82.'],

    // --- 全局限频 ---
    // 阈值是「每个键（已登录按 user.id，未登录按 IP）在窗口内的请求数」。
    // 历史默认 10000/60s ≈ 167 rps/键 —— 单 IP 打这么多请求已足以压垮进程，
    // 等于没有这一层防护；600/60s ≈ 10 rps/键，面板（WebSocket + 20s 心跳）与
    // 正常 SPA 交互都有 10 倍以上余量。压测需要更宽时用 FW_RATE_LIMIT_OVERRIDE
    // （只放宽、且必须严格正整数，见 engine/detectors/first-ratelimit.js）。
    // 全局限流开关（默认关闭）：只决定「有没有全局桶」——即没有声明 config.rateLimit 的路由
    // 是否也按 rateLimitRequests/rateLimitWindow 限流。**不再决定插件是否注册**
    // （2026-11-02 修：此前关全局 = @fastify/rate-limit 不注册 = 全仓 14 处端点声明静默失效，
    //  h5-token 的 30 次/分钟与 groupId 从未生效）。
    enableRateLimit: false,
    // 端点级限频开关（默认开启）：只决定「各路由声明的 config.rateLimit / groupId 是否生效」。
    // 关掉它 = 端点级声明一律忽略；若此时 enableRateLimit 也为 false，插件完全不注册（真·不限流）。
    // 与 enableRateLimit **互不联动**：关全局不会带走端点声明（2026-11-01 拆分 + 2026-11-02 修）。
    //
    // 2026-11-02 起**不再有** defense.endpointRateLimits（防火墙管道内自研路径规则）——
    // 那套规则既匹配不到现存路由（path 写的是 /api/sms 等不存在的接口），封禁又写到了
    // 非 IP 的键上，整套空转；端点级限流统一由 @fastify/rate-limit 的路由声明承担。
    enableEndpointRateLimit: true,
    rateLimitRequests: parseInt(process.env.FW_RATE_LIMIT || '600'),
    rateLimitWindow: parseInt(process.env.FW_RATE_WINDOW || '60'),

    // --- 用户级限频 ---
    enableUserRateLimit: true,
    userRateLimitRequests: parseInt(process.env.FW_USER_RATE_LIMIT || '120'),
    userRateLimitWindow: 60,

    // --- 暴力破解防护 ---
    enableBruteForce: true,
    bruteLimit: parseInt(process.env.FW_BRUTE_LIMIT || '5'),
    bruteWindow: 300,
    accountLockTime: parseInt(process.env.FW_LOCK_TIME || '900'),
    ipBlockTime: 600,
    bruteIpLimit: parseInt(process.env.FW_BRUTE_IP_LIMIT || '10'),

    // --- 并发连接 ---
    enableConnLimit: true,
    maxConn: parseInt(process.env.FW_MAX_CONN || '100'),
    // 僵尸连接清理任务周期（毫秒），默认 5 分钟。每次清理跑完重新读配置再排下一轮，
    // 面板/磁盘配置改了无需重启，下一轮即生效。非法值（非正数）回退默认。
    connCleanupIntervalMs: parseInt(process.env.FW_CONN_CLEANUP_INTERVAL || '300000'),
    // 连接记录静默阈值（毫秒）：超过这么久没活跃即视为泄漏残留并回收。
    // ⚠️ 必须大于单请求最长生命周期（上游 requestTimeout 默认 300s），
    // 否则正常长请求的 +1 会在请求结束前被回收，随后的 -1 计数失真。
    // 默认 10 分钟 = 2 × requestTimeout，且为清理周期的 2 倍。
    connStaleAfterMs: parseInt(process.env.FW_CONN_STALE_AFTER || '600000'),

    // --- 地理围栏 ---
    enableGeoFilter: process.env.FW_GEO_FILTER === 'true',
    geoRules: {
      // 敏感路径（逗号分隔，环境变量覆盖）
      sensitivePaths: process.env.FW_SENSITIVE_PATHS
        ? process.env.FW_SENSITIVE_PATHS.split(',')
        : ['/api/admin', '/api/payment', '/api/user/delete'],
      internalPrefixes: ['/internal/'],
      overseasLimit: 10,
      overseasWindow: 60,
      overseasBlockTime: 3600
    },

    // --- 端点级限频（可配置数组） ---
    // 已移除（2026-11-02）：原 endpointRateLimits 是防火墙管道内的自研路径规则，
    // 三条规则的 path（/api/sms、/api/order、/api/verify）在现存路由里**一条都不存在**
    // （实际前缀是 /auth、/user、/verify、/admin…），`url.includes()` 永不命中；
    // 且超限时 `setBlock('<path>:<ip>')` 写的是非 IP 键，封禁也落不了地。
    // 端点级限流现在**只有一条实现**：各路由自己的 `config: { rateLimit: {...} }`
    // （由 @fastify/rate-limit 的 onRoute 消费，见 first-ratelimit.js）。

    // --- Bot 检测（支持字符串和正则表达式） ---
    // 环境变量 FW_BOT_PATTERNS 可追加自定义模式（逗号分隔）
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
      'selenium',
      ...(process.env.FW_BOT_PATTERNS ? process.env.FW_BOT_PATTERNS.split(',') : [])
    ],
    browserPatterns: ['chrome', 'firefox', 'safari', 'edge', 'opera'],
    botChallengeNoUaLimit: parseInt(process.env.FW_BOT_NOUA_LIMIT || '10'),
    botChallengeBotLimit: parseInt(process.env.FW_BOT_LIMIT || '30'),
    botChallengeBrowserLimit: parseInt(process.env.FW_BROWSER_LIMIT || '120'),

    // --- 人机挑战的 PoW 难度 ---
    // 前导十六进制零个数：期望哈希次数 = 16^difficulty（3 → 约 4096 次，浏览器 <0.1s；
    // 5 → 约 100 万次，约 1~2s）。代码侧夹取到 [1, 6] 上限，防止把低端机卡死。
    challengeDifficulty: parseInt(process.env.FW_CHALLENGE_DIFFICULTY || '3'),

    // --- 设备维度封禁（跨 IP） ---
    // 自动封禁/挑战命中时，除 IP 外**同时**记到设备 ID 上（设备 ID 来自 auth 的结构化
    // 设备 ID 流程，与 IP 无关）。这是唯一能拦住「换个 IP 重来」的维度。
    // 关掉它则退回纯 IP 维度（历史上只有 IP 一个维度）。
    enableDeviceBlock: process.env.FW_DEVICE_BLOCK !== 'false',

    // --- 匿名请求的深度检测短路 ---
    // 打开后：路由声明 requireLogin 且请求**一个凭据都没带**时，跳过 Bot/地理/端点限频
    // 这三个深度检测（这些请求必被守卫 401，检测结果用不上）。
    // 取舍：端点枚举的阻力会下降（第一层全局限流与封禁/白名单阶段仍然生效）。
    // 默认关闭 —— 省下的只是 CPU 与 Redis 往返，而损失的是探测可见性。
    skipDeepCheckForAnonymous: process.env.FW_SKIP_DEEP_CHECK_ANON === 'true',

    // --- 攻击告警（旁路能力） ---
    // email / webhookUrl 为空时 auto-responder 不做任何外部请求，等价于关闭。
    alert: {
      enabled: true,
      email: process.env.FW_ALERT_EMAIL || '',
      webhookUrl: process.env.FW_ALERT_WEBHOOK || '',
      cooldownMs: 300000
    }
  }
};

export { DEFAULT_SECURITY_SETTINGS };
