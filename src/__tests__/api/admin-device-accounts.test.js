/**
 * 设备账户关联查询服务测试
 *
 * mock getModel（仓库既有 unstable_mockModule 模式），用内存 fixtures 验证
 * service 的聚合逻辑：多账户去重合并、活跃会话标记、时间窗口、非法入参防御、
 * 老格式 UUID 兼容查询、模型未加载报错。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { encodeTimestamp as feEncode } from '../../../packages/shared-device/src/base62-timestamp.js';

/** 内存模型注册表：每个用例自行填充 stub */
const modelMocks = {};

jest.unstable_mockModule('../../framework/db/index.js', () => ({
  getModel: jest.fn(name => modelMocks[name] || null)
}));

/** 动态导入被测服务（必须在 unstable_mockModule 之后） */
const { getDeviceAccountSummary } = await import('../../app/admin/services/device-account.service.js');

/** 构造合法结构化设备 ID */
function makeDeviceId(ageDays = 0) {
  return `WEB-${feEncode(Date.now() - ageDays * 24 * 60 * 60 * 1000)}-Ab3dE9`;
}

/** 构造 SessionToken 会话行 fixture（含 user include） */
function makeRow({ userId, uid, app = 'posecraft', lastActiveHoursAgo = 0, revoked = false, createdAtDaysAgo = 30 }) {
  const now = Date.now();
  return {
    user_id: userId,
    app_id: app,
    device_id: 'DEVICE',
    last_active: new Date(now - lastActiveHoursAgo * 3600 * 1000),
    revoked,
    created_at: new Date(now - createdAtDaysAgo * 24 * 3600 * 1000),
    updated_at: new Date(now - lastActiveHoursAgo * 3600 * 1000),
    user: { uid, username: `user-${userId}`, email: `${uid}@test.com`, avatar: null, status: 1, id: 999 }
  };
}

beforeEach(() => {
  modelMocks.SessionToken = {
    findAll: jest.fn(async () => [])
  };
  modelMocks.User = {};
});

describe('getDeviceAccountSummary 聚合逻辑', () => {
  test('多账户聚合：按 uid 去重、loginCount/apps 合并、活跃会话标记', async () => {
    const deviceA = makeDeviceId();
    modelMocks.SessionToken.findAll.mockImplementation(async ({ where }) => {
      expect(where.device_id).toBe(deviceA);
      return [
        // 用户 A：2 行（同 uid 多行兜底合并），1 行活跃 1 行已撤销
        makeRow({
          userId: 1,
          uid: 'uid-a',
          app: 'posecraft',
          lastActiveHoursAgo: 1,
          revoked: false,
          createdAtDaysAgo: 100
        }),
        makeRow({
          userId: 1,
          uid: 'uid-a',
          app: 'firewall',
          lastActiveHoursAgo: 10,
          revoked: true,
          createdAtDaysAgo: 90
        }),
        // 用户 B：1 行已撤销（无活跃会话）
        makeRow({
          userId: 2,
          uid: 'uid-b',
          app: 'posecraft',
          lastActiveHoursAgo: 50,
          revoked: true,
          createdAtDaysAgo: 60
        })
      ];
    });

    const summary = await getDeviceAccountSummary(deviceA);

    expect(summary.totalAccounts).toBe(2);
    expect(summary.deviceId).toBe(deviceA);

    const accountA = summary.accounts.find(a => a.uid === 'uid-a');
    const accountB = summary.accounts.find(a => a.uid === 'uid-b');

    expect(accountA.loginCount).toBe(2);
    expect(accountA.apps).toEqual(['posecraft', 'firewall']);
    expect(accountA.hasActiveSession).toBe(true);
    expect(accountA.username).toBe('user-1');
    expect(accountB.loginCount).toBe(1);
    expect(accountB.hasActiveSession).toBe(false);
  });

  test('不外露内部数字 id（隐私边界）', async () => {
    modelMocks.SessionToken.findAll.mockResolvedValue([makeRow({ userId: 1, uid: 'uid-a' })]);

    const summary = await getDeviceAccountSummary(makeDeviceId());
    const json = JSON.stringify(summary);
    expect(json).not.toContain('"id":999');
    expect(summary.accounts[0].uid).toBe('uid-a');
  });

  test('设备层摘要：firstSeenAt 取最早、lastActiveAt 取最新、structured 补充结构化信息', async () => {
    const device = makeDeviceId(10); // 10 天前生成
    modelMocks.SessionToken.findAll.mockResolvedValue([
      makeRow({ userId: 1, uid: 'uid-a', lastActiveHoursAgo: 2, createdAtDaysAgo: 30 }),
      makeRow({ userId: 2, uid: 'uid-b', lastActiveHoursAgo: 48, createdAtDaysAgo: 5 })
    ]);

    const summary = await getDeviceAccountSummary(device);

    expect(summary.structured.platform).toBe('WEB');
    expect(summary.structured.ageDays).toBeGreaterThanOrEqual(9);
    // uid-a 首见 30 天前，是全设备最早出现时间
    expect(new Date(summary.firstSeenAt).getTime()).toBe(new Date(summary.accounts[0].firstSeenAt).getTime());
    expect(summary.lastActiveAt).toBe(summary.accounts[0].lastActiveAt);
  });

  test('空结果：totalAccounts 0、accounts 空数组', async () => {
    const summary = await getDeviceAccountSummary(makeDeviceId());
    expect(summary).toEqual({
      deviceId: expect.any(String),
      structured: expect.any(Object),
      totalAccounts: 0,
      accounts: [],
      firstSeenAt: null,
      lastActiveAt: null
    });
  });

  test('老格式 UUID 存量 device_id 可查（structured 为 null）', async () => {
    const legacyUuid = '550e8400-e29b-41d4-a716-446655440000';
    modelMocks.SessionToken.findAll.mockResolvedValue([makeRow({ userId: 1, uid: 'uid-a' })]);

    const summary = await getDeviceAccountSummary(legacyUuid);
    expect(summary.structured).toBeNull();
    expect(summary.totalAccounts).toBe(1);
  });

  test.each([
    ['空字符串', ''],
    ['超长输入', 'x'.repeat(101)],
    ['非字符串', 12345],
    ['null', null]
  ])('非法入参返回 null：%s', async (_name, badInput) => {
    expect(await getDeviceAccountSummary(badInput)).toBeNull();
    expect(modelMocks.SessionToken.findAll).not.toHaveBeenCalled();
  });

  test('模型未加载抛 MODEL_NOT_LOADED', async () => {
    delete modelMocks.SessionToken;
    await expect(getDeviceAccountSummary(makeDeviceId())).rejects.toMatchObject({
      code: 'MODEL_NOT_LOADED'
    });
  });
});
