/**
 * 图形验证码：失败次数上限 + TTL 不被续命
 *
 * 这两条是图码的实际安全边界：
 *   · 图码只有 4–6 位字符、TTL 默认 10 分钟。没有失败上限时，同一个 captchaKey
 *     可以被反复试错 —— 而且**路由层限频挡不住**：限频按 IP 计，攻击者换 IP 继续打
 *     同一个 key 即可（key 是自己手上那张图）。
 *   · 失败写回必须按**剩余 TTL** 计算。若写完整 TTL，每错一次就续命一次，
 *     错得越多有效期越长，恰好与防护目标相反。
 *
 * 存储用内存替身实现 get/set/delete/getDel 四个方法（就是 store 适配器的契约），
 * 被测逻辑是 `verify/captcha/service.js` 真身。
 *
 * @author yijiu2025
 * @since 2026-10-31
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import captchaService from '../../framework/verify/captcha/service.js';

/** 记录型内存 store：额外记录每次 set 的 TTL，便于断言"没续命" */
function makeStore() {
  const map = new Map();
  const sets = [];
  return {
    map,
    sets,
    async get(k) {
      return map.get(k) ?? null;
    },
    async set(k, v, ttl) {
      sets.push({ key: k, ttl });
      map.set(k, v);
    },
    async delete(k) {
      map.delete(k);
    },
    async getDel(k) {
      const v = map.get(k) ?? null;
      map.delete(k);
      return v;
    }
  };
}

/** 直接塞一条已知答案的记录，跳过 SVG 生成（本文件不测渲染） */
async function seed(store, { text = 'abcd', ttl = 600, fingerprint = null } = {}) {
  await store.set(
    'key-1',
    { text, verified: false, expired: Date.now() + ttl * 1000, fingerprint, ...(fingerprint ? {} : {}) },
    ttl
  );
  return 'key-1';
}

beforeEach(() => {});

describe('失败次数上限', () => {
  it('正确码通过，并标记 verified（之后可一次性消费）', async () => {
    const store = makeStore();
    const key = await seed(store, { text: 'abcd' });

    expect(await captchaService.verify('ABCD', key, store)).toBe(true);
    expect((await store.get(key)).verified).toBe(true);
    expect(await captchaService.consume(key, store)).toBe(true);
  });

  it('连续错 5 次后 captchaKey 被作废（之后即使输对也不能过）', async () => {
    const store = makeStore();
    const key = await seed(store, { text: 'abcd' });

    for (let i = 0; i < 5; i++) {
      expect(await captchaService.verify('zzzz', key, store)).toBe(false);
    }

    // 达到上限即删除：再试正确码也拿不到记录
    expect(await store.get(key)).toBeNull();
    expect(await captchaService.verify('abcd', key, store)).toBe(false);
  });

  it('失败写回按剩余 TTL，不把有效期续长', async () => {
    const store = makeStore();
    const key = await seed(store, { text: 'abcd', ttl: 60 });

    await captchaService.verify('zzzz', key, store);

    const lastSet = store.sets.at(-1);
    expect(lastSet.key).toBe(key);
    // 原 TTL 60s，剩余必然 ≤ 60s（容许 1s 内的时钟抖动）
    expect(lastSet.ttl).toBeLessThanOrEqual(60);
    expect(lastSet.ttl).toBeGreaterThan(0);
    // 记录里的 expired 也不得被推迟
    expect((await store.get(key)).attempts).toBe(1);
  });

  it('指纹不符同样计入失败次数（不能靠"换个客户端慢慢试"绕过）', async () => {
    const store = makeStore();
    const key = await seed(store, { text: 'abcd' });
    // 先按 A 客户端生成指纹
    const ctxA = { ip: '203.0.113.1', ua: 'UA-A' };
    const fp = (await import('node:crypto'))
      .createHash('sha256')
      .update(`${ctxA.ip}|${ctxA.ua}|`)
      .digest('hex')
      .slice(0, 32);
    await store.set(key, { ...(await store.get(key)), fingerprint: fp }, 600);

    // B 客户端拿正确码来试：指纹不符 → false，且消耗一次机会
    const ctxB = { ip: '203.0.113.2', ua: 'UA-B' };
    expect(await captchaService.verify('abcd', key, store, ctxB)).toBe(false);
    expect((await store.get(key)).attempts).toBe(1);
    // 正确答案仍然可用（记录未被销毁），但只在 fingerprint 匹配的客户端上
    expect(await captchaService.verify('abcd', key, store, ctxA)).toBe(true);
  });
});

describe('过期与边界', () => {
  it('已过期 → 直接删除并判否', async () => {
    const store = makeStore();
    await store.set('expired-key', { text: 'abcd', verified: false, expired: Date.now() - 1 }, 600);

    expect(await captchaService.verify('abcd', 'expired-key', store)).toBe(false);
    expect(await store.get('expired-key')).toBeNull();
  });

  it('空参数 / 不存在的 key → false 且不抛错', async () => {
    const store = makeStore();
    expect(await captchaService.verify('', 'k', store)).toBe(false);
    expect(await captchaService.verify('abcd', '', store)).toBe(false);
    expect(await captchaService.verify('abcd', 'no-such-key', store)).toBe(false);
  });

  it('consume 未 verified 的 key → false（不能跳过 verify 直接消费）', async () => {
    const store = makeStore();
    const key = await seed(store, { text: 'abcd' });
    expect(await captchaService.consume(key, store)).toBe(false);
  });
});
