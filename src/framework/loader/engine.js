/**
 * 加载器引擎：按顺序执行 registry 目录下的所有加载模块
 * 扫描 `src/loader/registry/` 目录，按文件名数字前缀排序加载
 *
 * 【失败分级（2026-09-19）】
 * 早先的实现把除 DUPLICATE_ROUTE 外的所有错误都降级成"非致命警告" ——
 * 结果是「服务在跑，但功能缺失」：鉴权没装、路由没注册、模型没关联，
 * 进程却健康地监听端口，故障被伪装成接口 404 / 全部 500，排查成本远高于
 * 直接起不来。现在按**显式声明**分级：
 *   - 未列入 `OPTIONAL_LOADERS` 的一律视为关键 → 失败即终止启动（fail-fast）
 *   - 列入者失败只降级，明细经 `getLoaderStatus()` 暴露给 `/health/ready`
 * 默认取"关键"是有意为之：新增加载器若忘了声明，失败时会**拦住启动**而不是
 * 被静默放过；想知道某个文件为何可降级，看 OPTIONAL_LOADERS 里的逐条理由。
 *
 * @author yijiu2025
 * @since 2026-07-22
 * @updated 2026-09-19 增加关键/可选失败分级与加载状态导出
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { C } from '../../utils/colors.js';
import { createLogger } from '../log/index.js';

const log = createLogger('framework.loader.engine');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 每个模块加载超时时间（毫秒） */
const LOAD_TIMEOUT = 30000;

/**
 * 可降级加载器名单 —— 只有这里列出的失败才允许"带伤启动"。
 *
 * 判据：该模块缺失后，服务**仍能正确处理已注册路由的核心请求**，
 * 只是失去某项附加能力（可观测性 / 降级路径 / 种子数据）。
 * 凡是不满足这条的（鉴权、防火墙、模型、密钥、路由、应用扫描），
 * 一律留在名单外 → 失败即 fail-fast。
 */
const OPTIONAL_LOADERS = new Set([
  '01-monitor.js', // 请求耗时监控：缺失只丢 X-Response-Time 与慢请求告警
  '02-redis.js', // Redis：设计上未配置时就走进程内 MapStore 降级，属合法模式
  '03-db.js', // 该加载器自身语义即"连接失败不阻塞启动，降级为 null"
  '09-notice.js' // 通知配置种子：缺失只是没有种子数据，不影响请求处理
]);

/** 最近一次加载摘要（供 /health/ready 暴露明细；初始为空态） */
let lastLoadSummary = {
  total: 0,
  failed: 0,
  loadErrors: [],
  optionalFailed: 0,
  criticalFailed: 0,
  completed: false
};

/**
 * 判断某个加载器失败是否允许降级
 *
 * @param {string} file - 加载器文件名（含 .js）
 * @returns {boolean} true = 可选（失败不阻塞启动）
 */
function isOptionalLoader(file) {
  return OPTIONAL_LOADERS.has(file);
}

/**
 * 取最近一次加载摘要（进程级，不随调用重置）
 *
 * @returns {{total: number, failed: number, loadErrors: Array<{file: string, message: string}>, optionalFailed: number, criticalFailed: number, completed: boolean}} 加载摘要
 */
function getLoaderStatus() {
  return lastLoadSummary;
}

/**
 * 汇总打印非关键加载错误
 *
 * @param {Array<{file: string, message: string}>} loadErrors - 已收集的错误
 * @returns {void}
 */
function reportLoadErrors(loadErrors) {
  if (loadErrors.length === 0) return;
  log.warn(`\n⚠️ [Loader] ${C.yellow}以下加载项出错（非致命，已降级）：${C.reset}`);
  loadErrors.forEach(e => log.warn(`  • [${e.file}] ${e.message}`));
}

/**
 * 按文件名顺序加载 registry 目录下的所有模块
 * 每个模块导出默认函数 `register(app)`，失败时按关键/可选分级处理
 * 每个模块有 30 秒超时限制，防止挂起模块阻塞服务启动
 *
 * @param {import('fastify').FastifyInstance} app - Fastify 实例
 * @param {object} [options] - 可选参数
 * @param {string} [options.registryDir] - 覆盖 registry 目录（测试驱动真实加载路径用）
 * @returns {Promise<{total: number, failed: number, loadErrors: Array<{file: string, message: string}>}>} 加载摘要
 * @throws {Error} 注册表目录不存在时抛出；关键加载器失败（或路由重复注册）时抛出
 */
async function runEngine(app, options = {}) {
  const registryDir = options.registryDir || path.resolve(__dirname, './registry');

  // 检查注册表目录是否存在，提供清晰的错误信息
  try {
    await fs.access(registryDir);
  } catch {
    throw new Error(`注册表目录不存在: ${registryDir}`);
  }

  const files = await fs.readdir(registryDir);
  const sortedFiles = files.filter(f => f.endsWith('.js')).sort();

  // 收集所有可降级错误，最后一并报告（一次性看到所有问题）
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
      // 路由重复注册是确定的致命错误（不依赖错误消息文本）
      const isCritical = err.code === 'DUPLICATE_ROUTE' || !isOptionalLoader(file);
      if (isCritical) {
        // fail-fast 前先把已收集的可降级错误打出来，否则它们会被这次抛出吞掉
        reportLoadErrors(loadErrors);
        lastLoadSummary = {
          total: sortedFiles.length,
          failed: loadErrors.length + 1,
          loadErrors,
          optionalFailed: loadErrors.length,
          criticalFailed: 1,
          completed: false
        };
        // 带上加载器上下文，让上层日志能直接指出是哪个文件拦住了启动
        err.loaderFile = file;
        err.loaderCritical = true;
        throw err;
      }
      // 已声明可降级：收集到数组，最后统一报告
      loadErrors.push({ file, message: err.message });
    }
  }

  reportLoadErrors(loadErrors);

  lastLoadSummary = {
    total: sortedFiles.length,
    failed: loadErrors.length,
    loadErrors,
    optionalFailed: loadErrors.length,
    criticalFailed: 0,
    completed: true
  };

  return {
    total: sortedFiles.length,
    failed: loadErrors.length,
    loadErrors
  };
}

export { runEngine, getLoaderStatus, isOptionalLoader };
