/**
 * 防火墙默认安全策略矩阵（配置值单一来源）
 *
 * ⚠️ 本文件只放**值**，不放机制：
 *   - 这里 = 默认值 + 注释（叶子模块，**禁止 import 任何 src 代码**，见
 *     src/__tests__/config-leaf.test.js 的守护测试）；
 *   - framework/firewall/config/ = 机制（deepMerge、firewall_config.json 持久化、
 *     reader 注册）—— 机制需要 IO/日志/框架能力，留在 framework。
 * 依赖方向单向：framework/app/api → src/config，永不反向，因此不会成环。
 *
 * 运行时可修改性：本文件是**启动兜底值**。真正生效的配置由
 * `src/data/firewall_config.json`（面板热改，deepMerge 覆盖，数组整体替换）
 * 在 initDao 时合并进来 —— 改阈值优先走面板/JSON，改内置默认才动这里。
 *
 * env 兜底已退役（2026-11-03）：调优阈值不再读 FW_* 环境变量；
 * 仅剩两个特例 env：FW_RATE_LIMIT_OVERRIDE（压测纯放宽旁路，见 first-ratelimit.js）、
 * FW_TRAFFIC_STATS_FILE（测试隔离统计文件路径，见 app/firewall/data/store.js）。
 *
 * @author yijiu2025
 * @since 2026-11-03（自 framework/firewall/config/defaults.js 迁出配置值）
 */
const DEFAULT_SECURITY_SETTINGS = {
  activeIpApi: 'sohu',
  showTrajectory: true,

  defense: {
    manualBlacklistIps: [],
    manualBlacklistUsers: [],
    manualWhitelistIps: [],

    // --- 扫描检测 ---
    enableAutoBlacklist: true,
    // 同一窗口内 404 次数达到该值即封禁
    maxNotFoundAttempts: 10,
    // 封禁时长（秒）
    blacklistDuration: 3600,
    // 404 计数窗口（秒）
    notFoundWindow: 60,
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

    // 机房 / 云厂商网段：来自这些网段的请求不做地理围栏判定
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
    rateLimitRequests: 600,
    rateLimitWindow: 60,

    // --- 用户级限频 ---
    enableUserRateLimit: true,
    userRateLimitRequests: 120,
    userRateLimitWindow: 60,

    // --- 暴力破解防护 ---
    enableBruteForce: true,
    bruteLimit: 5,
    bruteWindow: 300,
    // 账号锁定时长（秒）
    accountLockTime: 900,
    // IP 封禁时长（秒）
    ipBlockTime: 600,
    bruteIpLimit: 10,

    // --- 并发连接 ---
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

    // --- 地理围栏 ---
    enableGeoFilter: false,
    geoRules: {
      // 敏感路径：来自海外 IP 的访问按 overseasLimit 限流
      sensitivePaths: ['/api/admin', '/api/payment', '/api/user/delete'],
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
    // 无 UA / Bot UA / 浏览器 UA 三档挑战阈值
    botChallengeNoUaLimit: 10,
    botChallengeBotLimit: 30,
    botChallengeBrowserLimit: 120,

    // --- 人机挑战的 PoW 难度 ---
    // 前导十六进制零个数：期望哈希次数 = 16^difficulty（3 → 约 4096 次，浏览器 <0.1s；
    // 5 → 约 100 万次，约 1~2s）。代码侧夹取到 [1, 6] 上限，防止把低端机卡死。
    challengeDifficulty: 3,

    // --- 设备维度封禁（跨 IP） ---
    // 自动封禁/挑战命中时，除 IP 外**同时**记到设备 ID 上（设备 ID 来自 auth 的结构化
    // 设备 ID 流程，与 IP 无关）。这是唯一能拦住「换个 IP 重来」的维度。
    // 关掉它则退回纯 IP 维度（历史上只有 IP 一个维度）。
    enableDeviceBlock: true,

    // --- 匿名请求的深度检测短路 ---
    // 打开后：路由声明 requireLogin 且请求**一个凭据都没带**时，跳过 Bot/地理/端点限频
    // 这三个深度检测（这些请求必被守卫 401，检测结果用不上）。
    // 取舍：端点枚举的阻力会下降（第一层全局限流与封禁/白名单阶段仍然生效）。
    // 默认关闭 —— 省下的只是 CPU 与 Redis 往返，而损失的是探测可见性。
    skipDeepCheckForAnonymous: false,

    // --- 攻击告警（旁路能力） ---
    // email / webhookUrl 为空时 auto-responder 不做任何外部请求，等价于关闭。
    alert: {
      enabled: true,
      email: '',
      webhookUrl: '',
      cooldownMs: 300000
    }
  }
};

export { DEFAULT_SECURITY_SETTINGS };
