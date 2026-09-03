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
 * @author yijiu2025
 * @since 2026-09-03
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { C } from '../../utils/colors.js';

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
    console.error(`❌ [Scheduler] ${C.red}读取配置失败，用默认值: ${err.message}${C.reset}`);
    return DEFAULT_CONFIG;
  }
}

/**
 * 启动调度器：扫描 tasks/ 目录，按 config 启用并启动每个任务
 * @param {object} app Fastify 实例
 */
export async function startScheduler(app) {
  const config = loadConfig();
  if (!config.enabled) {
    console.log(`ℹ️ [Scheduler] ${C.cyan}调度器已禁用（config.enabled=false）${C.reset}`);
    return;
  }

  const tasksDir = path.resolve(__dirname, 'tasks');
  if (!fs.existsSync(tasksDir)) {
    console.log(`ℹ️ [Scheduler] ${C.cyan}tasks/ 目录不存在，跳过任务加载${C.reset}`);
    return;
  }

  const timers = [];
  const entries = fs.readdirSync(tasksDir, { withFileTypes: true }).filter(e => e.name.endsWith('.js'));

  for (const entry of entries) {
    const taskKey = entry.name.replace(/\.js$/, '');
    const taskConfig = config.tasks[taskKey];

    // 配置里没这个任务或 disabled → 跳过
    if (!taskConfig || taskConfig.enabled === false) {
      console.log(`ℹ️ [Scheduler] ${C.cyan}任务 [${taskKey}] 已禁用，跳过${C.reset}`);
      continue;
    }

    try {
      const fileUrl = pathToFileURL(path.join(tasksDir, entry.name)).href;
      const { default: taskFactory } = await import(fileUrl);
      if (!taskFactory || typeof taskFactory.run !== 'function') {
        console.warn(`⚠️ [Scheduler] ${C.yellow}任务 [${taskKey}] 未导出 run 函数，跳过${C.reset}`);
        continue;
      }

      const intervalMs = (taskConfig.intervalHours || 24) * 60 * 60 * 1000;
      const run = () => {
        taskFactory.run(app, taskConfig).catch(err => {
          console.error(`❌ [Scheduler] ${C.red}任务 [${taskKey}] 执行失败: ${err.message}${C.reset}`);
        });
      };

      // 启动后立即跑一次（清理积累的孤儿），再按间隔跑
      run();
      const timer = setInterval(run, intervalMs);
      timers.push(timer);
      console.log(`✅ [Scheduler] ${C.green}任务 [${taskKey}] 已启动，间隔 ${taskConfig.intervalHours}h${C.reset}`);
    } catch (err) {
      console.error(`❌ [Scheduler] ${C.red}任务 [${taskKey}] 加载失败: ${err.message}${C.reset}`);
    }
  }

  // 优雅关闭：清所有定时器
  app.addHook('onClose', async () => {
    timers.forEach(t => clearInterval(t));
    console.log(`🛑 [Scheduler] ${C.cyan}所有定时任务已停止${C.reset}`);
  });
}
