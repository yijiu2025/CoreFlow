/**
 * JWT 签发与验证测试
 * 测试 RS256 签名、Access Token、ID Token 的签发和验证流程
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// 生成测试用 RSA 密钥对（不依赖 keys.js 的全局状态）
let privateKey, publicKey;

beforeAll(() => {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

describe('JWT 签发与验证', () => {
  test('使用 RS256 签发和验证 JWT', () => {
    const payload = { sub: 'user-123', client_id: 'test-client', scope: 'openid' };
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    expect(decoded.sub).toBe('user-123');
    expect(decoded.client_id).toBe('test-client');
    expect(decoded.scope).toBe('openid');
  });

  test('过期的 JWT 验证应抛出 TokenExpiredError', () => {
    const payload = { sub: 'user-123' };
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '0s' });

    expect(() => {
      jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    }).toThrow('jwt expired');
  });

  test('篡改的 JWT 验证应抛出 JsonWebTokenError', () => {
    const payload = { sub: 'user-123' };
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });

    // 篡改 payload
    const parts = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ sub: 'hacker' })).toString('base64url');
    const tamperedToken = `${parts[0]}.${tampered}.${parts[2]}`;

    expect(() => {
      jwt.verify(tamperedToken, publicKey, { algorithms: ['RS256'] });
    }).toThrow();
  });

  test('使用错误算法验证应抛出错误', () => {
    const payload = { sub: 'user-123' };
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });

    expect(() => {
      jwt.verify(token, publicKey, { algorithms: ['HS256'] });
    }).toThrow();
  });

  test('Access Token 包含标准 OAuth 2.1 claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'http://localhost:3000',
      sub: 'user-456',
      aud: 'test-client',
      client_id: 'test-client',
      scope: 'openid profile',
      iat: now,
      exp: now + 600,
      jti: crypto.randomUUID(),
      token_type: 'access_token'
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    expect(decoded.sub).toBe('user-456');
    expect(decoded.token_type).toBe('access_token');
    expect(decoded.scope).toBe('openid profile');
    expect(decoded.jti).toBeTruthy();
    expect(decoded.exp - decoded.iat).toBe(600);
  });

  test('ID Token 包含 OIDC 标准 claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'http://localhost:3000',
      sub: 'user-789',
      aud: 'test-client',
      iat: now,
      exp: now + 3600,
      auth_time: now,
      email: 'test@example.com',
      name: 'Test User'
    };

    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    expect(decoded.email).toBe('test@example.com');
    expect(decoded.name).toBe('Test User');
    expect(decoded.auth_time).toBe(now);
  });
});
