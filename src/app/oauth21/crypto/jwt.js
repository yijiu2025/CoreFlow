// src/crypto/jwt.js
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/config.js';
import { getPrivateKey, getPublicKey } from './keys.js';

const KEY_ID = 'oauth21-key-1';

/** 签发 JWT */
export function sign(payload, options = {}) {
  const privateKey = getPrivateKey();
  return jwt.sign(payload, privateKey, {
    algorithm: config.jwt.algorithm,
    keyid: KEY_ID,
    ...options
  });
}

/** 验证 JWT */
export function verify(token) {
  const publicKey = getPublicKey();
  return jwt.verify(token, publicKey, {
    algorithms: [config.jwt.algorithm]
  });
}

/** 签发 Access Token */
export function issueAccessToken({ sub, client_id, scope, aud }) {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    iss: config.server.issuer,
    sub,
    aud: aud || client_id,
    client_id,
    scope,
    iat: now,
    exp: now + config.jwt.accessTokenTTL,
    jti: uuidv4(),
    token_type: 'access_token'
  });
}

/** 签发 ID Token (OIDC) */
export function issueIdToken({
  sub,
  client_id,
  nonce,
  auth_time,
  email,
  name
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.server.issuer,
    sub,
    aud: client_id,
    iat: now,
    exp: now + config.jwt.idTokenTTL,
    auth_time: auth_time || now
  };
  if (nonce) payload.nonce = nonce;
  if (email) payload.email = email;
  if (name) payload.name = name;
  return sign(payload);
}
