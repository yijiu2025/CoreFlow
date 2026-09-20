/**
 * 跨实例 Pub/Sub 消息总线
 *
 * === 解决什么问题 ===
 * 防火墙监控的 WS 客户端集合是**进程内**的：多实例部署时，A 实例产生的封禁
 * 告警送不到连在 B 实例上的浏览器。本模块用 Redis Pub/Sub 把「本实例产生的
 * 消息」扇出到所有实例，各实例再把远端消息投给自己的本地客户端。
 *
 * === 关键设计（每条都对应一个真实踩过的坑） ===
 * ① **origin 过滤**：Redis 会把消息投给包括发布者在内的所有订阅者。不按
 *    实例 ID 丢弃自己发的消息，本地就会「直投 + 自发自收」重复两条。
 * ② **同 channel 只订阅一次**：node-redis 对同一 channel 用不同回调 subscribe
 *    两次 → 每条消息投两次（ws-fanout 关卡首跑就抓到过）。handler 收敛进
 *    Map<channel, Set>，Redis 层的订阅由 `subscribed` Set 去重。
 * ③ **订阅连接独占**：进入订阅模式的连接不能再执行普通命令，必须
 *    `main.duplicate()` 派生独立连接；且必须显式 `quit()`，否则进程无法自然退出。
 * ④ **重连自动恢复**：node-redis 重连后会自动恢复既有订阅（实测确认），
 *    因此**不做** 'ready' 兜底重订阅 —— 那个兜底反而会造成二次订阅（重复投递）。
 * ⑤ **生命周期**：应用关闭时必须 `closePubSub()`，否则派生连接挂着进程退不出去。
 *
 * === 降级 ===
 * Redis 未配置 / 主连接未就绪时：publish 返回 `{ok:false}`，subscribe 的
 * handler 照常登记（等连接就绪后自动生效），但不产生任何网络调用。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../log/index.js';

// plugin.js 的 globalRedis 是 let 变量的 ESM live binding：import 拿到的是
// 「当前值」的引用视图，连接建立后这里能看到。不能在模块顶层解构。
import { globalRedis } from './plugin.js';

const log = createLogger('framework.redis.pubsub');

/** 实例身份：跨进程唯一。origin 过滤与调试日志都靠它 */
const INSTANCE_ID = `${os.hostname()}#${process.pid}#${randomUUID().slice(0, 8)}`;

/**
 * channel → Set<handler>
 * 同一个 channel 可以有多个本地订阅者；Redis 层每 channel 只订一次
 */
const handlers = new Map();

/** 已向 Redis 订阅过的 channel（跨 handler 去重） */
const subscribed = new Set();

/** 派生出来的订阅连接（独占，不能跑普通命令） */
let subscriber = null;

function getInstanceId() {
  return INSTANCE_ID;
}

/** 订阅连接是否就绪（主连接就绪与否不影响本判断） */
function isPubSubReady() {
  return Boolean(subscriber && subscriber.isReady);
}

/**
 * 统一的消息分发：origin 过滤 + 派发给该 channel 的所有本地 handler
 *
 * 注意签名是 node-redis 的 (channel, message)。
 *
 * @param {string} channel
 * @param {string} raw JSON 序列化的 { __origin, payload }
 */
function dispatch(channel, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // 非 JSON 消息（可能来自别的写入方），静默忽略
  }
  if (!msg || typeof msg !== 'object') return;
  if (msg.__origin === INSTANCE_ID) return; // 自己发的：本地已直投，丢弃

  const set = handlers.get(channel);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(msg.payload);
    } catch (err) {
      log.warn(`⚠️  [PubSub] handler 执行失败（channel=${channel}）：${err.message}`);
    }
  }
}

/**
 * 确保订阅连接存在（惰性创建）
 *
 * 主连接不存在（Redis 未配置 / 尚未连接）时直接返回 —— 下次 subscribe/publish
 * 会再试。绝不抛错：Pub/Sub 是增强能力，不能因为它拖垮调用方。
 */
function ensureSubscriber() {
  if (subscriber) return subscriber;
  if (!globalRedis || !globalRedis.isReady) return null;

  const sub = globalRedis.duplicate();
  sub.on('error', err => {
    // 订阅连接断开由 node-redis 自动重连并恢复订阅（实测确认），这里只留痕
    log.warn(`⚠️  [PubSub] 订阅连接异常：${err.message}`);
  });
  subscriber = sub;
  return subscriber;
}

/**
 * 注册 channel 处理器（幂等）
 *
 * 同一 channel 多次注册只向 Redis 订阅一次；主连接未就绪时只登记，
 * 后续任意一次 subscribe/publish 调用会补建连接并补订阅。
 *
 * @param {string} channel
 * @param {(payload: any) => void} handler
 */
function subscribe(channel, handler) {
  if (typeof channel !== 'string' || !channel || typeof handler !== 'function') {
    throw new TypeError('subscribe(channel, handler): channel 必须非空字符串，handler 必须是函数');
  }

  let set = handlers.get(channel);
  if (!set) {
    set = new Set();
    handlers.set(channel, set);
  }
  set.add(handler);

  if (subscribed.has(channel)) return;

  const sub = ensureSubscriber();
  if (!sub) return; // 主连接未就绪：只登记，等下次调用补订阅

  subscribed.add(channel);
  // node-redis v5：连接未就绪时命令会自动缓冲，无需等 ready
  sub
    .subscribe(channel, (channel2, raw) => dispatch(channel2, raw))
    .catch(err => {
      log.warn(`⚠️  [PubSub] 订阅 channel=${channel} 失败：${err.message}`);
      subscribed.delete(channel); // 允许下次重试
    });
}

/**
 * 发布消息到 channel（fire-and-forget 语义，结果只通过返回值表达）
 *
 * 本地投递由调用方自行完成（直投）；本函数只负责远端扇出。
 * 自己发的消息会被 dispatch 按 origin 丢弃，所以发布者不会自发自收。
 *
 * @param {string} channel
 * @param {object} msg 消息体（会被 JSON 序列化）
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function publish(channel, msg) {
  if (typeof channel !== 'string' || !channel) {
    return { ok: false, reason: 'channel 必须是非空字符串' };
  }
  const main = globalRedis;
  if (!main || !main.isReady) {
    return { ok: false, reason: '主连接未就绪' };
  }
  try {
    await main.publish(channel, JSON.stringify({ __origin: INSTANCE_ID, payload: msg }));
    return { ok: true };
  } catch (err) {
    log.warn(`⚠️  [PubSub] 发布失败（channel=${channel}）：${err.message}`);
    return { ok: false, reason: err.message };
  }
}

/**
 * 关闭订阅连接并清空全部登记（应用关闭时调用）
 *
 * 必须显式关闭：派生的订阅连接不 quit，进程无法自然退出。
 *
 * @returns {Promise<void>}
 */
async function closePubSub() {
  const sub = subscriber;
  subscriber = null;
  subscribed.clear();
  handlers.clear();
  if (!sub) return;
  try {
    await sub.quit();
  } catch {
    try {
      sub.disconnect();
    } catch {
      /* 已断开 */
    }
  }
}

/**
 * 重置模块状态（仅供测试）：不关连接，只丢弃引用，让下一个 subscribe 重建
 */
function resetPubSub() {
  subscriber = null;
  subscribed.clear();
  handlers.clear();
}

export { getInstanceId, isPubSubReady, subscribe, publish, closePubSub, resetPubSub };
