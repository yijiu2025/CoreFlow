/**
 * 守卫配置跨实例同步单元测试
 *
 * 覆盖的核心安全属性：**实例 B 能在不重启的情况下拿到实例 A 改的配置**。
 * 如果没有这条，同一个路由打到不同实例会得到不同的鉴权结果 ——
 * 这在安全审计里是无法解释的，而且比"不可用"更难发现。
 *
 * 测试通过替身 GuardConfigDao 模拟"另一个实例刚写了 DB"，
 * 不需要真实数据库即可验证版本比对与合并逻辑。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 替身 DAO 的返回数据，各用例按需改写以模拟其他实例的写入 */
let dbPayload = { configs: {}, version: 0, versions: {} };
let dbShouldThrow = false;

jest.unstable_mockModule('../../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    async loadFromDB() {
      if (dbShouldThrow) throw new Error('模拟数据库不可用');
      return dbPayload;
    },
    async saveToDB() {
      return { maxVersion: 0, updated: [], versions: {} };
    }
  }
}));

const { registerSystemMetadata, registerGroupMetadata, registerApiMetadata, getGuardConfig, syncGuardConfigFromDb } =
  await import('../../api/guard-config.js');

/** 注册一个三层结构齐全的系统，模拟本实例启动时的代码级配置 */
function registerTestSystem(systemKey, { apiRequireLogin = false } = {}) {
  registerSystemMetadata(systemKey, { alias: '测试系统', prefix: '', enabled: true, requireLogin: false });
  registerGroupMetadata(systemKey, 'g1', { alias: '测试模块', prefix: '/v1', enabled: true, requireLogin: false });
  registerApiMetadata(systemKey, 'g1', 'a1', {
    alias: '测试接口',
    method: 'GET',
    url: '/probe',
    enabled: true,
    requireLogin: apiRequireLogin
  });
}

/** 构造"另一个实例写入 DB"后的完整系统配置（结构与内存一致，仅运行时字段不同） */
function makeDbSystem(apiRequireLogin) {
  return {
    id: 'x',
    enabled: true,
    requireLogin: false,
    allowIps: [],
    allowRoles: [],
    groups: {
      g1: {
        enabled: true,
        requireLogin: false,
        allowIps: [],
        allowRoles: [],
        apis: {
          a1: { enabled: true, requireLogin: apiRequireLogin, allowIps: [], allowRoles: [] }
        }
      }
    }
  };
}

beforeEach(() => {
  dbPayload = { configs: {}, version: 0, versions: {} };
  dbShouldThrow = false;
});

describe('守卫配置跨实例同步', () => {
  it('实例 B 能拿到实例 A 改的 API 鉴权开关（不重启）', async () => {
    registerTestSystem('sync-basic', { apiRequireLogin: false });
    // 同步前：本地是代码级默认值 requireLogin=false
    expect(getGuardConfig('sync-basic', 'g1', 'a1').requireLogin).toBe(false);

    // 模拟另一个实例把该 API 改成 requireLogin=true 并写入 DB
    dbPayload = {
      configs: { 'sync-basic': makeDbSystem(true) },
      version: 7,
      versions: { 'sync-basic': 7 }
    };

    const result = await syncGuardConfigFromDb();

    expect(result.updated).toEqual(['sync-basic']);
    expect(getGuardConfig('sync-basic', 'g1', 'a1').requireLogin).toBe(true);
  });

  it('版本号没变大时不重复合并（避免每次轮询都做深拷贝）', async () => {
    registerTestSystem('sync-noop');
    // 第一次同步：把本地版本号抬到 3
    dbPayload = {
      configs: { 'sync-noop': makeDbSystem(true) },
      version: 3,
      versions: { 'sync-noop': 3 }
    };
    expect((await syncGuardConfigFromDb()).updated).toEqual(['sync-noop']);

    // 第二次：DB 版本仍是 3，且把值改回去，也不应被合并
    dbPayload = {
      configs: { 'sync-noop': makeDbSystem(false) },
      version: 3,
      versions: { 'sync-noop': 3 }
    };
    expect((await syncGuardConfigFromDb()).updated).toEqual([]);
    // 因为版本没变，本地仍保留上次合并的 true
    expect(getGuardConfig('sync-noop', 'g1', 'a1').requireLogin).toBe(true);
  });

  it('DB 读不到时保留现有配置，不清空也不抛错', async () => {
    registerTestSystem('sync-dberr');
    dbPayload = {
      configs: { 'sync-dberr': makeDbSystem(true) },
      version: 5,
      versions: { 'sync-dberr': 5 }
    };
    await syncGuardConfigFromDb();
    expect(getGuardConfig('sync-dberr', 'g1', 'a1').requireLogin).toBe(true);

    dbShouldThrow = true;
    const result = await syncGuardConfigFromDb();

    expect(result.updated).toEqual([]);
    // 关键：配置还在，不能被"读失败"清成空
    expect(getGuardConfig('sync-dberr', 'g1', 'a1').requireLogin).toBe(true);
  });

  it('DB 里存在本实例未注册的系统时忽略，不创建幽灵配置', async () => {
    registerTestSystem('sync-known');
    dbPayload = {
      configs: { 'sync-known': makeDbSystem(false), 'sync-ghost': makeDbSystem(true) },
      version: 9,
      versions: { 'sync-known': 9, 'sync-ghost': 9 }
    };

    const result = await syncGuardConfigFromDb();

    expect(result.updated).toContain('sync-known');
    expect(result.updated).not.toContain('sync-ghost');
    expect(getGuardConfig('sync-ghost')).toBe(null);
  });

  it('只同步发生变化的系统，不受其他系统版本影响', async () => {
    registerTestSystem('sync-multi');
    dbPayload = {
      configs: { 'sync-multi': makeDbSystem(true) },
      version: 4,
      versions: { 'sync-multi': 4 }
    };
    expect((await syncGuardConfigFromDb()).updated).toEqual(['sync-multi']);
    // 再次同步，版本未变
    expect((await syncGuardConfigFromDb()).updated).toEqual([]);
  });
});
