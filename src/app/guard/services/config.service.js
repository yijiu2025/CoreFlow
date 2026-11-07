/**
 * Guard 配置开关服务
 *
 * 从 api/firewall/v1/apiConfig.js 下沉：模块/接口/系统级配置一键开关 + 热更新。
 * 复用 guard-config.js 的 getAllGuardConfigs / setGuardConfig。
 *
 * @author yijiu
 * @since 2026-08-16
 * @since 2026-11-07 热更新只允许**收紧**，不允许放宽（详见 PATCHABLE_FIELDS 注释）
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
 * 刻意排除的三类：
 * - 结构字段（id/name/url/method）：由代码注册决定，改了会让内存与代码不一致；
 * - **requirePermission**：代码级授权声明。若允许 PATCH 改写，任何拿到本接口权限的人
 *   都能把权限门槛设为 null 而自我提权（等于绕过 PBAC）；
 * - **requireLogin**（2026-11-07 移出）：true→false 等于把这个模块的鉴权整段关掉。
 *   它与 requirePermission 是同一类"放宽即提权"的字段 —— 只防了一个等于没防。
 *
 * 留下的三个里，`enabled` 是"关闭即拦截"（只会更严），`description` 无鉴权语义，
 * `allowRoles` / `allowIps` 则**只能追加不能删减**（见 findRelaxation）：
 * 删掉一个角色 / 清空白名单 = 放宽访问面，持 `fw:config:write` 的运维据此就能
 * 越过 app 边界（例：把 Admin 域某组的 allowRoles 清空后读用户列表）。
 */
const PATCHABLE_FIELDS = new Set(['enabled', 'allowIps', 'allowRoles', 'description']);

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
 * 判断 patch 是否包含"放宽"改动
 *
 * 规则：`allowRoles` / `allowIps` 的新值必须是旧值的**超集**。
 * 删元素（含清空数组）一律拒绝 —— 那是扩大访问面，只能由代码变更 + 发版完成。
 *
 * @param {object} current 当前生效配置节点
 * @param {object} patch 待写入的 patch
 * @returns {string|null} 违规说明；null 表示只收紧或不涉及
 */
function findRelaxation(current, patch) {
  if (!current) return null;

  for (const field of ['allowRoles', 'allowIps']) {
    if (patch[field] === undefined) continue;
    if (!Array.isArray(patch[field])) {
      return `${field} 必须是字符串数组`;
    }
    const oldList = Array.isArray(current[field]) ? current[field] : [];
    const removed = oldList.filter(v => !patch[field].includes(v));
    if (removed.length > 0) {
      return `${field} 不允许移除已有条目（会放宽访问面）: ${removed.join(', ')}`;
    }
  }

  return null;
}

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

  // 定位当前节点做"只能收紧"校验（拿不到节点时交给 setGuardConfig 返回 404）
  const current = locateConfig(getAllGuardConfigs(), system, group, apiKey);
  const relaxation = findRelaxation(current, patch);
  if (relaxation) {
    return { ok: false, statusCode: 400, message: relaxation };
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
 * `enabled=false` 是"该节点一律拒绝"，属收紧方向，故不受 findRelaxation 限制。
 *
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

export { PATCHABLE_FIELDS, updateConfig, toggleConfig, toggleSystemConfig, findRelaxation };
