/**
 * 加载器引擎：按顺序执行 registry 目录下的所有加载模块
 * 扫描 `src/loader/registry/` 目录，按文件名数字前缀排序加载
 * 收集非致命错误最后一并报告，关键错误立即终止
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

/* eslint-disable no-console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { C } from '../utils/colors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 按文件名顺序加载 registry 目录下的所有模块
 * 每个模块导出默认函数 `register(app)`，失败时收集到 loadErrors
 * 路由重复注册等关键错误立即终止，非关键错误汇总警告
 * 每个模块有 30 秒超时限制，防止挂起模块阻塞服务启动
 * 超时定时器在模块完成后清理，避免资源泄漏
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @returns {Promise<{total: number, failed: number, loadErrors: Array<{file: string, message: string}>}>} 加载摘要
 * @throws {Error} 注册表目录不存在时抛出；关键加载错误（如路由重复注册）时抛出
 */
export async function runEngine(app) {
  const registryDir = path.resolve(__dirname, './registry');

  // 检查注册表目录是否存在，提供清晰的错误信息
  try {
    await fs.access(registryDir);
  } catch {
    throw new Error(`注册表目录不存在: ${registryDir}`);
  }

  const files = await fs.readdir(registryDir);
  const sortedFiles = files.filter(f => f.endsWith('.js')).sort();

  /** 每个模块加载超时时间（毫秒） */
  const LOAD_TIMEOUT = 30000;

  // 收集所有非关键加载错误，最后一并报告（一次性看到所有问题）
  const loadErrors = [];

  for (const file of sortedFiles) {
    const fileUrl = pathToFileURL(path.join(registryDir, file)).href;
    try {
      const { default: register } = await import(fileUrl);
      if (typeof register === 'function') {
        // 使用 Promise.race 实现模块加载超时保护
        // 超时定时器在 register 完成后通过 finally 清理，避免资源泄漏
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(Object.assign(new Error(`模块加载超时 (${LOAD_TIMEOUT}ms)`), { code: 'LOAD_TIMEOUT' })),
            LOAD_TIMEOUT
          );
        });

        await Promise.race([register(app).finally(() => clearTimeout(timeoutId)), timeoutPromise]);
      } else if (register !== undefined) {
        // 模块导出了非函数默认值，可能是导出错误，记录下来便于排查
        loadErrors.push({ file, message: '默认导出不是函数，模块无法注册' });
      }
    } catch (err) {
      // 路由重复注册等关键错误使用错误码判断（不依赖错误消息文本）
      if (err.code === 'DUPLICATE_ROUTE') {
        throw err;
      }
      // 非关键错误收集到数组，最后统一报告
      loadErrors.push({ file, message: err.message });
    }
  }

  // 非关键错误汇总报告
  if (loadErrors.length > 0) {
    console.warn(`\n⚠️ [Loader] ${C.yellow}以下加载项出错（非致命）：${C.reset}`);
    loadErrors.forEach(e => console.warn(`  • [${e.file}] ${e.message}`));
  }

  return {
    total: sortedFiles.length,
    failed: loadErrors.length,
    loadErrors
  };
}
