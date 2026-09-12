/**
 * audit-logger 单元测试
 *
 * 覆盖：getAuditLogs 的 findAll 调用参数、logAuditEvent 双写降级、
 * createRingQueue 未配置时静默跳过 Redis 副本。
 *
 * @author yijiu2025
 * @since 2026-09-09
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

/** AuditLog 模型桩：记录 findAll/create 调用参数 */
const auditFindAll = jest.fn();
const auditCreate = jest.fn();
const AuditLogStub = {
  findAll: auditFindAll,
  create: auditCreate
};

jest.unstable_mockModule('../../../framework/db/index.js', () => ({
  default: {},
  getModel: name => (name === 'AuditLog' ? AuditLogStub : undefined)
}));

/** createRingQueue 桩：模拟环形缓冲 */
const ringPush = jest.fn();
jest.unstable_mockModule('../../../framework/redis/index.js', () => ({
  createRingQueue: () => ({ push: ringPush })
}));

/** Logger 桩 */
jest.unstable_mockModule('../../../framework/log/index.js', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

const { getAuditLogs, logAuditEvent } = await import('../../../framework/auth/audit-logger.js');

beforeEach(() => {
  auditFindAll.mockReset();
  auditCreate.mockReset();
  ringPush.mockReset();
});

describe('getAuditLogs → findAll 参数', () => {
  test('默认参数：limit=100 + DESC + created_at 排序', async () => {
    auditFindAll.mockResolvedValue([]);
    await getAuditLogs({});
    expect(auditFindAll).toHaveBeenCalledTimes(1);
    const args = auditFindAll.mock.calls[0][0];
    expect(args).toMatchObject({
      order: [['created_at', 'DESC']],
      limit: 100,
      where: {}
    });
  });

  test('event 过滤写入 where.event', async () => {
    auditFindAll.mockResolvedValue([]);
    await getAuditLogs({ event: 'LOGIN_FAILED' });
    expect(auditFindAll.mock.calls[0][0].where).toEqual({ event: 'LOGIN_FAILED' });
  });

  test('userId 过滤写入 where.user_id', async () => {
    auditFindAll.mockResolvedValue([]);
    await getAuditLogs({ userId: 42 });
    expect(auditFindAll.mock.calls[0][0].where).toEqual({ user_id: 42 });
  });

  test('limit 超过 500 被截断为 500', async () => {
    auditFindAll.mockResolvedValue([]);
    await getAuditLogs({ limit: 9999 });
    expect(auditFindAll.mock.calls[0][0].limit).toBe(500);
  });

  test('limit 小于 500 原样透传', async () => {
    auditFindAll.mockResolvedValue([]);
    await getAuditLogs({ limit: 50 });
    expect(auditFindAll.mock.calls[0][0].limit).toBe(50);
  });

  test('event + userId 组合过滤', async () => {
    auditFindAll.mockResolvedValue([]);
    await getAuditLogs({ event: 'LOGOUT', userId: 7, limit: 10 });
    expect(auditFindAll.mock.calls[0][0]).toMatchObject({
      where: { event: 'LOGOUT', user_id: 7 },
      order: [['created_at', 'DESC']],
      limit: 10
    });
  });

  test('返回值原样透传 findAll 结果', async () => {
    const fake = [{ id: 1 }, { id: 2 }];
    auditFindAll.mockResolvedValue(fake);
    const result = await getAuditLogs({});
    expect(result).toBe(fake);
  });
});

describe('logAuditEvent 双写', () => {
  test('DB 写入 + Redis 环形缓冲 push', async () => {
    await logAuditEvent({ type: 'LOGIN_SUCCESS', userId: 1, ip: '1.1.1.1', appId: 'x', details: { r: 1 } });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0]).toMatchObject({
      event: 'LOGIN_SUCCESS',
      user_id: 1,
      ip: '1.1.1.1',
      app_id: 'x'
    });
    expect(ringPush).toHaveBeenCalledTimes(1);
    // push 的 entry 含 timestamp（ISO 字符串）
    const entry = ringPush.mock.calls[0][0];
    expect(entry.type).toBe('LOGIN_SUCCESS');
    expect(typeof entry.timestamp).toBe('string');
  });

  test('DB 写入失败不阻塞 Redis 副本写入', async () => {
    auditCreate.mockRejectedValue(new Error('DB down'));
    await logAuditEvent({ type: 'LOGOUT', userId: 2 });
    expect(auditCreate).toHaveBeenCalledTimes(1);
    // DB 挂了，Redis 副本仍尝试写（降级不抛错）
    expect(ringPush).toHaveBeenCalledTimes(1);
  });

  test('Redis push 失败不抛错（DB 已写完整）', async () => {
    ringPush.mockRejectedValue(new Error('Redis down'));
    await expect(logAuditEvent({ type: 'PASSWORD_CHANGE', userId: 3 })).resolves.toBeUndefined();
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
