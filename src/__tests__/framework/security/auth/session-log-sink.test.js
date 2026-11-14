/**
 * 会话事件 → session_logs 落库（`framework/security/auth/audit/session-log-sink.js`）
 *
 * 这份测试盯的是一条**曾经静默失效**的链路：登录/登出/踢出只 emit 进程内事件，
 * 而全仓没有任何 `onAuthEvent` 订阅者 —— 事件广播空转，后台「登录日志」页从
 * 2026-11-13 起一条新记录都没有，代码看起来却完全正常（emit 写了、函数也调了）。
 *
 * 所以这里断言的不是"函数被调用"，而是**订阅之后 session_logs 真的写到了什么**：
 * 事件名、当事人（登录者 / 被踢者）、以及 `created_at` 必须带值
 * （该列 NOT NULL 且无默认值，交给数据库会 1364，然后被 catch 吞成"日志莫名不写"）。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect, jest } from '@jest/globals';

/** 捕获 SessionLog.create 的入参 */
const created = [];

jest.unstable_mockModule('../../../../framework/persistence/db/index.js', () => ({
  getModel: name => {
    if (name !== 'SessionLog') return null;
    return {
      create: async payload => {
        created.push(payload);
        return payload;
      }
    };
  },
  sequelize: {},
  Sequelize: {},
  getPoolStats: () => ({})
}));

const { registerSessionLogSink } = await import('../../../../framework/security/auth/audit/session-log-sink.js');
const { emitAuthEvent, AUTH_EVENTS } = await import('../../../../framework/security/auth/audit/events.js');

// 等 fire-and-forget 的写入落地
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('会话流水落库', () => {
  registerSessionLogSink();

  it('登录 → LOGIN 行，user_id 是登录者，created_at 必须自带', async () => {
    created.length = 0;
    emitAuthEvent(AUTH_EVENTS.SESSION_LOGIN, {
      userId: 7,
      appId: 'console',
      sessionId: 'sid-1',
      deviceType: 'browser',
      deviceId: 'dev-1',
      ip: '10.0.0.1',
      rememberMe: true
    });
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ event: 'LOGIN', user_id: 7, app_id: 'console', ip: '10.0.0.1' });
    expect(created[0].created_at).toBeInstanceOf(Date);
    expect(created[0].details).toMatchObject({ sessionId: 'sid-1', deviceId: 'dev-1', rememberMe: true });
  });

  it('踢出 → KICK 行，user_id 是**被踢的人**（不是操作者）', async () => {
    created.length = 0;
    emitAuthEvent(AUTH_EVENTS.SESSION_KICK, { userId: 42, sessionId: 'sid-2', reason: 'kicked', code: 'KICKED' });
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ event: 'KICK', user_id: 42 });
    expect(created[0].details).toMatchObject({ reason: 'kicked' });
  });

  it('登出 → LOGOUT 行', async () => {
    created.length = 0;
    emitAuthEvent(AUTH_EVENTS.SESSION_LOGOUT, { userId: 7, appId: 'console', sessionId: 'sid-3', ip: '10.0.0.2' });
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ event: 'LOGOUT', user_id: 7, app_id: 'console' });
  });

  it('重复注册不会写两行（幂等）', async () => {
    registerSessionLogSink();
    created.length = 0;
    emitAuthEvent(AUTH_EVENTS.SESSION_LOGOUT, { userId: 7, sessionId: 'sid-4' });
    await flush();
    expect(created).toHaveLength(1);
  });
});
