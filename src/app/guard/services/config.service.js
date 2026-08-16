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
 * 热更新指定 system/group(/apiKey) 配置
 * @returns {{ok:true, updated:object} | {ok:false, statusCode:number, message:string}}
 */
export function updateConfig(system, group, apiKey, patch, request) {
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
export function toggleConfig(system, groupKey, apiKey, request) {
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
export function toggleSystemConfig(system, request) {
  const configs = getAllGuardConfigs();
  if (!configs[system]) return { ok: false, statusCode: 404, message: '系统不存在' };

  const newState = !configs[system].enabled;
  setGuardConfig(system, { enabled: newState }, null, null, buildOperator(request));
  return { ok: true, enabled: newState };
}
