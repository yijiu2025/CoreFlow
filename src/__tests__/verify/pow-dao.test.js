/**
 * `verify/pow` 的 dao 层：出题落盘 / 一次性消费 / 判题取载荷
 *
 * 这一层的正确性有两块，**都不是"能跑就行"**：
 *   ① **存储契约**：只认 `put` / `take`（`take` 必须原子取走），不能退化成 `get + delete`
 *      —— 后者在多实例下同一份载荷可能被读两次，"一次挑战只能用一次"就破了；
 *   ② **不透明性**：`binding` 对 verify 是完全不透明的，本层只负责原样存、原样取回。
 *      一旦它开始认识 `ip` / `fingerprint`，verify 就反向依赖了防火墙的域模型。
 *
 * 所以这里用一个 `Map` 模拟"取走即消失"的存储，逐条钉住上面两条。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect } from '@jest/globals';

const { powDao, makePowSolver, MAX_DIFFICULTY, DEFAULT_TTL_SEC } =
  await import('../../framework/security/verify/pow/index.js');

/**
 * 造一个"取走即消失"的存储（语义上等价于 Redis GETDEL）
 *
 * @returns {{store: object, rows: Map<string, object>, puts: object[]}} 存储替身与记录
 */
function makeStore() {
  const rows = new Map();
  const puts = [];
  const store = {
    async put(challengeId, payload, ttlSec) {
      puts.push({ challengeId, payload, ttlSec });
      rows.set(challengeId, payload);
    },
    async take(challengeId) {
      const entry = rows.get(challengeId);
      rows.delete(challengeId); // 一次性：取走即消失
      return entry ?? null;
    }
  };
  return { store, rows, puts };
}

describe('powDao.issue：出题并把判定依据留在服务端', () => {
  test('返回的只有不透明题号 + 求解参数，不含盐以外的判定依据', async () => {
    const { store, puts } = makeStore();
    const challenge = await powDao.issue(store, {
      difficulty: 3,
      ttlSec: 300,
      binding: { ip: '203.0.113.9', fingerprint: 'fp', deviceId: null }
    });

    expect(Object.keys(challenge).sort()).toEqual(['challengeId', 'difficulty', 'maxAttempts', 'salt', 'ttlSec']);
    expect(challenge.challengeId).toMatch(/^[0-9a-f]{32}$/);
    expect(challenge.salt).toMatch(/^[0-9a-f]{16}$/);
    expect(challenge.difficulty).toBe(3);
    expect(challenge.maxAttempts).toBe(Math.ceil(8 * 16 ** 3));
    expect(challenge.ttlSec).toBe(300);

    // 落盘内容：盐/难度/绑定/签发时间，TTL 由调用方给定
    expect(puts).toHaveLength(1);
    expect(puts[0].challengeId).toBe(challenge.challengeId);
    expect(puts[0].ttlSec).toBe(300);
    expect(puts[0].payload).toMatchObject({ salt: challenge.salt, difficulty: 3, issuedAt: expect.any(Number) });
  });

  test('binding 是不透明字段：任意形状原样存取，本层不解读', async () => {
    const { store, puts } = makeStore();
    const binding = { anything: ['goes', 'here'], nested: { deep: 1 } };
    await powDao.issue(store, { difficulty: 2, binding });

    expect(puts[0].payload.binding).toEqual(binding);
  });

  test('没给 binding 时落 null（而不是 undefined，Redis JSON 里 null 才是显式的）', async () => {
    const { store, puts } = makeStore();
    await powDao.issue(store, { difficulty: 2 });
    expect(puts[0].payload.binding).toBeNull();
  });

  test('难度被夹到能力的合法区间，TTL 缺省走能力默认值', async () => {
    const { store, puts } = makeStore();

    const bad = await powDao.issue(store, { difficulty: 0 });
    expect(bad.difficulty).toBe(3); // 非法 → 默认 3，绝不等于"关掉挑战"

    const huge = await powDao.issue(store, { difficulty: 99 });
    expect(huge.difficulty).toBe(MAX_DIFFICULTY);

    const noTtl = await powDao.issue(store, { difficulty: 2 });
    expect(noTtl.ttlSec).toBe(DEFAULT_TTL_SEC);
    expect(puts.at(-1).ttlSec).toBe(DEFAULT_TTL_SEC);
  });
});

describe('powDao.consume：一次性取走', () => {
  test('同一题号只能取到一次（第二次为 null，对应 Challenge Expired）', async () => {
    const { store } = makeStore();
    const { challengeId } = await powDao.issue(store, { difficulty: 2 });

    const first = await powDao.consume(store, challengeId);
    expect(first).toMatchObject({ difficulty: 2 });
    await expect(powDao.consume(store, challengeId)).resolves.toBeNull();
  });

  test('非法题号直接返回 null，不打存储（避免把任意输入拼进键空间）', async () => {
    let touched = 0;
    const store = {
      async put() {},
      async take() {
        touched++;
        return null;
      }
    };
    await expect(powDao.consume(store, '')).resolves.toBeNull();
    await expect(powDao.consume(store, null)).resolves.toBeNull();
    expect(touched).toBe(0);
  });
});

describe('powDao.check：难度与盐只认载荷，不认外部', () => {
  test('完整闭环：出题 → 求解 → 判题通过；判题后再取载荷必然为空（重放无效）', async () => {
    const { store } = makeStore();
    const challenge = await powDao.issue(store, { difficulty: 2, binding: { ip: '127.0.0.1' } });

    // 用与服务端/浏览器同一份内核求解
    const matches = makePowSolver(`${challenge.challengeId}:${challenge.salt}:`, challenge.difficulty);
    let answer = null;
    for (let i = 0; i < challenge.maxAttempts; i++) {
      if (matches(i)) {
        answer = String(i);
        break;
      }
    }
    expect(answer).not.toBeNull();

    const payload = await powDao.consume(store, challenge.challengeId);
    const result = powDao.check(payload, { challengeId: challenge.challengeId, answer });
    expect(result).toEqual({ ok: true });

    // 判题不消费：consume 已经取走了，再取必然是 null
    await expect(powDao.consume(store, challenge.challengeId)).resolves.toBeNull();
  });

  test('答案不对 → Invalid Proof（原因文案与既有对外契约一致）', async () => {
    const { store } = makeStore();
    const challenge = await powDao.issue(store, { difficulty: 4 });
    const payload = await powDao.consume(store, challenge.challengeId);

    expect(powDao.check(payload, { challengeId: challenge.challengeId, answer: '0' })).toEqual({
      ok: false,
      reason: 'Invalid Proof'
    });
    // 非数字答案同样归入 Invalid Proof（路由 schema 已挡一层，这里兜底）
    expect(powDao.check(payload, { challengeId: challenge.challengeId, answer: 'abc' }).ok).toBe(false);
  });

  test('载荷缺失/字段写坏时不抛错，按失败处理', async () => {
    expect(powDao.check(null, { challengeId: 'a'.repeat(32), answer: '1' }).ok).toBe(false);
    expect(powDao.check({}, { challengeId: 'a'.repeat(32), answer: '1' }).ok).toBe(false);
  });

  test('难度取自载荷：即使外部传更大难度也照载荷判（防"下发后改配置"导致前后不一致）', async () => {
    const { store } = makeStore();
    const challenge = await powDao.issue(store, { difficulty: 1 });
    const payload = await powDao.consume(store, challenge.challengeId);

    // 找一个难度 1 下成立、难度 5 下不成立的答案
    const easy = makePowSolver(`${challenge.challengeId}:${challenge.salt}:`, 1);
    const hard = makePowSolver(`${challenge.challengeId}:${challenge.salt}:`, 5);
    let answer = null;
    for (let i = 0; i < 100_000; i++) {
      if (easy(i) && !hard(i)) {
        answer = String(i);
        break;
      }
    }
    expect(answer).not.toBeNull();
    expect(powDao.check(payload, { challengeId: challenge.challengeId, answer }).ok).toBe(true);
  });
});
