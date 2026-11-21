/**
 * 接口开关的二次验证策略
 *
 * === 这个设置管什么 ===
 * 「应用管理 → 接口开关」每次改动都要二次验证（邮箱验证码 / 密码），票据绑定
 * `path + patchHash`。这条策略说的是：**还要不要走这一步**。
 *
 *   requireStepUp = true（默认）  关闭与重开都要票据
 *   requireStepUp = false         关闭免票（收紧天然安全）；**重开仍要票据**
 *
 * 🔴 为什么"关掉之后重开还要票"：重开是**放宽**，`config.service` 会给它附一个
 *    签名信封，重启时 `applyRuntimeFields` 要靠这个信封才肯把 DB 里的放宽合并回来。
 *    没有票据就签不出信封 —— 强行走 `setGuardConfig` 写进去，重启后配置会被静默回滚，
 *    表现成"我明明开了，重启又关了"。所以这是设计约束，不是遗漏。
 *
 * === 设置存在哪 ===
 * `data/admin_config.json`（运行期配置，`createRuntimeConfig` 监听 mtime，1s 内热生效，
 * 多实例天然一致）。默认值写在下面的 `DEFAULTS`，`src/config/` 不参与 —— 它属于
 * **运维开关**而不是编译期常量。
 *
 * 🔴 只有超管能改（`isSuperAdmin`）：把二次验证关掉等于降低"误关生产接口"的门槛，
 *    这个权力不能顺着 `admin:app:*:manage` 扩散。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import fs from 'node:fs';
import { createRuntimeConfig } from '../../../framework/config/runtime.js';
import { dataFile, ensureDataDir } from '../../../framework/config/paths.js';
import { isSuperAdmin } from './authority.js';
import { logAuditEvent } from '../../../framework/security/auth/index.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.guard.switch-policy');

/** 默认值：开启二次验证 */
const DEFAULTS = { apiSwitch: { requireStepUp: true } };

const runtime = createRuntimeConfig({ name: 'admin', defaults: DEFAULTS });

/** 绑定的活对象：热改后原地更新，读方直接读属性 */
const policy = runtime.bind({ apiSwitch: { requireStepUp: true } });

/** 运行期文件名 */
const FILE_NAME = 'admin_config.json';

/**
 * 当前策略
 *
 * 判据用 `!== false` 而不是 `=== true`：文件缺失、键写错、被删掉时都应回落到"要二次验证"
 * （安全默认）。只有显式写 `false` 才算关闭。
 *
 * @returns {{requireStepUp: boolean}} 策略快照
 */
function getApiSwitchPolicy() {
  const value = policy?.apiSwitch?.requireStepUp;
  return { requireStepUp: value !== false };
}

/**
 * 原子写 JSON：先写临时文件再 rename，避免读到半截文件
 *
 * @param {string} file 目标文件
 * @param {object} data 内容
 * @returns {void}
 */
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * 修改策略（仅超管）
 *
 * @param {object} params 参数
 * @param {boolean} params.requireStepUp 是否要求二次验证
 * @param {object} params.actor 操作者（`request.state.user`）
 * @param {object} [params.request] Fastify 请求（审计取 ip / ua）
 * @returns {Promise<{ok: boolean, statusCode?: number, message?: string, policy?: object}>} 结果
 */
async function setApiSwitchPolicy({ requireStepUp, actor, request }) {
  if (!isSuperAdmin(actor)) {
    return { ok: false, statusCode: 403, message: '只有超级管理员可以调整二次验证策略' };
  }

  const file = dataFile(FILE_NAME);
  ensureDataDir();

  let current = {};
  try {
    if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (err) {
    /* 文件损坏时以默认值为底重写，不阻断操作（否则这个设置永远改不回来） */
    log.warn(`⚠️ [SwitchPolicy] ${FILE_NAME} 解析失败，按默认值重建: ${err?.message || err}`);
    current = {};
  }

  const next = {
    ...current,
    apiSwitch: { ...(current.apiSwitch || {}), requireStepUp: Boolean(requireStepUp) }
  };
  writeJsonAtomic(file, next);
  runtime.reload();

  await logAuditEvent({
    type: 'PERMISSION_CHANGE',
    userId: actor?.userId ?? null,
    ip: request?.ip ?? null,
    details: {
      action: 'api_switch_stepup_policy',
      requireStepUp: Boolean(requireStepUp),
      timestamp: new Date().toISOString()
    }
  }).catch(() => {});

  log.info(`🔐 [SwitchPolicy] 二次验证策略已改为 ${requireStepUp ? '开启' : '关闭'}（超管操作）`);
  return { ok: true, policy: getApiSwitchPolicy() };
}

export { getApiSwitchPolicy, setApiSwitchPolicy, FILE_NAME };
