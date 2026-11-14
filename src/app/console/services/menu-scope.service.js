/**
 * 菜单管理的「应用域」判据
 *
 * 跨应用之后，`admin:menu:update` 只回答"能不能改菜单"，不回答"能改哪个应用的菜单"。
 * 缺这一层就是一条提权通道：任何能进菜单管理的人都能改防火墙的按钮节点，
 * 再把按钮授权给自己的角色 —— 应用域就这么被绕过去了。
 *
 * 判据两条：
 *  ① 角色归属层（`canWriteApp`）：普通应用角色不能碰别家的菜单；
 *  ② 权限命名空间层：操作者必须持有该应用的码（`fw:*` / `posecraft:*`…），
 *     或者本身就是跨应用管理员（`*` / `admin:*`）。
 *
 * 抽成独立模块是为了可单测：这里是纯逻辑，不该被 Fastify 路由的 import 副作用拖住。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { actionMetaRegistry } from '../../../framework/security/pbac/index.js';
import { canWriteApp } from './access-scope.service.js';
import { toPermissionList } from '../utils/permissions.js';

/**
 * 应用显示名
 *
 * @param {string} appId 应用标识
 * @returns {string} 展示名（未注册时回落标识本身）
 */
function appNameOf(appId) {
  return actionMetaRegistry.find(meta => meta.domain === appId)?.name || appId;
}

/**
 * 应用对应的权限命名空间
 *
 * `firewall` → `fw`（历史命名不统一），所以从注册表里第一条码现取，不写死映射表 ——
 * 新应用接入时不用改这里。
 *
 * @param {string} appId 应用标识
 * @returns {string} 命名空间前缀（未注册时为空串）
 */
function namespaceOf(appId) {
  const meta = actionMetaRegistry.find(item => item.domain === appId);
  const sample = meta?.actions?.[0]?.code || '';
  return sample.split(':')[0];
}

/**
 * 操作者能否配置该应用的菜单
 *
 * @param {object} user request.state.user（读 `permissions`）
 * @param {object} actor 操作者画像（`getActorScope` 的产物）
 * @param {string} appId 目标应用
 * @returns {boolean} 是否可配置
 */
function canConfigureApp(user, actor, appId) {
  if (!canWriteApp(actor, appId)) return false;
  // admin 应用由路由上的 requirePermission（admin:menu:*）覆盖，无需再判命名空间
  if (appId === 'admin') return true;
  // 未注册的应用先拒：否则把 appId 打错也能建出一棵挂不到任何路由的菜单树
  const namespace = namespaceOf(appId);
  if (!namespace) return false;
  const codes = toPermissionList(user?.permissions);
  if (codes.some(code => code === '*' || code === 'admin:*')) return true;
  return codes.some(code => code === namespace || code.startsWith(`${namespace}:`));
}

export { appNameOf, namespaceOf, canConfigureApp };
