/**
 * 用户当前生效的访问权（角色 + 权限码）
 *
 * 授权记录是一串流水，但读的人真正想先知道的是「他现在到底能干什么」。流水里
 * 的"生效中"标签原来由前端按**已加载的那一页**倒推 —— 只要角色的授予记录落在
 * 第二页之后，前端就会把仍然生效的角色标成已撤销（实测就会）。所以当前状态必须
 * 由服务端算：一次给全，不分页。
 *
 * 角色 → 权限码的翻译只走 `roleDao.detailMap`（`extractPermissions` 是唯一解析口径：
 * policy 可能是 JSON 字符串，历史 raw 查询会这么返回）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import roleDao from '../dao/role.dao.js';
import grantDao from '../dao/grant.dao.js';
import { actionMetaRegistry } from '../../../framework/security/pbac/index.js';
import { activeRoleIds, appLabel } from './access-scope.service.js';

/** 权限码里常见的动作前缀：模块名靠剥掉它们得到（"查看用户" → "用户"） */
const ACTION_PREFIXES = [
  '查看',
  '创建',
  '编辑',
  '删除',
  '分配',
  '导出',
  '导入',
  '配置',
  '更新',
  '重置',
  '执行',
  '管理'
];

/**
 * 权限码 → 元数据（中文名 / 所属应用）
 *
 * 来自 `definePermissionMeta` 注册的元数据，是权限码中文名的**唯一来源** ——
 * 不在前端再维护一份映射表，否则新增权限码时弹窗里会显示成裸代码。
 *
 * @returns {Map<string, {domain: string, domainName: string, label: string}>} 索引
 */
function codeMetaMap() {
  const map = new Map();
  for (const meta of actionMetaRegistry) {
    for (const action of meta.actions || []) {
      if (!action?.code) continue;
      map.set(action.code, { domain: meta.domain, domainName: meta.name, label: action.label || '' });
    }
  }
  return map;
}

/**
 * 权限码所属模块（按码的前缀折叠）
 *
 * `admin:user:read` → `admin:user`；两段码（如 `fw:config`）→ 自身；`*` 单独一组。
 *
 * @param {string} code 权限码
 * @returns {string} 模块键
 */
function moduleKeyOf(code) {
  if (code === '*') return '*';
  const parts = String(code).split(':');
  return parts.length >= 3 ? `${parts[0]}:${parts[1]}` : parts[0];
}

/**
 * 模块显示名
 *
 * 三条来源，按可靠性排序：① 通配码的元数据（`admin:user:*` = "用户管理通配" → 剥掉
 * 后缀得"用户管理"）② 组内任一权限码的中文名剥动作前缀 ③ 模块键本身。
 *
 * @param {string} key 模块键
 * @param {string[]} codes 组内权限码
 * @param {Map<string, object>} metaByCode 元数据索引
 * @returns {string} 显示名
 */
function moduleLabelOf(key, codes, metaByCode) {
  if (key === '*') return '全部权限';

  const wildcard = metaByCode.get(`${key}:*`);
  if (wildcard?.label) {
    const stripped = wildcard.label.replace(/(通配|全部)$/, '').trim();
    if (stripped) return stripped;
  }

  for (const code of codes) {
    let label = metaByCode.get(code)?.label;
    if (!label) continue;
    for (const prefix of ACTION_PREFIXES) {
      if (label.startsWith(prefix) && label.length > prefix.length) {
        label = label.slice(prefix.length);
        break;
      }
    }
    if (label) return label;
  }
  return key;
}

/**
 * 把权限码按模块折叠
 *
 * 一个角色挂十几条权限码时，平铺成 chips 是一堵墙；按模块收起来之后"他能管用户、
 * 能看日志"这种结论才是可读的。
 *
 * @param {string[]} codes 权限码（已去重）
 * @returns {Array<{key: string, label: string, domain: string, domainName: string, codes: Array<{code: string, label: string}>}>}
 */
function groupPermissions(codes) {
  const metaByCode = codeMetaMap();
  const buckets = new Map();
  for (const code of codes) {
    const key = moduleKeyOf(code);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(code);
  }

  const groups = [...buckets.entries()].map(([key, list]) => {
    const first = metaByCode.get(list.find(code => metaByCode.has(code)) || list[0]);
    return {
      key,
      label: moduleLabelOf(key, list, metaByCode),
      domain: first?.domain || '',
      domainName: first?.domainName || '',
      codes: list.map(code => ({ code, label: metaByCode.get(code)?.label || '' }))
    };
  });

  // 通配 `*` 最有分量，排最前；其余按"应用 → 模块名"
  return groups.sort((a, b) => {
    if (a.key === '*') return -1;
    if (b.key === '*') return 1;
    return (
      (a.domainName || a.domain).localeCompare(b.domainName || b.domain, 'zh-CN') ||
      a.label.localeCompare(b.label, 'zh-CN')
    );
  });
}

/**
 * 描述某用户当前生效的角色与权限
 *
 * @param {number} userId 用户 ID
 * @returns {Promise<{
 *   roles: Array<object>,
 *   permissionCodes: string[],
 *   permissionGroups: Array<object>,
 *   apps: Array<{id: string, label: string}>,
 *   wildcard: boolean
 * }>} 当前生效的访问权
 */
async function describeCurrentAccess(userId) {
  const roleIds = await activeRoleIds(userId);
  if (roleIds.length === 0) {
    return { roles: [], permissionCodes: [], permissionGroups: [], apps: [], wildcard: false };
  }

  const [details, grants] = await Promise.all([roleDao.detailMap(roleIds), grantDao.currentGrantInfo(userId)]);
  const grantByRole = new Map(grants.map(g => [Number(g.roleId), g]));

  const roles = roleIds
    .map(id => {
      const detail = details.get(Number(id));
      if (!detail) return null; // 角色被删但关联还在：历史里能解释，这里不展示
      const grant = grantByRole.get(Number(id));
      return {
        role_id: Number(id),
        role_code: detail.code,
        role_name: detail.name,
        app_id: detail.appId,
        app_label: appLabel(detail.appId),
        rank_level: detail.rank,
        permissions: detail.permissions,
        granted_at: grant?.grantedAt ?? null,
        granted_by: grant?.grantedBy ?? null
      };
    })
    .filter(Boolean)
    // 职级高的在前：读者按"最重要的先看"扫
    .sort((a, b) => b.rank_level - a.rank_level);

  const permissionCodes = Array.from(new Set(roles.flatMap(role => role.permissions))).sort();
  const apps = Array.from(new Set(roles.map(role => role.app_id))).map(id => ({ id, label: appLabel(id) }));

  return {
    roles,
    permissionCodes,
    permissionGroups: groupPermissions(permissionCodes),
    apps,
    // `*` 是全权通配：这时候"共 N 个权限码"没有意义，前端要换一种说法
    wildcard: permissionCodes.includes('*')
  };
}

export { describeCurrentAccess, groupPermissions };
