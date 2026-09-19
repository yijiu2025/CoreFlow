/**
 * 并发连接追踪单元测试
 *
 * 核心覆盖的是**清理判据**的修复：
 * 原实现只在 `count > maxConn × 2` 时才回收记录，而真实泄漏往往只多 1~2 个计数
 * （异常路径没走到 onSend），永远到不了阈值 —— 那条记录会**永久**占用该 IP 的配额。
 * 现已改为按「最后活跃时间」回收，与残留计数多少无关。
 *
 * 测试用可注入的配置替身 + 假时钟精确控制时间，不依赖真实 Redis 或数据库。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/** 可切换的防御配置（替身 config-access 的返回值） */
let defenseConfig = { enableConnLimit: true, maxConn: 3 };

jest.unstable_mockModule('../../app/firewall/interface/config-access.js', () => ({
  readSecuritySettings: () => ({ defense: defenseConfig }),
  registerSettingsReader: () => {},
  hasSettingsReader: () => true
}));

const { trackConnection, getConnectionStats, cleanupStaleConnections } =
  await import('../../app/firewall/util/connection-tracker.js');
// 直接拿内部表做清理与断言，避免用例之间互相干扰
const { activeConnections } = await import('../../app/firewall/util/shared.js');

const STALE_AFTER_MS = 10 * 60 * 1000;

beforeEach(() => {
  activeConnections.clear();
  defenseConfig = { enableConnLimit: true, maxConn: 3 };
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-19T10:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
  activeConnections.clear();
});

describe('并发连接计数', () => {
  it('每实例内的计数按 +1 / -1 正确增减', () => {
    expect(trackConnection('10.0.0.1', 1)).toBe(1);
    expect(trackConnection('10.0.0.1', 1)).toBe(2);
    expect(trackConnection('10.0.0.1', -1)).toBe(1);
  });

  it('计数归零时删除记录，不残留空条目', () => {
    trackConnection('10.0.0.2', 1);
    expect(activeConnections.has('10.0.0.2')).toBe(true);
    trackConnection('10.0.0.2', -1);
    expect(activeConnections.has('10.0.0.2')).toBe(false);
  });

  it('超过 maxConn 抛 429（rule=connection-limit）', () => {
    trackConnection('10.0.0.3', 1);
    trackConnection('10.0.0.3', 1);
    trackConnection('10.0.0.3', 1);

    let err;
    try {
      trackConnection('10.0.0.3', 1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(429);
    expect(err.rule).toBe('connection-limit');
  });

  it('关闭连接（delta=-1）不会误报超限', () => {
    trackConnection('10.0.0.4', 1);
    trackConnection('10.0.0.4', 1);
    trackConnection('10.0.0.4', 1);
    // 第 4 个连接被拒后计数仍停在 3，此时关闭连接不应抛错
    expect(() => trackConnection('10.0.0.4', -1)).not.toThrow();
  });

  it('enableConnLimit=false 时完全不计数', () => {
    defenseConfig = { enableConnLimit: false, maxConn: 3 };
    expect(trackConnection('10.0.0.5', 1)).toBe(0);
    expect(activeConnections.has('10.0.0.5')).toBe(false);
  });
});

describe('僵尸记录清理（泄漏修复）', () => {
  it('只泄漏 1 个计数也会被回收 —— 原实现下这是永久占用', () => {
    // 模拟：请求进入 +1，但异常路径没走到 onSend → 残留 1
    trackConnection('10.0.0.6', 1);
    expect(activeConnections.get('10.0.0.6').count).toBe(1);

    // 残留 1 远低于旧判据的阈值（maxConn×2 = 6），旧实现永远不会回收这条记录
    jest.setSystemTime(Date.now() + STALE_AFTER_MS + 1000);
    const cleaned = cleanupStaleConnections();

    expect(cleaned).toBe(1);
    expect(activeConnections.has('10.0.0.6')).toBe(false);
  });

  it('反例：未超过静默窗口的活跃记录**不能**被回收', () => {
    trackConnection('10.0.0.7', 1);

    // 仅过了窗口的一半 —— 长请求（大文件上传）仍在进行中，绝不能误删
    jest.setSystemTime(Date.now() + Math.floor(STALE_AFTER_MS / 2));
    const cleaned = cleanupStaleConnections();

    expect(cleaned).toBe(0);
    expect(activeConnections.has('10.0.0.7')).toBe(true);
    // 记录仍在，后续 -1 才能正确递减
    expect(trackConnection('10.0.0.7', -1)).toBe(0);
  });

  it('持续活跃的记录不会被回收（每次 +1 都刷新最后活跃时间）', () => {
    // 上限调高，避免测试自身撞上限；本用例只关心"时间戳是否被刷新"
    defenseConfig = { enableConnLimit: true, maxConn: 100 };
    trackConnection('10.0.0.8', 1);
    // 每 4 分钟来一个请求，累计跨越 20 分钟（远超 10 分钟静默窗口）
    for (let i = 0; i < 5; i++) {
      jest.setSystemTime(Date.now() + 4 * 60 * 1000);
      trackConnection('10.0.0.8', 1);
      cleanupStaleConnections();
    }
    // 若 lastAt 没被刷新，累计 20 分钟早该被回收 —— 这正是不被回收的原因
    expect(activeConnections.has('10.0.0.8')).toBe(true);
    expect(activeConnections.get('10.0.0.8').count).toBe(6);
  });

  it('回收后该 IP 的配额恢复可用（不再被残留计数挤占）', () => {
    defenseConfig = { enableConnLimit: true, maxConn: 2 };
    trackConnection('10.0.0.9', 1);
    trackConnection('10.0.0.9', 1);
    // 已到上限
    expect(() => trackConnection('10.0.0.9', 1)).toThrow();

    jest.setSystemTime(Date.now() + STALE_AFTER_MS + 1000);
    cleanupStaleConnections();

    // 配额恢复：又能建立新连接了
    expect(trackConnection('10.0.0.9', 1)).toBe(1);
  });
});

describe('连接统计', () => {
  it('统计反映当前 IP 数与总连接数，并按连接数降序', () => {
    trackConnection('10.0.1.1', 1);
    trackConnection('10.0.1.2', 1);
    trackConnection('10.0.1.2', 1);

    const stats = getConnectionStats();
    expect(stats.totalIPs).toBe(2);
    expect(stats.totalConnections).toBe(3);
    expect(stats.topIPs[0]).toEqual({ ip: '10.0.1.2', count: 2 });
  });

  it('无连接时统计为空而不是抛错', () => {
    const stats = getConnectionStats();
    expect(stats.totalIPs).toBe(0);
    expect(stats.totalConnections).toBe(0);
    expect(stats.topIPs).toEqual([]);
  });
});
