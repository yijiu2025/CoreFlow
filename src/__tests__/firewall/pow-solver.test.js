/**
 * 零分配 PoW 内核（`makePowSolver`）
 *
 * 这个函数是"提速 5.9×"的全部来源，也是最容易写错的地方 —— 我在基准脚本里就踩过：
 * 前导零比较写成 `H[0] !== 0`，只有难度 8 才成立，难度 2 直接全 false（用户永远解不出）。
 * 所以这里不测性能（CI 上不稳定），只测**语义与 `sha256Hex` 逐位一致**：
 *   · 同一个答案，`matches()` 与 `sha256Hex(prefix+answer).startsWith('0'.repeat(d))` 必须同真同假
 *   · 边界答案（个位/十位/百位/上限）与边界长度（前缀长短 × 答案位数）都要覆盖
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect } from '@jest/globals';

const { sha256Hex, makePowSolver, verifyPow, SHA256_K } =
  await import('../../framework/security/verify/pow/service.js');

/** 参考实现：与挑战页/solvePow 原本用的判定方式完全一致 */
function referenceMatches(prefix, difficulty, answer) {
  return sha256Hex(prefix + answer).startsWith('0'.repeat(difficulty));
}

const PREFIXES = [
  // 真实形状：32 位 challengeId + ':' + 16 位 salt + ':'
  '0123456789abcdef0123456789abcdef:fedcba9876543210:',
  // 极短前缀：验证 totalLen 走 64 字节那条分支
  'a:',
  // 长前缀：57 字节左右，答案跨 1~8 位时 padding 边界会变
  'x'.repeat(50) + ':'
];

describe('makePowSolver：与 sha256Hex 逐位一致', () => {
  test('难度 1~6 × 边界答案（0 / 9 / 10 / 99 / 100 / 上限）全部同真同假', () => {
    const answers = [0, 1, 9, 10, 11, 99, 100, 101, 999, 1000, 99999, 999999, 20_000_000];
    for (const prefix of PREFIXES) {
      for (let d = 1; d <= 6; d++) {
        const matches = makePowSolver(prefix, d);
        for (const answer of answers) {
          expect([prefix.length, d, answer, matches(answer)]).toEqual([
            prefix.length,
            d,
            answer,
            referenceMatches(prefix, d, answer)
          ]);
        }
      }
    }
  });

  test('连续答案段（含多位数字进位）逐个对拍', () => {
    const prefix = PREFIXES[0];
    for (let d = 1; d <= 3; d++) {
      const matches = makePowSolver(prefix, d);
      // 0~20000 覆盖 1/2/3/4 位数字与多次进位
      let mismatch = null;
      for (let answer = 0; answer <= 20_000; answer++) {
        if (matches(answer) !== referenceMatches(prefix, d, answer)) {
          mismatch = { difficulty: d, answer };
          break;
        }
      }
      expect(mismatch).toBeNull();
    }
  });

  test('难度 0 → 恒真（与服务端 verifyPow 的 depth<=0 语义一致）', () => {
    const matches = makePowSolver(PREFIXES[0], 0);
    for (const answer of [0, 7, 12345]) expect(matches(answer)).toBe(true);
  });

  test('非法难度（NaN / null / 负数）按 0 处理，不抛错', () => {
    for (const bad of [Number.NaN, null, undefined, -3, 'x']) {
      const matches = makePowSolver(PREFIXES[0], bad);
      expect(matches(1)).toBe(true);
    }
  });

  test('找到的答案能被服务端 verifyPow 接受（闭环）', () => {
    const challengeId = 'a'.repeat(32);
    const salt = 'b'.repeat(16);
    const prefix = `${challengeId}:${salt}:`;
    for (let d = 1; d <= 3; d++) {
      const matches = makePowSolver(prefix, d);
      let answer = -1;
      for (let i = 0; i < 200_000; i++) {
        if (matches(i)) {
          answer = i;
          break;
        }
      }
      expect(answer).toBeGreaterThanOrEqual(0);
      expect(verifyPow(challengeId, salt, answer, d)).toBe(true);
    }
  });

  test('判定器可复用：同一实例连续调用不串味（缓冲复用必须自己清尾）', () => {
    const prefix = PREFIXES[0];
    const matches = makePowSolver(prefix, 2);
    // 先问一个"长答案"，再问短的 —— 若缓冲尾巴没清干净，第二次就会算错
    const probe = [123456, 7, 999, 42, 20000000, 1];
    for (let round = 0; round < 3; round++) {
      for (const answer of probe) {
        expect(matches(answer)).toBe(referenceMatches(prefix, 2, answer));
      }
    }
  });

  test('常量表是 64 项且与已知首尾值一致（防止被手改）', () => {
    expect(SHA256_K).toHaveLength(64);
    expect(SHA256_K[0]).toBe(0x428a2f98);
    expect(SHA256_K[63]).toBe(0xc67178f2);
  });
});
