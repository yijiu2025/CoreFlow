/**
 * 安全路由注册与权限判定（真实 guard 模块驱动）
 *
 * 旧版本断言的是手抄常量：`const options = { permission: 'fw:config:read' }` 再
 * `expect(options.permission).toBe('fw:config:read')`，CSRF 清单、限频阈值、Cookie
 * 选项也全是复制粘贴 —— 生产代码改坏一律不受影响。
 *
 * 本版直接驱动 `src/api/guard.js` + `src/api/guard-config.js`：
 * - 注册契约：permission 别名是否真落进守卫配置、requireLogin 是否自动带签名、
 *   完整 URL 是否由「系统前缀 + 组前缀 + 路由」拼出、重复注册是否被拦
 * - 判定契约：单个/any/all 三种权限格式、deny 优先、非法格式 fail-closed、
 *   未登录 401、IP 白名单 403
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock DB 层：guard-config 会写库，测试只需内存配置
jest.unstable_mockModule('../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    loadFromDB: async () => ({ configs: {}, version: 0, versions: {} }),
    saveToDB: async (configs, dbVersions) => {
      const versions = {};
      const maxVersion = Math.max(0, ...Object.values(dbVersions || {})) + 1;
      for (const key of Object.keys(configs)) versions[key] = maxVersion;
      return { maxVersion, updated: [], versions };
    }
  }
}));

const {
  registerSecureRoute,
  registerGroupMetadata,
  setRegistrationContext,
  __test__applyGuardLogic: applyGuardLogic
} = await import('../api/guard.js');
const { getGuardConfig, registerSystemMetadata } = await import('../api/guard-config.js');

/** 记录型 Fastify 桩 */
function mockFastify() {
  const routes = [];
  return {
    routes,
    get: (path, opts) => routes.push({ method: 'GET', path, opts }),
    post: (path, opts) => routes.push({ method: 'POST', path, opts }),
    put: (path, opts) => routes.push({ method: 'PUT', path, opts }),
    delete: (path, opts) => routes.push({ method: 'DELETE', path, opts }),
    patch: (path, opts) => routes.push({ method: 'PATCH', path, opts })
  };
}

/** 记录型 reply：捕获被调用的 result 方法 */
function mockReply() {
  const reply = { sent: false, statusCode: 200, calls: [] };
  const record = name => message => {
    reply.calls.push({ name, message });
    reply.sent = true;
    return reply;
  };
  reply.result = {
    success: record('success'),
    unauth: record('unauth'),
    forbidden: record('forbidden'),
    badRequest: record('badRequest')
  };
  reply.code = code => {
    reply.statusCode = code;
    return reply;
  };
  reply.send = body => {
    reply.sent = true;
    reply.body = body;
    return reply;
  };
  return reply;
}

function mockRequest(user, ip = '127.0.0.1') {
  return { ip, state: { user } };
}

function userWith(allows, denies = []) {
  return { sub: 1, roles: ['user'], permissions: { allows, denies } };
}

beforeEach(() => {
  setRegistrationContext('it-test-system');
  registerSystemMetadata('it-test-system', { name: '集成测试系统', prefix: '/it' });
  // 必须有组：guard-config 的 getGuardConfig 把空 groupKey 当作"取系统级配置"，
  // 不建组的话读不到 API 级条目（这也是生产上每个路由文件都要注册组的原因）
  registerGroupMetadata({ name: 'default' });
});

describe('路由注册契约', () => {
  it('permission 是 requirePermission 的别名，且真的写进守卫配置', () => {
    const fastify = mockFastify();
    registerSecureRoute(fastify, {
      name: 'alias-perm',
      method: 'GET',
      url: '/alias',
      permission: 'fw:config:read',
      handler: () => {}
    });

    const api = getGuardConfig('it-test-system', 'default', 'alias-perm');
    expect(api).toMatchObject({ requirePermission: 'fw:config:read', method: 'GET', url: '/it/alias' });
  });

  it('requireLogin 自动开启签名校验，并把 requireLogin 写进路由 config', () => {
    const fastify = mockFastify();
    registerSecureRoute(fastify, {
      name: 'login-route',
      method: 'POST',
      url: '/login-required',
      requireLogin: true,
      handler: () => {}
    });

    const route = fastify.routes.at(-1);
    expect(route.opts.config.requireSignature).toBe(true);
    expect(route.opts.config.requireLogin).toBe(true);
    expect(typeof route.opts.preHandler).toBe('function');
  });

  it('公开端点用 requireSignature 防爬时不误标 requireLogin', () => {
    const fastify = mockFastify();
    registerSecureRoute(fastify, {
      name: 'public-signed',
      method: 'GET',
      url: '/public-signed',
      requireSignature: true,
      handler: () => {}
    });

    const route = fastify.routes.at(-1);
    expect(route.opts.config.requireSignature).toBe(true);
    expect(route.opts.config.requireLogin).toBeUndefined();
  });

  it('完整 URL = 系统前缀 + 组前缀 + 路由地址', () => {
    registerGroupMetadata({ name: 'cfg', prefix: '/v1' });
    const fastify = mockFastify();
    registerSecureRoute(fastify, { name: 'composed', method: 'GET', url: '/summary', handler: () => {} });

    expect(fastify.routes.at(-1).path).toBe('/it/v1/summary');
  });

  it('同一 method+URL 重复注册被拦截（不同 name 也不行）', () => {
    const fastify = mockFastify();
    registerSecureRoute(fastify, { name: 'dup-a', method: 'GET', url: '/dup', handler: () => {} });

    expect(() =>
      registerSecureRoute(fastify, { name: 'dup-b', method: 'GET', url: '/dup', handler: () => {} })
    ).toThrow(/路由重复注册/);
  });

  it('缺 handler / 非法 method 抛 INVALID_PARAM', () => {
    const fastify = mockFastify();
    expect(() => registerSecureRoute(fastify, { name: 'x', method: 'GET', url: '/x' })).toThrow(/handler 必须是函数/);
    expect(() => registerSecureRoute(fastify, { name: 'y', url: '/y', handler: () => {} })).toThrow(/method 参数无效/);
  });
});

describe('权限判定（applyGuardLogic）', () => {
  it('单权限：父级通配符命中子权限', async () => {
    const reply = mockReply();
    await applyGuardLogic({ requirePermission: 'fw:config:read' }, mockRequest(userWith(['fw:config:*'])), reply);
    expect(reply.sent).toBe(false);
  });

  it('单权限：无匹配 → 403', async () => {
    const reply = mockReply();
    await applyGuardLogic({ requirePermission: 'fw:config:read' }, mockRequest(userWith(['user:profile:read'])), reply);
    expect(reply.calls).toEqual([{ name: 'forbidden', message: '权限不足：需要 [fw:config:read] 权限' }]);
  });

  it('deny 优先于 allows 的 *', async () => {
    const reply = mockReply();
    await applyGuardLogic(
      { requirePermission: 'fw:config:read' },
      mockRequest(userWith(['*'], ['fw:config:read'])),
      reply
    );
    expect(reply.calls[0].name).toBe('forbidden');
  });

  it('any：命中任一即放行', async () => {
    const reply = mockReply();
    await applyGuardLogic(
      { requirePermission: { any: ['a:read', 'b:read'] } },
      mockRequest(userWith(['b:read'])),
      reply
    );
    expect(reply.sent).toBe(false);
  });

  it('all：缺一项即 403，且提示列出全部所需权限', async () => {
    const reply = mockReply();
    await applyGuardLogic(
      { requirePermission: { all: ['a:read', 'b:read'] } },
      mockRequest(userWith(['a:read'])),
      reply
    );
    expect(reply.calls[0].name).toBe('forbidden');
    expect(reply.calls[0].message).toContain('a:read, b:read');
  });

  it('非法权限格式 fail-closed（不是放行）', async () => {
    const reply = mockReply();
    await applyGuardLogic({ requirePermission: { invalid: ['a:read'] } }, mockRequest(userWith(['*'])), reply);
    expect(reply.calls[0].name).toBe('forbidden');
  });

  it('未登录访问需权限的接口 → 401', async () => {
    const reply = mockReply();
    await applyGuardLogic({ requirePermission: 'a:read' }, mockRequest(null), reply);
    expect(reply.calls[0].name).toBe('unauth');
  });

  it('IP 白名单不匹配 → 403', async () => {
    const reply = mockReply();
    await applyGuardLogic({ allowIps: ['10.0.0.0/8'] }, mockRequest(userWith(['*']), '192.168.1.9'), reply);
    expect(reply.calls[0]).toMatchObject({ name: 'forbidden' });
    expect(reply.calls[0].message).toContain('192.168.1.9');
  });

  it('节点被禁用 → 403', async () => {
    const reply = mockReply();
    await applyGuardLogic({ enabled: false }, mockRequest(userWith(['*'])), reply);
    expect(reply.calls[0].name).toBe('forbidden');
  });

  it('Token 过期：返回 401 invalid_token，且不抛错（reply.sent 是只读 getter）', async () => {
    const reply = mockReply();
    const request = { ip: '127.0.0.1', state: { user: null, authError: { name: 'TokenExpiredError' } } };

    await expect(applyGuardLogic({ requireLogin: true }, request, reply)).resolves.toBeUndefined();
    expect(reply.statusCode).toBe(401);
    expect(reply.body).toEqual({ error: 'invalid_token', error_description: 'Token expired' });
    expect(reply.sent).toBe(true);
  });

  it('Token 未生效：401 not yet valid', async () => {
    const reply = mockReply();
    const request = { ip: '127.0.0.1', state: { user: null, authError: { name: 'NotBeforeError' } } };

    await applyGuardLogic({ requireLogin: true }, request, reply);
    expect(reply.body).toEqual({ error: 'invalid_token', error_description: 'Token not yet valid' });
  });
});
