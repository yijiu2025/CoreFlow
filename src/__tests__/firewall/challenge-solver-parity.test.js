/**
 * 跨端 PoW 等价性护栏（阶段 0）
 *
 * 浏览器端实现（`packages/challenge-client/src/pow.ts`）与服务端
 * （`src/framework/verify/pow/service.js`）是**两份手写代码**，注释里写着
 * "必须逐字节等价"，但此前没有任何测试守着它 —— 一旦漂移，症状是"用户永远解不出，
 * 服务端永远判 Invalid Proof"，而且只在线上暴露。
 *
 * 这里用 esbuild 现场把 TS 转成 CJS 再加载（不引构建产物、不落地中间文件），
 * 对拍两件事：
 *   ① `sha256Hex`：同一批向量必须产出完全相同的 64 位十六进制串（含 padding 边界长度）
 *   ② `makePowSolver`：同一难度下"第一个满足条件的答案"必须相同（含"都找不到"）
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect } from '@jest/globals';
import { transformSync } from 'esbuild';

const SERVER = await import('../../framework/verify/pow/service.js');

/** 把 `pow.ts` 现场转成 CJS 并求值，拿到它的导出（不依赖前端构建产物） */
function loadBrowserPow() {
  const source = readFileSync('packages/challenge-client/src/pow.ts', 'utf8');
  const cjs = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
  const mod = { exports: {} };
  // pow.ts 没有任何 import，require 不该被调用到
  new Function('module', 'exports', 'require', cjs)(mod, mod.exports, () => {
    throw new Error('pow.ts 不应有运行时 require');
  });
  return mod.exports;
}

const browser = loadBrowserPow();

describe('浏览器端与服务端的 SHA-256 必须逐字节等价', () => {
  test('两份实现都导出了 sha256Hex', () => {
    expect(typeof SERVER.sha256Hex).toBe('function');
    expect(typeof browser.sha256Hex).toBe('function');
  });

  test('向量集：空串 / 短串 / padding 边界（55·56·63·64·65 字节）/ PoW 真实形状', () => {
    const vectors = [
      '',
      'a',
      'abc',
      '0'.repeat(31),
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(63),
      'a'.repeat(64),
      'a'.repeat(65),
      'a'.repeat(119),
      'a'.repeat(120),
      // PoW 真实输入：32 位 id + ':' + 16 位 salt + ':' + 答案
      `${'f'.repeat(32)}:${'0'.repeat(16)}:0`,
      `${'f'.repeat(32)}:${'0'.repeat(16)}:1`,
      `${'f'.repeat(32)}:${'0'.repeat(16)}:123456`,
      `${'0123456789abcdef'.repeat(2)}:${'fedcba9876543210'}:20000000`
    ];
    for (const v of vectors) {
      expect([v.length, browser.sha256Hex(v)]).toEqual([v.length, SERVER.sha256Hex(v)]);
    }
  });

  test('随机向量 200 条（长度 0~140，字符集限定在 PoW 可能出现的范围内）', () => {
    const alphabet = '0123456789abcdef:';
    // 固定种子式生成（不用 Math.random，失败可复现）
    let seed = 20261106;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      const len = Math.floor(rand() * 141);
      let s = '';
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rand() * alphabet.length)];
      expect(browser.sha256Hex(s)).toBe(SERVER.sha256Hex(s));
    }
  });
});

describe('两端的求解内核必须找到同一个答案', () => {
  const challengeId = '0123456789abcdef0123456789abcdef';
  const salt = 'fedcba9876543210';
  const prefix = `${challengeId}:${salt}:`;

  /** 找出第一个满足难度的答案；找不到返回 -1 */
  function firstMatch(matches, limit) {
    for (let i = 0; i < limit; i++) if (matches(i)) return i;
    return -1;
  }

  test('难度 1~4：第一个满足条件的答案相同', () => {
    const limit = 400_000;
    for (let d = 1; d <= 4; d++) {
      const a = firstMatch(SERVER.makePowSolver(prefix, d), limit);
      const b = firstMatch(browser.makePowSolver(prefix, d), limit);
      expect([d, b]).toEqual([d, a]);
      // 顺手确认答案确实能被服务端校验接受（不是两边一起错）
      expect(a).toBeGreaterThanOrEqual(0);
      expect(SERVER.verifyPow(challengeId, salt, a, d)).toBe(true);
    }
  });

  test('短前缀（走 64 字节分支）同样一致', () => {
    const shortPrefix = 'a:';
    for (let d = 1; d <= 3; d++) {
      const a = firstMatch(SERVER.makePowSolver(shortPrefix, d), 100_000);
      const b = firstMatch(browser.makePowSolver(shortPrefix, d), 100_000);
      expect([d, b]).toEqual([d, a]);
    }
  });
});
