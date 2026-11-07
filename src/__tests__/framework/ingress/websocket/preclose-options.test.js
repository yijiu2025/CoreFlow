/**
 * WebSocket 关闭参数的可配置性（关闭码 / 宽限期）
 *
 * 这两项以前是模块内的裸常量：宽限期只能靠改代码，关闭码完全不可配。
 * 现在都从 `src/config/app_config.js` 的 websocket 段读，本文件钉住三件事：
 *   ① 合法值真的被采用（不是"读了但没用"）；
 *   ② 非法值 / 协议禁发码**回退 1001**，绝不把非法码发出去
 *      （发 1005/1006 会让客户端按协议错误断开，服务端日志看不出原因）；
 *   ③ 老签名 `createWsPreClose(150)` 仍然可用（向后兼容，测试与历史调用方都在用）。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { describe, it, expect } from '@jest/globals';
import {
  createWsPreClose,
  resolveWsCloseCode,
  WS_CLOSE_GOING_AWAY,
  DEFAULT_WS_SHUTDOWN_GRACE_MS
} from '../../../../framework/ingress/websocket/preclose.js';

/**
 * 造一个假的 websocketServer：记录 close/terminate 调用
 *
 * 真实的 wss 需要真端口与真握手，而这里要验的是"参数有没有被采纳"，
 * 假对象足够且能精确断言传出去的码。
 *
 * @param {number} [count] - 客户端数量
 * @returns {{wss: object, calls: object[]}} 假 wss 与调用记录
 */
function makeFakeWss(count = 1) {
  const calls = [];
  const clients = new Set();
  for (let i = 0; i < count; i++) {
    clients.add({
      close: (code, reason) => calls.push({ type: 'close', code, reason }),
      terminate: () => calls.push({ type: 'terminate' })
    });
  }
  return { wss: { clients, close() {} }, calls };
}

/** 跑一次 preClose 钩子（`this` 必须是含 websocketServer 的对象） */
function runPreClose(hook, wss) {
  let doneCalled = false;
  hook.call({ websocketServer: wss }, () => {
    doneCalled = true;
  });
  return doneCalled;
}

describe('resolveWsCloseCode', () => {
  it('未配置 → 1001（going away）', () => {
    expect(resolveWsCloseCode(undefined)).toBe(WS_CLOSE_GOING_AWAY);
    expect(resolveWsCloseCode(null)).toBe(WS_CLOSE_GOING_AWAY);
    expect(resolveWsCloseCode('')).toBe(WS_CLOSE_GOING_AWAY);
  });

  it('合法码原样采用（含应用自定义段 4000-4999）', () => {
    expect(resolveWsCloseCode(1000)).toBe(1000);
    expect(resolveWsCloseCode(4001)).toBe(4001);
    expect(resolveWsCloseCode(4999)).toBe(4999);
    expect(resolveWsCloseCode('4001')).toBe(4001); // 配置里写成字符串也认
  });

  it('🔴 协议禁发码（1005/1006/1015）→ 回退 1001', () => {
    for (const code of [1005, 1006, 1015]) {
      expect(resolveWsCloseCode(code)).toBe(WS_CLOSE_GOING_AWAY);
    }
  });

  it('越界 / 非整数 → 回退 1001', () => {
    expect(resolveWsCloseCode(999)).toBe(WS_CLOSE_GOING_AWAY);
    expect(resolveWsCloseCode(5000)).toBe(WS_CLOSE_GOING_AWAY);
    expect(resolveWsCloseCode(1001.5)).toBe(WS_CLOSE_GOING_AWAY);
    expect(resolveWsCloseCode('abc')).toBe(WS_CLOSE_GOING_AWAY);
  });
});

describe('createWsPreClose · 参数采纳', () => {
  it('配置的关闭码真的发给客户端（不是读了但没用）', () => {
    const { wss, calls } = makeFakeWss();
    runPreClose(createWsPreClose({ graceMs: 0, closeCode: 4001 }), wss);

    expect(calls.filter(c => c.type === 'close')).toHaveLength(1);
    expect(calls[0].code).toBe(4001);
    expect(calls[0].reason).toBe('server shutting down');
  });

  it('非法关闭码在出口处被兜住（客户端不会收到 1005）', () => {
    const { wss, calls } = makeFakeWss();
    runPreClose(createWsPreClose({ graceMs: 0, closeCode: 1005 }), wss);

    expect(calls[0].code).toBe(WS_CLOSE_GOING_AWAY);
  });

  it('老签名 createWsPreClose(150) 仍可用，关闭码取默认 1001', () => {
    const { wss, calls } = makeFakeWss();
    runPreClose(createWsPreClose(150), wss);

    expect(calls[0].code).toBe(WS_CLOSE_GOING_AWAY);
  });

  it('宽限期后强制 terminate 残留连接', async () => {
    const { wss, calls } = makeFakeWss();
    runPreClose(createWsPreClose({ graceMs: 10 }), wss);

    expect(calls.some(c => c.type === 'terminate')).toBe(false); // 宽限期内不动手
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(calls.some(c => c.type === 'terminate')).toBe(true);
  });

  it('没有客户端时立即 done（不排定时器）', () => {
    const { wss } = makeFakeWss(0);
    expect(runPreClose(createWsPreClose(), wss)).toBe(true);
  });
});

describe('保底值', () => {
  it('宽限期默认 1000ms，关闭码默认 1001', () => {
    expect(DEFAULT_WS_SHUTDOWN_GRACE_MS).toBe(1_000);
    expect(WS_CLOSE_GOING_AWAY).toBe(1001);
  });
});
