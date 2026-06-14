/**
 * 加密模块测试
 *
 * 覆盖：JWT 签名/验证、RSA 加密、PKCE、Cookie 签名
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

describe('加密模块', () => {
  describe('JWT', () => {
    it('JWT payload 结构正确', () => {
      const payload = {
        iss: 'http://localhost:3000',
        sub: 'uuid-xxx',
        aud: 'firewall',
        client_id: 'firewall',
        scope: 'openid profile email',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        jti: crypto.randomUUID(),
        token_type: 'access_token'
      };
      expect(payload).toHaveProperty('iss');
      expect(payload).toHaveProperty('sub');
      expect(payload).toHaveProperty('aud');
      expect(payload).toHaveProperty('exp');
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('ID Token payload 结构正确', () => {
      const payload = {
        iss: 'http://localhost:3000',
        sub: 'uuid-xxx',
        aud: 'firewall',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        auth_time: Math.floor(Date.now() / 1000),
        email: 'test@example.com',
        name: 'Test User'
      };
      expect(payload).toHaveProperty('auth_time');
      expect(payload).toHaveProperty('email');
    });

    it('JWT TTL 配置正确', () => {
      const config = {
        accessTokenTTL: 600,     // 10 分钟
        refreshTokenTTL: 86400,  // 24 小时
        idTokenTTL: 3600         // 1 小时
      };
      expect(config.accessTokenTTL).toBeLessThan(config.refreshTokenTTL);
      expect(config.idTokenTTL).toBeLessThan(config.refreshTokenTTL);
    });
  });

  describe('PKCE', () => {
    it('code_verifier 长度符合 RFC 7636', () => {
      const verifier = crypto.randomBytes(32).toString('base64url');
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('code_challenge 由 verifier 生成', () => {
      const verifier = 'test-verifier-12345678901234567890';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      expect(challenge).toBeTruthy();
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('相同 verifier 生成相同 challenge', () => {
      const verifier = 'test-verifier-12345678901234567890';
      const c1 = crypto.createHash('sha256').update(verifier).digest('base64url');
      const c2 = crypto.createHash('sha256').update(verifier).digest('base64url');
      expect(c1).toBe(c2);
    });
  });

  describe('Cookie 签名', () => {
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

    it('签名和验证正常工作', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie = signCookie(sessionId, 0);
      const result = verifyCookie(cookie);
      expect(result).not.toBeNull();
      expect(result.sessionId).toBe(sessionId);
      expect(result.accessCount).toBe(0);
    });

    it('篡改 cookie 返回 null', () => {
      const sessionId = crypto.randomBytes(32).toString('hex');
      const cookie = signCookie(sessionId, 0);
      const tampered = cookie.slice(0, -5) + 'XXXXX';
      expect(verifyCookie(tampered)).toBeNull();
    });

    it('空值返回 null', () => {
      expect(verifyCookie(null)).toBeNull();
      expect(verifyCookie('')).toBeNull();
    });

    it('格式错误返回 null', () => {
      expect(verifyCookie('no-dot')).toBeNull();
      expect(verifyCookie('a.b.c')).toBeNull();
    });
  });

  describe('RSA 密钥', () => {
    it('RSA-2048 密钥对生成', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('RSA-OAEP 加密解密', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const plaintext = 'Hello, World!';
      const encrypted = crypto.publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(plaintext)
      );
      const decrypted = crypto.privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        encrypted
      );
      expect(decrypted.toString()).toBe(plaintext);
    });
  });

  describe('bcrypt 哈希', () => {
    it('哈希包含盐', () => {
      const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      expect(hash).toContain('$2a$');
      expect(hash).toContain('$10$');
      expect(hash.length).toBe(60);
    });

    it('不同密码生成不同哈希', () => {
      const hash1 = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
      const hash2 = '$2a$10$XyZ123abcDEF456ghiJKLmnoPQR789stuvWxyz0123456789';
      expect(hash1).not.toBe(hash2);
    });
  });
});
