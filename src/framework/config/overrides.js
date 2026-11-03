/**
 * 可选配置覆盖加载器（**同步**）
 *
 * ════════════════════════════════════════════════════════════════════
 * 设计契约：`src/config/` 是**覆盖层**，不是数据源
 * ════════════════════════════════════════════════════════════════════
 * - 每个 core 自带保底默认值（写在使用它的模块里，带注释）；
 * - `src/config/*.js` 只写**要改的键**，未写的键走 core 保底；
 * - 整个目录缺失 / 单文件缺失 / 导出缺失 / 语法错误 → 一律返回 `{}`，
 *   服务照常用保底值启动。
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么不用静态 import
 * ════════════════════════════════════════════════════════════════════
 * 静态 `import` 在目标文件不存在时是**模块解析期**直接抛 ERR_MODULE_NOT_FOUND
 * —— 兜底默认值再完整也没机会执行，进程起不来。
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么不用动态 import（top-level await）
 * ════════════════════════════════════════════════════════════════════
 * 动态 import 必须 await，会给整个模块图引入 top-level await；
 * 而 TLA 模块**不能被 require()** —— jest 的 `jest.requireActual`（CJS 桩）
 * 会直接报 "require() cannot be used to load ES Module …: top-level await"。
 * 因此改用 `createRequire`：Node ≥ 22 支持**同步 require(ESM)**，
 * 本项目无 TLA、导出是纯字面量，同步加载完全够用。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger } from '../log/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 覆盖层目录（只允许加载这里的文件，避免被当成通用动态加载器滥用） */
const CONFIG_DIR = path.resolve(__dirname, '../../config');

const requireFromConfig = createRequire(import.meta.url);

const log = createLogger('framework.config.overrides');

/**
 * 加载一份可选的配置覆盖
 *
 * @param {string} fileName - src/config 下的文件名（如 'auth_config.js'）
 * @param {string} exportName - 期望的具名导出
 * @param {string} [label] - 日志里的可读名（默认取 exportName）
 * @returns {object} 覆盖对象；文件缺失或任何异常一律返回 {}（不阻断启动）
 */
function loadOverrides(fileName, exportName, label = exportName) {
  const fullPath = path.resolve(CONFIG_DIR, fileName);

  let mod;
  try {
    mod = requireFromConfig(fullPath);
  } catch (err) {
    // 文件不存在是**正常状态**（覆盖层本来可选），不告警；
    // 语法错误 / 依赖炸了才告警（说明文件在，但坏了）
    if (err?.code !== 'MODULE_NOT_FOUND') {
      log.warn(`⚠️ [Config] ${label} 覆盖文件加载失败，改用内置默认值：${err.message}`);
    }
    return {};
  }

  const value = mod?.[exportName];
  if (value === undefined) {
    log.warn(`⚠️ [Config] ${label} 覆盖文件缺少导出 \`${exportName}\`，改用内置默认值`);
    return {};
  }
  if (value === null || typeof value !== 'object') {
    log.warn(`⚠️ [Config] ${label} 覆盖不是对象（拿到 ${typeof value}），改用内置默认值`);
    return {};
  }
  return value;
}

export { loadOverrides, CONFIG_DIR };
