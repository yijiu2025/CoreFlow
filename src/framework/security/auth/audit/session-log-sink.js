/**
 * 会话事件 → `session_logs` 落库
 *
 * 背景：登录 / 登出 / 踢出的"会话流水"存在 `session_logs`（后台「登录日志」页读它），
 * 而 `framework/auth` 侧只把这三件事广播成**进程内事件**（`events.js`），
 * 由业务侧订阅后落库。本次排查发现：**全仓一个订阅者都没有**（`onAuthEvent` 零调用），
 * 于是事件广播等于空转 —— 控制台的登录日志从 2026-11-13 起就再没有任何新记录，
 * 而代码看起来"明明 emit 了"。
 *
 * 这里补上唯一的订阅方：把三条事件写进 `session_logs`，字段口径与历史数据一致
 * （`user_id` 是**当事人**：登录者是本人、被踢者是被踢的那个账号）。
 *
 * 为什么落在 framework 而不是 console：这三条事件是认证机制自己的产物，谁读它
 * （后台登录日志页 / 以后的风控看板）都无所谓，但"写下去"必须跟着机制走，
 * 否则换个前端就又丢一遍。
 *
 * 失败只 warn：审计是附属，写不进去不能把登录/登出卡住。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { onAuthEvent, AUTH_EVENTS } from './events.js';
import { getModel } from '../../../persistence/db/index.js';
import { createLogger } from '../../../support/log/index.js';

const log = createLogger('framework.auth.session-log');

/** 只注册一次（重复注册会让每条事件写两行） */
let registered = false;

/**
 * 写一条会话流水
 *
 * @param {object} entry 流水
 * @param {string} entry.event LOGIN / LOGOUT / KICK
 * @param {number|null} entry.userId 当事人（登录者 / 被踢者）
 * @param {string|null} [entry.appId] 应用
 * @param {string|null} [entry.ip] 客户端 IP
 * @param {string|null} [entry.userAgent] UA
 * @param {object|null} [entry.details] 附加信息
 * @returns {Promise<void>}
 */
async function writeSessionLog({ event, userId, appId = null, ip = null, userAgent = null, details = null }) {
  try {
    const SessionLog = getModel('SessionLog');
    if (!SessionLog) return;
    await SessionLog.create({
      user_id: userId != null ? Number(userId) : null,
      event,
      app_id: appId,
      ip,
      user_agent: userAgent,
      details,
      // 🔴 这一列是 `NOT NULL` 且**没有默认值**（见 session_logs DDL）：
      //    交给数据库会直接报 1364，而错误在 catch 里被吞掉，表现成"日志莫名不写"
      created_at: new Date()
    });
  } catch (err) {
    log.warn(`[SessionLog] ${event} 写入失败: ${err?.message}`);
  }
}

/**
 * 注册会话流水监听（幂等）
 *
 * 调用点：`04-auth` 初始化时。放在认证装配里而不是某个业务应用里，
 * 保证"只要认证起来了，会话流水就有人在记"。
 *
 * @returns {void}
 */
function registerSessionLogSink() {
  if (registered) return;
  registered = true;

  onAuthEvent(AUTH_EVENTS.SESSION_LOGIN, payload => {
    void writeSessionLog({
      event: 'LOGIN',
      userId: payload.userId,
      appId: payload.appId || null,
      ip: payload.ip || null,
      details: {
        sessionId: payload.sessionId || null,
        deviceType: payload.deviceType || null,
        deviceId: payload.deviceId || null,
        rememberMe: !!payload.rememberMe
      }
    });
  });

  onAuthEvent(AUTH_EVENTS.SESSION_LOGOUT, payload => {
    void writeSessionLog({
      event: 'LOGOUT',
      userId: payload.userId,
      appId: payload.appId || null,
      ip: payload.ip || null,
      details: { sessionId: payload.sessionId || null }
    });
  });

  onAuthEvent(AUTH_EVENTS.SESSION_KICK, payload => {
    // 踢出的 userId 是**被踢的人**：登录日志页按"这个账号发生了什么"展示
    void writeSessionLog({
      event: 'KICK',
      userId: payload.userId,
      details: { sessionId: payload.sessionId || null, reason: payload.reason || null, code: payload.code || null }
    });
  });
}

export { registerSessionLogSink };
