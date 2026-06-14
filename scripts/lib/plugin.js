// CLI 插件加载模块
// 扫描 src/app/<app>/cli/index.js 加载应用自定义命令
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsDir = path.resolve(__dirname, '../../src/app');

/**
 * 加载所有应用的 CLI 插件
 * @returns {Promise<object>} 包含 commands、errors、count 的加载结果
 */
export async function loadAppCommands() {
  const commands = {};
  const errors = [];

  if (!fs.existsSync(appsDir)) {
    return { commands, errors, count: 0 };
  }

  const entries = fs.readdirSync(appsDir, { withFileTypes: true });
  const appDirs = entries.filter((e) => e.isDirectory());

  for (const dir of appDirs) {
    const cliIndexPath = path.join(appsDir, dir.name, 'cli', 'index.js');

    if (!fs.existsSync(cliIndexPath)) {
      continue;
    }

    try {
      const fileUrl = pathToFileURL(cliIndexPath).href;
      const mod = await import(fileUrl);
      const plugin = mod.default || mod;

      // 验证插件格式
      const validation = validatePlugin(plugin, dir.name);
      if (!validation.valid) {
        errors.push(validation.error);
        continue;
      }

      // 检查命令名冲突
      if (commands[plugin.command]) {
        errors.push(`命令名冲突: ${plugin.command} (来自 ${dir.name} 和 ${commands[plugin.command]._source})`);
        continue;
      }

      // 注册命令
      commands[plugin.command] = {
        description: `[${plugin.appName || dir.name}] ${plugin.description}`,
        subcommands: plugin.subcommands || {},
        _source: dir.name,
        _path: cliIndexPath
      };
    } catch (err) {
      errors.push(`加载 ${dir.name}/cli/index.js 失败: ${err.message}`);
    }
  }

  return {
    commands,
    errors,
    count: Object.keys(commands).length
  };
}

/**
 * 验证插件格式
 * @param {object} plugin - 插件对象
 * @param {string} appName - 应用名称
 * @returns {object} { valid: boolean, error?: string }
 */
function validatePlugin(plugin, appName) {
  if (!plugin) {
    return { valid: false, error: `${appName}/cli/index.js 没有导出内容` };
  }

  if (!plugin.command || typeof plugin.command !== 'string') {
    return { valid: false, error: `${appName}/cli/index.js 缺少 command 属性` };
  }

  if (!plugin.description || typeof plugin.description !== 'string') {
    return { valid: false, error: `${appName}/cli/index.js 缺少 description 属性` };
  }

  if (plugin.subcommands && typeof plugin.subcommands !== 'object') {
    return { valid: false, error: `${appName}/cli/index.js 的 subcommands 必须是对象` };
  }

  // 验证子命令格式
  if (plugin.subcommands) {
    for (const [name, sub] of Object.entries(plugin.subcommands)) {
      if (!sub.description || typeof sub.description !== 'string') {
        return { valid: false, error: `${appName}/cli/index.js 的子命令 ${name} 缺少 description` };
      }
      if (!sub.handler || typeof sub.handler !== 'function') {
        return { valid: false, error: `${appName}/cli/index.js 的子命令 ${name} 缺少 handler 函数` };
      }
    }
  }

  return { valid: true };
}

/**
 * 合并内置命令和应用命令
 * @param {object} builtinCommands - 内置命令配置
 * @param {object} appCommands - 应用命令配置
 * @returns {object} 合并后的命令配置
 */
export function mergeCommands(builtinCommands, appCommands) {
  const merged = { ...builtinCommands };

  for (const [command, config] of Object.entries(appCommands)) {
    if (merged[command]) {
      console.warn(`命令 ${command} 与内置命令冲突，跳过应用 ${config._source} 的定义`);
      continue;
    }
    merged[command] = config;
  }

  return merged;
}
