import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUARD_FILE = path.resolve(__dirname, '../../data/guard_config.json');

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };

/**
 * 核心配置存储 - 仅存放与 API 加载、权限策略相关的配置
 */
let configs = {};
let persistedConfigs = {};

// 初始化时从文件加载持久化数据
try {
  if (!fs.existsSync(path.dirname(GUARD_FILE))) {
    fs.mkdirSync(path.dirname(GUARD_FILE), { recursive: true });
  }
  if (fs.existsSync(GUARD_FILE)) {
    const raw = JSON.parse(fs.readFileSync(GUARD_FILE, 'utf-8'));
    // 兼容旧格式或提取 configs 部分
    if (raw.configs) {
      persistedConfigs = raw.configs;
    } else {
      persistedConfigs = raw;
    }
    console.log(`💾 [Guard Config] ${C.dim}已加载持久化策略数据 (待与代码同步)${C.reset}`);
  }
} catch (err) {
  console.error(`❌ [Guard Config] ${C.red}加载持久化文件失败: ${err.message}${C.reset}`);
}

/**
 * 异步保存配置到文件 (防抖处理)
 */
let saveTimer = null;
function triggerSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const dataToSave = {
        configs: configs
      };
      fs.writeFileSync(GUARD_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error(`❌ [Guard Config] ${C.red}写入文件失败: ${err.message}${C.reset}`);
    }
  }, 1000);
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
 * 1层注册：系统级元数据 (Level 1)
 */
export function registerSystemMetadata(systemKey, metadata) {
  if (!configs[systemKey]) {
    configs[systemKey] = { groups: {} };
  }
  
  const persisted = persistedConfigs[systemKey] || {};
  
  Object.assign(configs[systemKey], {
    id: systemKey,
    name: metadata.alias || metadata.name || systemKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: persisted.enabled ?? (metadata.enabled ?? true),
    requireLogin: persisted.requireLogin ?? (metadata.requireLogin ?? false),
    allowIps: persisted.allowIps || (metadata.allowIps || []),
    allowRoles: persisted.allowRoles || (metadata.allowRoles || []),
    updatedAt: new Date().toISOString()
  });
}

/**
 * 2层注册：模块/文件级元数据 (Level 2)
 */
export function registerGroupMetadata(systemKey, groupKey, metadata) {
  if (!configs[systemKey]) {
    configs[systemKey] = { id: systemKey, name: systemKey, enabled: true, groups: {} };
  }
  if (!configs[systemKey].groups[groupKey]) {
    configs[systemKey].groups[groupKey] = { apis: {} };
  }

  const persisted = (persistedConfigs[systemKey]?.groups?.[groupKey]) || {};

  Object.assign(configs[systemKey].groups[groupKey], {
    id: groupKey,
    name: metadata.alias || metadata.name || groupKey,
    description: metadata.description || '',
    prefix: metadata.prefix || '',
    enabled: persisted.enabled ?? (metadata.enabled ?? true),
    requireLogin: persisted.requireLogin ?? (metadata.requireLogin ?? false),
    allowIps: persisted.allowIps || (metadata.allowIps || []),
    allowRoles: persisted.allowRoles || (metadata.allowRoles || []),
    updatedAt: new Date().toISOString()
  });
}

/**
 * 3层注册：API 级元数据 (Level 3)
 */
export function registerApiMetadata(systemKey, groupKey, apiKey, metadata) {
  if (!configs[systemKey]) {
    configs[systemKey] = { id: systemKey, name: systemKey, enabled: true, groups: {} };
  }
  if (!configs[systemKey].groups[groupKey]) {
    configs[systemKey].groups[groupKey] = { id: groupKey, name: groupKey, enabled: true, apis: {} };
  }

  const group = configs[systemKey].groups[groupKey];
  const persisted = (persistedConfigs[systemKey]?.groups?.[groupKey]?.apis?.[apiKey]) || {};

  if (!group.apis[apiKey]) {
    group.apis[apiKey] = {
      id: apiKey,
      name: metadata.alias || apiKey,
      enabled: persisted.enabled ?? (metadata.enabled ?? true),
      requireLogin: persisted.requireLogin ?? (metadata.requireLogin ?? false),
      allowIps: persisted.allowIps || (metadata.allowIps || []),
      allowRoles: persisted.allowRoles || (metadata.allowRoles || []),
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
 * 强制保存当前内存中的配置 (同步代码变更后调用)
 */
export function saveGuardConfig() {
  if (saveTimer) clearTimeout(saveTimer);
  
  try {
    const dataToSave = { configs: configs };
    fs.writeFileSync(GUARD_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    console.log(`✅ [Guard Config] ${C.green}配置文件已完成代码同步与剪枝${C.reset}`);
  } catch (err) {
    console.error(`❌ [Guard Config] ${C.red}最终同步保存失败: ${err.message}${C.reset}`);
  }
}
