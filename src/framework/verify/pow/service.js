/**
 * 工作量证明（PoW）能力服务 —— 纯计算 + 纯参数推导
 *
 * 归属：`framework/verify` 是「验证能力库」（`captcha` / `slider` / `recaptcha` /
 * `email` / `sms` / `voice` / `qrcode`，统一 `service + dao + index`）。PoW 与它们是
 * 同一种东西 —— 都只回答两个问题：**怎么出题**、**怎么判题**。
 *
 * 因此本文件只做两件事：
 *   ① 出题：给定难度，给出本题参数（不透明题号 + 盐 + 尝试上限 + TTL）
 *   ② 判题：给定答案，判断是否满足难度
 *
 * **刻意不在这里的东西**（越界会让 verify 反向依赖防火墙，依赖方向就翻了）：
 *
 * | 留给 firewall | 原因 |
 * | --- | --- |
 * | 什么时候该出题（挑战态 / 限频 / 封禁判定） | 访问控制策略 |
 * | 题目绑谁（ip / fingerprint / deviceId） | 策略；本模块只把它当**不透明字段**存取 |
 * | 通过后免检多久（匿名 120s / 登录 1800s） | 访问控制策略 |
 * | 题目怎么呈现（页面 / CSP / 302 / Worker） | 与「验证能力」无关，见 `challenge/template.js` |
 *
 * 为什么自己实现 SHA-256，而不用 `crypto.createHash` / `crypto.subtle`：
 *   - 服务端 `crypto.createHash` 没问题，但**求解发生在浏览器**；
 *   - 浏览器侧 `crypto.subtle` 只在安全上下文（HTTPS / localhost）存在，纯 HTTP 部署时
 *     为 `undefined` → PoW 直接失败、用户被永久卡在挑战页；
 *   - 所以需要一份**同步、零依赖、任何环境都能跑**的实现，并通过
 *     `Function.prototype.toString()` 内联进挑战页 —— 出题 / 判题 / 求解三处共用同一份
 *     源码，不存在「两份实现各改各的」漂移（跨端回归见
 *     `__tests__/firewall/challenge-solver-parity.test.js`）。
 *
 * 输入约束：PoW 的输入只可能是 `[0-9a-f:]` 组成的 ASCII 串，因此按「一字符一字节」处理即可，
 * 无需 UTF-8 编码逻辑（这也是本实现能保持极短的原因）。
 *
 * @author yijiu2025
 * @since 2026-09-15
 * @since 2026-11-06 从 framework/firewall/util/pow-sha256.js 迁入（能力归位，策略留 firewall）
 */
import crypto from 'node:crypto';

/**
 * SHA-256 常量表（前 64 个素数立方根小数部分的前 32 位）
 *
 * 单独提出来有两个原因：
 *   ① `makePowSolver()` 要在**内联进挑战页**时自带这张表（`toString()` 只带函数体，
 *      不带闭包外的变量），所以它必须是可序列化的一等公民；
 *   ② 表只有一份，`sha256Hex` 与 `makePowSolver` 不会各存一套数字慢慢漂移。
 *
 * @type {number[]}
 */
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/**
 * 难度上限：5 个前导十六进制零（期望 16^5 ≈ 105 万次哈希，约 0.4~3s）
 *
 * 上限曾是 6（期望 1670 万次）：纯 JS 在主线程上算 1670 万次 ≈ 1 分钟**整页冻结**，
 * 而且尝试上限只有 1.2 倍期望值 → 难度配 6 时约 30% 的用户直接 "Unsolvable"，
 * 而载荷是一次性的、页面又不重试 → 用户卡死。因此收到 5，并让尝试上限按 8 倍期望值推导。
 *
 * ⚠️ 与配置契约联动：`config/schema.js` 里 `challengeDifficulty` 的 `max` 必须等于本值，
 * 否则「配了 6 却被静默夹成 5」= 配了不生效（有契约测试钉住）。
 *
 * @type {number}
 */
const MAX_DIFFICULTY = 5;

/** 默认难度（配置缺项/非法时的保底值） */
const DEFAULT_DIFFICULTY = 3;

/** 挑战载荷默认有效期（秒）：够慢设备解完，又不至于让同一个题号被长期持有 */
const DEFAULT_TTL_SEC = 300;

/**
 * 计算字符串的 SHA-256 十六进制摘要
 *
 * @param {string} input 仅含 ASCII 字符的输入
 * @returns {string} 64 位小写十六进制摘要
 */
function sha256Hex(input) {
  const K = SHA256_K;
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  // 一字符一字节 + SHA-256 填充（0x80 + 补零 + 64 位大端长度）
  const bytes = [];
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

  const w = new Array(64);
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
  for (const v of [h0, h1, h2, h3, h4, h5, h6, h7]) {
    out += (v >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

/**
 * 造一个「答案是否满足难度」的判定器（**零分配**热循环）
 *
 * 为什么需要它：PoW 是"海量小输入"（难度 3 期望 4096 次、难度 5 期望 105 万次），
 * `sha256Hex()` 每次都新建 `bytes` 数组与 `w` 表、最后还要拼 64 位十六进制串再比
 * `startsWith` —— 这些开销在热循环里占大头。实测（无头 Chrome）：
 *
 * | 实现 | µs/次 | 难度 3 | 难度 5 |
 * | --- | --- | --- | --- |
 * | `sha256Hex()` + startsWith | 2.315 | 9.5 ms | ≈ 2.4 s |
 * | 本函数 | **0.395** | **1.6 ms** | **≈ 414 ms** |
 *
 * 另：`crypto.subtle` 在这类输入上反而更慢（2.95 µs/次，每次调用的固定开销 + TextEncoder），
 * 所以**不要**为了"提速"去换 WebCrypto。
 *
 * 三处共享同一份源码（`toString()` 内联）：服务端判题、挑战页 Worker、主线程降级。
 * 因此函数必须**自包含**（除 `SHA256_K` 外不引用任何外部量），内联时把 K 一起发过去即可。
 *
 * @param {string} prefix 固定前缀（`challengeId + ':' + salt + ':'`）
 * @param {number} difficulty 前导十六进制零个数（0 表示恒真，与 `verifyPow` 一致）
 * @returns {(answer: number) => boolean} 判定器（复用同一块缓冲，**不可重入/不可跨线程共享**）
 */
function makePowSolver(prefix, difficulty) {
  const text = String(prefix);
  const base = text.length;
  /** 一次哈希最多两块，128 字节够用（前缀 57 字节 + 答案最多 8 位） */
  const buf = new Uint8Array(128);
  for (let i = 0; i < base; i++) buf[i] = text.charCodeAt(i) & 0xff;

  const w = new Int32Array(64);
  const hv = new Int32Array(8);
  /** 十进制数字的临时位（最多 10 位） */
  const digits = new Uint8Array(10);
  const depth = Math.max(0, Math.floor(Number(difficulty) || 0));

  return function matches(answer) {
    // ① 就地写答案的十进制数字（不拼字符串、不产生垃圾）
    let len = base;
    if (answer < 10) {
      buf[len++] = 48 + answer;
    } else {
      let tmp = answer;
      let n = 0;
      while (tmp > 0) {
        digits[n++] = tmp % 10;
        tmp = (tmp - (tmp % 10)) / 10;
      }
      for (let i = n - 1; i >= 0; i--) buf[len++] = 48 + digits[i];
    }

    // ② SHA-256 填充：0x80 + 补零 + 64 位大端长度（复用缓冲，尾巴每轮清零）
    const bitLen = len * 8;
    buf[len] = 0x80;
    const total = len + 9 <= 64 ? 64 : 128;
    for (let i = len + 1; i < total - 8; i++) buf[i] = 0;
    buf[total - 8] = 0;
    buf[total - 7] = 0;
    buf[total - 6] = 0;
    buf[total - 5] = 0;
    buf[total - 4] = (bitLen >>> 24) & 0xff;
    buf[total - 3] = (bitLen >>> 16) & 0xff;
    buf[total - 2] = (bitLen >>> 8) & 0xff;
    buf[total - 1] = bitLen & 0xff;

    // ③ 压缩（`w` / `hv` 复用，语义与 `sha256Hex` 逐位相同）
    const K = SHA256_K;
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        w[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
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

    // ④ 只比前 depth 个十六进制位（逐 nibble，depth ≤ 6，开销可忽略）：
    //    不解十六进制串、不比整串，顺手省掉 64 字节字符串的分配
    if (depth === 0) return true;
    hv[0] = h0;
    hv[1] = h1;
    hv[2] = h2;
    hv[3] = h3;
    hv[4] = h4;
    hv[5] = h5;
    hv[6] = h6;
    hv[7] = h7;
    for (let i = 0; i < depth; i++) {
      if (((hv[i >> 3] >>> (28 - (i & 7) * 4)) & 0xf) !== 0) return false;
    }
    return true;
  };
}

/**
 * 校验工作量证明答案是否满足难度
 *
 * 题目：`sha256(challengeId + ':' + salt + ':' + answer)` 的十六进制摘要
 * 以 `difficulty` 个 `'0'` 开头。
 *
 * @param {string} challengeId 挑战 ID
 * @param {string} salt 服务端随机盐
 * @param {string|number} answer 客户端提交的答案
 * @param {number} difficulty 前导零个数（十六进制位）
 * @returns {boolean} 是否满足
 */
function verifyPow(challengeId, salt, answer, difficulty) {
  if (!challengeId || !salt || answer === undefined || answer === null) return false;
  const text = String(answer);
  // 答案必须是纯十进制数字串，杜绝把超长/特殊字符塞进哈希输入
  if (!/^\d{1,10}$/.test(text)) return false;
  const depth = Number(difficulty) || 0;
  // 🔴 难度非法时**判失败**，不是判通过（2026-11-08）：判题函数里的 fail-open
  // 是这类机制最危险的一处默认值 —— 任何把 difficulty 写成 0 的调用方/历史载荷
  // 都会让"任意数字答案"直接通过。合法难度恒 >= 1（`clampDifficulty` 保证），
  // 所以这里拒绝不会误伤任何正常链路。
  if (depth < 1) return false;
  const digest = sha256Hex(`${challengeId}:${salt}:${text}`);
  return digest.startsWith('0'.repeat(depth));
}

/**
 * 把外部来的难度夹到能力允许的区间
 *
 * 调用方（firewall）从自己的配置里读难度后必须过这一道：配置能写坏
 * （`0` / 负数 / `"abc"` / `null`），而难度写坏的两个方向都很糟 ——
 * `0` 等于关掉挑战，过大则让用户永远解不出。
 *
 * @param {unknown} raw 原始值（可能来自 JSON 配置）
 * @param {number} [fallback] 非法时使用（默认 3）
 * @returns {number} `[1, MAX_DIFFICULTY]` 内的整数
 */
function clampDifficulty(raw, fallback = DEFAULT_DIFFICULTY) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_DIFFICULTY, n);
}

/**
 * 单次挑战允许的尝试次数 = 8 × 期望值（16^difficulty）
 *
 * 8 倍期望值下「解不出来」的概率 ≈ e^-8 ≈ 0.03%，既不会误伤低端机，也不会让
 * 难度配置变成"看运气"。上限 2000 万只是防御性夹取（难度已被 `MAX_DIFFICULTY`
 * 夹到 5，实际最大 840 万）。
 *
 * @param {number} difficulty 难度
 * @returns {number} 尝试次数上限
 */
function attemptsForDifficulty(difficulty) {
  return Math.min(20_000_000, Math.ceil(8 * 16 ** difficulty));
}

/**
 * 出一道题（**只产生参数，不落存储**）
 *
 * 载荷由 `dao.issue()` 写进存储；本函数保持纯函数语义 —— 同样的入参结构，
 * 输出只有随机题号/盐不同，便于单测与跨端对拍。
 *
 * @param {object} [options] 出题参数
 * @param {number} [options.difficulty] 难度（会被夹到 `[1, MAX_DIFFICULTY]`）
 * @param {number} [options.ttlSec] 有效期（秒）
 * @returns {{challengeId:string, salt:string, difficulty:number, maxAttempts:number, ttlSec:number}} 题目
 */
function buildChallenge({ difficulty, ttlSec } = {}) {
  const depth = clampDifficulty(difficulty);
  const ttl = Number(ttlSec);
  return {
    // 32/16 位十六进制：不可猜测，且本身不含任何可直接回放的凭据
    challengeId: crypto.randomBytes(16).toString('hex'),
    salt: crypto.randomBytes(8).toString('hex'),
    difficulty: depth,
    maxAttempts: attemptsForDifficulty(depth),
    ttlSec: Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : DEFAULT_TTL_SEC
  };
}

/**
 * 判题（纯函数）
 *
 * `salt` / `difficulty` 必须来自**服务端存的载荷**，不能现读配置：
 * 下发后改配置会让同一份题号前后难度不一致，用户必然解不出。
 *
 * @param {object} params 判题参数
 * @param {string} params.challengeId 题号
 * @param {string} params.salt 盐（来自载荷）
 * @param {unknown} params.answer 客户端答案
 * @param {number} params.difficulty 难度（来自载荷）
 * @returns {{ok:true} | {ok:false, reason:string}} 判定结果
 */
function verifyAnswer({ challengeId, salt, answer, difficulty }) {
  if (!verifyPow(challengeId, salt, answer, difficulty)) {
    // 原因文案与既有对外契约一致（`Invalid Proof`），改它会连带改掉
    // 观测里的失败原因分布与前端提示，所以这里不细分"格式错"与"难度不符"。
    return { ok: false, reason: 'Invalid Proof' };
  }
  return { ok: true };
}

export {
  SHA256_K,
  MAX_DIFFICULTY,
  DEFAULT_DIFFICULTY,
  DEFAULT_TTL_SEC,
  sha256Hex,
  makePowSolver,
  verifyPow,
  clampDifficulty,
  attemptsForDifficulty,
  buildChallenge,
  verifyAnswer
};
