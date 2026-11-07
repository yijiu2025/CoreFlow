/**
 * 放宽权限的二次认证（step-up）
 *
 * 覆盖四类安全属性：
 *   1. 未认证不能放宽（428）；
 *   2. 票据绑定"这一次变更"（换 patch / 换路径都失败）；
 *   3. 票据一次性（重放失败）；
 *   4. 错误验证码有次数上限，达到即作废。
 *
 * 依赖说明：DB、邮件服务、密码校验用替身，被测模块（stepup.service.js）本身
 * 是真实加载的；存储走真实的 getStore（无 Redis 时自动降级 MapStore）。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

/** 当前用例的"数据库用户" */
let fakeUser = { uid: 'u-default', email: 'ops@example.com', phone: '', credential: 'hash', status: 1 };

/** mock 邮件服务捕获的验证码 */
let sentCode = null;
let sendShouldFail = false;

jest.unstable_mockModule('../../framework/db/index.js', () => ({
  getModel: () => ({
    async findOne() {
      return fakeUser;
    }
  })
}));

jest.unstable_mockModule('../../framework/verify/email/service.js', () => ({
  default: {
    // emailDao.sendCode 会调用它生成 6 位码；用固定值便于断言"发的是哪个码"
    generateCode() {
      return '246810';
    },
    async send(_email, code) {
      if (sendShouldFail) throw new Error('SMTP down');
      sentCode = code;
      return true;
    }
  }
}));

jest.unstable_mockModule('../../framework/auth/index.js', () => ({
  async verifyPassword(plain, stored) {
    return stored === 'hash' && plain === 'correct-password';
  }
}));

const { createChallenge, verifyChallenge, consumeTicket, hashPatch, buildPath } =
  await import('../../app/guard/services/stepup.service.js');

/**
 * 伪造一个 Fastify request 的最小形状
 *
 * 默认带 superadmin 角色：安全配置只对超管开放，绝大多数用例都要以超管身份发起；
 * 需要验证"非超管被拒"时显式传空数组。
 */
function makeRequest(uid, sessionId = 'sid-1', roles = ['superadmin']) {
  return {
    state: {
      user: { uid, sessionId, roles, email: `${uid}@example.com`, permissions: { allows: [], denies: [] } }
    },
    ip: '10.0.0.1',
    headers: {}
  };
}

/** 走完"发码 → 用码换票"，返回票据 */
async function issueTicket({ uid, system = 'Admin', group = 'userAdmin', apiKey = 'listUsers', patch }) {
  const request = makeRequest(uid);
  const challenge = await createChallenge({
    system,
    group,
    apiKey,
    patch,
    reason: '排查线上问题',
    method: 'email',
    request
  });
  expect(challenge.ok).toBe(true);

  const verified = await verifyChallenge({ challengeId: challenge.challengeId, code: sentCode, request });
  expect(verified.ok).toBe(true);
  return verified.ticket;
}

beforeEach(() => {
  sentCode = null;
  sendShouldFail = false;
  delete process.env.GUARD_SUPERADMIN_EMAILS;
});

describe('createChallenge', () => {
  it('邮箱方式返回脱敏目标，不泄露完整地址', async () => {
    fakeUser = { uid: 'u-mask', email: 'operator@example.com', phone: '', credential: 'hash', status: 1 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'listUsers',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-mask')
    });

    expect(result.ok).toBe(true);
    expect(result.maskedTarget).toBe('op***@example.com');
    expect(result.maskedTarget).not.toContain('operator');
  });

  it('原因过短时拒绝（原因要进签名与审计，不能留空）', async () => {
    fakeUser = { uid: 'u-short', email: 'u-short@example.com', phone: '', credential: 'hash', status: 1 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '啊',
      method: 'email',
      request: makeRequest('u-short')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('短信通道未接入时明确拒绝，不静默降级成邮箱', async () => {
    fakeUser = { uid: 'u-sms', email: 'u-sms@example.com', phone: '', credential: 'hash', status: 1 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'sms',
      request: makeRequest('u-sms')
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('短信通道尚未接入');
  });

  it('账号未绑定邮箱时拒绝', async () => {
    fakeUser = { uid: 'u-noemail', email: '', phone: '', credential: 'hash', status: 1 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-noemail')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
  });

  it('账号被禁用时拒绝', async () => {
    fakeUser = { uid: 'u-banned', email: 'u-banned@example.com', phone: '', credential: 'hash', status: 0 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-banned')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('非超管不能发起变更，连验证码都不发', async () => {
    fakeUser = { uid: 'u-plain', email: 'u-plain@example.com', phone: '', credential: 'hash', status: 1 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-plain', 'sid-1', [])
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain('超级管理员');
    expect(sentCode).toBeNull();
  });

  it('配了超管邮箱白名单时，白名单外的邮箱被拒', async () => {
    process.env.GUARD_SUPERADMIN_EMAILS = 'boss@example.com';
    fakeUser = { uid: 'u-wl', email: 'u-wl@example.com', phone: '', credential: 'hash', status: 1 };

    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-wl')
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.message).toContain('白名单');
    expect(sentCode).toBeNull();
  });

  it('白名单内的超管邮箱可以发码', async () => {
    process.env.GUARD_SUPERADMIN_EMAILS = 'boss@example.com, U-WL2@example.com';
    fakeUser = { uid: 'u-wl2', email: 'u-wl2@example.com', phone: '', credential: 'hash', status: 1 };

    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-wl2')
    });

    expect(result.ok).toBe(true);
    expect(sentCode).toBe('246810');
  });

  it('邮件发送失败时返回 502，而不是签发票据', async () => {
    fakeUser = { uid: 'u-mailfail', email: 'u-mailfail@example.com', phone: '', credential: 'hash', status: 1 };
    sendShouldFail = true;
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-mailfail')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(502);
  });

  it('同一账号连续发码受冷却时间约束', async () => {
    fakeUser = { uid: 'u-cool', email: 'u-cool@example.com', phone: '', credential: 'hash', status: 1 };
    const params = {
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: makeRequest('u-cool')
    };
    expect((await createChallenge(params)).ok).toBe(true);
    const second = await createChallenge(params);
    expect(second.ok).toBe(false);
    expect(second.statusCode).toBe(429);
  });
});

describe('verifyChallenge', () => {
  it('验证码错误时拒绝，且不签发票据', async () => {
    fakeUser = { uid: 'u-wrongcode', email: 'u-wrongcode@example.com', phone: '', credential: 'hash', status: 1 };
    const request = makeRequest('u-wrongcode');
    const challenge = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request
    });

    const result = await verifyChallenge({ challengeId: challenge.challengeId, code: '000000', request });
    expect(result.ok).toBe(false);
    expect(result.ticket).toBeUndefined();
  });

  it('连续 5 次错误后挑战作废', async () => {
    fakeUser = { uid: 'u-brute', email: 'u-brute@example.com', phone: '', credential: 'hash', status: 1 };
    const request = makeRequest('u-brute');
    const challenge = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request
    });

    let last;
    // emailDao 的判据是 attempts > 5 才作废，因此前 5 次都是普通失败，第 6 次才是 429
    for (let i = 0; i < 6; i += 1) {
      last = await verifyChallenge({ challengeId: challenge.challengeId, code: '000000', request });
    }
    expect(last.ok).toBe(false);
    expect(last.statusCode).toBe(429);

    // 作废后即使给对码也不能换票
    const after = await verifyChallenge({ challengeId: challenge.challengeId, code: sentCode, request });
    expect(after.ok).toBe(false);
  });

  it('别人拿到 challengeId 也不能替你完成认证', async () => {
    fakeUser = { uid: 'u-owner', email: 'u-owner@example.com', phone: '', credential: 'hash', status: 1 };
    const ownerReq = makeRequest('u-owner');
    const challenge = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'email',
      request: ownerReq
    });

    const attacker = await verifyChallenge({
      challengeId: challenge.challengeId,
      code: sentCode,
      request: makeRequest('u-other')
    });
    expect(attacker.ok).toBe(false);
    expect(attacker.statusCode).toBe(403);
  });

  it('密码方式校验失败不发票，成功才发', async () => {
    fakeUser = { uid: 'u-pwd', email: 'u-pwd@example.com', phone: '', credential: 'hash', status: 1 };
    const request = makeRequest('u-pwd');
    const challenge = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'password',
      request
    });
    expect(challenge.ok).toBe(true);

    const bad = await verifyChallenge({ challengeId: challenge.challengeId, password: 'wrong', request });
    expect(bad.ok).toBe(false);

    const good = await verifyChallenge({ challengeId: challenge.challengeId, password: 'correct-password', request });
    expect(good.ok).toBe(true);
    expect(typeof good.ticket).toBe('string');
  });

  it('账号无密码时不允许选择密码方式', async () => {
    fakeUser = { uid: 'u-nopwd', email: 'u-nopwd@example.com', phone: '', credential: '', status: 1 };
    const result = await createChallenge({
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      reason: '排查线上问题',
      method: 'password',
      request: makeRequest('u-nopwd')
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('未设置密码');
  });
});

describe('consumeTicket', () => {
  it('无票据时返回 428 并提示需要二次认证', async () => {
    const result = await consumeTicket({
      token: undefined,
      system: 'Admin',
      group: 'g',
      patch: { allowRoles: [] },
      request: makeRequest('u-x')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(428);
  });

  it('票据只能用一次（重放失败）', async () => {
    fakeUser = { uid: 'u-replay', email: 'u-replay@example.com', phone: '', credential: 'hash', status: 1 };
    const patch = { allowRoles: [] };
    const ticket = await issueTicket({ uid: 'u-replay', patch });

    const first = await consumeTicket({
      token: ticket,
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'listUsers',
      patch,
      request: makeRequest('u-replay')
    });
    expect(first.ok).toBe(true);

    const second = await consumeTicket({
      token: ticket,
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'listUsers',
      patch,
      request: makeRequest('u-replay')
    });
    expect(second.ok).toBe(false);
    expect(second.statusCode).toBe(428);
  });

  it('换了 patch 内容后票据失效（授权不能漂移）', async () => {
    fakeUser = { uid: 'u-drift', email: 'u-drift@example.com', phone: '', credential: 'hash', status: 1 };
    const approved = { allowRoles: [] };
    const ticket = await issueTicket({ uid: 'u-drift', patch: approved });

    const result = await consumeTicket({
      token: ticket,
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'listUsers',
      patch: { allowRoles: [], requireLogin: false },
      request: makeRequest('u-drift')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('换了目标路径后票据失效', async () => {
    fakeUser = { uid: 'u-path', email: 'u-path@example.com', phone: '', credential: 'hash', status: 1 };
    const patch = { allowRoles: [] };
    const ticket = await issueTicket({ uid: 'u-path', patch });

    const result = await consumeTicket({
      token: ticket,
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'deleteUser',
      patch,
      request: makeRequest('u-path')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('别人拿票据也不能用', async () => {
    fakeUser = { uid: 'u-a', email: 'u-a@example.com', phone: '', credential: 'hash', status: 1 };
    const patch = { allowRoles: [] };
    const ticket = await issueTicket({ uid: 'u-a', patch });

    const result = await consumeTicket({
      token: ticket,
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'listUsers',
      patch,
      request: makeRequest('u-b')
    });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  it('票据携带认证方式与原因，供审计使用', async () => {
    fakeUser = { uid: 'u-audit', email: 'u-audit@example.com', phone: '', credential: 'hash', status: 1 };
    const patch = { allowRoles: [] };
    const ticket = await issueTicket({ uid: 'u-audit', patch });

    const result = await consumeTicket({
      token: ticket,
      system: 'Admin',
      group: 'userAdmin',
      apiKey: 'listUsers',
      patch,
      request: makeRequest('u-audit')
    });
    expect(result.ok).toBe(true);
    expect(result.method).toBe('email');
    expect(result.reason).toBe('排查线上问题');
  });
});

describe('hashPatch', () => {
  it('相同内容的不同键顺序得到相同摘要', () => {
    const path = buildPath('Admin', 'g', 'a');
    expect(hashPatch(path, { allowRoles: [], enabled: true })).toBe(hashPatch(path, { enabled: true, allowRoles: [] }));
  });

  it('内容变化会改变摘要', () => {
    const path = buildPath('Admin', 'g', 'a');
    expect(hashPatch(path, { allowRoles: [] })).not.toBe(hashPatch(path, { allowRoles: ['x'] }));
  });
});
