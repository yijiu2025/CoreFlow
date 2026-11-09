/**
 * 手机号加解密的契约测试（此前这个模块 **零覆盖**）
 *
 * 为什么必须钉住：这里是唯一一处"加密后要能靠密文反查人"的判据 ——
 *   · 确定性 IV 一旦退化（改成随机 IV），手机号唯一索引立刻失效，注册查重静默失灵；
 *   · HMAC 标签一旦不验，CBC 的 bit-flipping 就能造出可控明文；
 *   · `isEncrypted` 一旦变宽，明文手机号会被判定为"已加密"而原样落库（真实回归点）。
 * 三条都不抛异常、不报错，只能靠用例拦。
 *
 * @author yijiu2025
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'node:crypto';
import { encryptPhone, decryptPhone, maskPhone, isEncrypted } from '../../utils/crypto.js';

/** 32 字节 hex：与生产约束一致（PHONE_ENCRYPT_KEY 必须 64 字符） */
const KEY_A = createHash('sha256').update('phone-key-a').digest('hex');
const KEY_B = createHash('sha256').update('phone-key-b').digest('hex');
const PHONE = '13812345678';

let prevKey;

beforeAll(() => {
  prevKey = process.env.PHONE_ENCRYPT_KEY;
  process.env.PHONE_ENCRYPT_KEY = KEY_A;
});

afterAll(() => {
  // ⚠️ 只还原、不删除：同 worker 里的其它套件可能共用这份 env
  if (prevKey === undefined) delete process.env.PHONE_ENCRYPT_KEY;
  else process.env.PHONE_ENCRYPT_KEY = prevKey;
});

describe('encryptPhone / decryptPhone', () => {
  it('往返加解密得到原文', () => {
    expect(decryptPhone(encryptPhone(PHONE))).toBe(PHONE);
  });

  it('同一明文两次加密结果完全相同（确定性 IV，唯一索引的前提）', () => {
    expect(encryptPhone(PHONE)).toBe(encryptPhone(PHONE));
  });

  it('密文是三段 base64（IV:密文:MAC），且不含明文', () => {
    const encrypted = encryptPhone(PHONE);
    const parts = encrypted.split(':');

    expect(parts).toHaveLength(3);
    expect(parts.every(p => /^[A-Za-z0-9+/]+={0,2}$/.test(p))).toBe(true);
    expect(encrypted).not.toContain(PHONE);
  });

  it('篡改密文后验签失败：原样返回，绝不返回被篡改的明文', () => {
    const [iv, ciphertext, mac] = encryptPhone(PHONE).split(':');
    // 改掉密文首字符（换一个**合法** base64 字符，保证不是靠形状被拦）
    const flipped = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1);
    const tampered = [iv, flipped, mac].join(':');

    const result = decryptPhone(tampered);
    expect(result).toBe(tampered);
    expect(result).not.toBe(PHONE);
  });

  it('换密钥后解不开：原样返回（迁移/轮换密钥时不至于抛错打断整表读取）', () => {
    const encrypted = encryptPhone(PHONE);
    process.env.PHONE_ENCRYPT_KEY = KEY_B;
    try {
      expect(decryptPhone(encrypted)).toBe(encrypted);
    } finally {
      process.env.PHONE_ENCRYPT_KEY = KEY_A;
    }
  });

  it('兼容旧的两段格式（无 MAC）', () => {
    const legacy = encryptPhone(PHONE).split(':').slice(0, 2).join(':');
    expect(legacy.split(':')).toHaveLength(2);
    expect(decryptPhone(legacy)).toBe(PHONE);
  });

  it('明文 / 空值 / 非密文原样返回（afterFind 会对整表调用）', () => {
    expect(decryptPhone(PHONE)).toBe(PHONE);
    expect(decryptPhone('')).toBe('');
    expect(decryptPhone(null)).toBe(null);
    expect(decryptPhone('http://example.com')).toBe('http://example.com');
  });

  it('未配置密钥时加密**必须**报错（不能静默存明文）', () => {
    delete process.env.PHONE_ENCRYPT_KEY;
    try {
      expect(() => encryptPhone(PHONE)).toThrow(/PHONE_ENCRYPT_KEY/);
    } finally {
      process.env.PHONE_ENCRYPT_KEY = KEY_A;
    }
  });

  it('数字型手机号也能加密（否则会在模型钩子里抛 TypeError）', () => {
    expect(decryptPhone(encryptPhone(13812345678))).toBe(PHONE);
  });
});

describe('isEncrypted：决定"要不要加密"的前置判据', () => {
  it('真密文（新/旧两种格式）都识别为已加密', () => {
    const encrypted = encryptPhone(PHONE);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted(encrypted.split(':').slice(0, 2).join(':'))).toBe(true);
  });

  it('明文手机号识别为未加密', () => {
    expect(isEncrypted(PHONE)).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('含一个冒号的普通字符串**不能**被误判成密文（旧实现只看段数）', () => {
    // 旧实现 `value.split(':').length === 2` 会把这些都判成密文 → 跳过加密 → 明文落库
    for (const value of ['http://a.com', 'a:b', '13812345678:分机', '010:12345678']) {
      expect(isEncrypted(value)).toBe(false);
    }
  });

  it('段数不对 / 非字符串一律 false', () => {
    expect(isEncrypted('a:b:c:d')).toBe(false);
    expect(isEncrypted(13812345678)).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });

  it('IV 不是 16 字节、MAC 不是 32 字节的伪密文都判 false', () => {
    const shortIv = Buffer.alloc(8, 1).toString('base64');
    const iv = Buffer.alloc(16, 1).toString('base64');
    const ciphertext = Buffer.alloc(16, 2).toString('base64');
    const mac = Buffer.alloc(32, 3).toString('base64');

    expect(isEncrypted(`${shortIv}:${ciphertext}:${mac}`)).toBe(false);
    expect(isEncrypted(`${iv}:${ciphertext}:${Buffer.alloc(8, 3).toString('base64')}`)).toBe(false);
    expect(isEncrypted(`${iv}:${ciphertext}:${mac}`)).toBe(true);
  });
});

describe('maskPhone', () => {
  it('正常号码掩中间四位', () => {
    expect(maskPhone('13812345678')).toBe('138****5678');
  });

  it('短号整段隐去，不泄漏片段', () => {
    expect(maskPhone('12345')).toBe('****');
    expect(maskPhone('')).toBe('****');
  });

  it('数字 / null / undefined 不抛错', () => {
    expect(maskPhone(13812345678)).toBe('138****5678');
    expect(maskPhone(null)).toBe('****');
    expect(maskPhone(undefined)).toBe('****');
  });
});
