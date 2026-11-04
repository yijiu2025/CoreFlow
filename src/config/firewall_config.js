/**
 * 防火墙配置 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 默认值：
 *   默认值 + 取值理由 → src/framework/firewall/config/defaults.js
 *   运行期热改（面板/JSON）→ src/data/firewall_config.json
 *
 * 可用键（顶层）：defense（防护策略）+ activeIpApi / showTrajectory（app 层展示配置）
 *   ⚠️ activeIpApi / showTrajectory 的默认值属于 **firewall 应用**（控制台展示 + 节点定位），
 *      定义在 src/app/firewall/config/defaults.js，core 不认识它们。写在这里仍然生效
 *      （静态覆盖先并进 core 默认对象，app 合并时 core 一侧优先），但**不要**把它们
 *      当成防护核心的配置 —— 卸载 firewall app 后它们就没有意义了。
 * defense 下的键（35 个，按功能分组见 defaults.js）：
 *   名单      manualBlacklistIps / manualBlacklistUsers / manualWhitelistIps
 *   扫描      enableAutoBlacklist / maxNotFoundAttempts / notFoundWindow /
 *             blacklistDuration / safePaths / internalIpPrefixes / idcIpPrefixes
 *   全局限频  enableRateLimit / rateLimitRequests / rateLimitWindow / enableEndpointRateLimit
 *   暴破      enableBruteForce / bruteLimit / bruteWindow / accountLockTime /
 *             ipBlockTime / bruteIpLimit
 *   连接      enableConnLimit / maxConn / connCleanupIntervalMs / connStaleAfterMs
 *   地理围栏  enableGeoFilter / geoRules
 *   Bot       botPatterns / browserPatterns / botChallengeNoUaLimit /
 *             botChallengeBotLimit / botChallengeBrowserLimit
 *   挑战      challengeDifficulty
 *   设备      enableDeviceBlock
 *   匿名短路  skipDeepCheckForAnonymous
 *   告警      alert { enabled, email, webhookUrl, cooldownMs }
 *
 * ⚠️ 数组是**整体替换**（不是追加）：写 botPatterns / safePaths 这类数组时要给全量。
 * ⚠️ 层级（securitySettings.defense）是持久化 schema 契约，别在这里改层级。
 *
 * 示例：
 *   const DEFAULT_SECURITY_SETTINGS = {
 *     defense: { rateLimitRequests: 1200, enableGeoFilter: true }
 *   };
 */
const DEFAULT_SECURITY_SETTINGS = {};

export { DEFAULT_SECURITY_SETTINGS };
