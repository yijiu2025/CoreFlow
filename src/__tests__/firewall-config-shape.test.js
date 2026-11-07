/**
 * `securitySettings` 形状校验的契约测试
 *
 * 规则：合法的 defense 键只认 `securitySettings.defense.*`。写在顶层的（历史遗留的
 * `enableRateLimit`、或以后谁手滑写个 `maxConn`）一律剔除 + 启动告警 —— 不做迁移、
 * 不留兼容分支，所以这里验证的是「通用规则」而不是某段历史。
 */
import { describe, it, expect } from '@jest/globals';
import { dropMisplacedDefenseKeys, DEFENSE_KEYS } from '../framework/ingress/firewall/config/validate.js';

describe('防火墙配置形状：defense 键只能写在 defense 下', () => {
  it('顶层出现的 defense 键被剔除，并报出键名', () => {
    const { settings, misplaced } = dropMisplacedDefenseKeys({
      enableRateLimit: true,
      rateLimitRequests: 60,
      defense: { rateLimitRequests: 600 }
    });

    expect(misplaced.sort()).toEqual(['enableRateLimit', 'rateLimitRequests']);
    expect('enableRateLimit' in settings).toBe(false);
    expect('rateLimitRequests' in settings).toBe(false);
    // defense 里的值原样保留（顶层那份本来就没被读过）
    expect(settings.defense.rateLimitRequests).toBe(600);
  });

  it('规则是通用的：任意 defense 键写到顶层都会被识别（不只限流那三个）', () => {
    const pick = ['maxConn', 'challengeDifficulty', 'botChallengeBotLimit', 'skipDeepCheckForAnonymous'];
    for (const key of pick) expect(DEFENSE_KEYS.has(key)).toBe(true);

    const { misplaced } = dropMisplacedDefenseKeys(Object.fromEntries(pick.map(k => [k, 1])));
    expect(misplaced.sort()).toEqual([...pick].sort());
  });

  it('面板层的合法顶层键不受影响（activeIpApi / showTrajectory）', () => {
    const { settings, misplaced } = dropMisplacedDefenseKeys({
      activeIpApi: 'ipinfo',
      showTrajectory: false,
      defense: {}
    });

    expect(misplaced).toEqual([]);
    expect(settings.activeIpApi).toBe('ipinfo');
    expect(settings.showTrajectory).toBe(false);
  });

  it('纯函数：不改入参', () => {
    const raw = { enableRateLimit: true, defense: {} };
    dropMisplacedDefenseKeys(raw);
    expect(raw.enableRateLimit).toBe(true);
  });

  it('非法输入原样返回（null / 数组 / 字符串不该抛）', () => {
    for (const bad of [null, undefined, [], 'nope', 42]) {
      const { settings, misplaced } = dropMisplacedDefenseKeys(bad);
      expect(settings).toBe(bad);
      expect(misplaced).toEqual([]);
    }
  });
});
