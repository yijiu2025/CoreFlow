/**
 * 防火墙默认策略的 schema 契约测试
 *
 * 被测对象是 **core 保底默认值**（framework/firewall/config/defaults.js）：
 * src/config/firewall_config.js 只是可选覆盖，出厂为空。
 * 为什么需要：`securitySettings.defense.*` 的键名是**持久化契约** ——
 * src/data/firewall_config.json 按这些键 deepMerge，管理面板按这些键读写，
 * 52 处检测器按这些键取值。键名写错/漏写不会报错，只会**静默不生效**，
 * 所以用测试把键集合钉死；改键名必须连带做 JSON 迁移，届时本测试会先失败提醒。
 *
 * 同时校验：默认值必须可 JSON 序列化（deepMerge 走 JSON 路径，含函数/undefined 会静默丢值）。
 */

import { describe, it, expect } from '@jest/globals';
import { DEFAULT_SECURITY_SETTINGS } from '../framework/firewall/config/defaults.js';

/** defense 下允许出现的键（= 持久化 schema，改这里等于改契约） */
const DEFENSE_KEYS = [
  // 手动名单
  'manualBlacklistIps',
  'manualBlacklistUsers',
  'manualWhitelistIps',
  // 扫描检测
  'enableAutoBlacklist',
  'maxNotFoundAttempts',
  'notFoundWindow',
  'blacklistDuration',
  'safePaths',
  'internalIpPrefixes',
  'idcIpPrefixes',
  // 全局限频
  'enableRateLimit',
  'rateLimitRequests',
  'rateLimitWindow',
  'enableEndpointRateLimit',
  // 用户级限频
  'enableUserRateLimit',
  'userRateLimitRequests',
  'userRateLimitWindow',
  // 暴力破解
  'enableBruteForce',
  'bruteLimit',
  'bruteWindow',
  'accountLockTime',
  'ipBlockTime',
  'bruteIpLimit',
  // 并发连接
  'enableConnLimit',
  'maxConn',
  'connCleanupIntervalMs',
  'connStaleAfterMs',
  // 地理围栏
  'enableGeoFilter',
  'geoRules',
  // Bot 检测
  'botPatterns',
  'browserPatterns',
  'botChallengeNoUaLimit',
  'botChallengeBotLimit',
  'botChallengeBrowserLimit',
  // 挑战难度
  'challengeDifficulty',
  // 设备维度
  'enableDeviceBlock',
  // 匿名短路
  'skipDeepCheckForAnonymous',
  // 告警
  'alert'
];

describe('防火墙默认策略 · schema 契约', () => {
  it('顶层只有 activeIpApi / showTrajectory / defense', () => {
    expect(Object.keys(DEFAULT_SECURITY_SETTINGS).sort()).toEqual(['activeIpApi', 'defense', 'showTrajectory']);
  });

  it('defense 键集合与持久化 schema 完全一致（不多不少）', () => {
    expect(Object.keys(DEFAULT_SECURITY_SETTINGS.defense).sort()).toEqual([...DEFENSE_KEYS].sort());
  });

  it('默认值可 JSON 往返（deepMerge 走 JSON 路径，函数/undefined 会静默丢值）', () => {
    const roundTrip = JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS));
    expect(roundTrip).toEqual(DEFAULT_SECURITY_SETTINGS);
  });

  it('关键阈值是正数（0/负数会让防护静默失效）', () => {
    const d = DEFAULT_SECURITY_SETTINGS.defense;
    expect(d.maxNotFoundAttempts).toBeGreaterThan(0);
    expect(d.blacklistDuration).toBeGreaterThan(0);
    expect(d.rateLimitRequests).toBeGreaterThan(0);
    expect(d.rateLimitWindow).toBeGreaterThan(0);
    expect(d.bruteLimit).toBeGreaterThan(0);
    expect(d.maxConn).toBeGreaterThan(0);
    expect(d.challengeDifficulty).toBeGreaterThanOrEqual(1);
    expect(d.challengeDifficulty).toBeLessThanOrEqual(6); // 代码侧夹取上限
  });

  it('连接静默阈值必须大于上游 requestTimeout（否则长请求的计数会被提前回收）', () => {
    const d = DEFAULT_SECURITY_SETTINGS.defense;
    // 与 src/config/app_config.js 的 http.requestTimeoutMs（300s）对齐检查
    expect(d.connStaleAfterMs).toBeGreaterThan(300_000);
  });
});
