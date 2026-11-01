/**
 * 认证事件总线（events.js）行为测试
 *
 * 覆盖：订阅/广播/退订、payload 透传、监听者抛错不阻断其它监听者与调用方、
 * async 监听者的 rejection 兜底、批量清理。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { AUTH_EVENTS, onAuthEvent, emitAuthEvent, removeAllAuthListeners } from '../../../framework/auth/events.js';

const TYPE = 'test:event';

beforeEach(() => {
  removeAllAuthListeners();
});

describe('onAuthEvent / emitAuthEvent', () => {
  test('监听者收到广播的 payload', () => {
    const seen = [];
    onAuthEvent(TYPE, p => seen.push(p));
    emitAuthEvent(TYPE, { a: 1 });
    expect(seen).toEqual([{ a: 1 }]);
  });

  test('同类型多个监听者都被调用', () => {
    const calls = [];
    onAuthEvent(TYPE, () => calls.push('A'));
    onAuthEvent(TYPE, () => calls.push('B'));
    emitAuthEvent(TYPE, {});
    expect(calls.sort()).toEqual(['A', 'B']);
  });

  test('无监听者时广播为安全 no-op', () => {
    expect(() => emitAuthEvent(TYPE, {})).not.toThrow();
    expect(() => emitAuthEvent(AUTH_EVENTS.SESSION_LOGIN, {})).not.toThrow();
  });

  test('退订函数生效，重复调用安全', () => {
    const seen = [];
    const off = onAuthEvent(TYPE, p => seen.push(p));
    off();
    off(); // 重复调用不抛错
    emitAuthEvent(TYPE, { a: 1 });
    expect(seen).toEqual([]);
  });

  test('参数校验：listener 非函数抛错', () => {
    expect(() => onAuthEvent(TYPE, null)).toThrow();
    expect(() => onAuthEvent('', () => {})).toThrow();
  });
});

describe('容错：监听者异常不阻断业务', () => {
  test('同步抛错的监听者不影响其它监听者，emit 不向上抛', () => {
    const calls = [];
    onAuthEvent(TYPE, () => {
      throw new Error('listener boom');
    });
    onAuthEvent(TYPE, () => calls.push('after-bad'));
    expect(() => emitAuthEvent(TYPE, {})).not.toThrow();
    expect(calls).toEqual(['after-bad']);
  });

  test('async 监听者的 rejection 被兜底，不影响其它监听者', async () => {
    const calls = [];
    onAuthEvent(TYPE, async () => {
      throw new Error('async boom');
    });
    onAuthEvent(TYPE, () => calls.push('ok'));
    expect(() => emitAuthEvent(TYPE, {})).not.toThrow();
    // emit 是同步分发的，给异步 rejection 一拍落定的时间
    await new Promise(r => setImmediate(r));
    expect(calls).toEqual(['ok']);
  });
});

describe('removeAllAuthListeners', () => {
  test('指定类型清空，其它类型保留', () => {
    const a = [];
    const b = [];
    onAuthEvent(TYPE, p => a.push(p));
    onAuthEvent('other:event', p => b.push(p));
    removeAllAuthListeners(TYPE);
    emitAuthEvent(TYPE, {});
    emitAuthEvent('other:event', {});
    expect(a).toEqual([]);
    expect(b).toEqual([{}]);
  });

  test('缺省清空全部', () => {
    const a = [];
    onAuthEvent(TYPE, p => a.push(p));
    onAuthEvent('other:event', p => a.push(p));
    removeAllAuthListeners();
    emitAuthEvent(TYPE, {});
    emitAuthEvent('other:event', {});
    expect(a).toEqual([]);
  });
});
