/**
 * 应用级接口开关（「应用管理 → 接口开关」的数据与写入）
 *
 * === 为什么不新写一套开关逻辑 ===
 * 守卫配置本来就是按「系统 / 模块 / 接口」三级存的三棵树（`api/guard-config.js`），
 * 防火墙面板那套开关读写的也是它。这里只是换了个**入口和可见范围**：
 *
 *   · 原来的入口按"系统"（`Admin` / `posecraft` …）铺开，任何人进去能看到全部系统；
 *   · 新入口按"应用"收口：`system.json` 声明了 `app_id` 的系统才属于某个应用，
 *     于是"管理 posecraft 应用"的人只看到 posecraft 的接口，看不到管理后台的。
 *
 * 🔴 写入一律走 `app/guard/services/config.service.js`，不直接 `setGuardConfig`：
 *    那里才有**二次验证票据消费**与**放宽签名信封**。绕过去写 = 关掉的接口无法合规重开，
 *    或者留下一条验签不过的配置，下次启动被静默忽略。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { getAllGuardConfigs, setGuardConfig } from '../../../api/guard-config.js';
import { toggleConfig, toggleSystemConfig, updateConfig } from './config.service.js';
import { getApiSwitchPolicy } from './app-switch-policy.service.js';
import { logAuditEvent } from '../../../framework/security/auth/index.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.guard.app-api');

/** 对外可见的节点字段（其余内部字段如 `_relaxation` / `updatedAt` 不出去） */
const PUBLIC_FIELDS = [
  'id',
  'name',
  'description',
  'prefix',
  'enabled',
  'requireLogin',
  'requirePermission',
  'allowIps',
  'allowRoles'
];

/**
 * 取节点对外形状
 *
 * @param {object} node 配置节点
 * @returns {object} 只含公开字段的快照
 */
function pickFields(node) {
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (node[key] !== undefined) out[key] = node[key];
  }
  return out;
}

/**
 * 某个应用占有哪些接口系统
 *
 * 判据是 `system.json` 里的归属声明，两级语义不同（详见 `api/guard-config.js` 的 `appId`）：
 *   · `app_id`       —— **会话归属**（私有 API）：这个前缀属于哪个应用
 *   · `owner_app_id` —— **管理归属**（共享 API 也能有）：开关归哪个应用的管理员管
 * 只声明 `owner_app_id` 的系统（如 `/oauth2.1` 登录授权、`/notice` 通知）会出现在
 * 对应应用的抽屉里，但**不会**参与会话归属校验 —— 否则别的应用的会话调登录接口会被 401。
 *
 * @param {string} appId 应用标识
 * @returns {object[]} 系统节点（含分组与接口）
 */
function listAppSystems(appId) {
  const tree = getAllGuardConfigs();
  const systems = [];

  for (const [systemKey, system] of Object.entries(tree)) {
    if (system?.appId !== appId) continue;
    const groups = [];
    for (const [groupKey, group] of Object.entries(system.groups || {})) {
      const apis = [];
      for (const [apiKey, api] of Object.entries(group.apis || {})) {
        apis.push({ key: apiKey, ...pickFields(api) });
      }
      // 组内按 key 排序：注册顺序取决于文件扫描顺序，每次重启可能变
      apis.sort((a, b) => String(a.key).localeCompare(String(b.key)));
      groups.push({ key: groupKey, ...pickFields(group), apis });
    }
    groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    systems.push({ key: systemKey, ...pickFields(system), groups });
  }

  systems.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return systems;
}

/**
 * 断言"这个系统确实属于该应用"
 *
 * 越权面在这里收口：调用方只提供 appId，系统归属由服务端判定 ——
 * 前端拿别的 systemKey 来试探，直接 403。
 *
 * @param {string} appId 应用标识
 * @param {string} systemKey 系统标识
 * @returns {boolean} 是否属于该应用
 */
function ownsSystem(appId, systemKey) {
  const node = getAllGuardConfigs()[systemKey];
  return Boolean(node) && node.appId === appId;
}

/**
 * 切换某个节点（系统 / 模块 / 接口）的启用状态
 *
 * @param {object} params 参数
 * @param {string} params.appId 应用标识（调用方声明）
 * @param {string} params.systemKey 系统标识
 * @param {string|null} [params.groupKey] 模块标识（空 = 系统级）
 * @param {string|null} [params.apiKey] 接口标识（空 = 模块级）
 * @param {object} params.request Fastify 请求（审计 + 二次验证要用）
 * @param {string|null} [params.stepupToken] 二次验证票据
 * @returns {Promise<object>} `{ ok, statusCode?, message?, code?, enabled? }`
 */
async function toggleAppNode({ appId, systemKey, groupKey, apiKey, request, stepupToken }) {
  if (!ownsSystem(appId, systemKey)) {
    return { ok: false, statusCode: 403, message: '该系统不属于当前应用' };
  }

  /*
   * 免票通道：策略关掉二次验证时，**只有"关闭"免票**。
   * "重开"是放宽，签名信封签不出来（见 app-switch-policy.service.js 的说明），仍走原路径。
   */
  const { requireStepUp } = getApiSwitchPolicy();
  if (!requireStepUp) {
    const node = getAllGuardConfigs()[systemKey];
    const target = !groupKey ? node : apiKey ? node?.groups?.[groupKey]?.apis?.[apiKey] : node?.groups?.[groupKey];
    if (!target) return { ok: false, statusCode: 404, message: '未找到指定配置路径' };

    if (target.enabled) {
      /* 收紧方向：直接写内存 + 落库，并留审计（reason 从请求体取，没有就写明免票策略） */
      const operator = { userId: request?.state?.user?.userId ?? null, ip: request?.ip ?? null };
      const updated = setGuardConfig(
        systemKey,
        { enabled: false, _relaxation: null },
        groupKey || null,
        apiKey || null,
        operator
      );
      if (!updated) return { ok: false, statusCode: 404, message: '未找到指定配置路径' };
      await logAuditEvent({
        type: 'PERMISSION_CHANGE',
        userId: operator.userId,
        ip: operator.ip,
        details: {
          action: 'api_switch_disable_without_stepup',
          path: [systemKey, groupKey || '', apiKey || ''].join('/'),
          reason: String(request?.body?.reason || '二次验证策略已关闭'),
          timestamp: new Date().toISOString()
        }
      }).catch(() => {});
      return { ok: true, enabled: false };
    }
    /* 正在开启：继续走带票据的路径，让上层拿到需要认证的结果 */
  }

  if (!groupKey) return toggleSystemConfig({ system: systemKey, request, stepupToken });

  const res = await toggleConfig({
    system: systemKey,
    group: groupKey,
    apiKey: apiKey || null,
    request,
    stepupToken: stepupToken || null
  });
  if (!res.ok) return res;

  /* 回读一次真实状态：切换是按"当前值取反"，返回值比调用方猜的可靠 */
  const node = getAllGuardConfigs()[systemKey];
  const target = apiKey ? node?.groups?.[groupKey]?.apis?.[apiKey] : node?.groups?.[groupKey];
  return { ok: true, enabled: Boolean(target?.enabled) };
}

/**
 * 更新节点上的可写字段（描述 / 白名单 / 是否要求登录）
 *
 * @param {object} params 参数
 * @param {string} params.appId 应用标识
 * @param {string} params.systemKey 系统标识
 * @param {string|null} [params.groupKey] 模块标识
 * @param {string|null} [params.apiKey] 接口标识
 * @param {object} params.patch 待写字段（只认 `PATCHABLE_FIELDS`）
 * @param {object} params.request Fastify 请求
 * @param {string|null} [params.stepupToken] 二次验证票据
 * @returns {Promise<object>} `{ ok, statusCode?, message?, code?, node? }`
 */
async function updateAppNode({ appId, systemKey, groupKey, apiKey, patch, request, stepupToken }) {
  if (!ownsSystem(appId, systemKey)) {
    return { ok: false, statusCode: 403, message: '该系统不属于当前应用' };
  }
  const res = await updateConfig({
    system: systemKey,
    group: groupKey || null,
    apiKey: apiKey || null,
    patch,
    request,
    stepupToken: stepupToken || null
  });
  if (!res.ok) return res;

  const node = getAllGuardConfigs()[systemKey];
  const target = apiKey ? node?.groups?.[groupKey]?.apis?.[apiKey] : groupKey ? node?.groups?.[groupKey] : node;
  return { ok: true, node: target ? pickFields(target) : null };
}

/**
 * 算出"切换"这次操作要写的 patch
 *
 * 二次认证的票据绑定 `path + patchHash`（见 `stepup.service.consumeTicket`），
 * 所以申请认证时的 patch 必须与真正执行时**逐字节一致**。让前端自己算
 * `{ enabled: !current }` 是危险的：它拿到的是几秒前的快照，期间别人改过一次就会失配，
 * 表现为"认证通过了但保存被拒"。这里在服务端按**当前真实状态**算，前后两次都走它。
 *
 * @param {object} params 参数
 * @param {string} params.appId 应用标识
 * @param {string} params.systemKey 系统标识
 * @param {string|null} [params.groupKey] 模块标识
 * @param {string|null} [params.apiKey] 接口标识
 * @returns {{ok: boolean, patch?: object, statusCode?: number, message?: string}} 结果
 */
function togglePatchOf({ appId, systemKey, groupKey, apiKey }) {
  if (!ownsSystem(appId, systemKey)) {
    return { ok: false, statusCode: 403, message: '该系统不属于当前应用' };
  }
  const node = getAllGuardConfigs()[systemKey];
  const target = !groupKey ? node : apiKey ? node?.groups?.[groupKey]?.apis?.[apiKey] : node?.groups?.[groupKey];
  if (!target) return { ok: false, statusCode: 404, message: '未找到指定配置路径' };
  return { ok: true, patch: { enabled: !target.enabled } };
}

/**
 * 某应用下的接口统计（供应用清单展示"关了 N 个"）
 *
 * @param {string} appId 应用标识
 * @returns {{total: number, disabled: number}} 统计
 */
function countAppApis(appId) {
  let total = 0;
  let disabled = 0;
  for (const system of listAppSystems(appId)) {
    for (const group of system.groups) {
      if (!group.enabled) disabled += 1;
      for (const api of group.apis) {
        total += 1;
        if (!api.enabled) disabled += 1;
      }
    }
  }
  return { total, disabled };
}

log.dev('📦 [AppApi] 应用级接口开关已加载');

export { listAppSystems, ownsSystem, toggleAppNode, updateAppNode, countAppApis, togglePatchOf };
