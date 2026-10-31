/**
 * 限流配置的可判定性：阈值解析 + 「配了等于没配」判定
 *
 * 这两个函数存在的理由是把两类静默失败变成**可断言的行为**：
 *   1. `resolveRateLimitMax` 的旁路只允许**放宽**、且必须严格正整数 ——
 *      `'10.5'` / `'12abc'` / `'0'` 一旦被静默接受，就成了"看起来调高了、实际没调"。
 *   2. `describeRateLimitRisk` 把 `enableRateLimit=false` 与"阈值高到没意义"两种情况
 *      显式判成风险 —— 前者会让全仓 13 处端点级 `config.rateLimit` 一起失效，
 *      而 Fastify 对未知 route config 不报错，线上完全看不出来。
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { resolveRateLimitMax, describeRateLimitRisk } from '../../app/firewall/engine/detectors/first-ratelimit.js';

const ORIGINAL_OVERRIDE = process.env.FW_RATE_LIMIT_OVERRIDE;

afterEach(() => {
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.FW_RATE_LIMIT_OVERRIDE;
  else process.env.FW_RATE_LIMIT_OVERRIDE = ORIGINAL_OVERRIDE;
});

describe('resolveRateLimitMax', () => {
  it('未配置时回退 300', () => {
    delete process.env.FW_RATE_LIMIT_OVERRIDE;
    expect(resolveRateLimitMax(undefined)).toBe(300);
    expect(resolveRateLimitMax(0)).toBe(300);
  });

  it('配置值优先于默认值', () => {
    delete process.env.FW_RATE_LIMIT_OVERRIDE;
    expect(resolveRateLimitMax(60)).toBe(60);
    expect(resolveRateLimitMax(10000)).toBe(10000);
  });

  it('旁路只能放宽：override 小于 base 时忽略', () => {
    process.env.FW_RATE_LIMIT_OVERRIDE = '10';
    expect(resolveRateLimitMax(60)).toBe(60);
  });

  it('旁路可以放宽：override 大于 base 时生效', () => {
    process.env.FW_RATE_LIMIT_OVERRIDE = '1000000';
    expect(resolveRateLimitMax(60)).toBe(1000000);
  });

  it('旁路必须是严格正整数：小数 / 混合字符串 / 0 / 负数一律忽略', () => {
    for (const bad of ['10.5', '12abc', '0', '-1', ' ', 'abc']) {
      process.env.FW_RATE_LIMIT_OVERRIDE = bad;
      expect(resolveRateLimitMax(60)).toBe(60);
    }
  });
});

describe('describeRateLimitRisk', () => {
  it('关闭限流 → 明确指出端点级 config.rateLimit 会一起失效', () => {
    const msg = describeRateLimitRisk({ enabled: false, max: 0, windowSec: 0 });
    expect(msg).toContain('全局限流未启用');
    expect(msg).toContain('config.rateLimit');
  });

  it('阈值高到没意义（10000/60s）被判定为风险', () => {
    const msg = describeRateLimitRisk({ enabled: true, max: 10000, windowSec: 60 });
    expect(msg).toBeTruthy();
    expect(msg).toContain('10000');
  });

  it('正常阈值不报风险（避免告警疲劳）', () => {
    expect(describeRateLimitRisk({ enabled: true, max: 60, windowSec: 60 })).toBeNull();
    expect(describeRateLimitRisk({ enabled: true, max: 600, windowSec: 60 })).toBeNull();
  });

  it('阈值非法（NaN / 0 / 负数）被判为风险', () => {
    expect(describeRateLimitRisk({ enabled: true, max: NaN, windowSec: 60 })).toBeTruthy();
    expect(describeRateLimitRisk({ enabled: true, max: 0, windowSec: 60 })).toBeTruthy();
    expect(describeRateLimitRisk({ enabled: true, max: -5, windowSec: 60 })).toBeTruthy();
  });
});
