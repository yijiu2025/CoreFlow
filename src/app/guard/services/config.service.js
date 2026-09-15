/**
 * Guard 配置开关服务
 *
 * 从 api/firewall/v1/apiConfig.js 下沉：模块/接口/系统级配置一键开关 + 热更新。
 * 复用 guard-config.js 的 getAllGuardConfigs / setGuardConfig。
 *
 * @author yijiu
 * @since 2026-08-16
 */
import { getAllGuardConfigs, setGuardConfig } from '../../../api/guard-config.js';

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
 * 允许经热更新接口改写的字段白名单。
 *
 * 语义必须与 `api/guard-config.js` 的 RUNTIME_FIELDS 保持一致：只放"运维可调"的运行时字段。
 * 刻意排除：
 * - 结构字段（id/name/url/method）：由代码注册决定，改了会让内存与代码不一致；
 * - **requirePermission**：这是代码级授权声明。若允许 PATCH 改写，
 *   任何拿到本接口权限的人都能把权限门槛设为 null 而自我提权（等于绕过 PBAC）。
 */
const PATCHABLE_FIELDS = new Set(['enabled', 'requireLogin', 'allowIps', 'allowRoles', 'description']);

/**
 * 热更新指定 system/group(/apiKey) 配置
 *
 * 只接受白名单字段；出现未知字段时**显式报错**而非静默丢弃
 * （静默丢弃正是本仓反复出现的缺陷类，会让调用方以为改成功了）。
 *
 * @returns {{ok:true, updated:object} | {ok:false, statusCode:number, message:string}}
 */
function updateConfig(system, group, apiKey, patch, request) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, statusCode: 400, message: 'patch 必须是对象' };
  }
  const unknown = Object.keys(patch).filter(k => !PATCHABLE_FIELDS.has(k));
  if (unknown.length > 0) {
    return { ok: false, statusCode: 400, message: `不允许修改的字段: ${unknown.join(', ')}` };
  }

  const operator = buildOperator(request);
  const updated = setGuardConfig(system, patch, group, apiKey, operator);
  if (!updated) {
    return { ok: false, statusCode: 404, message: '未找到指定配置路径' };
  }
  return { ok: true, updated };
}

/**
 * 模块/接口一键开关（toggle）
 *
 * 定位 system → group → (apiKey 指定时为接口级，否则模块级)，翻转 enabled。
 * @returns {{ok:true, enabled:boolean} | {ok:false, statusCode:number, message:string}}
 */
function toggleConfig(system, groupKey, apiKey, request) {
  const configs = getAllGuardConfigs();
  const sys = configs[system];
  if (!sys) return { ok: false, statusCode: 404, message: '系统不存在' };
  const group = sys.groups[groupKey];
  if (!group) return { ok: false, statusCode: 404, message: '模块不存在' };

  const current = apiKey ? (group.apis?.[apiKey] ?? null) : group;
  if (!current) return { ok: false, statusCode: 404, message: '接口不存在' };

  const newState = !current.enabled;
  setGuardConfig(system, { enabled: newState }, groupKey, apiKey, buildOperator(request));
  return { ok: true, enabled: newState };
}

/**
 * 系统全局防御一键开关
 * @returns {{ok:true, enabled:boolean} | {ok:false, statusCode:number, message:string}}
 */
function toggleSystemConfig(system, request) {
  const configs = getAllGuardConfigs();
  if (!configs[system]) return { ok: false, statusCode: 404, message: '系统不存在' };

  const newState = !configs[system].enabled;
  setGuardConfig(system, { enabled: newState }, null, null, buildOperator(request));
  return { ok: true, enabled: newState };
}

export { updateConfig, toggleConfig, toggleSystemConfig };
