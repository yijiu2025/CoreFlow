/**
 * 限流阈值旁路 `resolveRateLimitMax` 单测
 *
 * 背景：压测基线（scripts/bench/）三个场景共用 127.0.0.1，持久化限流会把
 * 压测打成 429。`FW_RATE_LIMIT_OVERRIDE` 是**纯放宽**旁路 —— 它只能抬高
 * 阈值，绝不能变成收紧旁路，且非法输入必须被拒收而不是被 parseInt 静默截断。
 *
 * 真身打桩：first-ratelimit.js 的重依赖（store/dao/geo/redis）全部替身，
 * `resolveRateLimitMax` 本身是纯函数、跑真身。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../app/firewall/data/store.js', () => ({
  pushRecord: jest.fn()
}));
jest.unstable_mockModule('../../framework/redis/index.js', () => ({
  createBoundStore: jest.fn()
}));
jest.unstable_mockModule('../../app/firewall/dao/dao.js', () => ({
  getSecuritySettings: () => ({ defense: { enableRateLimit: true } })
}));
jest.unstable_mockModule('../../app/firewall/engine/detectors/geo-filter.js', () => ({
  resolveGeoInfo: () => ({})
}));

const { resolveRateLimitMax } = await import('../../app/firewall/engine/detectors/first-ratelimit.js');

const ENV_KEY = 'FW_RATE_LIMIT_OVERRIDE';
const savedEnv = process.env[ENV_KEY];

beforeEach(() => {
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe('resolveRateLimitMax：无旁路时', () => {
  test('未设置环境变量 → 返回配置值', () => {
    expect(resolveRateLimitMax(500)).toBe(500);
  });

  test('配置值缺失 → 默认 300', () => {
    expect(resolveRateLimitMax(undefined)).toBe(300);
    expect(resolveRateLimitMax(0)).toBe(300);
  });
});

describe('resolveRateLimitMax：非法旁路输入一律拒收（退回配置值）', () => {
  test.each([
    ['空串', ''],
    ['纯空格', '   '],
    ['非数字', 'abc'],
    ['零', '0'],
    ['负整数', '-5'],
    ['小数（禁止 parseInt 式静默截断）', '10.5'],
    ['数字混字母', '12abc']
  ])('%s → 退回配置值', (_name, raw) => {
    process.env[ENV_KEY] = raw;
    expect(resolveRateLimitMax(500)).toBe(500);
  });
});

describe('resolveRateLimitMax：合法旁路只放宽、不收紧', () => {
  test('旁路大于配置值 → 取旁路（放宽生效）', () => {
    process.env[ENV_KEY] = '1000000';
    expect(resolveRateLimitMax(500)).toBe(1000000);
  });

  test('旁路小于配置值 → 仍取配置值（绝不收紧）', () => {
    process.env[ENV_KEY] = '10';
    expect(resolveRateLimitMax(500)).toBe(500);
  });

  test('旁路等于配置值 → 取配置值', () => {
    process.env[ENV_KEY] = '500';
    expect(resolveRateLimitMax(500)).toBe(500);
  });

  test('配置值缺失时旁路直接生效（压测从默认 300 放宽）', () => {
    process.env[ENV_KEY] = '1000000';
    expect(resolveRateLimitMax(undefined)).toBe(1000000);
  });
});
