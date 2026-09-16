/**
 * 防火墙数据访问对象 (DAO)
 * 负责安全配置、节点信息以及黑白名单的持久化读写与管理。
 *
 * 日志统一走框架日志出口（`framework/log`），不使用 console。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import fs from 'fs';
import path from 'path';
import { C } from '../../../utils/colors.js';
import { FIREWALL_FILE, DEFAULT_SERVER_NODE, DEFAULT_SECURITY_SETTINGS, DEFAULT_IP_APIS } from '../config/config.js';
import {
  HASH,
  writeWhitelist,
  removeWhitelist as removeWhitelistEntry,
  writeBlock,
  scanKeys,
  getRaw,
  ttlOf,
  addBlockIndexEntry,
  hasIndexField
} from '../util/redis.js';
import { createLogger } from '../../../framework/log/index.js';
import { registerSettingsReader } from '../interface/config-access.js';

const log = createLogger('app.firewall.dao.dao');

let serverNode = { ...DEFAULT_SERVER_NODE };
let securitySettings = { ...DEFAULT_SECURITY_SETTINGS };

// ============== 配置读取器注册（拆环，2026-09-16） ==============

/**
 * 把配置读取能力注册到 `interface/config-access.js`
 *
 * 这是 `util ↔ dao` 环断开的关键一步：`util/shared.js` 的 `getConfig()`
 * 改为调用接口层的 `readSecuritySettings()`，因此 util 不再需要 import 本模块。
 * 注册的是**函数引用**而非配置对象 —— 每次调用都读当前 `securitySettings` 绑定，
 * 所以 `updateSecuritySettings` 换掉对象后所有调用点立刻可见。
 */
registerSettingsReader(() => securitySettings);

// ============== 初始化与文件加载 ==============

/**
 * 初始化 DAO，从磁盘加载配置
 * 注意：此函数由 index.js 在插件注册时调用，不在模块顶层执行
 */
function initDao() {
  try {
    if (!fs.existsSync(path.dirname(FIREWALL_FILE))) {
      fs.mkdirSync(path.dirname(FIREWALL_FILE), { recursive: true });
    }
    if (fs.existsSync(FIREWALL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(FIREWALL_FILE, 'utf-8'));
      if (raw.serverNode) serverNode = { ...serverNode, ...raw.serverNode };
      if (raw.securitySettings) securitySettings = deepMerge(securitySettings, raw.securitySettings);
      log.info(`💾 [Firewall DAO] ${C.dim}已从文件恢复安全策略与节点数据${C.reset}`);
    } else {
      refreshServerNodeAuto().catch(err => {
        log.error(`❌ [Firewall DAO] ${C.red}节点初始化异常${C.reset}`, err);
      });
    }
  } catch (err) {
    log.error(`🚨 [Firewall DAO] ${C.red}加载持久化文件失败${C.reset}`, err);
  }
}

// --- 核心状态获取函数 ---
const getServerNode = () => serverNode;
const getSecuritySettings = () => securitySettings;
const getIpApis = () => DEFAULT_IP_APIS;

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
      log.error(`🚨 [Firewall DAO] ${C.red}写入文件失败${C.reset}`, err);
    }
  }, 1000);
}

/**
 * 清理保存定时器（应用关闭时调用，防止定时器在退出后执行）
 */
function cleanupSaveTimer() {
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
function updateServerNodeMetadata(patch) {
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
function updateSecuritySettings(patch) {
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
function addToBlacklist(type, value) {
  if (!value || typeof value !== 'string') return securitySettings.defense;

  if (type === 'ip' && !securitySettings.defense.manualBlacklistIps.includes(value)) {
    securitySettings.defense.manualBlacklistIps.push(value);
  } else if (type === 'user' && !securitySettings.defense.manualBlacklistUsers.includes(value)) {
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
function removeFromBlacklist(type, value) {
  if (type === 'ip') {
    securitySettings.defense.manualBlacklistIps = securitySettings.defense.manualBlacklistIps.filter(
      ip => ip !== value
    );
  } else if (type === 'user') {
    securitySettings.defense.manualBlacklistUsers = securitySettings.defense.manualBlacklistUsers.filter(
      u => u !== value
    );
  }
  triggerSave();
  return securitySettings.defense;
}

// ============== 白名单管理 ==============

/**
 * 将 IP 添加到白名单（内存 + 文件 + Redis）
 * @param {string} ip IP 地址
 * @param {number} durationSeconds 有效期（秒）
 * @returns {Promise<object>} 当前防御配置
 */
async function addToWhitelist(ip, durationSeconds) {
  if (!ip || typeof ip !== 'string') return securitySettings.defense;

  if (!securitySettings.defense.manualWhitelistIps) {
    securitySettings.defense.manualWhitelistIps = [];
  }
  const existing = securitySettings.defense.manualWhitelistIps.find(e => e.ip === ip);
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

  // 同步 Redis（key 布局与历史一致：fw:whitelist:{ip} + fw:whitelisted:ips）
  await writeWhitelist({ ip }, durationSeconds);

  triggerSave();
  return securitySettings.defense;
}

/**
 * 从白名单移除 IP（内存 + 文件 + Redis）
 * @param {string} ip IP 地址
 * @returns {Promise<object>} 当前防御配置
 */
async function removeFromWhitelist(ip) {
  if (!securitySettings.defense.manualWhitelistIps) {
    securitySettings.defense.manualWhitelistIps = [];
  }
  securitySettings.defense.manualWhitelistIps = securitySettings.defense.manualWhitelistIps.filter(e => e.ip !== ip);

  // 同步 Redis
  await removeWhitelistEntry({ ip });

  triggerSave();
  return securitySettings.defense;
}

// ============== 启动时同步手动名单到 Redis ==============

/**
 * 迁移单个旧格式封禁键到 hash 索引
 *
 * @param {string} keyRel 相对 key（如 `block:1.2.3.4`、`block:fp:abcdef`）
 * @returns {Promise<void>}
 */
async function migrateBlockKey(keyRel) {
  const isFp = keyRel.startsWith('block:fp:');
  const field = keyRel.replace(isFp ? 'block:fp:' : 'block:', '');
  const hashRel = isFp ? HASH.blockedFps : HASH.blockedIps;

  const raw = await getRaw(keyRel);
  if (!raw) return;
  if (await hasIndexField(hashRel, field)) return;

  // raw 是**原始字符串**：新格式为 JSON，旧格式为 '1'（封禁）或状态字面量。
  // 旧数据可能写入过半截/非法 JSON，JSON.parse 失败只能退回按状态字面量处理，
  // 绝不能让一条脏数据中断整个启动期迁移。
  let meta = null;
  if (typeof raw === 'string' && raw.trimStart().startsWith('{')) {
    try {
      meta = JSON.parse(raw);
    } catch (err) {
      log.warn(`⚠️  [Firewall DAO] 封禁键 ${keyRel} 的 JSON 非法，按旧格式迁移`, err);
    }
  }

  if (!meta) {
    const ttl = await ttlOf(keyRel);
    meta = {
      status: raw === '1' ? 'BLOCKED' : raw,
      source: 'auto',
      permanent: ttl === -1,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null
    };
  }
  await addBlockIndexEntry(field, JSON.stringify(meta), hashRel);
}

/**
 * 启动时将 manualBlacklistIps 同步为永久封禁到 Redis
 * 同时迁移已有的 fw:block:* 键到 fw:blocked:ips hash 索引
 *
 * 注意：手动黑名单的语义就是「永久」，这里直接写永久封禁（不带 TTL）。
 * 旧实现只在「键不存在」时才写，若该 IP 当时存在一条临时封禁，手动名单会被那条
 * 临时封禁顶掉，等 TTL 到期后手动拉黑随之失效。
 *
 * @returns {Promise<void>}
 */
async function syncManualBlacklistToRedis() {
  // 同步手动封禁列表
  const ips = securitySettings.defense.manualBlacklistIps || [];
  const now = Date.now();
  for (const ip of ips) {
    await writeBlock(
      { ip },
      {
        status: 'BLOCKED',
        source: 'manual',
        permanent: true,
        createdAt: now,
        expiresAt: null
      }
    );
  }

  // 扫描并迁移旧格式的 fw:block:* 键到 hash 索引
  const existing = await scanKeys('block:*');
  for (const keyRel of existing) {
    await migrateBlockKey(keyRel);
  }

  if (existing.length) {
    log.info(`💾 [Firewall DAO] ${C.dim}已迁移 ${existing.length} 个封禁键到 hash 索引${C.reset}`);
  }
}

/**
 * 启动时同步白名单到 Redis
 *
 * @returns {Promise<void>}
 */
async function syncManualWhitelistToRedis() {
  const entries = securitySettings.defense.manualWhitelistIps || [];
  for (const entry of entries) {
    const ip = typeof entry === 'string' ? entry : entry.ip;
    const duration = typeof entry === 'string' ? 86400 : entry.duration || 86400;
    await writeWhitelist({ ip }, duration);
  }
}

// ============== IP 解析逻辑（基于动态 API） ==============

/**
 * 自动刷新服务器节点定位信息
 */
async function refreshServerNodeAuto() {
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
      region: (parsed.region || '未知').replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, ''),
      city: parsed.city || serverNode.city,
      lat: parsed.lat || serverNode.lat,
      lon: parsed.lon || serverNode.lon,
      lastUpdate: new Date().toISOString()
    };
    triggerSave();
    log.info(
      `✅ [Firewall DAO] ${C.green}节点定位成功 (${apiConfig.name}): ` +
        `${serverNode.ip} ${serverNode.country}/${serverNode.region}/${serverNode.city} ` +
        `[${serverNode.lat},${serverNode.lon}]${C.reset}`
    );
  } catch (err) {
    log.warn(`⚠️ [Firewall DAO] ${C.yellow}${apiConfig.name} 定位失败${C.reset}`, err);
  }
}

export {
  initDao,
  getServerNode,
  getSecuritySettings,
  getIpApis,
  cleanupSaveTimer,
  updateServerNodeMetadata,
  updateSecuritySettings,
  addToBlacklist,
  removeFromBlacklist,
  addToWhitelist,
  removeFromWhitelist,
  syncManualBlacklistToRedis,
  syncManualWhitelistToRedis,
  refreshServerNodeAuto
};
