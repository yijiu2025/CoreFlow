/**
 * 三级级联守卫测试
 * 测试 IP 匹配引擎、权限校验逻辑
 */
import { describe, test, expect } from '@jest/globals';

// 直接提取 isIpMatch 纯函数进行测试（避免 guard-config 依赖）
function isIpMatch(clientIp, rule) {
  if (rule === '*' || rule === '0.0.0.0/0') return true;
  if (clientIp === rule) return true;

  if (rule.includes('*')) {
    const prefix = rule.split('*')[0];
    return clientIp.startsWith(prefix);
  }

  if (rule.includes('/')) {
    try {
      const [range, bits] = rule.split('/');
      const mask = ~((1 << (32 - bits)) - 1);
      const ipToLong = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
      return (ipToLong(clientIp) & mask) === (ipToLong(range) & mask);
    } catch {
      return false;
    }
  }

  return false;
}

describe('IP 匹配引擎 (isIpMatch)', () => {
  test('通配符 * 应匹配所有 IP', () => {
    expect(isIpMatch('192.168.1.100', '*')).toBe(true);
    expect(isIpMatch('10.0.0.1', '*')).toBe(true);
  });

  test('0.0.0.0/0 应匹配所有 IP', () => {
    expect(isIpMatch('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  test('精确匹配', () => {
    expect(isIpMatch('192.168.1.100', '192.168.1.100')).toBe(true);
    expect(isIpMatch('192.168.1.100', '192.168.1.101')).toBe(false);
  });

  test('通配符模式: 192.168.1.*', () => {
    expect(isIpMatch('192.168.1.1', '192.168.1.*')).toBe(true);
    expect(isIpMatch('192.168.1.254', '192.168.1.*')).toBe(true);
    expect(isIpMatch('192.168.2.1', '192.168.1.*')).toBe(false);
  });

  test('CIDR 规则: 192.168.1.0/24', () => {
    expect(isIpMatch('192.168.1.1', '192.168.1.0/24')).toBe(true);
    expect(isIpMatch('192.168.1.255', '192.168.1.0/24')).toBe(true);
    expect(isIpMatch('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  test('CIDR 规则: 10.0.0.0/8', () => {
    expect(isIpMatch('10.0.0.1', '10.0.0.0/8')).toBe(true);
    expect(isIpMatch('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(isIpMatch('11.0.0.1', '10.0.0.0/8')).toBe(false);
  });

  test('CIDR 规则: 172.16.0.0/12', () => {
    expect(isIpMatch('172.16.0.1', '172.16.0.0/12')).toBe(true);
    expect(isIpMatch('172.31.255.255', '172.16.0.0/12')).toBe(true);
    expect(isIpMatch('172.32.0.1', '172.16.0.0/12')).toBe(false);
  });

  test('不匹配的 IP 应返回 false', () => {
    expect(isIpMatch('192.168.1.100', '10.0.0.0/8')).toBe(false);
    expect(isIpMatch('192.168.1.100', '172.16.0.0/12')).toBe(false);
  });
});

describe('守卫权限逻辑', () => {
  // 模拟 applyGuardLogic 的核心逻辑
  function checkAccess(opts, user, clientIp) {
    const { enabled = true, allowIps = [], allowRoles = [], requireLogin = false } = opts;

    if (!enabled) return { blocked: true, reason: 'disabled' };

    if (allowIps.length > 0) {
      const isAllowed = allowIps.some((rule) => isIpMatch(clientIp, rule));
      if (!isAllowed) return { blocked: true, reason: 'ip_denied' };
    }

    if (requireLogin || allowRoles.length > 0) {
      if (!user) return { blocked: true, reason: 'unauth' };
      if (allowRoles.length > 0 && !allowRoles.includes(user.role)) {
        return { blocked: true, reason: 'role_denied' };
      }
    }

    return { blocked: false };
  }

  test('enabled=false 应拒绝所有请求', () => {
    expect(checkAccess({ enabled: false }, null, '127.0.0.1').blocked).toBe(true);
  });

  test('requireLogin=true 无用户应拒绝', () => {
    expect(checkAccess({ requireLogin: true }, null, '127.0.0.1').blocked).toBe(true);
    expect(checkAccess({ requireLogin: true }, null, '127.0.0.1').reason).toBe('unauth');
  });

  test('requireLogin=true 有用户应放行', () => {
    expect(checkAccess({ requireLogin: true }, { sub: 'u1' }, '127.0.0.1').blocked).toBe(false);
  });

  test('allowRoles 限制应拒绝无角色用户', () => {
    const result = checkAccess({ allowRoles: ['admin'] }, { sub: 'u1', role: 'user' }, '127.0.0.1');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('role_denied');
  });

  test('allowRoles 限制应放行匹配角色用户', () => {
    const result = checkAccess({ allowRoles: ['admin', 'moderator'] }, { sub: 'u1', role: 'admin' }, '127.0.0.1');
    expect(result.blocked).toBe(false);
  });

  test('IP 白名单 + requireLogin 组合', () => {
    // IP 不在白名单 → 拒绝
    const r1 = checkAccess({ allowIps: ['192.168.1.*'], requireLogin: true }, { sub: 'u1' }, '10.0.0.1');
    expect(r1.blocked).toBe(true);
    expect(r1.reason).toBe('ip_denied');

    // IP 在白名单 + 已登录 → 放行
    const r2 = checkAccess({ allowIps: ['192.168.1.*'], requireLogin: true }, { sub: 'u1' }, '192.168.1.100');
    expect(r2.blocked).toBe(false);
  });
});

describe('权限匹配 (checkPermission)', () => {
  function isPermissionMatch(pattern, target) {
    if (pattern === '*') return true;
    if (pattern === target) return true;
    if (pattern.endsWith(':*')) return target.startsWith(pattern.slice(0, -1));
    return false;
  }

  function matchSingle(perm, allows, denies) {
    if (denies.some(d => isPermissionMatch(d, perm))) return false;
    return allows.some(a => isPermissionMatch(a, perm));
  }

  function checkPermission(required, user) {
    if (!user) return false;
    const { allows = [], denies = [] } = user.permissions || {};
    if (typeof required === 'string') return matchSingle(required, allows, denies);
    if (required.any) return required.any.some(p => matchSingle(p, allows, denies));
    if (required.all) return required.all.every(p => matchSingle(p, allows, denies));
    return false;
  }

  test('单个权限精确匹配', () => {
    const user = { permissions: { allows: ['fw:config:read'], denies: [] } };
    expect(checkPermission('fw:config:read', user)).toBe(true);
    expect(checkPermission('fw:config:write', user)).toBe(false);
  });

  test('通配符匹配 fw:admin:*', () => {
    const user = { permissions: { allows: ['fw:admin:*'], denies: [] } };
    expect(checkPermission('fw:admin:reset', user)).toBe(true);
    expect(checkPermission('fw:admin:node', user)).toBe(true);
    expect(checkPermission('fw:config:read', user)).toBe(false);
  });

  test('全局通配符 *', () => {
    const user = { permissions: { allows: ['*'], denies: [] } };
    expect(checkPermission('anything:here', user)).toBe(true);
  });

  test('deny 优先于 allow', () => {
    const user = { permissions: { allows: ['*'], denies: ['user:delete'] } };
    expect(checkPermission('user:read', user)).toBe(true);
    expect(checkPermission('user:delete', user)).toBe(false);
  });

  test('any 模式（OR）', () => {
    const user = { permissions: { allows: ['fw:config:read'], denies: [] } };
    expect(checkPermission({ any: ['fw:config:read', 'fw:admin:*'] }, user)).toBe(true);
    expect(checkPermission({ any: ['fw:block:write', 'fw:admin:*'] }, user)).toBe(false);
  });

  test('all 模式（AND）', () => {
    const user = { permissions: { allows: ['fw:config:read', 'fw:config:write'], denies: [] } };
    expect(checkPermission({ all: ['fw:config:read', 'fw:config:write'] }, user)).toBe(true);
    expect(checkPermission({ all: ['fw:config:read', 'fw:admin:*'] }, user)).toBe(false);
  });

  test('空用户返回 false', () => {
    expect(checkPermission('fw:config:read', null)).toBe(false);
  });

  test('空权限返回 false', () => {
    const user = { permissions: { allows: [], denies: [] } };
    expect(checkPermission('fw:config:read', user)).toBe(false);
  });
});
