/**
 * Guard 配置开关服务
 *
 * 从 api/firewall/v1/apiConfig.js 下沉：模块/接口/系统级配置一键开关 + 热更新。
 * 复用 guard-config.js 的 getAllGuardConfigs / setGuardConfig。
 *
 * ── 授权模型（2026-11-07 起）──
 * 任何运行时字段的实际变更（收紧与放宽**都算**）都必须先换一张 step-up 票据：
 *   - 收紧（关模块、加角色、加白名单、requireLogin false→true）与放宽同样影响线上可用性，
 *     误操作与越权在结果上没有区别，因此不再"收紧免认证"；
 *   - 票据绑定本次 patch（服务端算 patchHash），一次性、5 分钟有效；
 *   - **只有放宽**额外附带 HMAC 签名信封：启动/同步合并时验签，
 *     这样"直接 UPDATE 数据库"这条路会因为拿不到签名而失效（收紧本来就不需要签名）；
 *   - 只改 description 这类无鉴权语义的字段才免认证。
 *
 * `requirePermission` / `freshPermission` 仍然是**代码级声明**，两边都不给口子：
 * 它们是 PBAC 的判据本身，一旦可写，整套权限模型就退化成表单字段。
 *
 * @author yijiu
 * @since 2026-08-16
 * @since 2026-11-07 改为方向感知 + 二次认证 + 签名信封
 */
import { getAllGuardConfigs, setGuardConfig } from '../../../api/guard-config.js';
import { logAuditEvent } from '../../../framework/security/auth/index.js';
import { createLogger } from '../../../framework/support/log/index.js';
import { diffPatch } from './direction.js';
import { signRelaxation } from './signing.js';
import { consumeTicket, buildPath } from './stepup.service.js';
import { isSuperAdmin } from './authority.js';

const log = createLogger('app.guard.config');

/**
 * 允许经热更新接口改写的字段白名单。
 *
 * 刻意排除的两类：
 * - 结构字段（id/name/url/method）：由代码注册决定，改了会让内存与代码不一致；
 * - **requirePermission / freshPermission**：代码级授权声明。若允许改写，
 *   任何拿到本接口权限的人都能把权限门槛设为 null 而自我提权（等于绕过 PBAC）。
 *
 * `requireLogin` 在 2026-11-07 曾因"true→false 等于关掉模块鉴权"被移出白名单；
 * 现在放宽方向已由二次认证 + 签名信封兜住，因此放回来 —— 否则面板会出现
 * "能加角色、不能改登录要求"的割裂。
 */
const PATCHABLE_FIELDS = new Set(['enabled', 'requireLogin', 'allowIps', 'allowRoles', 'description']);

/**
 * 构造操作者上下文（供审计）
 * @param {object} request - Fastify request
 * @returns {{userId:string, ip:string, redis:object}}
 */
function buildOperator(request) {
  return {
    userId: request.state?.user?.uid,
    ip: request.ip,
    redis: request.server?.redis
  };
}

/**
 * 在配置树里定位当前节点
 * @returns {object|null}
 */
function locateConfig(configs, system, group, apiKey) {
  const sys = configs?.[system];
  if (!sys) return null;
  if (!group) return sys;
  const grp = sys.groups?.[group];
  if (!grp) return null;
  if (!apiKey) return grp;
  return grp.apis?.[apiKey] ?? null;
}

/**
 * 为放宽变更补上签名信封
 *
 * 签名覆盖目标路径 + 该节点的全部运行时字段值 + 操作者 + 时间 + 原因，
 * 因此签名之后改任何一个运行时字段都会失配 —— 不存在"签一次名，之后随便改"。
 *
 * @returns {{ok:true, envelope:object} | {ok:false, message:string}}
 */
function attachRelaxation({ system, group, apiKey, current, patch, request, reason }) {
  const at = new Date().toISOString();
  const by = request.state?.user?.uid || 'unknown';

  try {
    const envelope = signRelaxation({
      path: buildPath(system, group, apiKey),
      node: { ...current, ...patch },
      at,
      by,
      reason
    });
    return { ok: true, envelope };
  } catch (err) {
    log.error(`❌ [Guard Config] 放宽签名失败 path=${buildPath(system, group, apiKey)}`, err);
    return { ok: false, message: '签名密钥未就绪，暂不能放宽权限配置' };
  }
}

/**
 * 记录一次"变更已授权"的审计
 *
 * setGuardConfig 内部那条记录的是通用变更（字段名列表），
 * 这里补的是"凭什么允许改"：谁、用什么方式、什么原因、改了哪几项、方向如何。
 */
function auditAuthorizedChange({ request, system, group, apiKey, diff, auth }) {
  logAuditEvent({
    type: 'PERMISSION_CHANGE',
    userId: request.state?.user?.uid || null,
    ip: request.ip || null,
    appId: 'guard',
    details: {
      action: 'guard_change_authorized',
      direction: diff.direction,
      path: buildPath(system, group, apiKey),
      method: auth.method,
      reason: auth.reason,
      changes: diff.changes,
      timestamp: new Date().toISOString()
    }
  }).catch(() => {
    // 审计写入失败不影响配置更新（与 setGuardConfig 的处理保持一致）
  });
}

/**
 * 热更新指定 system/group(/apiKey) 配置
 *
 * 只接受白名单字段；出现未知字段时**显式报错**而非静默丢弃
 * （静默丢弃正是本仓反复出现的缺陷类，会让调用方以为改成功了）。
 *
 * 认证要求：只要 patch 真的改变了某个运行时字段（收紧或放宽都算），就必须带 step-up 票据。
 * 只有 `description` 这类不参与鉴权的字段可以免认证 —— 否则改个说明也要收验证码。
 *
 * @param {object} params
 * @param {string} params.system
 * @param {string} params.group
 * @param {string} [params.apiKey]
 * @param {object} params.patch
 * @param {object} params.request
 * @param {string} [params.stepupToken] 有任何运行时字段变更时必传（原因存在票据里，不信任请求体）
 * @returns {Promise<object>}
 */
async function updateConfig({ system, group, apiKey, patch, request, stepupToken }) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, statusCode: 400, message: 'patch 必须是对象' };
  }

  const unknown = Object.keys(patch).filter(k => !PATCHABLE_FIELDS.has(k));
  if (unknown.length > 0) {
    return { ok: false, statusCode: 400, message: `不允许修改的字段: ${unknown.join(', ')}` };
  }

  // 写入路径再兜一道身份校验：票据有 5 分钟有效期，
  // 期间若超管角色被撤销，仅靠发票时的校验会留下一个越权窗口。
  if (!isSuperAdmin(request.state?.user)) {
    return { ok: false, statusCode: 403, message: '安全配置仅允许超级管理员操作' };
  }

  const current = locateConfig(getAllGuardConfigs(), system, group, apiKey);
  if (!current) {
    return { ok: false, statusCode: 404, message: '未找到指定配置路径' };
  }

  const diff = diffPatch(current, patch);

  // 无鉴权语义的改动（目前只有 description）不需要认证：
  // 它不进 RUNTIME_FIELDS，也不影响任何一条访问判定。
  if (diff.direction === 'neutral') {
    const updated = setGuardConfig(system, { ...patch }, group, apiKey, buildOperator(request));
    if (!updated) {
      return { ok: false, statusCode: 404, message: '未找到指定配置路径' };
    }
    return { ok: true, updated, direction: 'neutral' };
  }

  // 收紧与放宽都要求认证：误把模块关掉、把角色踢出去，和越权放宽在结果上没有区别
  const auth = await consumeTicket({ token: stepupToken, system, group, apiKey, patch, request });
  if (!auth.ok) {
    return {
      ok: false,
      statusCode: auth.statusCode,
      message: auth.message,
      code: 'stepup_required',
      changes: diff.changes
    };
  }

  const writePatch = { ...patch };

  if (diff.direction === 'relax') {
    // 只有放宽需要签名信封：DB 合并时的验签正是为了挡住"用 SQL 放权"这条旁路。
    // 收紧方向天然安全（DB 里收紧再多也只是更严），不需要签名。
    const signed = attachRelaxation({ system, group, apiKey, current, patch, request, reason: auth.reason });
    if (!signed.ok) {
      return { ok: false, statusCode: 503, message: signed.message };
    }
    writePatch._relaxation = signed.envelope;
  } else {
    // 收紧时清除旧信封，避免节点上留着一份与当前字段值对不上的签名
    writePatch._relaxation = null;
  }

  const updated = setGuardConfig(system, writePatch, group, apiKey, buildOperator(request));
  if (!updated) {
    return { ok: false, statusCode: 404, message: '未找到指定配置路径' };
  }

  auditAuthorizedChange({ request, system, group, apiKey, diff, auth });

  return { ok: true, updated, direction: diff.direction };
}

/**
 * 模块/接口一键开关（toggle）
 *
 * 翻转 `enabled`：`true → false` 是收紧、`false → true` 是放宽，
 * 两个方向都要二次认证 —— 否则"先关掉再打开"就是绕过认证的后门。
 *
 * @returns {Promise<object>}
 */
async function toggleConfig({ system, group: groupKey, apiKey, request, stepupToken }) {
  const configs = getAllGuardConfigs();
  const sys = configs[system];
  if (!sys) return { ok: false, statusCode: 404, message: '系统不存在' };
  const group = sys.groups?.[groupKey];
  if (!group) return { ok: false, statusCode: 404, message: '模块不存在' };

  const current = apiKey ? (group.apis?.[apiKey] ?? null) : group;
  if (!current) return { ok: false, statusCode: 404, message: '接口不存在' };

  const newState = !current.enabled;
  const result = await updateConfig({
    system,
    group: groupKey,
    apiKey,
    patch: { enabled: newState },
    request,
    stepupToken
  });
  if (!result.ok) return result;
  return { ...result, enabled: newState };
}

/**
 * 系统全局防御一键开关
 * @returns {Promise<object>}
 */
async function toggleSystemConfig({ system, request, stepupToken }) {
  const configs = getAllGuardConfigs();
  if (!configs[system]) return { ok: false, statusCode: 404, message: '系统不存在' };

  const newState = !configs[system].enabled;
  const result = await updateConfig({
    system,
    group: null,
    apiKey: null,
    patch: { enabled: newState },
    request,
    stepupToken
  });
  if (!result.ok) return result;
  return { ...result, enabled: newState };
}

export { PATCHABLE_FIELDS, updateConfig, toggleConfig, toggleSystemConfig };
