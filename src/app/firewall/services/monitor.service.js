/**
 * 防火墙监控编排服务
 *
 * 从 api/firewall/v1/monitor.js 下沉：
 * - WebSocket 客户端管理 + 日志/初始化广播
 * - 封禁/白名单（IP/指纹）的 isPermanent 决策 + Redis 写入 + 持久化同步
 *
 * 路由层只调本服务 + reply。
 *
 * @author yijiu
 * @since 2026-08-17
 */
import { getSummary, getRecentRecords, clearAll, setBroadcastHandler } from '../data/store.js';
import { addToBlacklist, removeFromBlacklist, addToWhitelist, removeFromWhitelist } from '../dao/dao.js';
import { setBlock, removeBlock } from '../engine/index.js';
import {
  setBlockFp,
  removeBlockFp,
  setWhitelistFp,
  removeWhitelistFp,
  setWhitelist,
  removeWhitelist as removeWhitelistRedis
} from '../dao/block-manager.js';

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
export function broadcastLog(record) {
  try {
    broadcast({ type: 'LOG', data: record });
  } catch (err) {
    console.error('🚨 [Monitor WS] 广播序列化失败:', err.message);
  }
}

/** 广播 INIT 消息（清空后重置 / 新客户端连接） */
export function broadcastInit() {
  broadcast({
    type: 'INIT',
    data: { summary: getSummary(), records: [] }
  });
}

/**
 * 注册新的 WebSocket 客户端：PING/PONG + 加入广播集合 + 首发 INIT
 * @param {object} client - WebSocket 客户端实例
 */
export function registerMonitorClient(client) {
  if (!client || typeof client.on !== 'function') {
    console.warn('⚠️  WebSocket 异常：未发现有效的 Socket 实例');
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
export function clearRecordsAndBroadcast() {
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
export async function addBlacklistEntry(redis, { type, value, duration, permanent }) {
  if (!['ip', 'user'].includes(type) || !value) {
    return { ok: false, message: '参数错误' };
  }

  const defenseState = addToBlacklist(type, value);

  // IP 类型同步写入 Redis 封禁
  if (type === 'ip') {
    const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });
    await setBlock(redis, value, {
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
export async function removeBlacklistEntry(redis, { type, value }) {
  const defenseState = removeFromBlacklist(type, value);
  if (type === 'ip') {
    await removeBlock(redis, value);
  }
  try {
    await redis?.del(`fw:lock:${value}`);
  } catch (e) {
    console.error('❌ [Monitor] 删除 Redis 封禁失败:', e);
  }
  return { message: '已移出黑名单', defenseState };
}

/**
 * 添加 IP 封禁
 * @returns {{ok:true, message:string} | {ok:false, message:string}}
 */
export async function addIpBlock(redis, { ip, duration, permanent, status }) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };

  const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });
  const blockStatus = status || 'BLOCKED';

  await setBlock(redis, ip, {
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
export async function removeIpBlock(redis, ip) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };
  await removeBlock(redis, ip);
  removeFromBlacklist('ip', ip);
  return { ok: true, message: '已解除封禁' };
}

/** 添加指纹封禁 */
export async function addFpBlock(redis, { fingerprint, duration, permanent, status }) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  const { isPermanent, expiresAt } = computeBlockMeta({ duration, permanent });
  const blockStatus = status || 'BLOCKED';

  await setBlockFp(redis, fingerprint, {
    status: blockStatus,
    source: 'manual',
    permanent: isPermanent,
    createdAt: Date.now(),
    expiresAt
  });
  return { ok: true, message: isPermanent ? '已永久封禁该指纹' : `已封禁指纹 ${duration || 86400} 秒` };
}

/** 移除指纹封禁 */
export async function removeFpBlock(redis, fingerprint) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  await removeBlockFp(redis, fingerprint);
  return { ok: true, message: '已解除指纹封禁' };
}

/** 添加 IP 白名单（默认 20 分钟） */
export async function addIpWhitelist(redis, { ip, duration }) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };
  const dur = duration || 1200;
  await setWhitelist(redis, ip, dur);
  addToWhitelist(ip, dur);
  return { ok: true, message: `已添加白名单 ${dur} 秒` };
}

/** 移除 IP 白名单 */
export async function removeIpWhitelist(redis, ip) {
  if (!ip) return { ok: false, message: '缺少 IP 参数' };
  await removeWhitelistRedis(redis, ip);
  removeFromWhitelist(ip);
  return { ok: true, message: '已移除白名单' };
}

/** 添加指纹白名单 */
export async function addFpWhitelist(redis, { fingerprint, duration }) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  const dur = duration || 1200;
  await setWhitelistFp(redis, fingerprint, dur);
  return { ok: true, message: `已添加指纹白名单 ${dur} 秒` };
}

/** 移除指纹白名单 */
export async function removeFpWhitelist(redis, fingerprint) {
  if (!fingerprint) return { ok: false, message: '缺少指纹参数' };
  await removeWhitelistFp(redis, fingerprint);
  return { ok: true, message: '已移除指纹白名单' };
}
