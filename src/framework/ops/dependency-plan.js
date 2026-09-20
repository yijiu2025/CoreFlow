/**
 * 容器启动时的依赖等待计划
 *
 * === 为什么这段策略要住在 src/ 而不是入口脚本里 ===
 * 「等谁、等不到怎么办」是**策略**，不是编排细节，它有两个都不能被误改的方向：
 *
 * - **数据库是硬依赖**：没有连接池的应用能监听到端口，却对所有请求返回 500。
 *   如果把它判成"可以继续"，容器会显示 healthy 而实际全废 —— 这是最糟的失败形态
 *   （监控全绿、用户全错）。
 * - **Redis 是软依赖**：不可用时访问层会降级到进程内 MapStore，限流/验证码/会话
 *   在单实例内照常工作。若把它判成致命，一次可选组件的抖动就会升级为整体不可用。
 *
 * 这类策略一旦被写进入口脚本，就只能靠人工 review 保证；抽到这里后，
 * `dependency-plan.test.js` 会把两个方向都钉死。
 *
 * @author yijiu2025
 * @since 2026-09-20
 */

/** 未显式配置端口时的默认值 */
const DEFAULT_DB_PORT = 3306;
const DEFAULT_REDIS_PORT = 6379;

/**
 * 解析端口，非法值回退默认
 *
 * @param {string|undefined} raw - 原始端口字符串
 * @param {number} fallback - 回退值
 * @returns {number}
 */
function parsePort(raw, fallback) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : fallback;
}

/**
 * 生成依赖等待计划
 *
 * 未配置的依赖**不进计划**（例如 `REDIS_ENABLED!=true` 时根本不该等 Redis）：
 * 把"没配置"和"配置了但连不上"混为一谈，会让日志失去诊断价值。
 *
 * @param {Record<string, string|undefined>} [env=process.env] - 环境变量视图
 * @returns {Array<{name: string, host: string, port: number, required: boolean}>}
 *          `required=true` 表示等不到即失败退出；`false` 表示告警后继续（降级）
 */
function planDependencyWaits(env = process.env) {
  const plan = [];

  if (env.DB_HOST) {
    plan.push({
      name: '数据库',
      host: env.DB_HOST,
      port: parsePort(env.DB_PORT, DEFAULT_DB_PORT),
      required: true
    });
  }

  if (env.REDIS_ENABLED === 'true' && env.REDIS_HOST) {
    plan.push({
      name: 'Redis',
      host: env.REDIS_HOST,
      port: parsePort(env.REDIS_PORT, DEFAULT_REDIS_PORT),
      required: false
    });
  }

  return plan;
}

/**
 * 依据等待结果给出应执行的动作
 *
 * @param {object} opts
 * @param {boolean} opts.ok - 依赖是否在预算内就绪
 * @param {boolean} opts.required - 是否为硬依赖
 * @returns {'ready'|'fail'|'degrade'} ready=继续；fail=失败退出；degrade=告警后继续
 */
function classifyWaitOutcome({ ok, required }) {
  if (ok) return 'ready';
  return required ? 'fail' : 'degrade';
}

export { planDependencyWaits, classifyWaitOutcome, parsePort };
