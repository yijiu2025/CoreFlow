/**
 * 守卫配置存储
 * 三级守卫配置的注册/查询/持久化，使用数据库存储替代 JSON 文件
 * 启动时 register* 设置代码级默认值 → loadGuardConfig 从 DB 加载覆盖（运维优先）
 * 运行时读内存，配置变更时异步原子写入 DB
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

/* eslint-disable no-console */

import { C } from '../utils/colors.js';
import GuardConfigDao from '../app/guard/dao/guard-config.dao.js';

/**
 * 核心配置存储 - 仅存放与 API 加载、权限策略相关的配置
 * 启动时 register* 构建代码级配置，随后 loadGuardConfig 用 DB 配置覆盖
 */
let configs = {};
let currentVersion = 0;

/**
 * 从数据库加载持久化配置，覆盖内存中的代码级默认值
 * 必须在 runEngine（register* 调用完成）之后执行
 * DB 配置优先，确保运维修改不因重启丢失
 *
 * @returns {Promise<void>}
 */
export async function loadGuardConfig() {
  let data;
  try {
    data = await GuardConfigDao.loadFromDB();
  } catch (err) {
    // 数据库不可用时使用代码级配置，不阻止启动
    console.warn(`⚠️ [Guard Config] ${C.yellow}数据库加载失败，使用代码级配置: ${err.message}${C.reset}`);
    return;
  }

  if (data.version > 0) {
    // 合并：DB 配置覆盖代码级配置（仅覆盖运行时字段，不覆盖结构）
    mergeDbConfig(data.configs);
    currentVersion = data.version;
    console.log(`💾 [Guard Config] ${C.dim}已加载持久化策略数据 (version=${currentVersion})${C.reset}`);
  } else {
    // 首次运行：DB 无数据，将代码级配置写入 DB 作为初始数据
    // 写入失败向上冒泡，让 initLoader 感知并阻止启动
    currentVersion = await GuardConfigDao.saveToDB(configs, 0);
    console.log(`💾 [Guard Config] ${C.dim}已写入初始策略数据 (version=${currentVersion})${C.reset}`);
  }
}

/**
 * 将 DB 配置合并到内存中，仅覆盖运行时字段，不覆盖结构定义
 * @param {object} dbConfigs - 从 DB 加载的完整配置树
 */
function mergeDbConfig(dbConfigs) {
  for (const [systemKey, dbSystem] of Object.entries(dbConfigs)) {
    if (!configs[systemKey]) {
      console.warn(`⚠️ [Guard Config] DB 中存在已删除或未注册的系统配置: ${systemKey}，已忽略`);
      continue;
    }
    // 覆盖系统级运行时字段
    overrideRuntimeFields(configs[systemKey], dbSystem);
    // 覆盖模块级运行时字段
    for (const [groupKey, dbGroup] of Object.entries(dbSystem.groups || {})) {
      if (!configs[systemKey].groups[groupKey]) {
        console.warn(`⚠️ [Guard Config] DB 中存在已删除的模块配置: ${systemKey}/${groupKey}，已忽略`);
        continue;
      }
      overrideRuntimeFields(configs[systemKey].groups[groupKey], dbGroup);
      // 覆盖 API 级运行时字段
      for (const [apiKey, dbApi] of Object.entries(dbGroup.apis || {})) {
        if (!configs[systemKey].groups[groupKey].apis[apiKey]) {
          console.warn(`⚠️ [Guard Config] DB 中存在已删除的 API 配置: ${systemKey}/${groupKey}/${apiKey}，已忽略`);
          continue;
        }
        overrideRuntimeFields(configs[systemKey].groups[groupKey].apis[apiKey], dbApi);
      }
    }
  }
}

/** 运行时字段列表（仅覆盖这些字段，不覆盖 id/name/url/method 等结构字段） */
const RUNTIME_FIELDS = ['enabled', 'requireLogin', 'allowIps', 'allowRoles'];

/**
 * 用 DB 值覆盖目标对象的运行时字段
 * @param {object} target - 内存中的配置对象
 * @param {object} source - DB 中的配置对象
 */
function overrideRuntimeFields(target, source) {
  for (const field of RUNTIME_FIELDS) {
    if (source[field] !== undefined) {
      target[field] = source[field];
    }
  }
  target.updatedAt = new Date().toISOString();
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
  const system = configs[systemKey];
  if (!system) return null;

  const updatePatch = { ...patch, updatedAt: new Date().toISOString() };

  if (apiKey && groupKey) {
    const group = system.groups?.[groupKey];
    const api = group?.apis?.[apiKey];
    if (!api) return null;
    Object.assign(api, updatePatch);
  } else if (groupKey) {
    const group = system.groups?.[groupKey];
    if (!group) return null;
    Object.assign(group, updatePatch);
  } else {
    Object.assign(system, updatePatch);
  }

  triggerSave();
  return configs[systemKey];
}

/** 异步写入超时时间（毫秒） */
const SAVE_TIMEOUT = 10000;

/**
 * 异步保存配置到数据库 (防抖处理)
 */
let saveTimer = null;
function triggerSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      // 数据库写入加超时保护，防止连接池耗尽时配置更新永久挂起
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`写入超时 (>${SAVE_TIMEOUT}ms)`)), SAVE_TIMEOUT)
      );
      currentVersion = await Promise.race([GuardConfigDao.saveToDB(configs, currentVersion), timeoutPromise]);
    } catch (err) {
      console.error(`❌ [Guard Config] ${C.red}异步写入失败: ${err.message}${C.reset}`);
    }
  }, 1000);
}

/**
 * 1层注册：系统级元数据 (Level 1)
 */
export function registerSystemMetadata(systemKey, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    console.warn(`⚠️ [Guard Config] registerSystemMetadata: metadata 参数无效，systemKey=${systemKey}`);
    return;
  }

  if (!configs[systemKey]) {
    configs[systemKey] = { groups: {} };
  }

  Object.assign(configs[systemKey], {
    id: systemKey,
    name: metadata.alias || metadata.name || systemKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: metadata.enabled ?? true,
    requireLogin: metadata.requireLogin ?? false,
    allowIps: metadata.allowIps || [],
    allowRoles: metadata.allowRoles || [],
    updatedAt: new Date().toISOString()
  });
}

/**
 * 2层注册：模块/文件级元数据 (Level 2)
 */
export function registerGroupMetadata(systemKey, groupKey, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    console.warn(
      `⚠️ [Guard Config] registerGroupMetadata: metadata 参数无效，systemKey=${systemKey}, groupKey=${groupKey}`
    );
    return;
  }

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

  Object.assign(configs[systemKey].groups[groupKey], {
    id: groupKey,
    name: metadata.alias || metadata.name || groupKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: metadata.enabled ?? true,
    requireLogin: metadata.requireLogin ?? false,
    allowIps: metadata.allowIps || [],
    allowRoles: metadata.allowRoles || [],
    updatedAt: new Date().toISOString()
  });
}

/**
 * 3层注册：API 级元数据 (Level 3)
 *
 * 注意：首次注册和后续更新的行为不对称：
 * - 首次注册：创建完整条目，包含 enabled/requireLogin 等运行时字段（使用 metadata 参数值）
 * - 后续更新：仅更新 name/url/method 等结构字段，不覆盖运行时字段
 *   运行时字段由 DB 持久化配置控制（loadGuardConfig 时覆盖），
 *   避免代码热更新意外重置运维配置
 */
export function registerApiMetadata(systemKey, groupKey, apiKey, metadata) {
  if (!metadata || typeof metadata !== 'object') {
    console.warn(
      `⚠️ [Guard Config] registerApiMetadata: metadata 参数无效，systemKey=${systemKey}, groupKey=${groupKey}, apiKey=${apiKey}`
    );
    return;
  }

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

  if (!group.apis[apiKey]) {
    group.apis[apiKey] = {
      id: apiKey,
      name: metadata.alias || apiKey,
      enabled: metadata.enabled ?? true,
      requireLogin: metadata.requireLogin ?? false,
      allowIps: metadata.allowIps || [],
      allowRoles: metadata.allowRoles || [],
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
 * 立即刷新待保存的配置到数据库（用于优雅关闭）
 * 清除防抖定时器并立即执行一次保存
 *
 * @returns {Promise<void>}
 */
export async function flushGuardConfig() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    currentVersion = await GuardConfigDao.saveToDB(configs, currentVersion);
    console.log(`✅ [Guard Config] ${C.green}配置已安全写入数据库${C.reset}`);
  } catch (err) {
    console.error(`❌ [Guard Config] ${C.red}优雅关闭保存失败: ${err.message}${C.reset}`);
  }
}

/**
 * 获取所有配置（深拷贝，防止外部篡改内部状态）
 * 注意：返回的数据量大时注意性能，当前配置规模在 KB 级别，深拷贝可接受
 */
export function getAllGuardConfigs() {
  return JSON.parse(JSON.stringify(configs));
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
