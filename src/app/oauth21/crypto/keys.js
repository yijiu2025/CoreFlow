// src/crypto/keys.js
import crypto from 'node:crypto';
import config from '../config/config.js';

let keyPair = null;
let jwkPublic = null;

export function generateKeyPair() {
  if (keyPair) return keyPair;

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const pubKeyObj = crypto.createPublicKey(publicKey);
  const jwk = pubKeyObj.export({ format: 'jwk' });

  keyPair = { privateKey, publicKey };
  jwkPublic = {
    ...jwk,
    kid: 'oauth21-key-1',
    use: 'sig',
    alg: config.jwt.algorithm
  };

  console.log('[Keys] RSA-2048 key pair generated');
  return keyPair;
}

export function getPrivateKey() {
  if (!keyPair) generateKeyPair();
  return keyPair.privateKey;
}

export function getPublicKey() {
  if (!keyPair) generateKeyPair();
  return keyPair.publicKey;
}

export function getJWKS() {
  if (!jwkPublic) generateKeyPair();
  return { keys: [jwkPublic] };
}
