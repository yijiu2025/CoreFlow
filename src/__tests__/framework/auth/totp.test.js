/**
 * TOTP 模块测试
 *
 * 起因：`totp.js`（149 行）在 AUDIT-REPORT-2026-09-12.md 🟡-3 中被查出**全仓零引用**——
 * 无任何绑定/校验端点调用它，也**没有任何测试覆盖**。149 行安全敏感代码长期无人验证，
 * 是典型的认知负债（且给人"系统已有 2FA"的错觉）。
 *
 * 本文件按报告建议方案 (b) 执行：补齐测试后保留该能力。
 * 核心价值是用 **RFC 6238 附录 B 的官方测试向量**做端到端校验（含 Base32 编解码 +
 * HMAC-SHA1 + 动态截断整条链路），而不是只测自己的实现自洽。
 *
 * @author yijiu2025
 * @since 2026-09-14
 */

import { describe, test, expect } from '@jest/globals';
import { generateSecret, generateTOTP, verifyTOTP } from '../../../framework/auth/totp.js';

/** RFC 6238 附录 B 的 SHA-1 测试密钥（ASCII '12345678901234567890' 的 Base32 编码） */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
/** RFC 向量的配置：8 位码（本模块默认 6 位，故显式覆盖） */
const RFC_CONFIG = { digits: 8, period: 30, algorithm: 'SHA-1', window: 1 };

describe('framework/auth/totp（🟡-3 补测）', () => {
  describe('RFC 6238 官方测试向量（端到端正确性）', () => {
    // 这 6 组是 RFC 6238 附录 B 给出的标准向量，命中即证明
    // Base32 解码 → 8 字节大端计数器 → HMAC-SHA1 → 动态截断 整条链路都正确。
    // 若只做"自签自验"式测试，Base32 编解码的对称性缺陷会被完全掩盖。
    test.each([
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130']
    ])('T=%i 秒 → %s', (epochSeconds, expected) => {
      expect(generateTOTP(RFC_SECRET, epochSeconds * 1000, RFC_CONFIG)).toBe(expected);
    });

    test('同一时间步长内多次取值结果稳定', () => {
      // 30s 步长内（第 30~59 秒）应恒等于 T=30 那一刻的码
      const base = generateTOTP(RFC_SECRET, 30_000, RFC_CONFIG);
      expect(generateTOTP(RFC_SECRET, 45_000, RFC_CONFIG)).toBe(base);
      expect(generateTOTP(RFC_SECRET, 59_999, RFC_CONFIG)).toBe(base);
    });

    test('跨时间步长后取值改变', () => {
      const beforeStep = generateTOTP(RFC_SECRET, 29_999, RFC_CONFIG);
      const afterStep = generateTOTP(RFC_SECRET, 30_000, RFC_CONFIG);
      expect(beforeStep).not.toBe(afterStep);
    });
  });

  describe('generateSecret', () => {
    test('返回 Base32 密钥与标准 otpauth URI', () => {
      const { secret, uri } = generateSecret('MyApp', 'alice@example.com');

      // 20 字节 = 160 bit，Base32 每字符 5 bit → 32 字符，无填充
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain('issuer=MyApp');
      expect(uri).toContain('algorithm=SHA1');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
      // account 需 URL 编码（@ 编码为 %40）
      expect(uri).toContain('alice%40example.com');
    });

    test('每次生成的密钥都不同（随机性）', () => {
      const a = generateSecret('MyApp', 'a');
      const b = generateSecret('MyApp', 'a');
      expect(a.secret).not.toBe(b.secret);
    });

    test('默认参数可用（不传 issuer/account）', () => {
      expect(() => generateSecret()).not.toThrow();
      expect(generateSecret().secret).toMatch(/^[A-Z2-7]{32}$/);
    });
  });

  describe('generateTOTP', () => {
    test('默认 6 位数字码', () => {
      const { secret } = generateSecret();
      expect(generateTOTP(secret)).toMatch(/^\d{6}$/);
    });

    test('8 位配置下长度随配置变化', () => {
      const { secret } = generateSecret();
      expect(generateTOTP(secret, Date.now(), RFC_CONFIG)).toMatch(/^\d{8}$/);
    });

    test('前导零被保留（不能被当成数字丢掉）', () => {
      // T=1111111109 的 RFC 向量是 '07081804'，首位是 0
      expect(generateTOTP(RFC_SECRET, 1111111109 * 1000, RFC_CONFIG)).toHaveLength(8);
      expect(generateTOTP(RFC_SECRET, 1111111109 * 1000, RFC_CONFIG).startsWith('0')).toBe(true);
    });
  });

  describe('verifyTOTP 正常路径', () => {
    const { secret } = generateSecret('MyApp', 'tester');

    test('当前时间步长的码通过', () => {
      expect(verifyTOTP(secret, generateTOTP(secret))).toBe(true);
    });

    test('前后各 1 个窗口的码通过（容错窗口）', () => {
      const now = Date.now();
      expect(verifyTOTP(secret, generateTOTP(secret, now - 30_000))).toBe(true);
      expect(verifyTOTP(secret, generateTOTP(secret, now + 30_000))).toBe(true);
    });

    test('窗口外的码被拒绝', () => {
      const now = Date.now();
      // 步长 30s、window=1 → 只检查 now-30s / now / now+30s
      expect(verifyTOTP(secret, generateTOTP(secret, now - 90_000))).toBe(false);
      expect(verifyTOTP(secret, generateTOTP(secret, now + 90_000))).toBe(false);
    });

    test('错误的码被拒绝', () => {
      const code = generateTOTP(secret);
      const wrong = code === '000000' ? '111111' : '000000';
      expect(verifyTOTP(secret, wrong)).toBe(false);
    });

    test('另一个密钥生成的码被拒绝（密钥隔离）', () => {
      const other = generateSecret('MyApp', 'someone-else');
      expect(verifyTOTP(secret, generateTOTP(other.secret))).toBe(false);
    });

    test('自定义 digits 生效', () => {
      expect(verifyTOTP(secret, generateTOTP(secret, Date.now(), RFC_CONFIG), RFC_CONFIG)).toBe(true);
    });

    test('数字类型的 code 可被接受（JSON body 常传 number）', () => {
      // 找一个首位非 0 的时间点，避免把前导零问题混进来
      const now = Date.now();
      const codeStr = generateTOTP(secret, now);
      if (codeStr.startsWith('0')) return; // 罕见，跳过即可
      expect(verifyTOTP(secret, Number(codeStr))).toBe(true);
    });
  });

  describe('verifyTOTP 入参防御（不再抛异常）', () => {
    // 回归：修复前 verifyTOTP 把 code 直接交给内部的 timingSafeEqual，
    // 而后者第一行读 `b.length` —— 传 undefined 即抛 TypeError，
    // 2FA 端点会 500 而不是返回"验证失败"（与 cookie.js 🔴-1 同类缺陷）。
    const { secret } = generateSecret('MyApp', 'tester');

    test.each([
      ['undefined', undefined],
      ['null', null],
      ['空字符串', ''],
      ['纯空格', '   '],
      ['非数字', 'abcdef'],
      ['位数不足', '123'],
      ['位数过长', '1234567'],
      ['对象', { code: '123456' }]
    ])('code = %s 时返回 false 而非抛异常', (_label, code) => {
      expect(() => verifyTOTP(secret, code)).not.toThrow();
      expect(verifyTOTP(secret, code)).toBe(false);
    });

    test.each([
      ['undefined', undefined],
      ['null', null],
      ['空字符串', ''],
      ['数字', 12345]
    ])('secret = %s 时返回 false 而非抛异常', (_label, badSecret) => {
      expect(() => verifyTOTP(badSecret, '123456')).not.toThrow();
      expect(verifyTOTP(badSecret, '123456')).toBe(false);
    });

    test('secret 含非法 Base32 字符时响亮抛错（数据损坏不该静默判失败）', () => {
      // 这是有意设计：密钥来自服务端存储，格式非法属数据损坏，应暴露而非吞掉
      expect(() => verifyTOTP('NOT-VALID-BASE32!!', '123456')).toThrow(/Invalid Base32/);
    });
  });
});
