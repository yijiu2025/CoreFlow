/**
 * 三级守卫系统单元测试
 *
 * 覆盖：路由注册、参数校验、权限匹配、上下文管理
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock 数据库模块，避免 import 链触发 process.exit(1)
jest.unstable_mockModule('../app/guard/dao/guard-config.dao.js', () => ({
  default: {
    loadFromDB: async () => ({ configs: {}, version: 0, versions: {} }),
    saveToDB: async (_configs, _dbVersions) => {
      const vals = Object.values(_dbVersions);
      const maxVersion = vals.length > 0 ? Math.max(...vals) + 1 : 1;
      const versions = {};
      for (const key of Object.keys(_configs)) {
        versions[key] = maxVersion;
      }
      return { maxVersion, updated: [], versions };
    }
  }
}));

const {
  registerSecureRoute,
  registerSecureWebSocket,
  createGuard,
  setRegistrationContext,
  getRegistrationContext,
  restoreRegistrationContext,
  getFullUrl
} = await import('../api/guard.js');
const { registerSystemMetadata } = await import('../api/guard-config.js');

// =============================================================================
// 辅助：创建 mock Fastify 实例
// =============================================================================
function mockFastify() {
  const routes = [];
  return {
    routes,
    get(path, opts, handler) {
      routes.push({ method: 'GET', path, opts, handler });
    },
    post(path, opts, handler) {
      routes.push({ method: 'POST', path, opts, handler });
    },
    put(path, opts, handler) {
      routes.push({ method: 'PUT', path, opts, handler });
    },
    delete(path, opts, handler) {
      routes.push({ method: 'DELETE', path, opts, handler });
    },
    patch(path, opts, handler) {
      routes.push({ method: 'PATCH', path, opts, handler });
    }
  };
}

// =============================================================================
// 辅助：创建 mock reply
// =============================================================================
function mockReply() {
  const reply = { sent: false, statusCode: 200 };
  reply.result = {
    success: () => {
      reply.sent = true;
      return reply;
    },
    unauth: () => {
      reply.sent = true;
      return reply;
    },
    forbidden: () => {
      reply.sent = true;
      return reply;
    }
  };
  reply.code = code => {
    reply.statusCode = code;
    return reply;
  };
  reply.send = () => {
    reply.sent = true;
    return reply;
  };
  return reply;
}

// =============================================================================
// 辅助：创建 mock request
// =============================================================================
function mockRequest(overrides = {}) {
  return {
    ip: '127.0.0.1',
    state: { user: null },
    log: { info: () => {} },
    ...overrides
  };
}

// =============================================================================
// 辅助：断言函数抛出指定错误码
// =============================================================================
function expectCode(fn, code) {
  try {
    fn();
    throw new Error('未抛出异常');
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

// =============================================================================
// 1. 上下文管理
// =============================================================================
describe('上下文管理', () => {
  beforeEach(() => {
    setRegistrationContext('system-default');
  });

  it('setRegistrationContext 设置有效 systemKey', () => {
    setRegistrationContext('firewall');
    const ctx = getRegistrationContext();
    expect(ctx.currentSystem).toBe('firewall');
    expect(ctx.currentGroup).toBe('');
    expect(ctx.currentPrefix).toBe('');
  });

  it('setRegistrationContext 空字符串使用默认值', () => {
    setRegistrationContext('');
    const ctx = getRegistrationContext();
    expect(ctx.currentSystem).toBe('system-default');
  });

  it('setRegistrationContext null 使用默认值', () => {
    setRegistrationContext(null);
    const ctx = getRegistrationContext();
    expect(ctx.currentSystem).toBe('system-default');
  });

  it('setRegistrationContext undefined 使用默认值', () => {
    setRegistrationContext(undefined);
    const ctx = getRegistrationContext();
    expect(ctx.currentSystem).toBe('system-default');
  });

  it('setRegistrationContext 带空格的字符串被 trim', () => {
    setRegistrationContext('  firewall  ');
    const ctx = getRegistrationContext();
    expect(ctx.currentSystem).toBe('firewall');
  });

  it('restoreRegistrationContext 恢复上下文', () => {
    setRegistrationContext('firewall');
    const saved = getRegistrationContext();
    setRegistrationContext('admin');
    restoreRegistrationContext(saved);
    const ctx = getRegistrationContext();
    expect(ctx.currentSystem).toBe('firewall');
  });
});

// =============================================================================
// 2. registerSecureRoute
// =============================================================================
describe('registerSecureRoute', () => {
  beforeEach(() => {
    setRegistrationContext('system-default');
  });

  it('正常注册路由', () => {
    const fastify = mockFastify();
    registerSecureRoute(fastify, {
      name: 'testRoute',
      method: 'GET',
      url: '/test',
      handler: async () => {}
    });
    expect(fastify.routes).toHaveLength(1);
    expect(fastify.routes[0].method).toBe('GET');
  });

  it('method 参数无效时抛出 INVALID_PARAM', () => {
    expectCode(() => {
      registerSecureRoute(mockFastify(), {
        name: 'test',
        url: '/test',
        handler: () => {}
      });
    }, 'INVALID_PARAM');
  });

  it('url 参数无效时抛出 INVALID_PARAM', () => {
    expectCode(() => {
      registerSecureRoute(mockFastify(), {
        name: 'test',
        method: 'GET',
        handler: () => {}
      });
    }, 'INVALID_PARAM');
  });

  it('handler 参数无效时抛出 INVALID_PARAM', () => {
    expectCode(() => {
      registerSecureRoute(mockFastify(), {
        name: 'test',
        method: 'GET',
        url: '/test',
        handler: 'not a function'
      });
    }, 'INVALID_PARAM');
  });

  it('重复路由注册抛出 DUPLICATE_ROUTE', () => {
    const fastify = mockFastify();
    const handler = async () => {};
    registerSecureRoute(fastify, {
      name: 'route1',
      method: 'GET',
      url: '/dup',
      handler
    });
    expectCode(() => {
      registerSecureRoute(fastify, {
        name: 'route2',
        method: 'GET',
        url: '/dup',
        handler
      });
    }, 'DUPLICATE_ROUTE');
  });
});

// =============================================================================
// 3. registerSecureWebSocket
// =============================================================================
describe('registerSecureWebSocket', () => {
  beforeEach(() => {
    setRegistrationContext('system-default');
  });

  it('options 参数无效时抛出 INVALID_PARAM', () => {
    expectCode(() => registerSecureWebSocket(mockFastify(), null), 'INVALID_PARAM');
  });

  it('handler 参数无效时抛出 INVALID_PARAM', () => {
    expectCode(() => {
      registerSecureWebSocket(mockFastify(), {
        url: '/ws/test',
        handler: 'not a function'
      });
    }, 'INVALID_PARAM');
  });

  it('正常注册 WebSocket 路由', () => {
    const fastify = mockFastify();
    registerSecureWebSocket(fastify, {
      url: '/ws/test',
      handler: () => {}
    });
    expect(fastify.routes).toHaveLength(1);
    expect(fastify.routes[0].method).toBe('GET');
  });
});

// =============================================================================
// 4. createGuard — 三级级联校验
// =============================================================================
describe('createGuard (三级级联校验)', () => {
  beforeEach(() => {
    setRegistrationContext('system-default');
  });

  it('系统不存在时放行（无配置 = 默认放行）', async () => {
    const guard = createGuard('non-existent', 'group', 'api');
    const req = mockRequest();
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(false);
  });

  it('系统级 enabled=false 时拒绝', async () => {
    registerSystemMetadata('test-sys', { enabled: false });
    const guard = createGuard('test-sys', 'group', 'api');
    const req = mockRequest();
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(true);
  });

  it('requireLogin=true 无用户时拒绝', async () => {
    registerSystemMetadata('test-sys2', { requireLogin: true });
    const guard = createGuard('test-sys2', 'group', 'api');
    const req = mockRequest();
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(true);
  });

  it('requireLogin=true 有用户时放行', async () => {
    registerSystemMetadata('test-sys3', { requireLogin: true });
    const guard = createGuard('test-sys3', 'group', 'api');
    const req = mockRequest({ state: { user: { sub: 'u1' } } });
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(false);
  });
});

// =============================================================================
// 5. getFullUrl
// =============================================================================
describe('getFullUrl', () => {
  beforeEach(() => {
    setRegistrationContext('system-default');
  });

  it('返回完整 URL', () => {
    const url = getFullUrl('/ws/monitor');
    expect(url).toMatch(/^\//);
    expect(url).toContain('ws/monitor');
  });
});

// =============================================================================
// 6. 权限校验集成（通过 createGuard 间接测试）
// =============================================================================
describe('权限校验集成', () => {
  beforeEach(() => {
    setRegistrationContext('system-default');
  });

  it('allowRoles 设置时未登录用户被拒绝', async () => {
    registerSystemMetadata('rbac-test', { allowRoles: ['admin'] });
    const guard = createGuard('rbac-test', 'group', 'api');
    const req = mockRequest();
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(true);
  });

  it('allowRoles 设置时角色不匹配被拒绝', async () => {
    registerSystemMetadata('rbac-test2', { allowRoles: ['admin'] });
    const guard = createGuard('rbac-test2', 'group', 'api');
    const req = mockRequest({ state: { user: { sub: 'u1', roles: ['user'] } } });
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(true);
  });

  it('allowRoles 设置时角色匹配放行', async () => {
    registerSystemMetadata('rbac-test3', { allowRoles: ['admin'] });
    const guard = createGuard('rbac-test3', 'group', 'api');
    const req = mockRequest({ state: { user: { sub: 'u1', roles: ['admin'] } } });
    const reply = mockReply();
    await guard(req, reply);
    expect(reply.sent).toBe(false);
  });
});
