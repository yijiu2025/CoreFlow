/**
 * connectStandalone 的**有界性**回归锁
 *
 * === 为什么值得单独钉住 ===
 * 2026-09-20 前的实现把重试完全交给客户端的 `reconnectStrategy`，而该策略
 * 在主连接上刻意「永不返回 Error」（超限后转 30s 低频探测，为的是 Redis
 * 恢复后自动连回）。结果是 `client.connect()` 永不 reject，
 * `await connectStandalone()` **可能永不返回**：
 *
 *   - 实测 `npm run verify:stats` 在 Redis 不可达时挂到 **5 分 18 秒**
 *     仍无任何结论（只能手动 kill），而 README 当时声称「8 秒内给结论」。
 *   - 更坏的后果是语义层面的：一个会挂死的关卡等于没有关卡，
 *     「环境不可用」(3) 与「代码回归」(1) 再也分不开。
 *
 * 修复后有界返回由三段共同保证，本文件对每段都有一个用例：
 *   ① TCP 预检否决         → 用例一（毫秒级）
 *   ② 外层超时兜底         → 用例二（假 Redis：TCP 通、协议层不通）
 *   ③ 幂等 / 配置早退       → 用例三、四
 *
 * 断言「不挂起」用的是外层守卫 + 耗时上限，而不是"最终返回了什么" ——
 * 因为回归的形态正是「永远不返回」，只看返回值的话测试自己也会挂住。
 */

import net from 'node:net';
import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';

const { connectStandalone, disconnectStandalone } = await import('../../framework/redis/plugin.js');

/** 守卫：限定 promise 在 ms 内 settle，否则给出可读失败信息 */
function bounded(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 未在 ${ms}ms 内返回（有界性回归）`)), ms);
  });
  const result = Promise.race([promise, guard]);
  result.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer)
  );
  return result;
}

/** 起一个 accept 后立刻销毁的「假 Redis」：TCP 握手成功，协议层立刻断 */
function startRudeServer() {
  return new Promise(resolve => {
    const server = net.createServer(socket => socket.destroy());
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

describe('connectStandalone 有界性（真实连接尝试）', () => {
  const ENV_KEYS = [
    'REDIS_ENABLED',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_DB',
    'REDIS_MAX_RETRIES',
    'REDIS_CONNECT_TIMEOUT',
    'REDIS_TLS'
  ];
  let saved;
  /** 每轮测试都递增：让「跑得越久越像成功」的假象无法混淆断言 */
  let rudeServers = [];

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_DB = '15';
    process.env.REDIS_MAX_RETRIES = '10';
    process.env.REDIS_CONNECT_TIMEOUT = '800';
    delete process.env.REDIS_TLS;
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  afterAll(async () => {
    for (const s of rudeServers) await new Promise(r => s.close(r));
    rudeServers = [];
    await disconnectStandalone();
  });

  it('① 端口无人监听 → TCP 预检直接否决，且远早于连接预算', async () => {
    // 取一个确定空闲的端口：先监听再关闭
    const tmp = await new Promise(resolve => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const deadPort = tmp.address().port;
    await new Promise(r => tmp.close(r));

    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = String(deadPort);

    const t0 = Date.now();
    const r = await bounded(connectStandalone({ timeoutMs: 5000 }), 8000, 'connectStandalone(拒绝)');
    const elapsed = Date.now() - t0;

    expect(r.ready).toBe(false);
    expect(r.code).toBe('TCP_UNREACHABLE');
    // 预检预算 = max(5000/3, 500) 且夹到 3000 → 拒绝场景应远小于它
    expect(elapsed).toBeLessThan(3000);
  });

  it('② 假 Redis（TCP 通、协议层断）→ 外层超时兜底，仍在大致预算内返回', async () => {
    const { server, port } = await startRudeServer();
    rudeServers.push(server);

    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = String(port);

    const budget = 1500;
    const t0 = Date.now();
    const r = await bounded(connectStandalone({ timeoutMs: budget }), budget + 6000, 'connectStandalone(假 Redis)');
    const elapsed = Date.now() - t0;

    expect(r.ready).toBe(false);
    expect(r.code).toBe('CONNECT_FAILED');
    // 预算 1500ms 的连接阶段 + 预检（TCP 通，几毫秒）+ 调度余量
    expect(elapsed).toBeLessThan(budget + 2500);
  });

  it('③ 未启用 Redis → 立即返回 NOT_CONFIGURED，不发起任何连接', async () => {
    process.env.REDIS_ENABLED = 'false';

    const t0 = Date.now();
    const r = await bounded(connectStandalone({ timeoutMs: 5000 }), 3000, 'connectStandalone(未启用)');
    const elapsed = Date.now() - t0;

    expect(r.ready).toBe(false);
    expect(r.code).toBe('NOT_CONFIGURED');
    expect(elapsed).toBeLessThan(200);
  });

  it('④ 非法 REDIS_DB → 立即返回 BAD_DB（在触碰网络之前）', async () => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_DB = '99';

    const r = await bounded(connectStandalone({ timeoutMs: 5000 }), 3000, 'connectStandalone(非法 DB)');
    expect(r.ready).toBe(false);
    expect(r.code).toBe('BAD_DB');
  });
});
