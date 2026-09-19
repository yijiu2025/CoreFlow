/**
 * 密码哈希模块
 *
 * 采用 Node 内置 `crypto.scrypt`（异步，运行在 libuv 线程池）替代 `bcryptjs`。
 *
 * ── 为什么必须换掉 bcryptjs ──
 * bcryptjs 是**纯 JavaScript 实现**（无原生绑定），其 `hashSync` / `compareSync`
 * 会完全占住主线程。实测（2026-09-19，Node 24，cost=10，10 次并发）：
 *
 *   hashSync ×10 串行          总耗时 725ms   事件循环最大卡顿 720ms
 *   bcrypt.hash async ×10 并发  总耗时 736ms   事件循环最大卡顿 729ms  ← 异步版并没有更好
 *   crypto.scrypt async ×10 并发 总耗时 160ms   事件循环最大卡顿  11ms  ← 线程池，真并行
 *
 * ⚠️ 关键结论：**"改用 bcryptjs 的异步 API" 无法解决阻塞**。它的 async 版本虽然用
 * `setImmediate` 让出调度权，但每个任务仍会整体同步跑完，因此事件循环卡顿与同步版
 * 几乎相同（729ms vs 720ms）。只有把计算移出主线程（线程池）才真正有效。
 *
 * 在单线程的 Node 中，这 700ms 的卡顿意味着**所有其他请求（含健康探针）全部排队** ——
 * 登录接口是公开的，一次并发登录突发即可让实例探针超时并被摘流，形成雪崩。
 *
 * ── 与历史数据的兼容 ──
 * 数据库中已有的哈希是 bcrypt 格式（`$2a$` / `$2b$` / `$2y$`），本模块**保留校验能力**，
 * 不会让任何存量用户无法登录。校验通过后由调用方用 `isLegacyHash()` 判断并顺手升级为
 * scrypt（登录路径已有 `identity.save()`，复用即可，不额外写库）。
 *
 * ⚠️ 遗留代价：bcrypt 校验路径仍会阻塞约 68ms。但它是**一次性**的 ——
 * 每个用户在你的首次成功登录后即被迁移为 scrypt，阻塞随之消失（收敛而非永续）。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const scryptAsync = promisify(crypto.scrypt);

// ════════════════════════════════════════════════════════════════════
// 参数
// ════════════════════════════════════════════════════════════════════

/**
 * 新哈希固定使用的 scrypt 参数。
 * 内存开销 = 128 × N × r = 128 × 16384 × 8 = 16MB（低于默认 maxmem 32MB）。
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** 派生密钥长度（字节） */
const KEY_LENGTH = 64;

/** 盐长度（字节） */
const SALT_LENGTH = 16;

/** scrypt 哈希前缀 —— 与历史 bcrypt 哈希的区分依据 */
const SCRYPT_PREFIX = 'scrypt';

/** 历史 bcrypt 哈希识别：$2a$ / $2b$ / $2y$ */
const BCRYPT_PATTERN = /^\$2[aby]\$/;

/**
 * 从存储串解析出的参数上限。
 * scrypt 的参数直接决定内存与 CPU 开销，而参数是从**数据库字符串**里读出来的 ——
 * 若该字段被污染成一个超大 N，校验会变成一次内存爆炸（DoS）。
 * 默认 maxmem 虽会拦截，但那会抛异常；此处显式给界，让它**优雅地判为不匹配**。
 */
const MAX_SCRYPT_N = 1 << 20; // 1,048,576
const MAX_SCRYPT_R = 32;
const MAX_SCRYPT_P = 16;

// ════════════════════════════════════════════════════════════════════
// 实现
// ════════════════════════════════════════════════════════════════════

/**
 * 判断存储串是否为历史 bcrypt 哈希
 *
 * 用于登录成功后决定是否需要升级为 scrypt。
 *
 * @param {*} stored - 数据库中的 credential 值
 * @returns {boolean} true = 是历史 bcrypt 哈希，需要升级
 */
function isLegacyHash(stored) {
  return typeof stored === 'string' && BCRYPT_PATTERN.test(stored);
}

/**
 * 生成密码哈希（scrypt）
 *
 * 返回格式：`scrypt$N$r$p$saltB64$hashB64`
 * 参数内嵌于哈希串中，因此**未来调参不影响存量哈希的校验**。
 *
 * @param {string} plain - 明文密码
 * @returns {Promise<string>} 哈希串
 * @throws {TypeError} plain 不是字符串时
 */
async function hashPassword(plain) {
  if (typeof plain !== 'string') {
    throw new TypeError('hashPassword: 密码必须是字符串');
  }
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(plain, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return [SCRYPT_PREFIX, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * 校验 scrypt 哈希
 *
 * @param {string} plain - 明文密码
 * @param {string} stored - scrypt 哈希串
 * @returns {Promise<boolean>} true = 匹配
 */
async function _verifyScrypt(plain, stored) {
  const parts = stored.split('$');
  // scrypt$N$r$p$salt$hash → 6 段
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    N < 2 ||
    N > MAX_SCRYPT_N ||
    r < 1 ||
    r > MAX_SCRYPT_R ||
    p < 1 ||
    p > MAX_SCRYPT_P
  ) {
    return false;
  }

  // Buffer.from(x, 'base64') 对非法输入不抛错而是静默产出空/残缺缓冲，
  // 必须先校验长度再进 timingSafeEqual（后者对不同长度会抛错）
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  let derived;
  try {
    derived = await scryptAsync(plain, salt, expected.length, { N, r, p });
  } catch {
    // 参数在合法界内但仍可能因 maxmem 抛错 —— 判为不匹配而非让异常冒泡
    return false;
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/**
 * 校验密码
 *
 * 同时支持 scrypt（新）与 bcrypt（历史）两种格式，因此**换算法不会导致存量用户登录失败**。
 *
 * @param {string} plain - 明文密码
 * @param {string} stored - 数据库中的 credential
 * @returns {Promise<boolean>} true = 匹配
 */
async function verifyPassword(plain, stored) {
  // 归一化：plain 可能来自请求体解密结果，stored 可能为 null（三方登录身份无密码）
  if (typeof plain !== 'string' || typeof stored !== 'string' || stored.length === 0) {
    return false;
  }

  if (stored.startsWith(`${SCRYPT_PREFIX}$`)) {
    return _verifyScrypt(plain, stored);
  }

  if (BCRYPT_PATTERN.test(stored)) {
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }

  // 未知格式（脏数据）→ 不匹配，且不抛错
  return false;
}

// ── 导出 ──

export { hashPassword, verifyPassword, isLegacyHash };
