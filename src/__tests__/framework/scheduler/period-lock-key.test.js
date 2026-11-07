/**
 * 周期锁键名派生（`periodLockKey`）
 *
 * 为什么单独钉这个纯函数：锁名一旦变更（2026-11-08 加了 `:p<周期>`），
 * `scripts/verify/lock-mutex.mjs` 会按旧名读 PTTL 得到 -2，表现成"锁没建起来"的假红。
 * 现在两侧都从这一个函数取名，本文件保证它的语义（周期序号随时间推进而变、边界取整）。
 *
 * @author yijiu2025
 * @since 2026-11-08
 */
import { describe, it, expect } from '@jest/globals';
import { periodLockKey } from '../../../framework/scheduler/index.js';

describe('periodLockKey', () => {
  it('同一周期内时间点 → 同一个键（否则一个周期会被拆成多把锁）', () => {
    expect(periodLockKey('t', 3000, 0)).toBe('scheduler:t:p0');
    expect(periodLockKey('t', 3000, 1)).toBe('scheduler:t:p0');
    expect(periodLockKey('t', 3000, 2999)).toBe('scheduler:t:p0');
  });

  it('跨过周期边界 → 换新键（这是"跨周期可再次执行"的机制本身）', () => {
    expect(periodLockKey('t', 3000, 3000)).toBe('scheduler:t:p1');
    expect(periodLockKey('t', 3000, 6000)).toBe('scheduler:t:p2');
  });

  it('任务名原样保留（锁粒度 = 任务名）', () => {
    expect(periodLockKey('session-token-cleanup', 60_000, 0)).toBe('scheduler:session-token-cleanup:p0');
  });

  it('周期为 0 / 负数 → 固定 p0（无周期任务不随时间换键）', () => {
    expect(periodLockKey('t', 0, 1_700_000_000_000)).toBe('scheduler:t:p0');
    expect(periodLockKey('t', -5, 1_700_000_000_000)).toBe('scheduler:t:p0');
  });

  it('不传 at 时按当前时间派生（不跨周期边界地断言，避免 1ms 抖动导致的假红）', () => {
    const at = Date.now();
    expect(periodLockKey('t', 3000, at)).toBe(`scheduler:t:p${Math.floor(at / 3000)}`);
    expect(periodLockKey('t', 3000)).toMatch(/^scheduler:t:p\d+$/);
  });
});
