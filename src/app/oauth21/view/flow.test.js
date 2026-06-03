// test/flow.test.js
/**
 * ESM 集成测试 — 运行前确保 npm start 已启动
 */
import http from 'node:http';
import crypto from 'node:crypto';

const BASE = 'http://localhost:3000';

// ─── 工具 ───
function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', ...headers }
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const codeVerifier = () => crypto.randomBytes(32).toString('base64url');
const codeChallenge = (v) =>
  crypto.createHash('sha256').update(v).digest('base64url');

// ─── 动态导入服务（用于模拟内部调用） ───
const { AuthorizationService } =
  await import('../src/services/authorization.service.js');
const { DeviceService } = await import('../src/services/device.service.js');
const authService = new AuthorizationService();
const deviceService = new DeviceService();

// ─── 测试 ───
console.log('\n' + '='.repeat(60));
console.log('  OAuth 2.1 Integration Tests  (ESM)');
console.log('='.repeat(60) + '\n');

let passed = 0;
let failed = 0;

function assert(cond, name) {
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    failed++;
  }
}

// ── 1. Discovery ──
console.log('\n── OIDC Discovery ──');
const disc = await request('GET', '/.well-known/openid-configuration');
assert(disc.status === 200, 'Discovery 200');
assert(disc.body.issuer === BASE, 'Issuer matches');
assert(
  disc.body.code_challenge_methods_supported.includes('S256'),
  'S256 supported'
);

// ── 2. JWKS ──
console.log('\n── JWKS ──');
const jwks = await request('GET', '/.well-known/jwks.json');
assert(jwks.status === 200, 'JWKS 200');
assert(jwks.body.keys?.length > 0, 'Key present');
assert(jwks.body.keys[0].alg === 'RS256', 'RS256');

// ── 3. Client Credentials ──
console.log('\n── Client Credentials ──');
const ccAuth =
  'Basic ' + Buffer.from('m2m-client-001:demo_m2m_secret').toString('base64');
const cc = await request(
  'POST',
  '/token',
  { grant_type: 'client_credentials', scope: 'api:read' },
  { Authorization: ccAuth }
);
assert(cc.status === 200, 'CC 200');
assert(cc.body.access_token, 'access_token');
assert(cc.body.token_type === 'Bearer', 'Bearer');
assert(cc.body.scope === 'api:read', 'scope');

// ── 4. Authorization Code + PKCE ──
console.log('\n── Authorization Code + PKCE ──');
const cv = codeVerifier();
const cc2 = codeChallenge(cv);

const code = await authService.issueAuthorizationCode({
  userId: 'test-user',
  clientId: 'spa-client-001',
  scope: 'openid profile email',
  redirectUri: 'http://localhost:8080/callback',
  codeChallenge: cc2,
  codeChallengeMethod: 'S256'
});
assert(code.length > 20, 'Auth code generated');

const tokResp = await request('POST', '/token', {
  grant_type: 'authorization_code',
  code,
  redirect_uri: 'http://localhost:8080/callback',
  code_verifier: cv,
  client_id: 'spa-client-001'
});
assert(tokResp.status === 200, 'Token exchange 200');
assert(tokResp.body.access_token, 'access_token');
assert(tokResp.body.refresh_token, 'refresh_token');
assert(tokResp.body.id_token, 'id_token (OIDC)');

// 授权码重放
const replay = await request('POST', '/token', {
  grant_type: 'authorization_code',
  code,
  redirect_uri: 'http://localhost:8080/callback',
  code_verifier: cv,
  client_id: 'spa-client-001'
});
assert(replay.status === 400, 'Replay rejected');

// ── 5. PKCE 失败 ──
console.log('\n── PKCE Failure ──');
const code2 = await authService.issueAuthorizationCode({
  userId: 'test-user',
  clientId: 'spa-client-001',
  scope: 'openid',
  redirectUri: 'http://localhost:8080/callback',
  codeChallenge: codeChallenge(codeVerifier()),
  codeChallengeMethod: 'S256'
});
const badPkce = await request('POST', '/token', {
  grant_type: 'authorization_code',
  code: code2,
  redirect_uri: 'http://localhost:8080/callback',
  code_verifier: 'wrong-verifier-12345678901234567890123456789012345678',
  client_id: 'spa-client-001'
});
assert(badPkce.status === 400, 'Wrong verifier rejected');
assert(badPkce.body.error === 'invalid_grant', 'invalid_grant');

// ── 6. Refresh Token Rotation ──
console.log('\n── Refresh Token Rotation ──');
const oldRT = tokResp.body.refresh_token;
const refresh = await request('POST', '/token', {
  grant_type: 'refresh_token',
  refresh_token: oldRT,
  client_id: 'spa-client-001'
});
assert(refresh.status === 200, 'Refresh 200');
assert(refresh.body.refresh_token !== oldRT, 'Token rotated');

const reuse = await request('POST', '/token', {
  grant_type: 'refresh_token',
  refresh_token: oldRT,
  client_id: 'spa-client-001'
});
assert(reuse.status === 400, 'Old RT rejected');

// ── 7. UserInfo ──
console.log('\n── UserInfo ──');
const ui = await request('GET', '/userinfo', null, {
  Authorization: `Bearer ${tokResp.body.access_token}`
});
assert(ui.status === 200, 'UserInfo 200');
assert(ui.body.sub, 'sub present');

const noAuth = await request('GET', '/userinfo');
assert(noAuth.status === 401, 'No token → 401');

// ── 8. Device Code Flow ──
console.log('\n── Device Code Flow ──');
const di = await request('POST', '/device/code', {
  client_id: 'm2m-client-001',
  scope: 'api:read'
});
assert(di.status === 200, 'Device init 200');
assert(di.body.device_code, 'device_code');
assert(di.body.user_code, 'user_code');

const p1 = await request('POST', '/device/token', {
  grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  device_code: di.body.device_code,
  client_id: 'm2m-client-001'
});
assert(p1.status === 400, 'Pending → 400');
assert(p1.body.error === 'authorization_pending', 'pending');

await deviceService.authorizeDevice(di.body.user_code, 'test-user');

const p2 = await request('POST', '/device/token', {
  grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  device_code: di.body.device_code,
  client_id: 'm2m-client-001'
});
assert(p2.status === 200, 'After auth → 200');
assert(p2.body.access_token, 'access_token');

// ── 9. Revoke ──
console.log('\n── Revoke ──');
const rv = await request(
  'POST',
  '/revoke',
  {
    token: refresh.body.refresh_token,
    token_type_hint: 'refresh_token'
  },
  { Authorization: ccAuth }
);
assert(rv.status === 200, 'Revoke 200');

// ── 10. Health ──
console.log('\n── Health ──');
const h = await request('GET', '/health');
assert(h.status === 200, 'Health OK');

// ── 结果 ──
console.log('\n' + '='.repeat(60));
console.log(
  `  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`
);
console.log('='.repeat(60) + '\n');
process.exit(failed > 0 ? 1 : 0);
