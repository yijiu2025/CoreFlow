/**
 * 统一定时任务调度器
 *
 * 集中管理后台定时任务（session 清理、未来可扩展其他维护任务）。
 * 任务频率与开关从 src/data/scheduler_config.json 读取（参考 firewall_config.json 的本地文件模式）。
 *
 * 设计：
 * - tasks/ 目录下每个文件导出一个任务工厂 { name, run(app) }，调度器按 config 启动
 * - 每个任务独立 interval，config 可单独开关/调频率
 * - 优雅关闭：onClose 清所有定时器，防进程退出时悬挂
 * - 任务异常不互不影响：单个任务失败只记日志，不影响其他任务
 *
 * ── 多实例语义（2026-09-19 新增）──
 * 原实现只有进程内 setInterval，**无任何互斥** → N 个实例每个周期执行 N 次。
 * 这类问题不报错，只表现为"数据库负载莫名变高"，且任务一旦带副作用（发通知/对账）
 * 就会产生 N 份重复数据。
 *
 * 现改为：执行前抢一把**周期锁**（分布式锁，TTL = 任务周期）。
 * - TTL = 周期，意味着锁覆盖整个周期 → 一个周期内全集群只有抢到锁的实例执行；
 * - 锁**故意不主动释放** —— 若在任务结束后释放，下一个实例的定时器会立刻抢到并重复执行，
 *   等于没加锁。让它按 TTL 自然过期，正好对应"下一个周期"。
 * - 未配置 Redis（单实例部署）→ 保持原有行为，每次都执行；
 * - Redis 已配置但**不可达** → 跳过本轮并告警，**不回退到本地执行**：
 *   回退会在多实例下造成重复执行，而重复执行的危害大于"某一轮不执行"。
 *
 * @author yijiu2025
 * @since 2026-09-03
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { C } from '../../utils/colors.js';
import { createLogger } from '../log/index.js';
import { createLock } from '../redis/lock-store.js';
import { isRedisConfigured } from '../redis/utils.js';

const log = createLogger('framework.scheduler.index');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../../src/data/scheduler_config.json');

/** 默认配置（文件缺失或字段缺失时兜底） */
const DEFAULT_CONFIG = {
  enabled: true,
  tasks: {
    'session-cleanup': { enabled: true, intervalHours: 24, retentionDays: 90 }
  }
};

/** 读取配置文件，缺失字段用 DEFAULT_CONFIG 兜底 */
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    // 浅合并顶层 + 每个 task 浅合并默认值
    const tasks = { ...DEFAULT_CONFIG.tasks };
    if (raw.tasks) {
      for (const [key, val] of Object.entries(raw.tasks)) {
        tasks[key] = { ...tasks[key], ...val };
      }
    }
    return { ...DEFAULT_CONFIG, ...raw, tasks };
  } catch (err) {
    log.error(`❌ [Scheduler] ${C.red}读取配置失败，用默认值${C.reset}`, err);
    return DEFAULT_CONFIG;
  }
}

/**
 * 抢本轮的周期锁
 *
 * @param {string} taskKey - 任务名（锁粒度）
 * @param {number} intervalMs - 任务周期（毫秒），同时作为锁的 TTL
 * @returns {Promise<boolean>} true = 本实例获得本周期执行权
 */
async function acquirePeriodLock(taskKey, intervalMs) {
  if (!isRedisConfigured()) return true; // 单实例部署：不引入锁语义

  try {
    const lock = createLock(`scheduler:${taskKey}`, { ttl: intervalMs });
    return await lock.tryAcquire(intervalMs);
  } catch (err) {
    // 已配置但不可达 → 跳过，不回退。回退执行在多实例下会重复跑任务。
    log.warn(
      `⚠️ [Scheduler] ${C.yellow}任务 [${taskKey}] 获取分布式锁失败，跳过本轮（不重复执行）${C.reset}: ${err.message}`
    );
    return false;
  }
}

/**
 * 执行单个任务：先抢周期锁，抢到才跑
 *
 * @param {object} params
 * @param {string} params.taskKey - 任务名
 * @param {object} params.taskFactory - 任务工厂（需含 run 方法）
 * @param {object} params.taskConfig - 任务配置
 * @param {number} params.intervalMs - 任务周期
 * @param {object} params.app - Fastify 实例
 * @returns {Promise<void>}
 */
async function executeTask({ taskKey, taskFactory, taskConfig, intervalMs, app }) {
  const acquired = await acquirePeriodLock(taskKey, intervalMs);
  if (!acquired) {
    log.info(`ℹ️ [Scheduler] ${C.dim}任务 [${taskKey}] 本周期已由其他实例执行，跳过${C.reset}`);
    return;
  }
  await taskFactory.run(app, taskConfig);
}

/**
 * 启动调度器：扫描 tasks/ 目录，按 config 启用并启动每个任务
 * @param {object} app Fastify 实例
 */
async function startScheduler(app) {
  const config = loadConfig();
  if (!config.enabled) {
    log.info(`ℹ️ [Scheduler] ${C.cyan}调度器已禁用（config.enabled=false）${C.reset}`);
    return;
  }

  const tasksDir = path.resolve(__dirname, 'tasks');
  if (!fs.existsSync(tasksDir)) {
    log.info(`ℹ️ [Scheduler] ${C.cyan}tasks/ 目录不存在，跳过任务加载${C.reset}`);
    return;
  }

  const timers = [];
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true }).filter(e => e.name.endsWith('.js'));

  for (const entry of entries) {
    const taskKey = entry.name.replace(/\.js$/, '');
    const taskConfig = config.tasks[taskKey];

    // 配置里没这个任务或 disabled → 跳过
    if (!taskConfig || taskConfig.enabled === false) {
      log.info(`ℹ️ [Scheduler] ${C.cyan}任务 [${taskKey}] 已禁用，跳过${C.reset}`);
      continue;
    }

    try {
      const fileUrl = pathToFileURL(path.join(tasksDir, entry.name)).href;
      const { default: taskFactory } = await import(fileUrl);
      if (!taskFactory || typeof taskFactory.run !== 'function') {
        log.warn(`⚠️ [Scheduler] ${C.yellow}任务 [${taskKey}] 未导出 run 函数，跳过${C.reset}`);
        continue;
      }

      const intervalMs = (taskConfig.intervalHours || 24) * 60 * 60 * 1000;
      // 锁的获取与释放都在 executeTask 内部完成，这里只负责"不要让异常逃逸成 unhandledRejection"
      const run = () => {
        executeTask({ taskKey, taskFactory, taskConfig, intervalMs, app }).catch(err => {
          log.error(`❌ [Scheduler] ${C.red}任务 [${taskKey}] 执行失败${C.reset}`, err);
        });
      };

      // 启动后立即跑一次（清理积累的孤儿），再按间隔跑。
      // 多实例下这次"立即跑"同样受周期锁保护 —— 滚动发布时只有第一个实例会执行。
      run();
      const timer = setInterval(run, intervalMs);
      timers.push(timer);
      log.info(`✅ [Scheduler] ${C.green}任务 [${taskKey}] 已启动，间隔 ${taskConfig.intervalHours}h${C.reset}`);
    } catch (err) {
      log.error(`❌ [Scheduler] ${C.red}任务 [${taskKey}] 加载失败${C.reset}`, err);
    }
  }

  // 优雅关闭：清所有定时器（分布式锁不释放，按 TTL 自然过期）
  app.addHook('onClose', async () => {
    timers.forEach(t => clearInterval(t));
    log.info(`🛑 [Scheduler] ${C.cyan}所有定时任务已停止${C.reset}`);
  });
}

// ── 导出 ──
// acquirePeriodLock / executeTask 一并导出：它们是"多实例下是否重复执行"的**全部决策逻辑**，
// 必须能被独立测试。若只导出 startScheduler，验证这一点就得去驱动真实定时器 + 真实 Redis，
// 那类测试要么被跳过、要么慢到没人跑，最终等于没有覆盖。
export { startScheduler, acquirePeriodLock, executeTask };
