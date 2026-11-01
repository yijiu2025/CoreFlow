/**
 * Redis 重连退避策略（纯函数）
 *
 * === 这两条语义必须都成立，且互不串味 ===
 * - `forever`（常驻服务默认）：超限后转 30s 低频探测，**永不 giveUp**
 *   —— 这是「Redis 恢复后自动连回」的保障，丢了它服务就再也不会自愈；
 * - `bounded`（CLI / 脚本 / 验收关卡）：超限后**必须 giveUp**
 *   —— 这是「环境不可用要在大致预算内说清」的保障，丢了它脚本会挂死。
 *
 * 两者此前共用一个内联回调，`bounded` 语义完全没有覆盖，以至于
 * 「关卡挂 5 分钟」这种回归只能靠人肉发现（2026-09-20 实测）。
 */

import { describe, it, expect } from '@jest/globals';

const { resolveReconnectDelay, resolveCommandTimeout } = await import('../../framework/redis/plugin.js');

describe('resolveReconnectDelay', () => {
  describe('退避序列（未超限）', () => {
    it('首次重连 500ms，随后指数增长', () => {
      expect(resolveReconnectDelay({ retries: 0, maxRetries: 10 }).delay).toBe(500);
      expect(resolveReconnectDelay({ retries: 1, maxRetries: 10 }).delay).toBe(1000);
      expect(resolveReconnectDelay({ retries: 2, maxRetries: 10 }).delay).toBe(2000);
      expect(resolveReconnectDelay({ retries: 3, maxRetries: 10 }).delay).toBe(4000);
      expect(resolveReconnectDelay({ retries: 4, maxRetries: 10 }).delay).toBe(8000);
    });

    it('单次退避封顶 15s，不会无限增长', () => {
      expect(resolveReconnectDelay({ retries: 5, maxRetries: 10 }).delay).toBe(15_000);
      expect(resolveReconnectDelay({ retries: 9, maxRetries: 10 }).delay).toBe(15_000);
    });

    it('未超限时绝不 giveUp', () => {
      for (let r = 0; r < 10; r++) {
        const d = resolveReconnectDelay({ retries: r, maxRetries: 10 });
        expect(d.giveUp).toBeFalsy();
        expect(d.delay).toBeGreaterThan(0);
      }
    });
  });

  describe('超限分支（两种策略的分水岭）', () => {
    it('bounded + 超限 → giveUp，并带可读 message', () => {
      const d = resolveReconnectDelay({ retries: 10, maxRetries: 10, policy: 'bounded' });
      expect(d.giveUp).toBe(true);
      expect(typeof d.message).toBe('string');
      expect(d.message).toContain('10');
    });

    it('bounded 在「恰好超第一个」时就放弃（边界是 >= 不是 >）', () => {
      expect(resolveReconnectDelay({ retries: 9, maxRetries: 10, policy: 'bounded' }).giveUp).toBeFalsy();
      expect(resolveReconnectDelay({ retries: 10, maxRetries: 10, policy: 'bounded' }).giveUp).toBe(true);
    });

    it('forever + 超限 → 30s 慢速探测，永不放弃', () => {
      const d = resolveReconnectDelay({ retries: 10, maxRetries: 10, policy: 'forever' });
      expect(d.giveUp).toBeFalsy();
      expect(d.slowProbe).toBe(true);
      expect(d.delay).toBe(30_000);
    });

    it('forever 超限后继续加码也仍是慢速探测（不会某次突然放弃）', () => {
      for (const r of [10, 25, 500]) {
        const d = resolveReconnectDelay({ retries: r, maxRetries: 10, policy: 'forever' });
        expect(d.giveUp).toBeFalsy();
        expect(d.delay).toBe(30_000);
      }
    });
  });

  describe('默认值安全性', () => {
    it('默认策略是 forever —— 常驻服务不能因为漏传参数而变成有界放弃', () => {
      const d = resolveReconnectDelay({ retries: 99, maxRetries: 10 });
      expect(d.giveUp).toBeFalsy();
      expect(d.slowProbe).toBe(true);
    });

    it('默认 maxRetries=10 —— 与 REDIS_MAX_RETRIES 的文档默认值一致', () => {
      expect(resolveReconnectDelay({ retries: 9, policy: 'bounded' }).giveUp).toBeFalsy();
      expect(resolveReconnectDelay({ retries: 10, policy: 'bounded' }).giveUp).toBe(true);
    });

    it('自定义 maxRetries 生效（REDIS_MAX_RETRIES 可用环境变量收紧）', () => {
      expect(resolveReconnectDelay({ retries: 2, maxRetries: 3, policy: 'bounded' }).giveUp).toBeFalsy();
      expect(resolveReconnectDelay({ retries: 3, maxRetries: 3, policy: 'bounded' }).giveUp).toBe(true);
    });
  });
});

/**
 * 命令超时（node-redis v6 默认值固化）
 *
 * v6 把 `commandOptions.timeout` 的默认值改成了 5000ms，超时即 abort 命令。
 * 本项目有「大 key 遍历」「长 Lua 脚本」这类耗时不可控的命令（ring queue / 封禁索引 /
 * 批次清理），5s 默认值会让它们在生产里随机失败 —— 而且报错是 TIMEOUT 而非业务错误，
 * 排查成本极高。所以默认必须是 0（不设超时，等同 v5 语义）。
 */
describe('resolveCommandTimeout', () => {
  it('未配置时返回 0 —— 不设超时，避免 v6 的 5s 默认值掐断长命令', () => {
    expect(resolveCommandTimeout(undefined)).toBe(0);
    expect(resolveCommandTimeout('')).toBe(0);
  });

  it('0 / 负数 / 非法值一律视为不设超时', () => {
    expect(resolveCommandTimeout('0')).toBe(0);
    expect(resolveCommandTimeout(-1)).toBe(0);
    expect(resolveCommandTimeout('abc')).toBe(0);
    expect(resolveCommandTimeout(NaN)).toBe(0);
  });

  it('显式配置的正整数生效（REDIS_COMMAND_TIMEOUT_MS 可开启保护）', () => {
    expect(resolveCommandTimeout('12000')).toBe(12_000);
    expect(resolveCommandTimeout(3000)).toBe(3000);
  });
});
