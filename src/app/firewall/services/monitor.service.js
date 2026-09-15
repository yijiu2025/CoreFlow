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
import { getSummary, getRecentRecords, clearAll, setBroadcastHandler } from '../data/store.js';
import { addToBlacklist, removeFromBlacklist, addToWhitelist, removeFromWhitelist } from '../dao/dao.js';
import { setBlock, removeBlock } from '../engine/index.js';
import {
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
import { createLogger } from '../../../framework/log/index.js';

const log = createLogger('app.firewall.services.monitor.service');

// ==================== WebSocket 客户端管理 ====================

/** 所有活跃的 WebSocket 客户端 */
const clients = new Set();

/**
 * 向所有活跃 WS 客户端广播一条消息
 * @param {object} msg - 消息对象
 */
function broadcast(msg) {
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

/** 广播单条日志记录 */
function broadcastLog(record) {
  try {
    broadcast({ type: 'LOG', data: record });
  } catch (err) {
    log.error('🚨 [Monitor WS] 广播序列化失败:', err);
  }
}

/** 广播 INIT 消息（清空后重置 / 新客户端连接） */
function broadcastInit() {
  broadcast({
    type: 'INIT',
    data: { summary: getSummary(), records: [] }
  });
}

/**
 * 注册新的 WebSocket 客户端：PING/PONG + 加入广播集合 + 首发 INIT
 * @param {object} client - WebSocket 客户端实例
 */
function registerMonitorClient(client) {
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
    client.send(
      JSON.stringify({
        type: 'INIT',
        data: {
          summary: { ...getSummary() },
          records: getRecentRecords()
        }
      })
    );
  }
}

/** 清空审计记录并广播 INIT 重置 */
function clearRecordsAndBroadcast() {
  clearAll();
  broadcastInit();
}

// 订阅 store 的广播钩子（日志写入时触发 broadcastLog）
setBroadcastHandler(broadcastLog);

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
