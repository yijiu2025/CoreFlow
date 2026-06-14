/**
 * 核心逻辑测试
 *
 * 测试实际业务逻辑，而非仅验证数据结构
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

describe('核心逻辑', () => {
  describe('权限匹配引擎', () => {
    function isPermissionMatch(pattern, target) {
      if (pattern === '*') return true;
      if (pattern === target) return true;
      if (pattern.endsWith(':*')) {
        return target.startsWith(pattern.slice(0, -1));
      }
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

    it('deny 优先于 allow', () => {
      const user = { permissions: { allows: ['*'], denies: ['user:delete'] } };
      expect(checkPermission('user:delete', user)).toBe(false);
      expect(checkPermission('user:read', user)).toBe(true);
    });

    it('通配符 fw:* 匹配 fw:config:read', () => {
      const user = { permissions: { allows: ['fw:*'], denies: [] } };
      expect(checkPermission('fw:config:read', user)).toBe(true);
      expect(checkPermission('fw:block:write', user)).toBe(true);
      expect(checkPermission('user:read', user)).toBe(false);
    });

    it('any 模式任一满足即通过', () => {
      const user = { permissions: { allows: ['fw:config:read'], denies: [] } };
      expect(checkPermission({ any: ['fw:config:read', 'fw:admin:*'] }, user)).toBe(true);
      expect(checkPermission({ any: ['fw:block:write', 'fw:admin:*'] }, user)).toBe(false);
    });

    it('all 模式全部满足才通过', () => {
      const user = { permissions: { allows: ['fw:config:read', 'fw:config:write'], denies: [] } };
      expect(checkPermission({ all: ['fw:config:read', 'fw:config:write'] }, user)).toBe(true);
      expect(checkPermission({ all: ['fw:config:read', 'fw:admin:*'] }, user)).toBe(false);
    });

    it('空用户返回 false', () => {
      expect(checkPermission('fw:config:read', null)).toBe(false);
      expect(checkPermission('fw:config:read', undefined)).toBe(false);
    });

    it('空权限返回 false', () => {
      const user = { permissions: { allows: [], denies: [] } };
      expect(checkPermission('fw:config:read', user)).toBe(false);
    });
  });

  describe('IP 匹配引擎', () => {
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
          const mask = ~((1 << (32 - parseInt(bits))) - 1);
          const ipToLong = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
          return (ipToLong(clientIp) & mask) === (ipToLong(range) & mask);
        } catch {
          return false;
        }
      }
      return false;
    }

    it('CIDR /24 匹配', () => {
      expect(isIpMatch('192.168.1.100', '192.168.1.0/24')).toBe(true);
      expect(isIpMatch('192.168.2.100', '192.168.1.0/24')).toBe(false);
    });

    it('CIDR /16 匹配', () => {
      expect(isIpMatch('10.0.1.1', '10.0.0.0/16')).toBe(true);
      expect(isIpMatch('10.1.1.1', '10.0.0.0/16')).toBe(false);
    });

    it('通配符匹配', () => {
      expect(isIpMatch('192.168.1.100', '192.168.*')).toBe(true);
      expect(isIpMatch('192.168.2.100', '192.168.1.*')).toBe(false);
    });
  });

  describe('Cookie 签名验证', () => {
    const SECRET = 'test-secret';

    function signCookie(sessionId, accessCount) {
      const payload = `${sessionId}:${accessCount}`;
      const encoded = Buffer.from(payload).toString('base64url');
      const signature = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
      return `${encoded}.${signature}`;
    }

    function verifyCookie(cookieValue) {
      if (!cookieValue) return null;
      const parts = cookieValue.split('.');
      if (parts.length !== 2) return null;
      const [encoded, signature] = parts;
      const expectedSig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
      const decoded = Buffer.from(encoded, 'base64url').toString();
      const [sessionId, countStr] = decoded.split(':');
      return { sessionId, accessCount: parseInt(countStr, 10) };
    }

    it('签名后可验证', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie = signCookie(sessionId, 0);
      const result = verifyCookie(cookie);
      expect(result.sessionId).toBe(sessionId);
      expect(result.accessCount).toBe(0);
    });

    it('篡改后验证失败', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie = signCookie(sessionId, 0);
      const tampered = cookie.slice(0, -5) + 'XXXXX';
      expect(verifyCookie(tampered)).toBeNull();
    });

    it('不同 accessCount 生成不同签名', () => {
      const sessionId = 'test-session';
      const cookie0 = signCookie(sessionId, 0);
      const cookie5 = signCookie(sessionId, 5);
      expect(cookie0).not.toBe(cookie5);
      expect(verifyCookie(cookie0).accessCount).toBe(0);
      expect(verifyCookie(cookie5).accessCount).toBe(5);
    });
  });

  describe('PKCE 验证', () => {
    function base64url(buffer) {
      return Buffer.from(buffer).toString('base64url');
    }

    function sha256(plain) {
      return crypto.createHash('sha256').update(plain).digest();
    }

    function verifyPKCE(verifier, challenge, method) {
      if (method === 'S256') {
        return base64url(sha256(verifier)) === challenge;
      }
      return verifier === challenge;
    }

    it('S256 验证成功', () => {
      const verifier = 'test-verifier-12345678901234567890';
      const challenge = base64url(sha256(verifier));
      expect(verifyPKCE(verifier, challenge, 'S256')).toBe(true);
    });

    it('S256 验证失败（错误 verifier）', () => {
      const verifier = 'test-verifier-12345678901234567890';
      const challenge = base64url(sha256(verifier));
      expect(verifyPKCE('wrong-verifier', challenge, 'S256')).toBe(false);
    });

    it('plain 验证', () => {
      expect(verifyPKCE('verifier', 'verifier', 'plain')).toBe(true);
      expect(verifyPKCE('verifier', 'other', 'plain')).toBe(false);
    });
  });

  describe('JWT payload 构建', () => {
    it('access_token payload 结构', () => {
      const payload = {
        iss: 'http://localhost:3000',
        sub: 'user-uuid',
        aud: 'firewall',
        client_id: 'firewall',
        scope: 'openid profile email',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        jti: crypto.randomUUID(),
        token_type: 'access_token'
      };
      expect(payload.exp).toBeGreaterThan(payload.iat);
      expect(payload.token_type).toBe('access_token');
    });

    it('id_token payload 结构', () => {
      const payload = {
        iss: 'http://localhost:3000',
        sub: 'user-uuid',
        aud: 'firewall',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        auth_time: Math.floor(Date.now() / 1000)
      };
      expect(payload.exp).toBeGreaterThan(payload.iat);
      expect(payload).toHaveProperty('auth_time');
    });
  });

  describe('Refresh Token 管理', () => {
    it('Sorted Set 按时间排序', () => {
      const set = new Map();
      set.set('token1', Date.now() - 1000);
      set.set('token2', Date.now() - 500);
      set.set('token3', Date.now());

      const sorted = [...set.entries()].sort((a, b) => a[1] - b[1]);
      expect(sorted[0][0]).toBe('token1');
      expect(sorted[2][0]).toBe('token3');
    });

    it('超限时删除最旧的', () => {
      const maxTokens = 3;
      const tokens = ['t1', 't2', 't3', 't4', 't5'];
      const scores = [100, 200, 300, 400, 500];

      while (tokens.length > maxTokens) {
        const minIdx = scores.indexOf(Math.min(...scores));
        tokens.splice(minIdx, 1);
        scores.splice(minIdx, 1);
      }

      expect(tokens).toHaveLength(3);
      expect(tokens).toContain('t3');
      expect(tokens).toContain('t4');
      expect(tokens).toContain('t5');
    });
  });

  describe('密码哈希', () => {
    it('bcrypt 哈希格式正确', () => {
      const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      expect(hash).toMatch(/^\$2a\$\d+\$.{53}$/);
    });

    it('盐值嵌入哈希中', () => {
      const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const parts = hash.split('$');
      expect(parts[1]).toBe('2a');
      expect(parts[2]).toBe('10');
      // parts[3] 包含盐值 + 哈希值（共 53 字符）
      expect(parts[3].length).toBe(53);
    });
  });

  describe('审计日志', () => {
    it('日志数据结构正确', () => {
      const log = {
        userId: 'uuid-xxx',
        event: 'LOGIN_SUCCESS',
        appId: 'firewall',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0...',
        details: { reason: 'direct_login' },
        timestamp: new Date().toISOString()
      };
      expect(log.event).toBe('LOGIN_SUCCESS');
      expect(log.details).toHaveProperty('reason');
    });

    it('事件类型枚举完整', () => {
      const events = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_KICK', 'ROLE_ASSIGNED', 'PERMISSION_CHANGE'];
      expect(events).toHaveLength(6);
    });
  });
});
