// src/services/authorization.service.js
import CodeDao from '../dao/code.dao.js';
import UserDao from '../dao/user.dao.js';
import ClientDao from '../dao/client.dao.js';
import ConsentDao from '../dao/consent.dao.js';
import { generateAuthorizationCode } from '../crypto/tokens.js';
import config from '../config/config.js';

export class OAuthError extends Error {
  constructor(error, description, statusCode = 400) {
    super(description);
    this.name = 'OAuthError';
    this.error = error;
    this.description = description;
    this.statusCode = statusCode;
  }

  toRedirectParams() {
    return `error=${encodeURIComponent(this.error)}&error_description=${encodeURIComponent(this.description)}`;
  }

  toJSON() {
    return { error: this.error, error_description: this.description };
  }
}

export class AuthorizationService {
  /**
   * 验证 /authorize 请求参数
   */
  async validateAuthorizeRequest(query) {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method
    } = query;

    // 1. 必须参数
    if (!client_id)
      throw new OAuthError('invalid_request', 'client_id is required');
    if (!redirect_uri)
      throw new OAuthError('invalid_request', 'redirect_uri is required');
    if (response_type !== 'code') {
      throw new OAuthError(
        'unsupported_response_type',
        'Only response_type=code is supported'
      );
    }

    // 2. 查找客户端
    const client = await ClientDao.findById(client_id);
    if (!client) throw new OAuthError('invalid_client', 'Unknown client_id');

    // 3. redirect_uri 校验
    if (!client.redirect_uris.includes(redirect_uri)) {
      throw new OAuthError('invalid_request', 'redirect_uri is not registered');
    }

    // 4. grant_type 兼容性
    if (!client.grant_types.includes('authorization_code')) {
      throw new OAuthError(
        'unauthorized_client',
        'Client not authorized for authorization_code grant'
      );
    }

    // 5. PKCE（OAuth 2.1 强制）
    if (config.pkce.required) {
      if (!code_challenge) {
        throw new OAuthError(
          'invalid_request',
          'code_challenge is required (OAuth 2.1)'
        );
      }
      if (
        code_challenge_method &&
        !['S256', 'plain'].includes(code_challenge_method)
      ) {
        throw new OAuthError(
          'invalid_request',
          'code_challenge_method must be S256 or plain'
        );
      }
    }

    return {
      client,
      scope: scope || client.scope,
      state: query.state,
      nonce: query.nonce,
      code_challenge,
      code_challenge_method: code_challenge_method || 'S256'
    };
  }

  /**
   * 用户认证
   */
  async authenticateUser(username, password) {
    const user = await UserDao.findByUsername(username);
    if (!user) return null;
    const valid = await UserDao.verifyPassword(user, password);
    return valid ? user : null;
  }

  /**
   * 检查已有同意
   */
  async hasConsent(userId, clientId, requestedScopes) {
    const consent = await ConsentDao.find(userId, clientId);
    if (!consent) return false;
    const needed = requestedScopes.split(' ');
    return needed.every((s) => consent.scopes.includes(s));
  }

  /**
   * 发放授权码
   */
  async issueAuthorizationCode({
    userId,
    clientId,
    scope,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    nonce
  }) {
    const code = generateAuthorizationCode();

    await CodeDao.save(code, {
      sub: userId,
      client_id: clientId,
      scope,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      nonce,
      expiresIn: config.jwt.authorizationCodeTTL
    });

    return code;
  }
}
