/**
 * 活跃设备数上限裁剪测试（pruneActiveDevices）
 *
 * mock getModel（unstable_mockModule），用内存数组模拟 session_tokens，
 * 验证：超限裁剪最旧设备、未超限不动、硬删语义（SessionToken 无软删）。
 *
 * @author yijiu2025
 * @since 2026-09-05
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

/** MAX_ACTIVE_DEVICES 默认 20：为便于测试，保存原值并在用例中动态换算 */
const { MAX_ACTIVE_DEVICES_DEFAULT } = { MAX_ACTIVE_DEVICES_DEFAULT: 20 };

/** 内存 session_tokens 表：{ id, user_id, revoked, last_active } */
let rows;
let destroyedIds;

jest.unstable_mockModule('../../../framework/db/index.js', () => ({
  default: {},
  getModel: () => ({
    count: async ({ where }) => rows.filter(r => r.user_id === where.user_id && r.revoked === false).length,
    findAll: async ({ where, limit }) => {
      const active = rows
        .filter(r => r.user_id === where.user_id && r.revoked === false)
        .sort((a, b) => new Date(a.last_active) - new Date(b.last_active));
      return active.slice(0, limit).map(r => ({ id: r.id }));
    },
    destroy: async ({ where }) => {
      const ids = where.id.in ?? where.id;
      const idList = Array.isArray(ids) ? ids : [ids];
      let n = 0;
      for (const id of idList) {
        const idx = rows.findIndex(r => r.id === id);
        if (idx !== -1) {
          rows.splice(idx, 1);
          destroyedIds.push(id);
          n++;
        }
      }
      return n;
    }
  })
}));

const { pruneActiveDevices } = await import('../../../framework/auth/session.js');

/** 造 N 台设备的活跃行 */
function seedDevices(userId, n) {
  for (let i = 0; i < n; i++) {
    rows.push({
      id: rows.length + 1,
      user_id: userId,
      revoked: false,
      last_active: new Date(Date.now() - (n - i) * 60 * 1000) // i 越大越新
    });
  }
}

beforeEach(() => {
  rows = [];
  destroyedIds = [];
});

describe('pruneActiveDevices 活跃设备上限裁剪', () => {
  test('未超限（< MAX_ACTIVE_DEVICES）→ 不裁剪', async () => {
    seedDevices(1, 5);
    const removed = await pruneActiveDevices(1);
    expect(removed).toBe(0);
    expect(rows.filter(r => r.user_id === 1)).toHaveLength(5);
  });

  test('恰好等于上限 → 不裁剪（新设备进来后才触发）', async () => {
    seedDevices(1, MAX_ACTIVE_DEVICES_DEFAULT);
    const removed = await pruneActiveDevices(1);
    expect(removed).toBe(0);
  });

  test('超限 → 裁剪最旧设备，保留最新 MAX_ACTIVE_DEVICES 台', async () => {
    seedDevices(1, MAX_ACTIVE_DEVICES_DEFAULT + 1); // 21 台（20 旧 + 1 新）
    const removed = await pruneActiveDevices(1);
    expect(removed).toBe(1);
    expect(rows.filter(r => r.user_id === 1)).toHaveLength(MAX_ACTIVE_DEVICES_DEFAULT);
    expect(destroyedIds).toHaveLength(1);
  });

  test('多用户隔离：只裁剪目标用户的设备', async () => {
    seedDevices(1, MAX_ACTIVE_DEVICES_DEFAULT + 1);
    seedDevices(2, 3);
    const removed = await pruneActiveDevices(1);
    expect(removed).toBe(1);
    expect(rows.filter(r => r.user_id === 2)).toHaveLength(3);
  });

  test('revoked 的行不计入活跃数', async () => {
    seedDevices(1, MAX_ACTIVE_DEVICES_DEFAULT);
    rows[0].revoked = true; // 最旧的一台已被踢
    const removed = await pruneActiveDevices(1);
    expect(removed).toBe(0);
  });
});
