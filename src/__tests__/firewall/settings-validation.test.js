/**
 * 防火墙安全策略的**配置校验**测试
 *
 * 三件事被钉住：
 *  1. spec 与 `defaults.js` 的键集合**双向**一致 —— 少一个键就是"某个配置项没校验"，
 *     多一个键就是"spec 里躺着一个没人读的字段"。
 *  2. 实测过的四个坏值（0 / "abc" / -1 / 未知键）必须被清洗掉，且**回落默认值**；
 *     2026-11 之前它们能原样进内存（`connStaleAfterMs: 0` 会清空在飞连接）。
 *  3. 面板接口 schema 由同一份 spec 生成：数值带 minimum、枚举带 enum ——
 *     手写 schema 与清洗规则曾经各说各话（`enableBotChallenge` 就只在 schema 里存在）。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { describe, it, expect } from '@jest/globals';
import { DEFAULT_SECURITY_SETTINGS } from '../../framework/firewall/config/defaults.js';
import {
  DEFENSE_SPEC,
  PANEL_SPEC,
  sanitizeDefense,
  sanitizeSecuritySettings,
  normalizeSettingsPatch,
  toSettingsJsonProperties,
  toDefenseJsonProperties
} from '../../framework/firewall/config/schema.js';

const DEFENSE = DEFAULT_SECURITY_SETTINGS.defense;

describe('spec 覆盖度：与默认值键集合双向一致', () => {
  it('defaults.defense 的每个键都有 spec（漏一个 = 该键没人校验）', () => {
    const missing = Object.keys(DEFENSE).filter(key => !(key in DEFENSE_SPEC));
    expect(missing).toEqual([]);
  });

  it('spec 里没有 defaults 之外的键（多一个 = 校验一个没人读的字段）', () => {
    const extra = Object.keys(DEFENSE_SPEC).filter(key => !(key in DEFENSE));
    expect(extra).toEqual([]);
  });

  it('每个 spec 条目都有合法 type，且能生成 schema 片段', () => {
    const props = toDefenseJsonProperties();
    for (const key of Object.keys(DEFENSE_SPEC)) {
      expect(['bool', 'int', 'number', 'string', 'stringArray', 'enum', 'object']).toContain(DEFENSE_SPEC[key].type);
      expect(props[key]).toBeDefined();
    }
  });

  it('面板层两个键也在 spec 里', () => {
    expect(Object.keys(PANEL_SPEC).sort()).toEqual(['activeIpApi', 'showTrajectory']);
  });
});

describe('清洗：非法值丢弃并回落默认值', () => {
  it('默认值本身必须全部通过校验（否则启动时就会把自己洗掉）', () => {
    const { value, problems } = sanitizeDefense(DEFENSE);
    expect(problems).toEqual([]);
    expect(value).toEqual(DEFENSE);
  });

  it('实测过的四个坏值：0 / "abc" / -1 / 未知键', () => {
    const { value, problems } = sanitizeDefense({
      connStaleAfterMs: 0,
      maxConn: 'abc',
      connHighWater: -1,
      // 历史上真实存在的死键：面板写过、后端从来没有读取点
      enableUserRateLimit: true
    });

    expect(value).toEqual({});
    expect(problems.map(p => p.key)).toEqual([
      'defense.connStaleAfterMs',
      'defense.maxConn',
      'defense.connHighWater',
      'defense.enableUserRateLimit'
    ]);
    expect(problems.map(p => p.kind)).toEqual(['invalid', 'invalid', 'invalid', 'unknown']);
  });

  it('enableBotChallenge 是**真实**开关（2026-11-05 补）：默认 true，值按布尔校验', () => {
    // 它曾经是"面板有、后端没有"的假开关 —— 现在 spec 里必须有它，
    // 且 detector 真的读（见 __tests__/bot-detector.test.js 的总开关用例）。
    expect(DEFENSE_SPEC.enableBotChallenge).toEqual({ type: 'bool' });
    expect(DEFENSE.enableBotChallenge).toBe(true);
    expect(sanitizeDefense({ enableBotChallenge: false }).value).toEqual({ enableBotChallenge: false });
    expect(sanitizeDefense({ enableBotChallenge: 'false' }).value).toEqual({ enableBotChallenge: false });
  });

  it('回落靠"丢弃 + 与默认值合并"，不是靠业务代码里再写一遍默认值', () => {
    const { value } = sanitizeDefense({ connStaleAfterMs: 0, maxConn: 50 });
    // 被丢弃的键不在清洗结果里 → 调用方 deepMerge 后取默认值；合法键保留
    expect(value).toEqual({ maxConn: 50 });
    expect('connStaleAfterMs' in value).toBe(false);
  });

  it('字符串 "false" 归一化成 false（否则 truthy 会把开关打开）', () => {
    const { value, problems } = sanitizeDefense({ enableRateLimit: 'false' });
    expect(value).toEqual({ enableRateLimit: false });
    expect(problems[0].kind).toBe('coerced');
  });

  it('数组里的空串条目让整条规则失效 —— 必须被拒', () => {
    const { value, problems } = sanitizeDefense({ botPatterns: ['python-requests', ''] });
    expect(value).toEqual({});
    expect(problems[0].key).toBe('defense.botPatterns');
  });

  it('嵌套对象：未知子键丢弃、越界子值丢弃', () => {
    const { value, problems } = sanitizeDefense({
      geoRules: { overseasLimit: 0, unknownSub: 1 },
      alert: { enabled: true, cooldownMs: -1 }
    });
    expect(value).toEqual({ geoRules: {}, alert: { enabled: true } });
    expect(problems.map(p => p.key).sort()).toEqual([
      'defense.alert.cooldownMs',
      'defense.geoRules.overseasLimit',
      'defense.geoRules.unknownSub'
    ]);
  });

  it('challengeDifficulty 上下界与代码夹取一致（1~6）', () => {
    expect(sanitizeDefense({ challengeDifficulty: 0 }).value).toEqual({});
    expect(sanitizeDefense({ challengeDifficulty: 7 }).value).toEqual({});
    expect(sanitizeDefense({ challengeDifficulty: 3 }).value).toEqual({ challengeDifficulty: 3 });
  });
});

describe('整个 securitySettings 的清洗', () => {
  it('顶层 defense 键（错位形状）被丢弃并留痕', () => {
    const { value, problems } = sanitizeSecuritySettings({ defense: {}, maxConn: 999 });
    expect(value).toEqual({ defense: {} });
    expect(problems).toEqual([expect.objectContaining({ kind: 'unknown', key: 'maxConn' })]);
  });

  it('面板层两个键按各自规则校验', () => {
    expect(sanitizeSecuritySettings({ activeIpApi: 'baidu' }).value).toEqual({ activeIpApi: 'baidu' });
    expect(sanitizeSecuritySettings({ activeIpApi: 'nope' }).problems[0]).toEqual(
      expect.objectContaining({ kind: 'invalid', key: 'activeIpApi' })
    );
    expect(sanitizeSecuritySettings({ showTrajectory: 'true' }).value).toEqual({ showTrajectory: true });
  });

  it('任意垃圾输入都不抛错', () => {
    for (const input of [null, undefined, 'str', 42, [], { defense: 'x' }, { defense: null }]) {
      expect(() => sanitizeSecuritySettings(input)).not.toThrow();
    }
  });
});

describe('写入期：形状归位', () => {
  it('忘记套 defense 的载荷被收回 defense 下（否则会写成顶层死键、重启即丢）', () => {
    const { value, misplaced } = normalizeSettingsPatch({ maxConn: 200, enableGeoFilter: true });
    expect(misplaced.sort()).toEqual(['enableGeoFilter', 'maxConn']);
    expect(value).toEqual({ defense: { maxConn: 200, enableGeoFilter: true } });
  });

  it('已经套好 defense 的载荷原样返回', () => {
    const patch = { defense: { maxConn: 200 }, showTrajectory: false };
    const { value, misplaced } = normalizeSettingsPatch(patch);
    expect(misplaced).toEqual([]);
    expect(value).toEqual(patch);
  });

  it('混合载荷：defense 内的键不被覆盖，顶层散键并入', () => {
    const { value } = normalizeSettingsPatch({ defense: { maxConn: 300 }, bruteLimit: 5 });
    expect(value).toEqual({ defense: { maxConn: 300, bruteLimit: 5 } });
  });
});

describe('面板接口 schema：从 spec 生成', () => {
  const props = toSettingsJsonProperties();

  it('数值字段带 minimum（0/负数在接口层就 400）', () => {
    expect(props.defense.properties.maxConn).toEqual({ type: 'number', minimum: 1 });
    expect(props.defense.properties.connStaleAfterMs).toEqual({ type: 'number', minimum: 1 });
    // 上下界必须与 challenge-template.js 的 MAX_DIFFICULTY 一致（5），
    // 否则"配 6"会通过接口校验、却在运行时被静默夹回 5
    expect(props.defense.properties.challengeDifficulty).toEqual({ type: 'number', minimum: 1, maximum: 5 });
  });

  it('数组字段给 items 约束（空串条目在接口层就 400）', () => {
    expect(props.defense.properties.safePaths).toEqual({ type: 'array', items: { type: 'string', minLength: 1 } });
  });

  it('activeIpApi 是枚举，与 app 侧 4 个数据源 id 一致', () => {
    expect(props.activeIpApi).toEqual({ type: 'string', enum: ['sohu', 'ipinfo', 'ipapi', 'baidu'] });
  });

  it('defense 的 properties 与 spec 键集合一致（不会手写漏掉新增键）', () => {
    expect(Object.keys(props.defense.properties).sort()).toEqual(Object.keys(DEFENSE_SPEC).sort());
  });
});
