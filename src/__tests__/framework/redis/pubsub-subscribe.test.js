/**
 * 订阅连接的生命周期契约
 *
 * === 它锁的是什么 ===
 * `duplicate()` 只复制配置，**返回的是未连接客户端**。而 node-redis 的
 * `sendCommand` 在 `socket.isOpen` 为假时直接以 `ClientClosedError` 拒绝 ——
 * 未连接就 `subscribe()` 只会得到这个拒绝，且它只落在 catch 日志里，
 * 外部能观察到的现象仅仅是「订阅永远不就绪」。
 *
 * 这个组合曾经真实存在：跨实例 WS 扇出（pubsub.js + monitor.service.js）
 * 因此从未生效，而单进程里一切正常，所以没人发现。直到 CI 的 ws-fanout 关卡
 * 在**真 Redis** 上跑到「本进程订阅连接未在 10s 内就绪」才暴露（2026-09-21）。
 *
 * === 为什么用替身而不是真 Redis ===
 * 这里要验的是**调用顺序契约**（connect 先于 SUBSCRIBE），不是 Redis 语义；
 * 用真 Redis 反而验不了「未连接时不许订阅」这一条（真连接总是就绪的）。
 * 被测对象仍是真实的 pubsub.js 本体，替身只提供 globalRedis 这个外部依赖。
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

/** 订阅连接替身：连接前 isOpen/isReady 均为假，与 node-redis 真身一致 */
const fakeSub = {
  isOpen: false,
  isReady: false,
  on: jest.fn(),
  connect: jest.fn(),
  subscribe: jest.fn(),
  quit: jest.fn()
};

const fakeMain = {
  isReady: true,
  duplicate: () => fakeSub
};

// pubsub.js 用 `import { globalRedis } from './plugin.js'` 取主连接。
// 替身只需提供这一个导出；被测代码本体不受影响。
jest.unstable_mockModule('../../../framework/redis/plugin.js', () => ({
  globalRedis: fakeMain
}));

const { subscribe, isPubSubReady, resetPubSub } = await import('../../../framework/redis/pubsub.js');

/** 让 connected.then(...) 那条微任务链跑完 */
const tick = () => new Promise(r => setImmediate(r));

describe('pubsub 订阅连接生命周期', () => {
  beforeEach(() => {
    resetPubSub();
    fakeSub.isOpen = false;
    fakeSub.isReady = false;
    fakeSub.on.mockClear();
    fakeSub.connect.mockReset().mockImplementation(() => {
      fakeSub.isOpen = true;
      return Promise.resolve();
    });
    fakeSub.subscribe.mockReset().mockImplementation(() => Promise.resolve());
  });

  test('subscribe() 先 connect 再发 SUBSCRIBE（duplicate 得到的是未连接客户端）', async () => {
    subscribe('ch:a', () => {});

    // 未连接就订阅 = 必然被 ClientClosedError 拒绝，所以此刻不应订阅
    expect(fakeSub.subscribe).not.toHaveBeenCalled();
    expect(fakeSub.connect).toHaveBeenCalledTimes(1);

    await tick();
    expect(fakeSub.subscribe).toHaveBeenCalledTimes(1);
    expect(fakeSub.subscribe.mock.calls[0][0]).toBe('ch:a');
  });

  test('同一 channel 重复注册只向 Redis 订阅一次', async () => {
    subscribe('ch:b', () => {});
    subscribe('ch:b', () => {});
    await tick();

    expect(fakeSub.subscribe).toHaveBeenCalledTimes(1);
  });

  test('已发起过连接的订阅连接不再重复 connect', async () => {
    subscribe('ch:c1', () => {});
    await tick();
    const connectCallsAfterFirst = fakeSub.connect.mock.calls.length;

    subscribe('ch:c2', () => {});
    await tick();

    expect(fakeSub.connect.mock.calls.length).toBe(connectCallsAfterFirst); // 不重复建连
    expect(fakeSub.subscribe).toHaveBeenCalledTimes(2); // 两个 channel 各订阅一次
  });

  test('isPubSubReady() 反映订阅连接自身的就绪状态', async () => {
    expect(isPubSubReady()).toBe(false); // 尚未派生

    subscribe('ch:d', () => {});
    expect(isPubSubReady()).toBe(false); // 已派生但未就绪

    await tick();
    fakeSub.isReady = true;
    expect(isPubSubReady()).toBe(true);
  });
});
