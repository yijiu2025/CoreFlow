// src/services/token.service.js
import bcrypt from 'bcryptjs';
import CodeDao from '../dao/code.dao.js';
import TokenDao from '../dao/token.dao.js';
import ClientDao from '../dao/client.dao.js';
import UserDao from '../dao/user.dao.js';
import { verifyPKCE, isValidCodeVerifier } from '../crypto/pkce.js';
import { generateToken } from '../crypto/tokens.js';
import { issueAccessToken, issueIdToken } from '../crypto/jwt.js';
import config from '../config/config.js';

export class TokenError extends Error {
  constructor(error, description, statusCode = 400) {
    super(description);
    this.name = 'TokenError';
    this.error = error;
    this.description = description;
    this.statusCode = statusCode;
  }

  toJSON() {
    return { error: this.error, error_description: this.description };
  }
}

export class TokenService {
  /**
   * 验证客户端身份（HTTP Basic / POST body）
   */
  async authenticateClient(req) {
    let clientId, clientSecret;

    // 方式1: HTTP Basic Auth
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      [clientId, clientSecret] = decoded.split(':');
    }

    // 方式2: POST body
    if (!clientId) {
      clientId = req.body.client_id;
      clientSecret = req.body.client_secret;
    }

    if (!clientId) return null;

    const client = await ClientDao.findById(clientId);
    if (!client) return null;

    // 公共客户端不需要 secret
    if (client.token_endpoint_auth_method === 'none') {
      return client;
    }

    // 机密客户端验证 secret (使用 bcrypt 安全比对)
    if (!clientSecret || !client.client_secret) {
      return null;
    }

    const match = await bcrypt.compare(clientSecret, client.client_secret);
    if (!match) {
      return null;
    }

    return client;
  }

  /**
   * 授权码模式
   */
  async handleAuthorizationCode({ code, redirect_uri, code_verifier, client }) {
    // 1. 消费授权码（一次性 + 重放检测）
    const codeData = await CodeDao.consume(code);
    if (!codeData) {
      throw new TokenError('invalid_grant', 'Invalid or expired authorization code');
    }

    // 2. client_id 匹配
    if (codeData.client_id !== client.client_id) {
      throw new TokenError('invalid_grant', 'client_id mismatch');
    }

    // 3. redirect_uri 匹配
    if (codeData.redirect_uri !== redirect_uri) {
      throw new TokenError('invalid_grant', 'redirect_uri mismatch');
    }

    // 4. PKCE 验证
    if (codeData.code_challenge) {
      if (!code_verifier) {
        throw new TokenError('invalid_grant', 'code_verifier is required');
      }
      if (!isValidCodeVerifier(code_verifier)) {
        throw new TokenError('invalid_grant', 'Invalid code_verifier format');
      }
      const method = codeData.code_challenge_method || 'S256';
      if (!verifyPKCE(code_verifier, codeData.code_challenge, method)) {
        throw new TokenError('invalid_grant', 'PKCE verification failed');
      }
    }

    // 5. 签发令牌
    const user = await UserDao.findById(codeData.sub);

    const accessToken = issueAccessToken({
      sub: codeData.sub,
      client_id: client.client_id,
      scope: codeData.scope
    });

    const refreshToken = generateToken(48);
    await TokenDao.save(refreshToken, {
      sub: codeData.sub,
      client_id: client.client_id,
      scope: codeData.scope,
      expiresIn: config.jwt.refreshTokenTTL
    });

    const result = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: config.jwt.accessTokenTTL,
      refresh_token: refreshToken,
      scope: codeData.scope
    };

    // 6. OIDC: scope 包含 openid → 签发 ID Token
    if (codeData.scope?.includes('openid')) {
      result.id_token = issueIdToken({
        sub: codeData.sub,
        client_id: client.client_id,
        nonce: codeData.nonce,
        auth_time: Math.floor(Date.now() / 1000) - 60,
        email: user?.email,
        name: user?.name
      });
    }

    return result;
  }

  /**
   * 客户端凭证模式
   */
  async handleClientCredentials({ client, scope }) {
    if (!client.grant_types.includes('client_credentials')) {
      throw new TokenError('unauthorized_client', 'Client not authorized for client_credentials');
    }

    const allowedScopes = client.scope.split(' ');
    const requestedScopes = (scope || client.scope).split(' ');
    const validScopes = requestedScopes.filter((s) => allowedScopes.includes(s));

    if (validScopes.length === 0) {
      throw new TokenError('invalid_scope', 'No valid scopes');
    }

    const finalScope = validScopes.join(' ');
    const accessToken = issueAccessToken({
      sub: client.client_id,
      client_id: client.client_id,
      scope: finalScope
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: config.jwt.accessTokenTTL,
      scope: finalScope
    };
  }

  /**
   * 刷新令牌模式（带令牌轮换）
   */
  async handleRefreshToken({ refresh_token, scope, client }) {
    const tokenData = await TokenDao.find(refresh_token);
    if (!tokenData || tokenData.revoked) {
      throw new TokenError('invalid_grant', 'Invalid or revoked refresh token');
    }
    if (tokenData.client_id !== client.client_id) {
      throw new TokenError('invalid_grant', 'Refresh token does not belong to this client');
    }

    // 轮换：吊销旧刷新令牌
    await TokenDao.revoke(refresh_token);

    const newScope = scope || tokenData.scope;
    const accessToken = issueAccessToken({
      sub: tokenData.sub,
      client_id: client.client_id,
      scope: newScope
    });

    const newRefreshToken = generateToken(48);
    await TokenDao.save(newRefreshToken, {
      sub: tokenData.sub,
      client_id: client.client_id,
      scope: newScope,
      expiresIn: config.jwt.refreshTokenTTL
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: config.jwt.accessTokenTTL,
      refresh_token: newRefreshToken,
      scope: newScope
    };
  }

  /**
   * 撤销令牌
   */
  async revokeToken({ token, token_type_hint, client }) {
    if (token_type_hint === 'refresh_token' || !token_type_hint) {
      await TokenDao.revoke(token);
    }
    return true;
  }
}
