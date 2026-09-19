/**
 * 密码哈希模块单元测试
 *
 * 覆盖：
 * - scrypt 哈希生成与校验（新格式）
 * - 历史 bcrypt 哈希的兼容校验（换算法不能让存量用户登不进来）
 * - 脏数据 / 恶意参数必须优雅判否，不得抛错或造成内存爆炸
 *
 * ⚠️ 本文件中的断言全部**调用真实实现**产生，不含"手写常量断言手写常量"的空测试。
 * 可用毒丸法复验：把 password-hash.js 的 verifyPassword 改成恒返回 true，
 * 下面的"错误密码拒绝"用例会立刻变红。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

import { describe, it, expect } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword, isLegacyHash } from '../../framework/auth/password-hash.js';

const PASSWORD = 'Correct#Horse2026';

/** 数据库中的历史 bcrypt 哈希（用于验证换算法不破坏存量数据） */
const LEGACY_BCRYPT = bcrypt.hashSync(PASSWORD, 10);

describe('密码哈希 · scrypt（新格式）', () => {
  it('生成的哈希是自描述格式 scrypt$N$r$p$salt$hash', async () => {
    const hash = await hashPassword(PASSWORD);
    const parts = hash.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(Number(parts[1])).toBe(16384); // N
    expect(Number(parts[2])).toBe(8); // r
    expect(Number(parts[3])).toBe(1); // p
    // 盐与派生密钥都是合法 base64 且非空
    expect(Buffer.from(parts[4], 'base64').length).toBe(16);
    expect(Buffer.from(parts[5], 'base64').length).toBe(64);
  });

  it('不再产出 bcrypt 格式（防止回退到阻塞实现）', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash.startsWith('$2')).toBe(false);
    expect(isLegacyHash(hash)).toBe(false);
  });

  it('相同密码每次哈希不同（盐随机）', async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
    // 但两者都能校验通过
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });

  it('正确密码通过校验', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  });

  it('错误密码被拒绝', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword('Wrong#Horse2026', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
    // 大小写敏感
    expect(await verifyPassword(PASSWORD.toUpperCase(), hash)).toBe(false);
  });

  it('非字符串密码抛 TypeError（哈希入口不接受脏输入）', async () => {
    await expect(hashPassword(12345)).rejects.toThrow(TypeError);
    await expect(hashPassword(null)).rejects.toThrow(TypeError);
  });
});

describe('密码哈希 · bcrypt 历史兼容', () => {
  it('识别历史 bcrypt 哈希', () => {
    expect(isLegacyHash(LEGACY_BCRYPT)).toBe(true);
    expect(isLegacyHash('scrypt$16384$8$1$aa$bb')).toBe(false);
    expect(isLegacyHash('')).toBe(false);
    expect(isLegacyHash(null)).toBe(false);
    expect(isLegacyHash(undefined)).toBe(false);
  });

  it('历史 bcrypt 哈希的密码仍可登录（换算法不破坏存量数据）', async () => {
    expect(await verifyPassword(PASSWORD, LEGACY_BCRYPT)).toBe(true);
  });

  it('历史 bcrypt 哈希对错误密码依然拒绝', async () => {
    expect(await verifyPassword('Wrong#Horse2026', LEGACY_BCRYPT)).toBe(false);
  });
});

describe('密码哈希 · 脏数据与恶意参数必须优雅判否', () => {
  it('空值 / 非字符串 credential 一律判否且不抛错', async () => {
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(await verifyPassword(PASSWORD, undefined)).toBe(false);
    expect(await verifyPassword(PASSWORD, '')).toBe(false);
    expect(await verifyPassword(PASSWORD, 12345)).toBe(false);
    expect(await verifyPassword(PASSWORD, {})).toBe(false);
    expect(await verifyPassword(null, LEGACY_BCRYPT)).toBe(false);
    expect(await verifyPassword({ a: 1 }, LEGACY_BCRYPT)).toBe(false);
  });

  it('未知格式的 credential 判否而非抛错', async () => {
    expect(await verifyPassword(PASSWORD, 'plain-text')).toBe(false);
    expect(await verifyPassword(PASSWORD, '$1$md5$abcdef')).toBe(false);
  });

  it('参数被污染成超大值时优雅判否（不 OOM、不抛错）', async () => {
    const b64 = s => Buffer.from(s).toString('base64');
    // N 超出上限 → 必须判否，而不是真的去分配内存
    expect(await verifyPassword(PASSWORD, `scrypt$99999999$8$1$${b64('salt')}$${b64('x'.repeat(64))}`)).toBe(false);
    // r 超出上限
    expect(await verifyPassword(PASSWORD, `scrypt$16384$999$1$${b64('salt')}$${b64('x'.repeat(64))}`)).toBe(false);
    // p 超出上限
    expect(await verifyPassword(PASSWORD, `scrypt$16384$8$99$${b64('salt')}$${b64('x'.repeat(64))}`)).toBe(false);
    // 非法 base64
    expect(await verifyPassword(PASSWORD, 'scrypt$16384$8$1$!!!$!!!')).toBe(false);
    // 段数不足
    expect(await verifyPassword(PASSWORD, 'scrypt$16384$8$1$abc')).toBe(false);
    // N 非整数
    expect(await verifyPassword(PASSWORD, `scrypt$abc$8$1$${b64('salt')}$${b64('x'.repeat(64))}`)).toBe(false);
  });
});
