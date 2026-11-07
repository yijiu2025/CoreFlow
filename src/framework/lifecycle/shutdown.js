/**
 * 优雅关闭编排（framework 层，不感知具体业务）
 *
 * 入口只声明"要关哪些东西"，不写"按什么顺序关、失败了怎么办"：
 *   - 顺序 = 任务数组顺序（数组即契约，比散在闭包里一眼可见）；
 *   - 每条任务独立捕获错误 —— 一个任务抛错不能中断后面的任务。
 *
 * 【为什么错误隔离是硬要求】
 * Fastify 的 `onClose` 不会把异步错误抛给调用方（它只是等 Promise settle），
 * 任何一条任务抛出都会让后续任务集体跳过。而在关闭阶段"少关一个连接"的后果是
 * 事件循环上留着活句柄 → 进程不退出 → 被编排系统强杀（退出码 1，判为异常退出）。
 * 所以这里**吞错但必须记日志**，让问题可见而不是让进程卡死。
 *
 * 【为什么从 src/app.js 上收（2026-11-07）】
 * 原实现是入口里的一个闭包，只能靠"起一个真服务再关掉"来验证顺序与错误隔离。
 * 抽成纯函数后，这两条判据都能用假 app / 假任务单测（见
 * `src/__tests__/framework/lifecycle/shutdown.test.js`）。
 *
 * @author yijiu2025
 * @since 2026-11-07 自 src/app.js 上收
 */

import { createLogger } from '../support/log/index.js';

const defaultLog = createLogger('framework.shutdown');

/**
 * 按数组顺序依次执行关闭任务
 *
 * 任务形如 `{ name, run }`：`name` 只用于日志定位，`run` 可以是同步或异步函数。
 * 缺 `run` 的项跳过（允许在配置里临时用注释/占位项调顺序）。
 *
 * @param {Array<{name?: string, run?: () => (void|Promise<void>)>}>} tasks 关闭任务，数组顺序即执行顺序
 * @param {{error: (msg: string, err?: unknown) => void}} [logger] 日志器（注入以便测试）
 * @returns {Promise<void>}
 */
async function runShutdownTasks(tasks, logger = defaultLog) {
  for (const task of tasks || []) {
    if (!task || typeof task.run !== 'function') continue;
    try {
      await task.run();
    } catch (err) {
      logger.error(`❌ [Shutdown] 关闭任务失败: ${task.name || '未命名'}`, err);
    }
  }
}

/**
 * 把关闭任务挂到 Fastify 的 `onClose`
 *
 * 薄壳：只负责"挂"，执行语义全在 runShutdownTasks。
 *
 * @param {import('fastify').FastifyInstance} app Fastify 实例
 * @param {Array<{name?: string, run?: () => (void|Promise<void>)>}>} tasks 关闭任务
 * @param {{error: (msg: string, err?: unknown) => void}} [logger] 日志器
 * @returns {void}
 */
function registerShutdownHooks(app, tasks, logger = defaultLog) {
  app.addHook('onClose', () => runShutdownTasks(tasks, logger));
}

export { runShutdownTasks, registerShutdownHooks };
