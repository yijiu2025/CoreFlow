/**
 * 防火墙数据访问对象 (DAO)
 * 负责安全配置、节点信息以及黑白名单的持久化读写与管理。
 */
import fs from 'fs';
import path from 'path';
import { FIREWALL_FILE, DEFAULT_SERVER_NODE, DEFAULT_SECURITY_SETTINGS, DEFAULT_IP_APIS } from '../config.js';

let serverNode = { ...DEFAULT_SERVER_NODE };
let securitySettings = { ...DEFAULT_SECURITY_SETTINGS };

// 1. 初始化与文件加载
/**
 * 初始化 DAO，从磁盘加载配置
 */
export function initDao() {
  try {
    if (!fs.existsSync(path.dirname(FIREWALL_FILE))) {
      fs.mkdirSync(path.dirname(FIREWALL_FILE), { recursive: true });
    }
    if (fs.existsSync(FIREWALL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(FIREWALL_FILE, 'utf-8'));
      if (raw.serverNode) serverNode = { ...serverNode, ...raw.serverNode };
      if (raw.securitySettings) securitySettings = deepMerge(securitySettings, raw.securitySettings);
      console.log('💾 [Firewall DAO] 已从文件恢复安全策略与节点数据');
    } else {
      refreshServerNodeAuto().catch(err => {
        console.error('[Firewall DAO] 节点初始化异常:', err.message);
      });
    }
  } catch (err) {
    console.error('🚨 [Firewall DAO] 加载持久化文件失败:', err.message);
  }
}

// --- 核心状态获取函数 ---
export const getServerNode = () => serverNode;
export const getSecuritySettings = () => securitySettings;
export const getIpApis = () => DEFAULT_IP_APIS;

// 3. 状态更新与持久化机制
let saveTimer = null;
/**
 * 触发数据保存（防抖执行）
 */
function triggerSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const tmpFile = `${FIREWALL_FILE}.tmp`;
      const dataToSave = { serverNode, securitySettings };
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, FIREWALL_FILE);
    } catch (err) {
      console.error('🚨 [Firewall DAO] 写入文件失败:', err.message);
    }
  }, 1000);
}

// 深度合并（防原型污染）
/**
 * 深度合并对象
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 更新节点元数据
 */
export function updateServerNodeMetadata(patch) {
  serverNode = { ...serverNode, ...patch, lastUpdate: new Date().toISOString() };
  triggerSave();
  return serverNode;
}

/**
 * 更新安全设置
 */
export function updateSecuritySettings(patch) {
  securitySettings = deepMerge(securitySettings, patch);
  triggerSave();
  return securitySettings;
}

// === 4. 动态名单管理机制 ===
/**
 * 将指定值添加到黑名单
 */
export function addToBlacklist(type, value) {
  if (type === 'ip' && !securitySettings.defense.manualBlacklistIps.includes(value)) {
    securitySettings.defense.manualBlacklistIps.push(value);
  } else if (type === 'user' && !securitySettings.defense.manualBlacklistUsers.includes(value)) {
    securitySettings.defense.manualBlacklistUsers.push(value);
  }
  triggerSave();
  return securitySettings.defense;
}

export function removeFromBlacklist(type, value) {
  if (type === 'ip') {
    securitySettings.defense.manualBlacklistIps = securitySettings.defense.manualBlacklistIps.filter(ip => ip !== value);
  } else if (type === 'user') {
    securitySettings.defense.manualBlacklistUsers = securitySettings.defense.manualBlacklistUsers.filter(u => u !== value);
  }
  triggerSave();
  return securitySettings.defense;
}

// === 5.1 白名单管理 ===
export function addToWhitelist(ip, durationSeconds) {
  if (!securitySettings.defense.manualWhitelistIps) {
    securitySettings.defense.manualWhitelistIps = [];
  }
  const existing = securitySettings.defense.manualWhitelistIps.find(e => e.ip === ip);
  if (existing) {
    existing.duration = durationSeconds;
    existing.addedAt = Date.now();
  } else {
    securitySettings.defense.manualWhitelistIps.push({ ip, duration: durationSeconds, addedAt: Date.now() });
  }
  triggerSave();
  return securitySettings.defense;
}

export function removeFromWhitelist(ip) {
  if (!securitySettings.defense.manualWhitelistIps) {
    securitySettings.defense.manualWhitelistIps = [];
  }
  securitySettings.defense.manualWhitelistIps = securitySettings.defense.manualWhitelistIps.filter(e => e.ip !== ip);
  triggerSave();
  return securitySettings.defense;
}

// === 6. 启动时同步手动名单到 Redis ===
const HASH_BLOCKED = 'fw:blocked:ips';
const HASH_WHITELIST = 'fw:whitelisted:ips';

/**
 * 启动时将 manualBlacklistIps 同步为永久封禁到 Redis
 * 同时迁移已有的 fw:block:* 键到 fw:blocked:ips hash 索引
 */
export async function syncManualBlacklistToRedis(redisClient) {
  if (!redisClient) return;

  const ips = securitySettings.defense.manualBlacklistIps || [];
  for (const ip of ips) {
    try {
      const meta = { status: 'BLOCKED', source: 'manual', permanent: true, createdAt: Date.now(), expiresAt: null };
      const value = JSON.stringify(meta);
      const existing = await redisClient.get(`fw:block:${ip}`);
      if (!existing) {
        await redisClient.set(`fw:block:${ip}`, value);
      }
      await redisClient.hset(HASH_BLOCKED, ip, value);
    } catch (err) {
      console.error(`[DAO] 同步手动封禁失败: ${ip}`, err.message);
    }
  }

  // 迁移已有的 fw:block:* 到 hash 索引
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', 'fw:block:*', 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        if (key === HASH_BLOCKED) continue;
        const ip = key.replace('fw:block:', '');
        try {
          const raw = await redisClient.get(key);
          if (!raw) continue;
          // 已经在 hash 中则跳过
          const inHash = await redisClient.hexists(HASH_BLOCKED, ip);
          if (inHash) continue;
          let meta;
          if (raw.startsWith('{')) {
            meta = JSON.parse(raw);
          } else {
            const ttl = await redisClient.ttl(key);
            meta = {
              status: raw === '1' ? 'BLOCKED' : raw,
              source: 'auto',
              permanent: ttl === -1,
              createdAt: Date.now(),
              expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null,
            };
          }
          await redisClient.hset(HASH_BLOCKED, ip, JSON.stringify(meta));
        } catch { /* skip malformed */ }
      }
    } while (cursor !== '0');
    console.log('[DAO] 已迁移现有封禁键到 hash 索引');
  } catch (err) {
    console.error('[DAO] 迁移封禁键失败:', err.message);
  }
}

/**
 * 启动时同步白名单到 Redis
 */
export async function syncManualWhitelistToRedis(redisClient) {
  if (!redisClient) return;

  const entries = securitySettings.defense.manualWhitelistIps || [];
  for (const entry of entries) {
    try {
      const ip = typeof entry === 'string' ? entry : entry.ip;
      const duration = typeof entry === 'string' ? 86400 : (entry.duration || 86400);
      const meta = { expiresAt: Date.now() + duration * 1000 };
      await redisClient.set(`fw:whitelist:${ip}`, '1', { EX: duration });
      await redisClient.hset(HASH_WHITELIST, ip, JSON.stringify(meta));
    } catch (err) {
      console.error(`[DAO] 同步白名单失败: ${entry.ip || entry}`, err.message);
    }
  }
}

// === 5. IP 解析逻辑（基于动态 API） ===
/**
 * 自动刷新服务器节点定位信息
 */
export async function refreshServerNodeAuto() {
  const activeApiId = securitySettings.activeIpApi || 'sohu';
  const apiConfig = DEFAULT_IP_APIS.find(a => a.id === activeApiId) || DEFAULT_IP_APIS[0];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(apiConfig.url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let raw;
    try {
      raw = apiConfig.isText ? await res.text() : await res.json();
    } catch (parseErr) {
      throw new Error(`返回数据格式错误: ${parseErr.message}`, { cause: parseErr });
    }
    const parsed = apiConfig.parse(raw);

    if (!parsed.ip) throw new Error('返回数据缺少 IP 字段');

    serverNode = {
      ...serverNode,
      ip: parsed.ip,
      country: parsed.country || serverNode.country,
      region: (parsed.region || '未知').replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, ''),
      city: parsed.city || serverNode.city,
      lat: parsed.lat || serverNode.lat,
      lon: parsed.lon || serverNode.lon,
      lastUpdate: new Date().toISOString()
    };
    triggerSave();
    console.log(`[Firewall DAO] 节点定位成功 (${apiConfig.name}): ${serverNode.ip} ${serverNode.country}/${serverNode.region}/${serverNode.city} [${serverNode.lat},${serverNode.lon}]`);
  } catch (err) {
    console.warn(`[Firewall DAO] ${apiConfig.name} 定位失败: ${err.message}`);
  }
}

// 在应用启动时调用
initDao();