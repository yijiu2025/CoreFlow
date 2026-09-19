/**
 * 防火墙监控编排服务
 *
 * 从 api/firewall/v1/monitor.js 下沉：
 * - WebSocket 客户端管理 + 日志/初始化广播
 * - 封禁/白名单（IP / 指纹 / 设备）的 isPermanent 决策 + Redis 写入 + 持久化同步
 *
 * 路由层只调本服务 + reply。
 *
 * @author yijiu
 * @since 2026-08-17
 * @since 2026-09-15 新增设备维度（跨 IP 生效）
 */
import {
  getSummaryAggregated,
  getRecentRecordsAggregated,
  clearAll,
  setBroadcastHandler
} from '../data/store.js';
import { addToBlacklist, removeFromBlacklist, addToWhitelist, removeFromWhitelist } from '../dao/dao.js';
import {
  setBlock,
  removeBlock,
  setBlockFp,
  removeBlockFp,
  setWhitelistFp,
  removeWhitelistFp,
  setBlockDevice,
  removeBlockDevice,
  setWhitelistDevice,
  removeWhitelistDevice
} from '../dao/block-manager.js';
import { removeKeys, rel } from '../util/redis.js';
import { publish, subscribe } from '../../../framework/redis/index.js';
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.services.monitor.service');

// ==================== WebSocket 客户端管理 ====================

/** 所有活跃的 WebSocket 客户端 */
const clients = new Set();

/** 跨实例广播 channel：本实例产生的消息经 Redis Pub/Sub 扇出到所有实例 */
const BROADCAST_CHANNEL = 'firewall:monitor';

/**
 * 向本实例所有活跃 WS 客户端投递一条消息（不做跨实例扇出）
 * @param {object} msg - 消息对象
 */
function deliverLocal(msg) {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    try {
      if (client && client.readyState === 1) {
        client.send(data, err => {
          if (err) clients.delete(client);
        });
      }
    } catch {
      clients.delete(client);
    }
  }
}

/**
 * 广播一条消息：本地直投 + Redis Pub/Sub 跨实例扇出
 *
 * 多实例部署时 WS 客户端集合是进程内的：只直投的话，A 实例产生的告警
 * 送不到连在 B 实例上的浏览器。publish 内部按 origin 过滤，发布者不会
 * 自发自收（否则本地会重复两条）。publish 自吞错误、永不 reject，
 * 未 await 也不会产生 unhandled rejection。
 *
 * @param {object} msg - 消息对象
 */
function broadcast(msg) {
  deliverLocal(msg);
  publish(BROADCAST_CHANNEL, msg);
}

/** 广播单条日志记录 */
function broadcastLog(record) {
  try {
    broadcast({ type: 'LOG', data: record });
  } catch (err) {
    log.error('🚨 [Monitor WS] 广播序列化失败:', err);
  }
}

/** 广播 INIT 消息（清空后重置 / 新客户端连接） */
async function broadcastInit() {
  broadcast({ type: 'INIT', data: await buildInitSnapshot() });
}

/**
 * 构造 INIT 快照（聚合视图：Redis 全量 + 本实例未刷写增量）
 *
 * 多实例下新客户端连到任一实例都应看到全局视图，而不是只有本实例的统计。
 *
 * @returns {Promise<{summary: object, records: object[]}>}
 */
async function buildInitSnapshot() {
  const [summary, records] = await Promise.all([getSummaryAggregated(), getRecentRecordsAggregated(100)]);
  return { summary, records };
}

/**
 * 注册新的 WebSocket 客户端：PING/PONG + 加入广播集合 + 首发 INIT
 *
 * 先绑定消息/close 处理器再加入广播集合，最后才异步取 INIT 快照：
 * 取快照期间客户端可能已断开（readyState 变化或已从集合移除），
 * 发送前必须复查，否则快照会发给一个死连接。
 *
 * @param {object} client - WebSocket 客户端实例
 */
async function registerMonitorClient(client) {
  if (!client || typeof client.on !== 'function') {
    log.warn('⚠️  WebSocket 异常：未发现有效的 Socket 实例');
    return;
  }

  const onData = data => {
    if (data.toString() === 'PING') client.send('PONG');
  };
  client.on('message', onData);
  clients.add(client);
  client.on('close', () => {
    clients.delete(client);
    client.removeListener('message', onData);
  });

  if (client.readyState === 1) {
    const snapshot = await buildInitSnapshot();
    if (clients.has(client) && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'INIT', data: snapshot }));
    }
  }
}

/** 清空审计记录（本地 + Redis 聚合）并广播 INIT 重置 */
async function clearRecordsAndBroadcast() {
  await clearAll();
  await broadcastInit();
}

// 订阅 store 的广播钩子（日志写入时触发 broadcastLog）
setBroadcastHandler(broadcastLog);

// 订阅跨实例扇出：其他实例产生的消息投给本实例的 WS 客户端
// （本实例自己的消息由 publish 的 origin 过滤丢弃，不会重复投递）
subscribe(BROADCAST_CHANNEL, payload => deliverLocal(payload));

// ==================== 封禁/白名单编排 ====================

/** 计算是否永久封禁 + 过期时间 */
function computeBlockMeta({ duration, permanent }) {
  const isPermanent = permanent === true || (!duration && permanent !== false);
  const expiresAt = isPermanent ? null : Date.now() + (duration || 86400) * 1000;
  return { isPermanent, expiresAt };
}

/**
 * 添加 IP 黑名单（持久化 + Redis 封禁）
 * @returns {{ok:true, message:string, defenseState:object} | {ok:false, message:string}}
 */
async function addBlacklistEntry({ type, value, duration, permanent }) {
  if (!['ip', 'user'].includes(type) || !value) {
    return { ok: false, message: '参数错误' };
  }

  const defenseState = addToBlacklist(type, value);

  // IP 类型同步写入 Redis 封禁
  if (type === 'ip') {
    const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });
    await setBlock(value, {
      status: 'BLOCKED',
      source: 'manual',
      permanent: isPermanent,
      createdAt: Date.now(),
      expiresAt
    });
  }

  return { ok: true, message: `已加入${permanent === false ? '临时' : '永久'}黑名单`, defenseState };
}

/**
 * 移除黑名单（持久化 + Redis 封禁 + lock 清理）
 */
async function removeBlacklistEntry({ type, value }) {
  const defenseState = removeFromBlacklist(type, value);
  if (type === 'ip') {
    await removeBlock(value);
  }
  await removeKeys([rel.accountLock(value)]);
  return { message: '已移出黑名单', defenseState };
}

/**
 * 添加 IP 封禁
 * @returns {{ok:true, message:string} | {ok:false, message:string}}
 */
async function addIpBlock({ ip, duration, permanent, status }) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };

  const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });
  const blockStatus = status || 'BLOCKED';

  await setBlock(ip, {
    status: blockStatus,
    source: 'manual',
    permanent: isPermanent,
    createdAt: Date.now(),
    expiresAt
  });
  addToBlacklist('ip', ip);

  return { ok: true, message: isPermanent ? '已永久封禁' : `已封禁 ${duration || 86400} 秒` };
}

/** 移除 IP 封禁 */
async function removeIpBlock(ip) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };
  await removeBlock(ip);
  removeFromBlacklist('ip', ip);
  return { ok: true, message: '已解除封禁' };
}

/** 添加指纹封禁 */
async function addFpBlock({ fingerprint, duration, permanent, status }) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });
  const blockStatus = status || 'BLOCKED';

  await setBlockFp(fingerprint, {
    status: blockStatus,
    source: 'manual',
    permanent: isPermanent,
    createdAt: Date.now(),
    expiresAt
  });
  return { ok: true, message: isPermanent ? '已永久封禁该指纹' : `已封禁指纹 ${duration || 86400} 秒` };
}

/** 移除指纹封禁 */
async function removeFpBlock(fingerprint) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  await removeBlockFp(fingerprint);
  return { ok: true, message: '已解除指纹封禁' };
}

/** 添加 IP 白名单（默认 20 分钟） */
async function addIpWhitelist({ ip, duration }) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };
  const dur = duration || 1200;
  // addToWhitelist 内部已写 Redis（writeWhitelist）+ 配置文件，不要再单独调 setWhitelist，
  // 否则同一条白名单会被写两遍（多一次 Lua 往返）。
  // 必须 await：漏掉 await 会让「写库失败」变成一个游离的 rejected promise（unhandled
  // rejection），而 HTTP 响应已经先回了「已添加白名单」—— 用户看到成功、实际没写进去。
  await addToWhitelist(ip, dur);
  return { ok: true, message: `已添加白名单 ${dur} 秒` };
}

/** 移除 IP 白名单 */
async function removeIpWhitelist(ip) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };
  // 同理：removeFromWhitelist 已同时清 Redis 与配置文件
  await removeFromWhitelist(ip);
  return { ok: true, message: '已移除白名单' };
}

/** 添加指纹白名单 */
async function addFpWhitelist({ fingerprint, duration }) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  const dur = duration || 1200;
  await setWhitelistFp(fingerprint, dur);
  return { ok: true, message: `已添加指纹白名单 ${dur} 秒` };
}

/** 移除指纹白名单 */
async function removeFpWhitelist(fingerprint) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  await removeWhitelistFp(fingerprint);
  return { ok: true, message: '已移除指纹白名单' };
}

// ==================== 设备维度（跨 IP） ====================

/**
 * 添加设备封禁
 *
 * 与 IP/指纹封禁的区别：设备 ID 与 IP 无关，因此这条封禁**换 IP 也仍然生效**。
 * 设备 ID 必须是 auth 结构化设备 ID（形如 WEB-DaBOSbNdSuc-8s4T），这里只做存在性校验，
 * 格式合法性由 auth 的校验流程保证（控制台展示的值本来就来自请求日志）。
 *
 * @param {object} params
 * @param {string} params.deviceId 设备 ID
 * @param {number} [params.duration] 封禁时长（秒）
 * @param {boolean} [params.permanent] 是否永久
 * @param {string} [params.status] 封禁状态（BLOCKED/SCANNER/CHALLENGE）
 * @returns {Promise<{ok:true, message:string} | {ok:false, message:string}>}
 */
async function addDeviceBlock({ deviceId, duration, permanent, status }) {
  if (!deviceId) return { ok: false, message: '缺少设备 ID 参数' };
  const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });

  await setBlockDevice(deviceId, {
    status: status || 'BLOCKED',
    source: 'manual',
    permanent: isPermanent,
    createdAt: Date.now(),
    expiresAt
  });
  return { ok: true, message: isPermanent ? '已永久封禁该设备' : `已封禁设备 ${duration || 86400} 秒` };
}

/** 移除设备封禁 */
async function removeDeviceBlock(deviceId) {
  if (!deviceId) return { ok: false, message: '缺少设备 ID 参数' };
  await removeBlockDevice(deviceId);
  return { ok: true, message: '已解除设备封禁' };
}

/** 添加设备白名单 */
async function addDeviceWhitelist({ deviceId, duration }) {
  if (!deviceId) return { ok: false, message: '缺少设备 ID 参数' };
  const dur = duration || 1200;
  await setWhitelistDevice(deviceId, dur);
  return { ok: true, message: `已添加设备白名单 ${dur} 秒` };
}

/** 移除设备白名单 */
async function removeDeviceWhitelist(deviceId) {
  if (!deviceId) return { ok: false, message: '缺少设备 ID 参数' };
  await removeWhitelistDevice(deviceId);
  return { ok: true, message: '已移除设备白名单' };
}

export {
  broadcastLog,
  broadcastInit,
  registerMonitorClient,
  clearRecordsAndBroadcast,
  addBlacklistEntry,
  removeBlacklistEntry,
  addIpBlock,
  removeIpBlock,
  addFpBlock,
  removeFpBlock,
  addIpWhitelist,
  removeIpWhitelist,
  addFpWhitelist,
  removeFpWhitelist,
  addDeviceBlock,
  removeDeviceBlock,
  addDeviceWhitelist,
  removeDeviceWhitelist
};
