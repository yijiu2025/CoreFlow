/**
 * DB 合并时的放宽校验（端到端）
 *
 * 这组用例守的是一条**真实攻击路径**：绕过面板，直接改数据库。
 * 旧实现会无条件把 DB 值盖到内存上，一句 SQL 就能清空某个组的角色门槛。
 * 现在放宽必须在写库时带服务端签名，否则合并阶段整节点跳过。
 *
 * 与 guard-config-sync.test.js 的分工：那个文件测"跨实例同步能不能拿到变更"，
 * 这个文件测"拿到的变更该不该被采纳"。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

/** 替身 DAO：模拟"另一个写入口直接改了 DB" */
let dbPayload = { configs: {}, version: 0, versions: {} };

jest.unstable_mockModule('../../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    async loadFromDB() {
      return dbPayload;
    },
    async saveToDB() {
      return { maxVersion: 0, updated: [], versions: {} };
    }
  }
}));

const { registerSystemMetadata, registerGroupMetadata, registerApiMetadata, getGuardConfig, syncGuardConfigFromDb } =
  await import('../../api/guard-config.js');

const { signRelaxation } = await import('../../app/guard/services/signing.js');

beforeAll(() => {
  process.env.APP_SECRET = 'test-app-secret-0123456789abcdef0123456789';
});

/** 注册一个"要求登录 + 限定角色"的接口，作为代码基线 */
function registerProtectedSystem(systemKey) {
  registerSystemMetadata(systemKey, { alias: '测试系统', prefix: '', enabled: true, requireLogin: false });
  registerGroupMetadata(systemKey, 'g1', { alias: '测试模块', prefix: '/v1', enabled: true, requireLogin: false });
  registerApiMetadata(systemKey, 'g1', 'a1', {
    alias: '受保护接口',
    method: 'GET',
    url: '/probe',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin_viewer']
  });
}

/** 构造 DB 中该接口的节点（只带运行时字段，结构与代码一致） */
function dbApi({ requireLogin = true, allowRoles = ['admin_viewer'], _relaxation } = {}) {
  const node = { enabled: true, requireLogin, allowIps: [], allowRoles };
  if (_relaxation) node._relaxation = _relaxation;
  return node;
}

/** 构造完整的 DB payload，version=2 保证触发合并 */
function payloadFor(systemKey, apiNode) {
  return {
    configs: {
      [systemKey]: {
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
            apis: { a1: apiNode }
          }
        }
      }
    },
    version: 2,
    versions: { [systemKey]: 2 }
  };
}

beforeEach(() => {
  dbPayload = { configs: {}, version: 0, versions: {} };
});

describe('DB 合并：未签名的放宽被忽略', () => {
  it('SQL 直接清空 allowRoles 不生效', async () => {
    const key = 'db-guard-roles';
    registerProtectedSystem(key);
    expect(getGuardConfig(key, 'g1', 'a1').allowRoles).toEqual(['admin_viewer']);

    dbPayload = payloadFor(key, dbApi({ allowRoles: [] }));
    await syncGuardConfigFromDb();

    // 放宽被拒绝 → 仍然是代码基线的角色要求
    expect(getGuardConfig(key, 'g1', 'a1').allowRoles).toEqual(['admin_viewer']);
  });

  it('SQL 直接把 requireLogin 改成 false 不生效', async () => {
    const key = 'db-guard-login';
    registerProtectedSystem(key);

    dbPayload = payloadFor(key, dbApi({ requireLogin: false }));
    await syncGuardConfigFromDb();

    expect(getGuardConfig(key, 'g1', 'a1').requireLogin).toBe(true);
  });

  it('一次同时放宽两个字段，仍然整节点被拒绝', async () => {
    const key = 'db-guard-both';
    registerProtectedSystem(key);

    dbPayload = payloadFor(key, dbApi({ requireLogin: false, allowRoles: [] }));
    await syncGuardConfigFromDb();

    const node = getGuardConfig(key, 'g1', 'a1');
    expect(node.requireLogin).toBe(true);
    expect(node.allowRoles).toEqual(['admin_viewer']);
  });
});

describe('DB 合并：带签名的放宽被接受', () => {
  it('签名与字段值一致时生效', async () => {
    const key = 'db-guard-signed';
    registerProtectedSystem(key);

    const relaxed = { enabled: true, requireLogin: false, allowIps: [], allowRoles: [] };
    const envelope = signRelaxation({
      path: `${key}/g1/a1`,
      node: relaxed,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-ops',
      reason: '应急只读排查'
    });

    dbPayload = payloadFor(key, dbApi({ requireLogin: false, allowRoles: [], _relaxation: envelope }));
    await syncGuardConfigFromDb();

    const node = getGuardConfig(key, 'g1', 'a1');
    expect(node.requireLogin).toBe(false);
    expect(node.allowRoles).toEqual([]);
    // 信封必须留下来，否则下次启动会因为"签名丢失"而重新收紧
    expect(node._relaxation).toBeDefined();
  });

  it('签名后再篡改其它字段，整节点被拒绝', async () => {
    const key = 'db-guard-tamper';
    registerProtectedSystem(key);

    // 签名针对"只放宽 requireLogin"，allowRoles 保持不变
    const signedNode = { enabled: true, requireLogin: false, allowIps: [], allowRoles: ['admin_viewer'] };
    const envelope = signRelaxation({
      path: `${key}/g1/a1`,
      node: signedNode,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-ops',
      reason: '应急只读排查'
    });

    // DB 里把 allowRoles 也顺手清空了 —— 签名覆盖不到这个新值
    dbPayload = payloadFor(key, dbApi({ requireLogin: false, allowRoles: [], _relaxation: envelope }));
    await syncGuardConfigFromDb();

    const node = getGuardConfig(key, 'g1', 'a1');
    expect(node.requireLogin).toBe(true);
    expect(node.allowRoles).toEqual(['admin_viewer']);
  });
});

describe('DB 合并：收紧不需要签名', () => {
  it('SQL 追加角色直接生效（方向更严）', async () => {
    const key = 'db-guard-tighten';
    registerProtectedSystem(key);

    dbPayload = payloadFor(key, dbApi({ allowRoles: ['admin_viewer', 'admin_operator'] }));
    await syncGuardConfigFromDb();

    expect(getGuardConfig(key, 'g1', 'a1').allowRoles).toEqual(['admin_viewer', 'admin_operator']);
  });

  it('SQL 把 requireLogin 设为 false 之外的值（true→true）不产生变更', async () => {
    const key = 'db-guard-noop';
    registerProtectedSystem(key);

    dbPayload = payloadFor(key, dbApi({ requireLogin: true, allowRoles: ['admin_viewer'] }));
    await syncGuardConfigFromDb();

    expect(getGuardConfig(key, 'g1', 'a1').requireLogin).toBe(true);
  });
});
