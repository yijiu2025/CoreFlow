/**
 * 浏览器端工作量证明（PoW）求解
 *
 * ⚠️ 与服务端 `src/framework/firewall/util/pow-sha256.js` **必须逐字节等价**：
 * 题目是 `sha256(challengeId + ':' + salt + ':' + answer)` 的十六进制摘要以
 * `difficulty` 个 `0` 开头，服务端用 Node 侧那份实现校验。两边算法一致才能对上。
 *
 * 为什么不在浏览器里用 `crypto.subtle`：它只在安全上下文（HTTPS / localhost）存在，
 * 纯 HTTP 部署下是 `undefined`，PoW 直接失败 → 用户被永久卡在挑战页。这也是后端
 * 内置模板用纯 JS 实现的同一个理由。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

/** SHA-256 常量表（前 64 个素数立方根小数部分的前 32 位） */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2
];

/** 循环右移（32 位无符号语义） */
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/**
 * 计算字符串的 SHA-256 十六进制摘要
 *
 * 输入只可能是 `[0-9a-f:]` 组成的 ASCII 串，因此按"一字符一字节"处理，
 * 不做 UTF-8 编码 —— 这与服务端实现的前提一致（改输入字符集必须两边同改）。
 *
 * @param input 待哈希字符串
 * @returns 64 位小写十六进制摘要
 */
export function sha256Hex(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) bytes.push(input.charCodeAt(i) & 0xff);

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 4294967296);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array<number>(64);

  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  let out = '';
  for (const v of [h0, h1, h2, h3, h4, h5, h6, h7]) out += (v >>> 0).toString(16).padStart(8, '0');
  return out;
}

/** 求解参数 */
export interface SolveOptions {
  /** 服务端下发的不透明挑战 ID */
  challengeId: string;
  /** 服务端下发的一次性盐 */
  salt: string;
  /** 前导零个数（十六进制位） */
  difficulty: number;
  /** 尝试上限（服务端按 8×期望值推导；缺省按难度推导） */
  maxAttempts?: number;
  /** 进度回调（0~1），用于驱动进度条 */
  onProgress?: (ratio: number) => void;
  /** 取消信号（组件卸载 / 用户重试时中断上一轮计算） */
  signal?: AbortSignal;
  /** 每片迭代数（默认 20000）：分片让出事件循环，避免长难度下整页冻结 */
  chunkSize?: number;
}

/** 求解结果 */
export type SolveResult = { answer: string } | { answer: null; cancelled: boolean };

/**
 * 求解工作量证明
 *
 * 分片执行（每 `chunkSize` 次让出一次事件循环）：难度 5 时期望 100 万次哈希，
 * 一次性同步跑完会把页面冻住约 1~3 秒，进度条也永远停在 0 —— 用户会以为卡死。
 *
 * @param options 求解参数
 * @returns 找到答案返回 `{ answer }`；取消返回 `{ answer: null, cancelled: true }`；
 *          用尽上限返回 `{ answer: null, cancelled: false }`
 */
export async function solvePow(options: SolveOptions): Promise<SolveResult> {
  const { challengeId, salt, difficulty, onProgress, signal } = options;
  const target = '0'.repeat(Math.max(1, difficulty));
  const prefix = `${challengeId}:${salt}:`;
  const chunkSize = options.chunkSize && options.chunkSize > 0 ? options.chunkSize : 20_000;
  const maxAttempts =
    options.maxAttempts && options.maxAttempts > 0 ? options.maxAttempts : Math.ceil(8 * 16 ** difficulty);

  for (let base = 0; base < maxAttempts; base += chunkSize) {
    if (signal?.aborted) return { answer: null, cancelled: true };

    const end = Math.min(base + chunkSize, maxAttempts);
    for (let answer = base; answer < end; answer++) {
      if (sha256Hex(prefix + answer).startsWith(target)) {
        onProgress?.(1);
        return { answer: String(answer) };
      }
    }
    onProgress?.(Math.min(1, end / maxAttempts));

    // 让出事件循环：进度条能刷新、取消信号能被处理
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  return { answer: null, cancelled: false };
}
