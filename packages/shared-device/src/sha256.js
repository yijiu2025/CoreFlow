/**
 * SHA-256 哈希
 *
 * 优先使用 Web Crypto API（浏览器原生，安全上下文 HTTPS/localhost），
 * crypto.subtle 不可用时（HTTP 局域网部署、非安全上下文）降级为
 * 自包含纯 JS 实现，保证 H5 签名等依赖方在任何环境都能工作。
 *
 * 实现为纯 JS（而非 TS）：根 Jest 配置 transform: {}（纯 ESM 不编译 TS），
 * 单元测试需直接 import 本文件与 Node crypto 对拍（与 base62-timestamp.js 同一约定）。
 *
 * @author yijiu2025
 * @since 2026-08-22
 * @since 2026-09-03 增加 crypto.subtle 可用性检测与纯 JS 降级实现
 * @since 2026-09-04 迁移为 .js + .d.ts 形态，纳入单元测试覆盖
 */

/** Web Crypto API 是否可用（非安全上下文下 crypto.subtle 为 undefined） */
function hasSubtleCrypto() {
  return (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined' &&
    globalThis.crypto.subtle !== null
  );
}

/**
 * SHA-256 哈希函数
 * @param {string} message 待哈希字符串（UTF-8 编码）
 * @returns {Promise<string>} 64 位小写 hex 字符串
 */
export async function sha256(message) {
  if (hasSubtleCrypto()) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Pure(message);
}

/* ==================== 纯 JS SHA-256 降级实现 ==================== */

/** SHA-256 轮函数常量（前 64 个素数的立方根小数部分前 32 位） */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/**
 * 纯 JS SHA-256 实现（UTF-8 输入）
 * @param {string} message 待哈希字符串
 * @returns {string} 64 位小写 hex 字符串
 */
export function sha256Pure(message) {
  // UTF-8 编码
  const bytes = new TextEncoder().encode(message);
  const msgLen = bytes.length;

  // 填充：追加 0x80 + 0x00 至 56 mod 64，再追加 64 位大端长度
  const paddedLen = (((msgLen + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[msgLen] = 0x80;
  const bitLenHigh = Math.floor(msgLen / 0x20000000); // msgLen * 8 的高 32 位
  const bitLenLow = (msgLen << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHigh);
  view.setUint32(paddedLen - 4, bitLenLow);

  // 初始哈希值（前 8 个素数的平方根小数部分前 32 位）
  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a;
  let h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => x.toString(16).padStart(8, '0')).join('');
}

/** 32 位循环右移 */
function rotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
