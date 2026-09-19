/**
 * WebSocket 测试
 *
 * 覆盖：服务端优雅关闭（preClose 对半开连接的处理）、握手鉴权关闭码
 *
 * 【为什么重写】
 * 原 9 项全是「手写常量再断言该常量」（如 `expect(4001).toBe(4001)`、
 * `expect('PING').toBe('PING')`），零 import 生产代码 —— 把被测模块删掉仍全绿。
 * 现改为真实驱动：真实 Fastify + 真实 @fastify/websocket + 真实 createWsPreClose
 * + 真实 registerSecureWebSocket。
 *
 * 注：原文件里的"重连间隔递增"其实测的是**前端**逻辑（本仓不含那段代码），
 * 在这里无法产生真实覆盖，故删除而不是保留一个看起来在测的假象。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-19 重写为真实驱动
 */
import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import net from 'node:net';
import { createWsPreClose, WS_CLOSE_GOING_AWAY } from '../framework/websocket/preclose.js';
import { registerSecureWebSocket } from '../api/guard.js';

/** 宽限期：测试里取小值，既跑得快也顺带验证该参数真的被采纳 */
const GRACE_MS = 150;

/**
 * 给 Promise 加一个硬截止时间（避免"卡住"变成无限等待而让整个测试超时）
 *
 * @param {Promise<any>} promise - 原始 Promise
 * @param {number} ms - 截止毫秒
 * @returns {Promise<any>} 原始结果，或超时标记 '__deadline__'
 */
function withDeadline(promise, ms) {
  let timer;
  const guarded = promise.then(
    v => {
      clearTimeout(timer);
      return v;
    },
    e => {
      clearTimeout(timer);
      throw e;
    }
  );
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve('__deadline__'), ms);
  });
  return Promise.race([guarded, deadline]);
}

/**
 * 启动一个带 WS 路由的 Fastify 应用
 *
 * @param {object} [options] - 选项
 * @param {boolean} [options.usePreClose] - 是否挂载被测的 preClose（false 用于反例对照）
 * @returns {Promise<{app: object, port: number}>} 应用与监听端口
 */
async function startWsApp({ usePreClose = true } = {}) {
  const app = Fastify({ logger: false, forceCloseConnections: true });
  await app.register(websocket, usePreClose ? { preClose: createWsPreClose(GRACE_MS) } : {});

  app.get('/ws', { websocket: true }, conn => {
    const client = conn.socket || conn;
    client.on('message', () => {});
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  return { app, port: app.server.address().port };
}

/**
 * 建立一个"规范"的 WebSocket 客户端连接
 *
 * @param {number} port - 端口
 * @returns {Promise<{client: WebSocket, closeInfo: () => object}>} 客户端与关闭信息读取器
 */
async function connectWellBehaved(port) {
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let closeCode = null;
  let closeReason = '';
  client.on('close', (code, reason) => {
    closeCode = code;
    closeReason = reason?.toString() ?? '';
  });

  await new Promise((resolve, reject) => {
    client.on('open', resolve);
    client.on('error', reject);
  });

  return { client, closeInfo: () => ({ code: closeCode, reason: closeReason }) };
}

/**
 * 建立一个"半开"连接：完成 WS 握手后**对服务端的关闭帧不作任何回应**
 * 真机上的对应场景：移动端断网、浏览器崩溃、NAT 超时。
 *
 * @param {number} port - 端口
 * @returns {Promise<{sock: net.Socket, upgraded: boolean, isClosed: () => boolean}>} 连接句柄
 */
async function connectHalfOpen(port) {
  const sock = net.connect(port, '127.0.0.1');
  await new Promise(resolve => sock.on('connect', resolve));

  sock.write(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`
  );

  const upgraded = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 2000);
    sock.on('data', d => {
      if (d.toString().includes('101')) {
        clearTimeout(timer); // 不让这个兜底定时器活到测试结束（会挂住 jest 进程）
        resolve(true);
      }
    });
  });

  let closed = false;
  sock.on('close', () => {
    closed = true;
  });

  return { sock, upgraded, isClosed: () => closed };
}

describe('WebSocket 优雅关闭', () => {
  it('没有客户端时立即完成关闭', async () => {
    const { app } = await startWsApp();

    const elapsed = await withDeadline(
      app.close().then(() => Date.now()),
      GRACE_MS * 4
    );

    expect(elapsed).not.toBe('__deadline__');
  });

  it('规范客户端：收到 1001 关闭帧后立即断开', async () => {
    const { app, port } = await startWsApp();
    const { client, closeInfo } = await connectWellBehaved(port);

    await app.close();
    // 客户端处理关闭帧是异步的，给它一个 tick
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(closeInfo().code).toBe(WS_CLOSE_GOING_AWAY);
    client.terminate();
  });

  it('半开连接（不回关闭帧）：宽限期后被强制断开，close() 不挂起', async () => {
    const { app, port } = await startWsApp();
    const peer = await connectHalfOpen(port);
    expect(peer.upgraded).toBe(true);

    const startedAt = Date.now();
    const result = await withDeadline(
      app.close().then(() => true),
      3000
    );
    const elapsed = Date.now() - startedAt;

    // 修复前这里会是 '__deadline__'：默认 preClose 会一直等对端回应
    expect(result).toBe(true);
    // 宽限期 + 余量：远小于入口的 30s 兜底
    expect(elapsed).toBeLessThan(2500);

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(peer.isClosed()).toBe(true);
  });

  it('反例：不挂载 preClose 时，同样的半开连接会让 close() 一直等下去', async () => {
    // 这条用例证明"修复是必要的" —— 没有它，上面那条断言可能只是在一个
    // 本来就不会挂住的场景里通过，无法说明被测代码起了作用。
    const { app, port } = await startWsApp({ usePreClose: false });
    const peer = await connectHalfOpen(port);
    expect(peer.upgraded).toBe(true);

    const closing = app.close().then(() => true);
    const result = await withDeadline(closing, 1200);

    expect(result).toBe('__deadline__'); // 1.2s 内未返回 = 确实被挂住

    // 清理：手动断开对端，让关闭流程走完，避免句柄泄漏影响后续用例
    peer.sock.destroy();
    await withDeadline(closing, 3000);
  });
});

describe('WebSocket 握手鉴权', () => {
  it('未登录连接被以 4001 关闭，且业务 handler 不被执行', async () => {
    const app = Fastify({ logger: false });
    await app.register(websocket, { preClose: createWsPreClose(GRACE_MS) });

    let handlerCalled = false;
    registerSecureWebSocket(app, {
      url: '/secure-ws',
      requireLogin: true,
      handler: () => {
        handlerCalled = true;
      }
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;

    const client = new WebSocket(`ws://127.0.0.1:${port}/secure-ws`);
    const code = await new Promise(resolve => {
      const timer = setTimeout(() => resolve('__deadline__'), 3000);
      const done = v => {
        clearTimeout(timer);
        resolve(v);
      };
      client.on('close', c => done(c));
      client.on('error', () => done('__error__'));
    });

    expect(code).toBe(4001);
    expect(handlerCalled).toBe(false);

    client.terminate();
    await app.close();
  });
});
