/**
 * 认证事件总线（framework/auth）
 *
 * 进程内轻量发布/订阅：会话生命周期（登录/登出/踢出）与封禁/二级认证等关键动作
 * 在此广播，业务侧（审计、WebSocket 推送、运营统计等）通过 onAuthEvent 订阅，
 * 无需侵入 session.js / session-kick.js 内部。
 *
 * 与 audit-logger.js 的分工：
 * - audit-logger 是**消费者**（DB + Redis 环形缓冲的审计落盘），已由 login.service
 *   等调用方在业务层挂接；
 * - 本模块是**机制**（解耦的广播管道），只负责把事件送达所有监听者，不落任何存储。
 *
 * 设计约束：
 * - 零外部依赖（不 import redis/db），import 本文件零副作用；
 * - emit 同步遍历监听者，单个监听者抛错只记 warn 不中断其它监听者、不阻断业务主流程；
 * - 事件 payload 里可含 raw sessionId（进程内传递，不经过网络/日志序列化），
 *   监听者不得把它写入对外响应体。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import { createLogger } from '../log/index.js';

const log = createLogger('framework.auth.events');

/** 事件名常量（单一出处，避免监听方手写字符串漂移） */
const AUTH_EVENTS = {
  SESSION_LOGIN: 'session:login',
  SESSION_LOGOUT: 'session:logout',
  SESSION_KICK: 'session:kick',
  ACCOUNT_BAN: 'account:ban',
  ACCOUNT_UNTIE: 'account:untie',
  SAFE_OPEN: 'safe:open',
  SAFE_CLOSE: 'safe:close'
};

/** 事件类型 → Set<listener>；仅进程内存活，无需持久化 */
const listeners = new Map();

/**
 * 订阅认证事件
 * @param {string} type 事件名（见 AUTH_EVENTS）
 * @param {(payload: object) => void|Promise<void>} listener 监听函数（async 函数的返回值被忽略）
 * @returns {() => void} 取消订阅函数（重复调用安全）
 */
function onAuthEvent(type, listener) {
  if (!type || typeof listener !== 'function') {
    throw new Error('onAuthEvent: type 与 listener 均为必填');
  }
  if (!listeners.has(type)) listeners.set(type, new Set());
  const set = listeners.get(type);
  set.add(listener);
  return () => set.delete(listener);
}

/**
 * 广播认证事件（内部使用，业务侧不要直接调用）
 *
 * 同步遍历所有监听者；async listener 的 Promise rejection 会被兜底 catch（fire-and-forget）。
 * 任何监听者抛错只记 warn，不向上传播 —— 事件消费失败不得影响登录/登出主流程。
 *
 * @param {string} type 事件名
 * @param {object} payload 事件数据
 */
function emitAuthEvent(type, payload = {}) {
  const set = listeners.get(type);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      const ret = listener(payload);
      // async 监听者的 rejection 单独兜底（此时 try/catch 已捕获不到）
      if (ret && typeof ret.catch === 'function') {
        ret.catch(err => log.warn('[Events] 异步监听者抛错: type=%s, err=%s', type, err?.message));
      }
    } catch (err) {
      log.warn('[Events] 监听者抛错: type=%s, err=%s', type, err?.message);
    }
  }
}

/**
 * 取消某事件类型的全部监听者（仅测试用；生产运行期不应动态清空订阅）
 * @param {string} [type] 事件名；缺省清空全部
 */
function removeAllAuthListeners(type) {
  if (type) listeners.delete(type);
  else listeners.clear();
}

export { AUTH_EVENTS, onAuthEvent, emitAuthEvent, removeAllAuthListeners };
