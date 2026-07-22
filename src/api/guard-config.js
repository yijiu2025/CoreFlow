/**
 * 守卫配置存储
 * 三级守卫配置的注册/查询/持久化，使用数据库存储替代 JSON 文件
 * 启动时 DB → 内存，运行时读内存，配置变更时异步原子写入 DB
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

/* eslint-disable no-console */

import { C } from '../utils/colors.js';
import GuardConfigDao from '../app/guard/dao/guard-config.dao.js';

/**
 * 核心配置存储 - 仅存放与 API 加载、权限策略相关的配置
 * 启动时从 DB 加载，运行时全内存操作，变更后异步写回 DB
 */
let configs = {};
let currentVersion = 0;

/**
 * 从数据库加载持久化配置到内存
 * 在 runEngine 之前调用，确保注册阶段可以读取已持久化的 enabled/allowIps 等
 *
 * @returns {Promise<void>}
 */
export async function loadGuardConfig() {
  try {
    const data = await GuardConfigDao.loadFromDB();
    configs = data.configs;
    currentVersion = data.version;
    if (currentVersion > 0) {
      console.log(`💾 [Guard Config] ${C.dim}已加载持久化策略数据 (version=${currentVersion})${C.reset}`);
    }
  } catch (err) {
    // 首次运行或无数据时使用空配置，不阻止启动
    configs = {};
    currentVersion = 0;
    console.warn(`⚠️ [Guard Config] ${C.yellow}数据库加载失败，使用空配置: ${err.message}${C.reset}`);
  }
}

/**
 * 获取指定层级的配置
 */
export function getGuardConfig(systemKey, groupKey = null, apiKey = null) {
  const system = configs[systemKey];
  if (!system) return null;

  if (!groupKey) return system;

  const group = system.groups ? system.groups[groupKey] : null;
  if (!group) return null;

  if (!apiKey) return group;

  return group.apis ? group.apis[apiKey] : null;
}

/**
 * 热更新配置 (支持 3 层更新)
 */
export function setGuardConfig(systemKey, patch, groupKey = null, apiKey = null) {
  if (!configs[systemKey]) return null;

  const updatePatch = { ...patch, updatedAt: new Date().toISOString() };

  if (apiKey && groupKey) {
    Object.assign(configs[systemKey].groups[groupKey].apis[apiKey], updatePatch);
  } else if (groupKey) {
    Object.assign(configs[systemKey].groups[groupKey], updatePatch);
  } else {
    Object.assign(configs[systemKey], updatePatch);
  }

  triggerSave();
  return configs[systemKey];
}

/**
 * 异步保存配置到数据库 (防抖处理)
 */
let saveTimer = null;
function triggerSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      currentVersion = await GuardConfigDao.saveToDB(configs, currentVersion);
    } catch (err) {
      console.error(`❌ [Guard Config] ${C.red}异步写入失败: ${err.message}${C.reset}`);
    }
  }, 1000);
}

/**
 * 1层注册：系统级元数据 (Level 1)
 */
export function registerSystemMetadata(systemKey, metadata) {
  if (!configs[systemKey]) {
    configs[systemKey] = { groups: {} };
  }

  const persisted = (currentVersion > 0 && configs[systemKey]) || {};

  Object.assign(configs[systemKey], {
    id: systemKey,
    name: metadata.alias || metadata.name || systemKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: persisted.enabled ?? metadata.enabled ?? true,
    requireLogin: persisted.requireLogin ?? metadata.requireLogin ?? false,
    allowIps: persisted.allowIps || metadata.allowIps || [],
    allowRoles: persisted.allowRoles || metadata.allowRoles || [],
    updatedAt: new Date().toISOString()
  });
}

/**
 * 2层注册：模块/文件级元数据 (Level 2)
 */
export function registerGroupMetadata(systemKey, groupKey, metadata) {
  if (!configs[systemKey]) {
    configs[systemKey] = {
      id: systemKey,
      name: systemKey,
      enabled: true,
      groups: {}
    };
  }
  if (!configs[systemKey].groups[groupKey]) {
    configs[systemKey].groups[groupKey] = { apis: {} };
  }

  const persisted = (currentVersion > 0 && configs[systemKey]?.groups?.[groupKey]) || {};

  Object.assign(configs[systemKey].groups[groupKey], {
    id: groupKey,
    name: metadata.alias || metadata.name || groupKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: persisted.enabled ?? metadata.enabled ?? true,
    requireLogin: persisted.requireLogin ?? metadata.requireLogin ?? false,
    allowIps: persisted.allowIps || metadata.allowIps || [],
    allowRoles: persisted.allowRoles || metadata.allowRoles || [],
    updatedAt: new Date().toISOString()
  });
}

/**
 * 3层注册：API 级元数据 (Level 3)
 */
export function registerApiMetadata(systemKey, groupKey, apiKey, metadata) {
  if (!configs[systemKey]) {
    configs[systemKey] = {
      id: systemKey,
      name: systemKey,
      enabled: true,
      groups: {}
    };
  }
  if (!configs[systemKey].groups[groupKey]) {
    configs[systemKey].groups[groupKey] = {
      id: groupKey,
      name: groupKey,
      enabled: true,
      apis: {}
    };
  }

  const group = configs[systemKey].groups[groupKey];
  const persisted = (currentVersion > 0 && configs[systemKey]?.groups?.[groupKey]?.apis?.[apiKey]) || {};

  if (!group.apis[apiKey]) {
    group.apis[apiKey] = {
      id: apiKey,
      name: metadata.alias || apiKey,
      enabled: persisted.enabled ?? metadata.enabled ?? true,
      requireLogin: persisted.requireLogin ?? metadata.requireLogin ?? false,
      allowIps: persisted.allowIps || metadata.allowIps || [],
      allowRoles: persisted.allowRoles || metadata.allowRoles || [],
      url: metadata.url,
      method: metadata.method,
      updatedAt: new Date().toISOString()
    };
  } else {
    Object.assign(group.apis[apiKey], {
      name: metadata.alias || group.apis[apiKey].name,
      url: metadata.url,
      method: metadata.method
    });
  }
}

/**
 * 获取所有配置
 */
export function getAllGuardConfigs() {
  return configs;
}

/**
 * 异步原子写入数据库（启动时同步代码变更后调用）
 * 委托 DAO 层处理 upsert + version 乐观锁
 *
 * @returns {Promise<void>}
 * @throws {Error} 版本冲突或数据库写入失败时抛出
 */
export async function saveGuardConfig() {
  if (saveTimer) clearTimeout(saveTimer);

  try {
    currentVersion = await GuardConfigDao.saveToDB(configs, currentVersion);
    console.log(`✅ [Guard Config] ${C.green}数据库已同步 (version=${currentVersion})${C.reset}`);
  } catch (err) {
    console.error(`❌ [Guard Config] ${C.red}同步失败: ${err.message}${C.reset}`);
    throw err;
  }
}
