/**
 * 防火墙配置 —— **可选的静态覆盖层**
 *
 * ⚠️ 本文件可以整个删掉，服务照常用 core 保底值启动。
 * 这里只写**你想改的键**，未写的键一律走 core 默认值：
 *   默认值 + 取值理由 → src/framework/ingress/firewall/config/defaults.js
 *   运行期热改（面板/JSON）→ data/firewall_config.json
 *
 * 可用键（顶层）：**defense** + **activeIpApi / showTrajectory**（兼容保留）
 *   `defense`           防护策略（52 个键），core 按它执行。
 *   `activeIpApi`       ⚠️ 历史面板键（节点 IP 数据源）。2026-11-21 面板应用移出本仓后
 *                       **框架内已无消费方**，仅为兼容存量 data/firewall_config.json 继续接受；
 *                       新部署不必写，写了也不会驱动任何内置页面。
 *   `showTrajectory`    同上（面板是否展示访问轨迹）。
 *
 *   ⚠️ 这两个键现在的语义是「兼容占位」：校验通过、原样保留，但不参与任何判定。
 *      真正的防护策略只看 `defense`；运行期热改存在 data/firewall_config.json，
 *      那一层优先级更高（热改 > 静态配置 > 内置默认）。
 *
 * defense 下的键（52 个）—— 分组与顺序和 `defaults.js`、`config/schema.js` 完全一致：
 *   ① 开关    enableFirewall（总开关）/ enableGlobalBlock / enableChallenge
 *   ② 名单    manualBlacklistIps / manualBlacklistUsers / manualWhitelistIps
 *   ③ 扫描    enableAutoBlacklist / maxNotFoundAttempts / notFoundWindow /
 *             blacklistDuration / safePaths / loopbackPrefixes /
 *             internalIpPrefixes / idcIpPrefixes
 *   ③b 探针   probePaths（部署相关，代码里另有兜底常量）
 *   ④ 限频    enableRateLimit / rateLimitRequests / rateLimitWindow / enableEndpointRateLimit /
 *             fallbackMaxKeys（Redis 降级时内存表容量，默认 10 万键；满了拒绝新键）
 *   ⑤ 暴破    enableBruteForce / bruteLimit / bruteWindow / accountLockTime /
 *             ipBlockTime / bruteIpLimit
 *   ⑥ 连接    enableConnLimit / maxConn / connCleanupIntervalMs / connStaleAfterMs / connHighWater
 *   ⑦ 地理    enableGeoFilter / geoRules { sensitivePaths, internalPrefixes, ... }
 *   ⑧ 挑战    enableBotChallenge（Bot 总开关）/ botPatterns / browserPatterns /
 *             botChallengeNoUaLimit / botChallengeBotLimit / botChallengeBrowserLimit /
 *             challengeProvider（pow / turnstile / hcaptcha / google）/ challengeDifficulty（基准）/
 *             challengeReputationEnabled（递进难度，默认关）/
 *             challengeDifficultyMin / challengeDifficultyMax /
 *             challengeReputationHardenAfterFails / challengeReputationHardenStrongAfterFails /
 *             challengeReputationRelaxAfterPasses / challengeReputationWindowSec /
 *             challengePageUrl（独立前端挑战页，空 = 用内置页）
 *   ⑨ 设备    enableDeviceBlock
 *   ⑩ 匿名    skipDeepCheckForAnonymous
 *   ⑪ 告警    alert { enabled, email, webhookUrl, cooldownMs }
 *
 * ⚠️ 数组是**整体替换**（不是追加）：写 botPatterns / safePaths 这类数组时要给全量。
 * ⚠️ 值会过校验：类型/上下界/枚举由 `framework/ingress/firewall/config/schema.js` 的 spec 定义。
 *    写错的值**不会让服务起不来**，但会被丢弃并回落默认值，启动日志里有一条 warn 列出
 *    所有被丢弃的键 —— 看到那条 warn 就说明这里写错了。
 * ⚠️ 层级（securitySettings.defense）是持久化 schema 契约，别在这里改层级。
 * ⚠️ defense 的键**必须写在 defense 下**：写成顶层（例如 `enableRateLimit: false`）会被
 *    **忽略**并在启动时告警 —— 顶层没有任何读取点，留着只会让人以为它生效了。
 *    载入时会自动剔除这类错位键（`framework/ingress/firewall/config/validate.js`），不做迁移、
 *    不兼容旧形状：这套 schema 只有一个版本。
 *
 * 示例：
 *   const DEFAULT_SECURITY_SETTINGS = {
 *     activeIpApi: 'ipinfo',                                       // 兼容保留（无消费方）
 *     defense: { rateLimitRequests: 1200, enableGeoFilter: true }  // 防护策略
 *   };
 */
const DEFAULT_SECURITY_SETTINGS = {};

export { DEFAULT_SECURITY_SETTINGS };
