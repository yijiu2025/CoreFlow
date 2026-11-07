/**
 * 放宽配置的签名信封
 *
 * 核心安全属性：**签名覆盖字段值**。
 * 这意味着"签完名再改值"会失配，而不是"签一次名、之后随便改"。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

const SECRET = 'test-app-secret-0123456789abcdef0123456789';

let signing;

beforeAll(async () => {
  process.env.APP_SECRET = SECRET;
  signing = await import('../../app/guard/services/signing.js');
});

/** 构造一个"放宽后"的节点 */
function relaxedNode(overrides = {}) {
  return { enabled: true, requireLogin: false, allowIps: [], allowRoles: [], ...overrides };
}

describe('signRelaxation / verifyRelaxation', () => {
  it('合法签名可以通过校验', () => {
    const node = relaxedNode();
    const envelope = signing.signRelaxation({
      path: 'Admin/userAdmin/listUsers',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '临时只读排查'
    });

    const verdict = signing.verifyRelaxation('Admin/userAdmin/listUsers', { ...node, _relaxation: envelope });
    expect(verdict.ok).toBe(true);
  });

  it('签名后改动 allowRoles 会失配', () => {
    const node = relaxedNode({ allowRoles: ['admin_viewer'] });
    const envelope = signing.signRelaxation({
      path: 'p',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '需求'
    });

    const tampered = { ...node, allowRoles: [], _relaxation: envelope };
    const verdict = signing.verifyRelaxation('p', tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('SIGNATURE_MISMATCH');
  });

  it('签名后改动 requireLogin 会失配', () => {
    const node = relaxedNode();
    const envelope = signing.signRelaxation({
      path: 'p',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '需求'
    });

    const verdict = signing.verifyRelaxation('p', { ...node, requireLogin: true, _relaxation: envelope });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('SIGNATURE_MISMATCH');
  });

  it('换一个路径会失配（签名不能跨节点复用）', () => {
    const node = relaxedNode();
    const envelope = signing.signRelaxation({
      path: 'A/g/a',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '需求'
    });

    const verdict = signing.verifyRelaxation('B/g/b', { ...node, _relaxation: envelope });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('SIGNATURE_MISMATCH');
  });

  it('改原因会失配（原因属于被签名内容）', () => {
    const node = relaxedNode();
    const envelope = signing.signRelaxation({
      path: 'p',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '真实原因'
    });

    const verdict = signing.verifyRelaxation('p', {
      ...node,
      _relaxation: { ...envelope, reason: '编个理由' }
    });
    expect(verdict.ok).toBe(false);
  });

  it('缺少信封时明确报 MISSING_SIGNATURE', () => {
    const verdict = signing.verifyRelaxation('p', relaxedNode());
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('MISSING_SIGNATURE');
  });

  it('信封版本不符时拒绝（不尝试猜测旧格式）', () => {
    const node = relaxedNode();
    const envelope = signing.signRelaxation({
      path: 'p',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '理由'
    });

    const verdict = signing.verifyRelaxation('p', { ...node, _relaxation: { ...envelope, v: 99 } });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('UNSUPPORTED_VERSION');
  });

  it('签名长度不一致时不抛 RangeError（先比长度再 timingSafeEqual）', () => {
    const node = relaxedNode();
    const envelope = signing.signRelaxation({
      path: 'p',
      node,
      at: '2026-11-07T05:00:00.000Z',
      by: 'uid-1',
      reason: '理由'
    });

    const verdict = signing.verifyRelaxation('p', { ...node, _relaxation: { ...envelope, sig: 'short' } });
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('SIGNATURE_MISMATCH');
  });
});
