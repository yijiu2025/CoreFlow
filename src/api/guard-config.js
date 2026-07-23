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
import { logAuditEvent } from '../auth/audit-logger.js';

/**
 * 核心配置存储 - 仅存放与 API 加载、权限策略相关的配置
 * 启动时 register* 构建代码级配置，随后 loadGuardConfig 用 DB 配置覆盖
 */
let configs = {};
let currentVersion = 0;
let _dbVersions = {}; // 每行独立版本号: { systemKey: version }
let _dirtySystems = new Set(); // 待保存的脏系统列表

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
    _dbVersions = data.versions || {};
    console.log(`💾 [Guard Config] ${C.dim}已加载持久化策略数据${C.reset}`);

    // 将内存中的完整配置写回 DB，确保新增/删除的 API 路由同步到数据库
    // 新增的 API 路由在 runEngine 阶段已注册到内存，但 DB 中可能没有
    // 删除的 API 路由 DB 中仍有残留，写入时会被覆盖清理
    try {
      const result = await saveWithTimeout();
      currentVersion = result.maxVersion;
      if (result.updated.length > 0) {
        const detail = result.updated.map(k => `${k}(v${result.versions[k]})`).join(', ');
        console.log(`💾 [Guard Config] ${C.dim}已同步代码级配置 — 更新: ${detail}${C.reset}`);
      } else {
        console.log(`💾 [Guard Config] ${C.dim}已同步代码级配置 — 无变更${C.reset}`);
      }
    } catch (err) {
      // 同步失败不阻止启动，下次启动会重试
      console.warn(`⚠️ [Guard Config] ${C.yellow}代码级配置同步失败: ${err.message}，下次启动将重试${C.reset}`);
    }
  } else {
    // 首次运行：DB 无数据，将代码级配置写入 DB 作为初始数据
    // 写入失败向上冒泡，让 initLoader 感知并阻止启动
    const result = await saveWithTimeout();
    currentVersion = result.maxVersion;
    console.log(
      `💾 [Guard Config] ${C.dim}已写入初始策略数据 (${Object.keys(configs).length} 个系统, version=${currentVersion})${C.reset}`
    );
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

/** 每次写入前备份的旧版本快照，用于写入失败时回滚 */
let _previousSnapshot = null;

/**
 * 验证 configs 对象结构完整性
 * 检查每个系统是否包含必要的字段
 *
 * @param {object} configs - 要验证的配置树
 * @returns {boolean}
 */
function validateConfigs(configs) {
  for (const [systemKey, system] of Object.entries(configs)) {
    if (!system || typeof system !== 'object') {
      console.warn(`⚠️ [Guard Config] 验证失败: 系统 ${systemKey} 配置无效`);
      return false;
    }
    if (!system.groups || typeof system.groups !== 'object') {
      console.warn(`⚠️ [Guard Config] 验证失败: 系统 ${systemKey} 缺少 groups`);
      return false;
    }
  }
  return true;
}

/** 异步写入超时时间（毫秒） */
const SAVE_TIMEOUT = 10000;

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
  // 更新内存中的 updatedAt 时间戳，但注意这里不触发 triggerSave
  // 因此内存和 DB 的 updatedAt 可能不一致。updatedAt 仅用于展示，
  // 守卫逻辑不依赖该字段，因此不触发 DB 写入是合理的性能优化
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
 *
 * @param {string} systemKey - 系统标识
 * @param {object} patch - 要更新的字段
 * @param {string} [groupKey=null] - 模块标识
 * @param {string} [apiKey=null] - API 标识
 * @param {object} [operator={}] - 操作者信息（用于审计日志）
 * @param {string|number} [operator.userId] - 操作者用户 ID
 * @param {string} [operator.ip] - 操作者 IP
 * @param {object} [operator.redis] - Redis 实例（可选）
 * @returns {object|null} 更新后的系统配置，失败返回 null
 */
export function setGuardConfig(systemKey, patch, groupKey = null, apiKey = null, operator = {}) {
  const system = configs[systemKey];
  if (!system) return null;

  // patch 无效时直接返回，避免静默 no-op 让人困惑
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    console.warn(`⚠️ [Guard Config] setGuardConfig: patch 参数无效，systemKey=${systemKey}`);
    return null;
  }

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

  triggerSave(systemKey);

  // 审计日志：记录配置变更
  logAuditEvent(operator.redis, {
    type: 'PERMISSION_CHANGE',
    userId: operator.userId || null,
    ip: operator.ip || null,
    appId: 'guard',
    details: {
      systemKey,
      groupKey: groupKey || null,
      apiKey: apiKey || null,
      patch: Object.keys(patch),
      timestamp: new Date().toISOString()
    }
  }).catch(() => {
    // 审计日志写入失败不影响配置更新
  });

  return configs[systemKey];
}

/**
 * 带超时保护的数据库写入
 * 所有写入路径统一使用此函数，确保超时行为一致
 *
 * @param {string[]|null} [systemKeys] - 要写入的系统列表，null 表示全部写入
 * @returns {Promise<{maxVersion: number, updated: string[], versions: object}>}
 * @throws {Error} 写入超时或配置校验失败时抛出
 */
async function saveWithTimeout(systemKeys = null) {
  // 写入前校验结构完整性
  if (!validateConfigs(configs)) {
    throw new Error('配置结构校验失败，已取消写入');
  }

  // 只写入指定系统，或全部写入
  const toSave = systemKeys ? Object.fromEntries(systemKeys.map(k => [k, configs[k]]).filter(([, v]) => v)) : configs;

  // 备份当前状态，用于写入失败时回滚
  _previousSnapshot = {
    configs: structuredClone(configs),
    versions: { ..._dbVersions },
    version: currentVersion
  };

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`写入超时 (>${SAVE_TIMEOUT}ms)`)), SAVE_TIMEOUT);
  });
  const result = await Promise.race([
    GuardConfigDao.saveToDB(toSave, _dbVersions).finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
  // 更新每行独立版本号
  _dbVersions = result.versions;
  return result;
}

/**
 * 异步保存配置到数据库 (防抖处理)
 * 只保存标记为脏的系统，避免全量写入
 *
 * @param {string} [systemKey] - 被修改的系统标识，用于标记脏系统
 */
let saveTimer = null;
function triggerSave(systemKey) {
  if (systemKey) _dirtySystems.add(systemKey);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const keys = _dirtySystems.size > 0 ? [..._dirtySystems] : null;
    _dirtySystems.clear();
    try {
      currentVersion = await saveWithTimeout(keys);
    } catch (err) {
      // 写入失败时回滚内存状态到写入前的快照
      if (_previousSnapshot) {
        configs = structuredClone(_previousSnapshot.configs);
        currentVersion = _previousSnapshot.version;
        _dbVersions = { ..._previousSnapshot.versions };
        _previousSnapshot = null;
      }
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
      method: metadata.method,
      updatedAt: new Date().toISOString()
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
  const keys = _dirtySystems.size > 0 ? [..._dirtySystems] : null;
  _dirtySystems.clear();
  try {
    currentVersion = await saveWithTimeout(keys);
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
  return structuredClone(configs);
}

/**
 * 异步原子写入数据库（启动时同步代码变更后调用）
 * 委托 DAO 层处理 upsert + version 乐观锁
 *
 * @returns {Promise<void>}
 * @throws {Error} 版本冲突或数据库写入失败时抛出
 */
export async function saveGuardConfig() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    currentVersion = await saveWithTimeout();
    console.log(`✅ [Guard Config] ${C.green}数据库已同步 (version=${currentVersion})${C.reset}`);
  } catch (err) {
    console.error(`❌ [Guard Config] ${C.red}同步失败: ${err.message}${C.reset}`);
    throw err;
  }
}
