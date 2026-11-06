/**
 * 防火墙默认策略的 schema 契约测试
 *
 * 被测对象是 **core 保底默认值**（framework/firewall/config/defaults.js）：
 * src/config/firewall_config.js 只是可选覆盖，出厂为空。
 * 为什么需要：`securitySettings.defense.*` 的键名是**持久化契约** ——
 * data/firewall_config.json 按这些键 deepMerge，管理面板按这些键读写，
 * 52 处检测器按这些键取值。键名写错/漏写不会报错，只会**静默不生效**，
 * 所以用测试把键集合钉死；改键名必须连带做 JSON 迁移，届时本测试会先失败提醒。
 *
 * 同时校验：默认值必须可 JSON 序列化（deepMerge 走 JSON 路径，含函数/undefined 会静默丢值）。
 */

import { describe, it, expect } from '@jest/globals';
import { DEFAULT_SECURITY_SETTINGS } from '../framework/firewall/config/defaults.js';
import { DEFENSE_SPEC } from '../framework/firewall/config/schema.js';
import { DEFAULT_SECURITY_SETTINGS as APP_SECURITY_SETTINGS } from '../app/firewall/config/config.js';

/** defense 下允许出现的键（= 持久化 schema，改这里等于改契约） */
const DEFENSE_KEYS = [
  // 总开关 + 五道闸门各自的开关
  'enableFirewall',
  'enableGlobalBlock',
  'enableChallenge',
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
  'loopbackPrefixes',
  'internalIpPrefixes',
  'idcIpPrefixes',
  // 全局限频
  'enableRateLimit',
  'rateLimitRequests',
  'rateLimitWindow',
  'enableEndpointRateLimit',
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
  'connHighWater',
  // 探针路径（部署相关；前端产物路径后端不认识，不是配置项）
  'probePaths',
  // 地理围栏
  'enableGeoFilter',
  'geoRules',
  // Bot 检测
  'enableBotChallenge',
  'botPatterns',
  'browserPatterns',
  'botChallengeNoUaLimit',
  'botChallengeBotLimit',
  'botChallengeBrowserLimit',
  // 挑战难度
  'challengeDifficulty',
  'challengePageUrl',
  // 设备维度
  'enableDeviceBlock',
  // 匿名短路
  'skipDeepCheckForAnonymous',
  // 告警
  'alert'
];

describe('防火墙默认策略 · schema 契约', () => {
  it('core 顶层只有 defense（面板展示类配置不属于防护核心）', () => {
    // 2026-11-04：showTrajectory / activeIpApi 是控制台概念（地图轨迹开关、节点定位数据源），
    // 只有 firewall 前端与 app/dao 读，防护核心零读取 —— 默认值已下沉 app 层。
    // 这条断言防回退：core 里重新出现展示类键 = 又把 app 概念塞回核心。
    expect(Object.keys(DEFAULT_SECURITY_SETTINGS).sort()).toEqual(['defense']);
  });

  it('app 层把展示类默认值补回来，合并结果仍是完整的三段形状', () => {
    // dao.js 从这里取初值 → 面板 GET /settings 的形状不能变（持久化 schema 冻结）
    expect(Object.keys(APP_SECURITY_SETTINGS).sort()).toEqual(['activeIpApi', 'defense', 'showTrajectory']);
    expect(APP_SECURITY_SETTINGS.activeIpApi).toBe('sohu');
    expect(APP_SECURITY_SETTINGS.showTrajectory).toBe(true);
    // defense 必须来自 core（同一份对象内容），不能在 app 层复制一份策略默认值
    expect(APP_SECURITY_SETTINGS.defense).toEqual(DEFAULT_SECURITY_SETTINGS.defense);
  });

  it('defense 键集合与持久化 schema 完全一致（不多不少）', () => {
    expect(Object.keys(DEFAULT_SECURITY_SETTINGS.defense).sort()).toEqual([...DEFENSE_KEYS].sort());
  });

  it('键**顺序**与 spec 一致（三处排版同源：defaults / schema.js / firewall_config.js）', () => {
    // 为什么连顺序也钉：这三个文件是给人对照着改的（改配置的人要在 defaults 看取值理由、
    // 在 schema 看类型约束、在 firewall_config.js 看可覆盖键）。顺序/分组一旦不同，
    // 找一个键就得来回翻三个文件 —— 2026-11-05 已按 ①..⑪ 分组对齐，这条守卫防止漂回去。
    expect(Object.keys(DEFAULT_SECURITY_SETTINGS.defense)).toEqual(Object.keys(DEFENSE_SPEC));
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
    // 与 challenge-template.js 的 MAX_DIFFICULTY 对齐：配置 6 会被静默夹成 5，
    // 那属于"配了不生效"，不如直接在 spec 上拒绝
    expect(d.challengeDifficulty).toBeLessThanOrEqual(5);
  });

  it('连接静默阈值必须大于上游 requestTimeout（否则长请求的计数会被提前回收）', () => {
    const d = DEFAULT_SECURITY_SETTINGS.defense;
    // 与 src/config/app_config.js 的 http.requestTimeoutMs（300s）对齐检查
    expect(d.connStaleAfterMs).toBeGreaterThan(300_000);
  });
});

describe('路径级跳过规则的默认值', () => {
  const d = DEFAULT_SECURITY_SETTINGS.defense;

  it('探针 / 挑战页路径清单非空且是以 / 开头的绝对路径', () => {
    // 这些键的代码里还有一份兜底常量，但配置项本身必须有可用默认值 ——
    // 否则面板上看到的是空数组，等于"配置关掉了自保能力"。
    for (const key of ['probePaths']) {
      expect(Array.isArray(d[key])).toBe(true);
      expect(d[key].length).toBeGreaterThan(0);
      for (const p of d[key]) {
        expect(typeof p).toBe('string');
        expect(p.startsWith('/')).toBe(true);
      }
    }
  });

  it('连接高水位是正数（0/负数会让每轮清理都告警）', () => {
    expect(d.connHighWater).toBeGreaterThan(0);
  });

  it('回环前缀默认非空、全是非空字符串（代码侧只剩空数组，保底值只能在这里）', () => {
    // 2026-11-05：scan-trap.js 的 LOOPBACK_PREFIXES 已上收到本键。默认值一空，
    // 开发机刷几次 404 就会被自己封 1 小时 —— 这条是防"清空配置"的。
    expect(Array.isArray(d.loopbackPrefixes)).toBe(true);
    expect(d.loopbackPrefixes.length).toBeGreaterThan(0);
    for (const p of d.loopbackPrefixes) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0); // 空串 startsWith('') 恒真 = 谁都不封
    }
    // 与 internalIpPrefixes 分工明确：回环豁免不该顺手把 RFC1918 也豁免掉
    expect(d.loopbackPrefixes).not.toContain('10.');
    expect(d.loopbackPrefixes).not.toContain('192.168.');
  });

  it('挑战接口路径与前端产物路径都**不是**配置项', () => {
    // 挑战接口：必须与路由注册一一对应，可配 = 允许漂移
    expect('challengeApiPaths' in d).toBe(false);
    expect('challengeVerifyPath' in d).toBe(false);
    // 前端产物路径：后端起的是 API，前端由 nginx/CDN 部署，core 不该知道这些路径
    expect('challengePagePaths' in d).toBe(false);
    expect('challengeAssetPrefixes' in d).toBe(false);
  });
});
