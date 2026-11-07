/**
 * 启动期配置体检（环境变量 + 运行调优配置）
 *
 * 从 `src/app.js` 抽出（2026-11-07）。两条判据的共同点是：**都必须在建立任何连接之前跑完**，
 * 否则配置错误会以"某个功能在运行期静默失效"的形态出现，排查成本远高于启动失败。
 *
 * 环境变量校验判据已统一收敛到 `framework/config/env.js` 的 schema —— 包括密钥强度与
 * 已知弱值黑名单（原先的 validateSecrets 就是这里的一部分）。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { validateEnv } from '../config/env.js';
import { APP_CONFIG } from '../config/app-config.js';
import { validateAppConfig } from '../config/app-config-schema.js';
import { createLogger } from '../log/index.js';

const log = createLogger('app.startup');

/**
 * 输出运行调优配置的问题（未知配置段/配置项、越界值）
 *
 * 只告警不阻断：调优文件不该有让服务起不来的能力。但必须在任何消费之前打印 ——
 * 配置问题要能在启动日志里一眼看见。
 *
 * ⚠️ 必须把 APP_CONFIG 传进去。`validateAppConfig()` 的形参默认值是 `{}`，
 * 无参调用等于"校验一个空对象" ⇒ 永远返回空数组、一条日志都不打，
 * 而 src/config/app_config.js 里写的错别字/越界值会静默生效为默认值（真实踩过：
 * 入口里写 `validateAppConfig()` 看起来像在体检，实际整条判据是死的）。
 * 回归用例见 src/__tests__/framework/startup/config-check.test.js。
 *
 * @returns {number} 问题条数（便于调用方/测试断言）
 */
function reportAppConfigWarnings() {
  const warnings = validateAppConfig(APP_CONFIG);
  for (const w of warnings) {
    log.warn(`⚠️ [AppConfig] ${w}`);
  }
  return warnings.length;
}

/**
 * 校验环境变量
 *
 * 分两级处置：
 *   · **错误**（配错、或生产环境缺必需项）→ 打印全部问题后终止进程。
 *     静默启动一个配置错误的服务，比启动失败更难排查。
 *   · **警告**（非生产环境缺必需项）→ 只提示，不拦启动。本地开发不该被拦住。
 *
 * ⚠️ 返回 false 表示已安排退出，调用方必须立刻停止后续初始化。
 *
 * @param {boolean} isProduction - 是否生产环境
 * @returns {boolean} true = 校验通过可以继续启动
 */
function checkEnvironment(isProduction) {
  const result = validateEnv(process.env, { isProduction });

  for (const w of result.warnings) {
    log.warn(`⚠️ [Config] ${w.key}: ${w.message}`);
  }
  for (const n of result.notes) {
    log.info(`ℹ️ [Config] ${n}`);
  }

  if (result.ok) return true;

  // 统一出口打印，避免问题多时被其他日志穿插
  log.always.error(`❌ [Config] 环境变量校验失败（${result.errors.length} 项），拒绝启动：`);
  for (const e of result.errors) {
    log.always.error(`   • ${e.key}: ${e.message}`);
  }
  // 给 stderr 100ms 刷新时间，确保 CI/Docker 环境下错误消息完整输出
  setTimeout(() => process.exit(1), 100);
  return false;
}

export { reportAppConfigWarnings, checkEnvironment };
