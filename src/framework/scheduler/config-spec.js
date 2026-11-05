/**
 * 调度器配置（`data/scheduler_config.json`）的**配置规格**
 *
 * 与防火墙那套用同一个工具（`framework/config/field-spec.js`），理由也一样：
 * 这个文件是运维手改的，`{ tasks: { 'session-cleanup': { intervalHours: "abc" } } }`
 * 会一路走到 `intervalMs = "abc" * 3600 * 1000` → NaN → **定时器立刻触发、之后空转**，
 * 而日志里只有一句"任务已启动，间隔 abch"。
 *
 * 任务名是**动态**的（`tasks/` 目录里有什么就跑什么），所以这里只校验任务对象的字段，
 * 不限制任务名 —— 未知任务名原样保留，未知**字段**丢弃并告警。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { sanitizeBySpec, isPlainObject } from '../config/field-spec.js';

/** 顶层字段 */
const ROOT_SPEC = {
  enabled: { type: 'bool' }
};

/** 单个任务对象的字段（所有任务共用；任务私有字段自行加在这里） */
const TASK_SPEC = {
  enabled: { type: 'bool' },
  // 小时；必须 > 0，否则 intervalMs = 0 → 定时器空转
  intervalHours: { type: 'number', min: 1 },
  // 保留天数；0 = 不保留（删得更狠），是合法取值
  retentionDays: { type: 'int', min: 0 }
};

/**
 * 清洗调度器配置
 *
 * @param {*} raw 磁盘上的原始 JSON（可为任意值）
 * @returns {{value: {enabled?: boolean, tasks: Object<string, object>}, problems: Array<{kind: string, key: string, message: string}>}}
 *          value.tasks 一定是对象（可能为空）；非法字段已丢弃
 */
function sanitizeSchedulerConfig(raw) {
  const problems = [];
  const value = { tasks: {} };

  if (!isPlainObject(raw)) {
    if (raw !== undefined && raw !== null) {
      problems.push({ kind: 'invalid', key: 'scheduler_config', message: '必须是对象，已整体忽略' });
    }
    return { value, problems };
  }

  // tasks 单独处理（任务名动态），其余顶层键走同一套清洗（未知键会被标出来）
  const { tasks: rawTasks, ...rest } = raw;
  const root = sanitizeBySpec(ROOT_SPEC, rest);
  problems.push(...root.problems);
  if (root.value.enabled !== undefined) value.enabled = root.value.enabled;

  if (rawTasks !== undefined) {
    if (!isPlainObject(rawTasks)) {
      problems.push({ kind: 'invalid', key: 'tasks', message: '必须是对象，已忽略' });
    } else {
      for (const [taskKey, taskRaw] of Object.entries(rawTasks)) {
        // 任务名不设白名单（tasks/ 目录决定有哪些任务），只清洗字段
        const task = sanitizeBySpec(TASK_SPEC, taskRaw, { label: `tasks.${taskKey}` });
        problems.push(...task.problems);
        value.tasks[taskKey] = task.value;
      }
    }
  }

  return { value, problems };
}

export { sanitizeSchedulerConfig, ROOT_SPEC, TASK_SPEC };
