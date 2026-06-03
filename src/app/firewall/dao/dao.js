/**
 * 防火墙数据访问对象 (DAO)
 * 负责安全配置、节点信息以及黑白名单的持久化读写与管理。
 *
 * 系统级模块：日志使用 console（Pino 结构化日志用于请求生命周期）
 */
import fs from 'fs';
import path from 'path';
import { safeRedis } from '../../../redis/safe-redis.js';
import { C } from '../../../utils/colors.js';
import {
  FIREWALL_FILE,
  DEFAULT_SERVER_NODE,
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_IP_APIS
} from '../config/config.js';

let serverNode = { ...DEFAULT_SERVER_NODE };
let securitySettings = { ...DEFAULT_SECURITY_SETTINGS };

// ============== 初始化与文件加载 ==============

/**
 * 初始化 DAO，从磁盘加载配置
 * 注意：此函数由 index.js 在插件注册时调用，不在模块顶层执行
 */
export function initDao() {
  try {
    if (!fs.existsSync(path.dirname(FIREWALL_FILE))) {
      fs.mkdirSync(path.dirname(FIREWALL_FILE), { recursive: true });
    }
    if (fs.existsSync(FIREWALL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(FIREWALL_FILE, 'utf-8'));
      if (raw.serverNode) serverNode = { ...serverNode, ...raw.serverNode };
      if (raw.securitySettings)
        securitySettings = deepMerge(securitySettings, raw.securitySettings);
      console.log(
        `💾 [Firewall DAO] ${C.dim}已从文件恢复安全策略与节点数据${C.reset}`
      );
    } else {
      refreshServerNodeAuto().catch((err) => {
        console.error(
          `❌ [Firewall DAO] ${C.red}节点初始化异常: ${err.message}${C.reset}`
        );
      });
    }
  } catch (err) {
    console.error(
      `🚨 [Firewall DAO] ${C.red}加载持久化文件失败: ${err.message}${C.reset}`
    );
  }
}

// --- 核心状态获取函数 ---
export const getServerNode = () => serverNode;
export const getSecuritySettings = () => securitySettings;
export const getIpApis = () => DEFAULT_IP_APIS;

// ============== 状态更新与持久化机制 ==============

let saveTimer = null;

/**
 * 触发数据保存（防抖执行，1 秒内多次修改只写一次文件）
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
      console.error(
        `🚨 [Firewall DAO] ${C.red}写入文件失败: ${err.message}${C.reset}`
      );
    }
  }, 1000);
}

/**
 * 清理保存定时器（应用关闭时调用，防止定时器在退出后执行）
 */
export function cleanupSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

// ============== 深度合并（防原型污染） ==============

/**
 * 深度合并对象，跳过 __proto__/constructor/prototype 键
 * @param {object} target 目标对象
 * @param {object} source 源对象
 * @returns {object} 合并后的新对象
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ============== 配置更新 ==============

/**
 * 更新节点元数据
 * @param {object} patch 要合并的字段
 * @returns {object} 更新后的节点信息
 */
export function updateServerNodeMetadata(patch) {
  serverNode = {
    ...serverNode,
    ...patch,
    lastUpdate: new Date().toISOString()
  };
  triggerSave();
  return serverNode;
}

/**
 * 更新安全设置
 * @param {object} patch 要深度合并的配置
 * @returns {object} 更新后的安全设置
 */
export function updateSecuritySettings(patch) {
  securitySettings = deepMerge(securitySettings, patch);
  triggerSave();
  return securitySettings;
}

// ============== 黑名单管理 ==============

/**
 * 将指定值添加到黑名单（内存 + 文件）
 * @param {'ip'|'user'} type 类型
 * @param {string} value 值
 * @returns {object} 当前防御配置
 */
export function addToBlacklist(type, value) {
  if (!value || typeof value !== 'string') return securitySettings.defense;

  if (
    type === 'ip' &&
    !securitySettings.defense.manualBlacklistIps.includes(value)
  ) {
    securitySettings.defense.manualBlacklistIps.push(value);
  } else if (
    type === 'user' &&
    !securitySettings.defense.manualBlacklistUsers.includes(value)
  ) {
    securitySettings.defense.manualBlacklistUsers.push(value);
  }
  triggerSave();
  return securitySettings.defense;
}

/**
 * 从黑名单移除指定值
 * @param {'ip'|'user'} type 类型
 * @param {string} value 值
 * @returns {object} 当前防御配置
 */
export function removeFromBlacklist(type, value) {
  if (type === 'ip') {
    securitySettings.defense.manualBlacklistIps =
      securitySettings.defense.manualBlacklistIps.filter((ip) => ip !== value);
  } else if (type === 'user') {
    securitySettings.defense.manualBlacklistUsers =
      securitySettings.defense.manualBlacklistUsers.filter((u) => u !== value);
  }
  triggerSave();
  return securitySettings.defense;
}

// ============== 白名单管理 ==============

/**
 * 将 IP 添加到白名单（内存 + 文件 + Redis）
 * @param {string} ip IP 地址
 * @param {number} durationSeconds 有效期（秒）
 * @param {object|null} redisClient Redis 客户端（可选）
 * @returns {object} 当前防御配置
 */
export async function addToWhitelist(ip, durationSeconds, redisClient = null) {
  if (!ip || typeof ip !== 'string') return securitySettings.defense;

  if (!securitySettings.defense.manualWhitelistIps) {
    securitySettings.defense.manualWhitelistIps = [];
  }
  const existing = securitySettings.defense.manualWhitelistIps.find(
    (e) => e.ip === ip
  );
  if (existing) {
    existing.duration = durationSeconds;
    existing.addedAt = Date.now();
  } else {
    securitySettings.defense.manualWhitelistIps.push({
      ip,
      duration: durationSeconds,
      addedAt: Date.now()
    });
  }

  // 同步 Redis
  if (redisClient) {
    const meta = { expiresAt: Date.now() + durationSeconds * 1000 };
    await safeRedis(redisClient, (r) =>
      r.set(`fw:whitelist:${ip}`, '1', { EX: durationSeconds })
    );
    await safeRedis(redisClient, (r) =>
      r.hset(HASH_WHITELIST, ip, JSON.stringify(meta))
    );
  }

  triggerSave();
  return securitySettings.defense;
}

/**
 * 从白名单移除 IP（内存 + 文件 + Redis）
 * @param {string} ip IP 地址
 * @param {object|null} redisClient Redis 客户端（可选）
 * @returns {object} 当前防御配置
 */
export async function removeFromWhitelist(ip, redisClient = null) {
  if (!securitySettings.defense.manualWhitelistIps) {
    securitySettings.defense.manualWhitelistIps = [];
  }
  securitySettings.defense.manualWhitelistIps =
    securitySettings.defense.manualWhitelistIps.filter((e) => e.ip !== ip);

  // 同步 Redis
  if (redisClient) {
    await safeRedis(redisClient, (r) => r.del(`fw:whitelist:${ip}`));
    await safeRedis(redisClient, (r) => r.hdel(HASH_WHITELIST, ip));
  }

  triggerSave();
  return securitySettings.defense;
}

// ============== 启动时同步手动名单到 Redis ==============

const HASH_BLOCKED = 'fw:blocked:ips';
const HASH_WHITELIST = 'fw:whitelisted:ips';

/**
 * 迁移单个旧格式封禁键到 hash 索引
 * @param {object} redisClient Redis 客户端
 * @param {string} key 旧格式键名
 */
async function migrateBlockKey(redisClient, key) {
  if (key === HASH_BLOCKED) return;
  const ip = key.replace('fw:block:', '');
  const raw = await safeRedis(redisClient, (r) => r.get(key));
  if (!raw) return;

  const inHash = await safeRedis(redisClient, (r) =>
    r.hexists(HASH_BLOCKED, ip)
  );
  if (inHash) return;

  let meta;
  if (raw.startsWith('{')) {
    meta = JSON.parse(raw);
  } else {
    const ttl = await safeRedis(redisClient, (r) => r.ttl(key), -1);
    meta = {
      status: raw === '1' ? 'BLOCKED' : raw,
      source: 'auto',
      permanent: ttl === -1,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null
    };
  }
  await safeRedis(redisClient, (r) =>
    r.hset(HASH_BLOCKED, ip, JSON.stringify(meta))
  );
}

/**
 * 启动时将 manualBlacklistIps 同步为永久封禁到 Redis
 * 同时迁移已有的 fw:block:* 键到 fw:blocked:ips hash 索引
 * @param {object} redisClient Redis 客户端
 */
export async function syncManualBlacklistToRedis(redisClient) {
  if (!redisClient) return;

  // 同步手动封禁列表
  const ips = securitySettings.defense.manualBlacklistIps || [];
  for (const ip of ips) {
    const meta = {
      status: 'BLOCKED',
      source: 'manual',
      permanent: true,
      createdAt: Date.now(),
      expiresAt: null
    };
    const value = JSON.stringify(meta);
    const existing = await safeRedis(redisClient, (r) =>
      r.get(`fw:block:${ip}`)
    );
    if (!existing) {
      await safeRedis(redisClient, (r) => r.set(`fw:block:${ip}`, value));
    }
    await safeRedis(redisClient, (r) => r.hset(HASH_BLOCKED, ip, value));
  }

  // 扫描并迁移旧格式的 fw:block:* 键到 hash 索引
  let cursor = '0';
  do {
    const result = await safeRedis(redisClient, (r) =>
      r.scan(cursor, { MATCH: 'fw:block:*', COUNT: 100 })
    );
    if (!result) break;
    cursor = result.cursor;
    for (const key of result.keys || []) {
      await migrateBlockKey(redisClient, key);
    }
  } while (cursor !== '0');

  console.log(
    `💾 [Firewall DAO] ${C.dim}已迁移现有封禁键到 hash 索引${C.reset}`
  );
}

/**
 * 启动时同步白名单到 Redis
 * @param {object} redisClient Redis 客户端
 */
export async function syncManualWhitelistToRedis(redisClient) {
  if (!redisClient) return;

  const entries = securitySettings.defense.manualWhitelistIps || [];
  for (const entry of entries) {
    const ip = typeof entry === 'string' ? entry : entry.ip;
    const duration =
      typeof entry === 'string' ? 86400 : entry.duration || 86400;
    const meta = { expiresAt: Date.now() + duration * 1000 };
    await safeRedis(redisClient, (r) =>
      r.set(`fw:whitelist:${ip}`, '1', { EX: duration })
    );
    await safeRedis(redisClient, (r) =>
      r.hset(HASH_WHITELIST, ip, JSON.stringify(meta))
    );
  }
}

// ============== IP 解析逻辑（基于动态 API） ==============

/**
 * 自动刷新服务器节点定位信息
 */
export async function refreshServerNodeAuto() {
  const activeApiId = securitySettings.activeIpApi || 'sohu';
  const apiConfig =
    DEFAULT_IP_APIS.find((a) => a.id === activeApiId) || DEFAULT_IP_APIS[0];

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
      throw new Error(`返回数据格式错误: ${parseErr.message}`, {
        cause: parseErr
      });
    }
    const parsed = apiConfig.parse(raw);

    if (!parsed.ip) throw new Error('返回数据缺少 IP 字段');

    serverNode = {
      ...serverNode,
      ip: parsed.ip,
      country: parsed.country || serverNode.country,
      region: (parsed.region || '未知').replace(
        /省|市|自治区|壮族|回族|维吾尔|特别行政区/g,
        ''
      ),
      city: parsed.city || serverNode.city,
      lat: parsed.lat || serverNode.lat,
      lon: parsed.lon || serverNode.lon,
      lastUpdate: new Date().toISOString()
    };
    triggerSave();
    console.log(
      `✅ [Firewall DAO] ${C.green}节点定位成功 (${apiConfig.name}): ` +
        `${serverNode.ip} ${serverNode.country}/${serverNode.region}/${serverNode.city} ` +
        `[${serverNode.lat},${serverNode.lon}]${C.reset}`
    );
  } catch (err) {
    console.warn(
      `⚠️ [Firewall DAO] ${C.yellow}${apiConfig.name} 定位失败: ${err.message}${C.reset}`
    );
  }
}
