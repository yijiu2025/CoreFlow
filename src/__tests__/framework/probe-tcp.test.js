/**
 * probeTcp —— 有界 TCP 可达性探测
 *
 * 这个函数存在的唯一理由是「有界」：它必须是 Redis 客户端那套**永不放弃**的
 * 重连策略之外的快速否决通道。因此测试除了验证可达性判定，还要验证
 * **任何路径都在预算内 settle**（否则它就不配当预检）。
 *
 * 全部断言驱动真实 TCP 连接（真起 server、真连、真拒绝），
 * 不使用任何 mock —— 探测的就是内核行为，打桩等于什么都没测。
 */

import net from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const { probeTcp } = await import('../../framework/redis/probe.js');

/** 起一个只监听、不做任何响应逻辑的 TCP server，返回 { server, port } */
function startServer() {
  return new Promise(resolve => {
    const server = net.createServer(socket => {
      // 保持连接，不主动关闭
      socket.on('error', () => {});
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** 起一个 accept 后立刻销毁连接的 server（模拟「TCP 通但不是 Redis」） */
function startRudeServer() {
  return new Promise(resolve => {
    const server = net.createServer(socket => socket.destroy());
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

describe('probeTcp（真实 TCP）', () => {
  let openServer;
  let openPort;
  let rudeServer;
  let rudePort;
  let closedPort;

  beforeAll(async () => {
    const a = await startServer();
    openServer = a.server;
    openPort = a.port;
    const b = await startRudeServer();
    rudeServer = b.server;
    rudePort = b.port;

    // 拿一个「确定没人监听」的端口：起一个 server 再立刻关掉
    const tmp = await startServer();
    closedPort = tmp.port;
    await new Promise(r => tmp.server.close(r));
  });

  afterAll(async () => {
    await new Promise(r => openServer.close(r));
    await new Promise(r => rudeServer.close(r));
  });

  it('监听中的端口 → ok=true / code=OK', async () => {
    const r = await probeTcp('127.0.0.1', openPort, 2000);
    expect(r.ok).toBe(true);
    expect(r.code).toBe('OK');
    expect(r.ms).toBeLessThan(2000);
  });

  it('无人监听的端口 → ok=false，且立刻给出结论（不到超时预算就用完）', async () => {
    const r = await probeTcp('127.0.0.1', closedPort, 2000);
    expect(r.ok).toBe(false);
    // 关键：拒绝是即时的，不能等到预算耗尽才返回 —— 否则预检就失去意义
    expect(r.ms).toBeLessThan(1500);
    expect(['ECONNREFUSED', 'ECONNRESET', 'CONNECT_ERROR']).toContain(r.code);
  });

  it('accept 后立刻断开（TCP 通、协议层不通）→ 预检仍判为可达', async () => {
    // 这正是「假 Redis」场景：预检只负责快速否决，不能越权批准，
    // 真正的协议层失败必须由连接阶段发现。这里锁住这个分工。
    const r = await probeTcp('127.0.0.1', rudePort, 2000);
    expect(r.ok).toBe(true);
  });

  // ── 以下两条只锁「契约」，不锁「网络一定失败」 ──
  // 本机实测：任意公网地址与任意域名的 TCP 都能瞬时「成功」——环境中存在
  // 透明代理/DNS 通配劫持（`10.255.255.1:65000` 与 `.invalid` 域名均返回可达）。
  // 因此这里不再断言 ok=false（那是在断言这台机器的网络策略），
  // 而是断言 probeTcp 真正对外承诺的东西：**有界、不抛、结论结构完整**。
  // 也正因为「TCP 通 ≠ Redis 可用」，预检只能用来快速否决，
  // 批准必须留给协议层 —— 这个分工由上面「假 Redis」用例锁住。
  it('不可路由地址 → 无论是否可达，都在预算内 settle 且结论完整', async () => {
    const budget = 800;
    const r = await probeTcp('10.255.255.1', 65000, budget);
    expect(typeof r.ok).toBe('boolean');
    expect(typeof r.code).toBe('string');
    expect(r.ms).toBeLessThanOrEqual(budget + 500);
  });

  it('非法 timeoutMs → 回退默认预算，不抛错也不无限等', async () => {
    const r = await probeTcp('127.0.0.1', openPort, Number.NaN);
    expect(r.ok).toBe(true);
  });

  it('不存在的域名 → 有界 settle，不挂起（DNS 劫持环境下也不抛）', async () => {
    const budget = 1500;
    const r = await probeTcp('host-that-does-not-exist.invalid', 6379, budget);
    expect(typeof r.ok).toBe('boolean');
    expect(r.ms).toBeLessThanOrEqual(budget + 500);
  });
});
