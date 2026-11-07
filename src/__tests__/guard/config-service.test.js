/**
 * 配置写入服务的授权门槛
 *
 * 这组用例守的是本次改动的核心语义：**收紧与放宽都要二次认证**。
 * 之前的实现只拦放宽，等于允许"先关掉某个模块"这种同样高危的操作免检通过。
 *
 * 依赖：配置树与 step-up 票据用替身，方向判定与签名用真实实现
 * （否则测到的就不是"接线上"的行为）。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

/** 当前配置树（每个用例前重置） */
let configs;
/** setGuardConfig 的调用记录 */
let setCalls;
/** consumeTicket 的调用记录与返回值 */
let consumeCalls;
let ticketResult;

jest.unstable_mockModule('../../api/guard-config.js', () => ({
  getAllGuardConfigs: () => JSON.parse(JSON.stringify(configs)),
  setGuardConfig: (system, patch, group, apiKey) => {
    setCalls.push({ system, patch, group, apiKey });
    return { ...configs[system].groups[group], ...patch };
  }
}));

jest.unstable_mockModule('../../framework/security/auth/index.js', () => ({
  logAuditEvent: async () => {}
}));

jest.unstable_mockModule('../../app/guard/services/stepup.service.js', () => ({
  buildPath: (system, group, apiKey) => [system, group, apiKey].filter(Boolean).join('/'),
  consumeTicket: async params => {
    consumeCalls.push(params);
    return ticketResult;
  }
}));

const { updateConfig, toggleConfig } = await import('../../app/guard/services/config.service.js');

/** 一份最小可用的配置树：g1 要求登录且限定角色 */
function makeConfigs() {
  return {
    Admin: {
      id: 'Admin',
      enabled: true,
      requireLogin: false,
      allowIps: [],
      allowRoles: [],
      groups: {
        g1: {
          id: 'g1',
          enabled: true,
          requireLogin: true,
          allowIps: [],
          allowRoles: ['admin_viewer'],
          apis: {}
        }
      }
    }
  };
}

/** 伪造 request（默认超管；安全配置只对超管开放） */
function makeRequest(roles = ['superadmin']) {
  return {
    state: { user: { uid: 'uid-ops', sessionId: 'sid-1', roles, permissions: { allows: [], denies: [] } } },
    ip: '10.0.0.1',
    headers: {}
  };
}

beforeAll(() => {
  process.env.APP_SECRET = 'test-app-secret-0123456789abcdef0123456789';
});

beforeEach(() => {
  configs = makeConfigs();
  setCalls = [];
  consumeCalls = [];
  ticketResult = { ok: true, method: 'email', reason: '排查线上问题' };
});

describe('收紧：必须二次认证', () => {
  it('无票据时拒绝，且不写入任何配置', async () => {
    ticketResult = { ok: false, statusCode: 428, message: '该变更需要二次认证' };

    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { allowRoles: ['admin_viewer', 'admin_operator'] },
      request: makeRequest()
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(428);
    expect(result.code).toBe('stepup_required');
    expect(setCalls).toHaveLength(0);
  });

  it('有票据时写入，并清除可能残留的放宽签名', async () => {
    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { allowRoles: ['admin_viewer', 'admin_operator'] },
      request: makeRequest(),
      stepupToken: 'ticket-1'
    });

    expect(result.ok).toBe(true);
    expect(result.direction).toBe('tighten');
    expect(consumeCalls).toHaveLength(1);
    expect(setCalls).toHaveLength(1);
    // 收紧不需要签名，但必须把旧信封清掉
    expect(setCalls[0].patch._relaxation).toBeNull();
  });

  it('关闭模块（enabled true→false）同样需要票据', async () => {
    ticketResult = { ok: false, statusCode: 428, message: '该变更需要二次认证' };

    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { enabled: false },
      request: makeRequest()
    });

    expect(result.ok).toBe(false);
    expect(setCalls).toHaveLength(0);
  });
});

describe('放宽：必须二次认证 + 签名', () => {
  it('无票据时拒绝', async () => {
    ticketResult = { ok: false, statusCode: 428, message: '该变更需要二次认证' };

    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { allowRoles: [] },
      request: makeRequest()
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('stepup_required');
    expect(setCalls).toHaveLength(0);
  });

  it('有票据时写入签名信封（签名覆盖目标路径与字段值）', async () => {
    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { allowRoles: [] },
      request: makeRequest(),
      stepupToken: 'ticket-2'
    });

    expect(result.ok).toBe(true);
    expect(result.direction).toBe('relax');
    const envelope = setCalls[0].patch._relaxation;
    expect(envelope).toBeDefined();
    expect(envelope.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(envelope.by).toBe('uid-ops');
    expect(envelope.reason).toBe('排查线上问题');
  });
});

describe('不需要鉴权语义的字段', () => {
  it('只改 description 时免认证', async () => {
    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { description: '只改说明文字' },
      request: makeRequest()
    });

    expect(result.ok).toBe(true);
    expect(result.direction).toBe('neutral');
    expect(consumeCalls).toHaveLength(0);
    expect(setCalls).toHaveLength(1);
  });

  it('重复写入相同的运行时值也算 neutral（不强迫用户重复认证）', async () => {
    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { allowRoles: ['admin_viewer'] },
      request: makeRequest()
    });

    expect(result.ok).toBe(true);
    expect(result.direction).toBe('neutral');
    expect(consumeCalls).toHaveLength(0);
  });
});

describe('身份门槛：只认超管', () => {
  it('非超管即使拿到票据也被拒', async () => {
    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { allowRoles: ['admin_viewer', 'admin_operator'] },
      request: makeRequest([]),
      stepupToken: 'ticket-any'
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain('超级管理员');
    // 身份不通过时不应该走票据核验，更不应该落盘
    expect(consumeCalls).toHaveLength(0);
    expect(setCalls).toHaveLength(0);
  });
});

describe('字段白名单', () => {
  it('requirePermission 仍然不可写（认证也不能开这个口子）', async () => {
    const result = await updateConfig({
      system: 'Admin',
      group: 'g1',
      patch: { requirePermission: null },
      request: makeRequest(),
      stepupToken: 'ticket-3'
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(setCalls).toHaveLength(0);
  });
});

describe('toggle 走同一条授权路径', () => {
  it('关闭模块（收紧）需要票据', async () => {
    ticketResult = { ok: false, statusCode: 428, message: '该变更需要二次认证' };

    const result = await toggleConfig({
      system: 'Admin',
      group: 'g1',
      request: makeRequest()
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('stepup_required');
    expect(setCalls).toHaveLength(0);
  });

  it('有票据时翻转成功', async () => {
    const result = await toggleConfig({
      system: 'Admin',
      group: 'g1',
      request: makeRequest(),
      stepupToken: 'ticket-4'
    });

    expect(result.ok).toBe(true);
    expect(result.enabled).toBe(false);
    expect(setCalls[0].patch.enabled).toBe(false);
  });
});
