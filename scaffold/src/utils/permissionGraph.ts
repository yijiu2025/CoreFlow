/**
 * 权限关系图的索引与洞察（纯函数）
 *
 * 把 `/permissions/graph` 的扁平数据建成双向索引，供溯源视图、菜单星图与体检复用。
 * 移植自参考项目 `utils/permissionGraph.ts`，三处字段差异已对齐本仓后端：
 *   1. 菜单父级是 `parent_id`（参考项目是 `parentId`）；
 *   2. 超管编码是 `superadmin`（参考项目是 `super_admin`）；
 *   3. 角色表没有启用位（只有软删）⇒ `roleActive` 恒真，判据是"记录存在"。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import type { GraphMenu, GraphRole, GraphUser, PermissionGraph } from '@/api/types';

export type { GraphMenu, GraphRole, GraphUser };

/** 建好索引后的整图 */
export interface PermissionIndex {
  graph: PermissionGraph;
  user: Map<number, GraphUser>;
  role: Map<number, GraphRole>;
  menu: Map<number, GraphMenu>;
  /** 用户 → 角色 ID */
  rolesOfUser: Map<number, number[]>;
  /** 角色 → 用户 ID */
  usersOfRole: Map<number, number[]>;
  /** 菜单 → 授予它的角色 ID */
  rolesOfMenu: Map<number, number[]>;
  /** 父菜单 ID（根为 0）→ 子菜单 */
  childrenOf: Map<number, GraphMenu[]>;
}

/**
 * 往 map 的数组里追加
 *
 * @param map 目标
 * @param key 键
 * @param value 值
 */
function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * 建立整图索引
 *
 * @param graph 后端返回的扁平数据
 * @returns 索引对象
 */
export function indexPermissionGraph(graph: PermissionGraph): PermissionIndex {
  const rolesOfUser = new Map<number, number[]>();
  const usersOfRole = new Map<number, number[]>();
  for (const [userId, roleId] of graph.userRoles) {
    push(rolesOfUser, Number(userId), Number(roleId));
    push(usersOfRole, Number(roleId), Number(userId));
  }

  const rolesOfMenu = new Map<number, number[]>();
  for (const role of graph.roles) {
    for (const menuId of role.menuIds ?? []) push(rolesOfMenu, Number(menuId), Number(role.id));
  }

  const childrenOf = new Map<number, GraphMenu[]>();
  const sorted = [...graph.menus].sort((a, b) => a.sort - b.sort || a.id - b.id);
  for (const menu of sorted) push(childrenOf, menu.parent_id ?? 0, menu);

  return {
    graph,
    user: new Map(graph.users.map(u => [Number(u.id), u])),
    role: new Map(graph.roles.map(r => [Number(r.id), r])),
    menu: new Map(graph.menus.map(m => [Number(m.id), m])),
    rolesOfUser,
    usersOfRole,
    rolesOfMenu,
    childrenOf
  };
}

/**
 * 角色是否生效
 *
 * 🔴 本仓 `iam_role` 没有启用位，软删由 paranoid（`deleted_at`）在查询层过滤，
 *    所以进到图里的角色一律视为生效 —— 保留这个函数是为了让调用点的语义
 *    与参考项目一致（将来加启用位只改这里）。
 *
 * @param role 角色
 * @returns 是否生效
 */
export function roleActive(role: GraphRole | undefined): boolean {
  return Boolean(role);
}

/**
 * 是否超级管理员（拥有全部菜单）
 *
 * @param role 角色
 * @returns 是否超管
 */
export function isSuperRole(role: GraphRole | undefined): boolean {
  return Boolean(role && role.code === 'superadmin');
}

/**
 * 用户实际拥有的菜单 ID（生效角色的并集）
 *
 * @param index 索引
 * @param userId 用户 ID
 * @returns 菜单 ID 集合
 */
export function menusOfUser(index: PermissionIndex, userId: number): Set<number> {
  const out = new Set<number>();
  for (const roleId of index.rolesOfUser.get(userId) ?? []) {
    const role = index.role.get(roleId);
    if (!roleActive(role) || !role) continue;
    if (isSuperRole(role)) index.graph.menus.forEach(m => out.add(m.id));
    else (role.menuIds ?? []).forEach(id => out.add(Number(id)));
  }
  return out;
}

/**
 * 菜单从根到自身的路径
 *
 * @param index 索引
 * @param menuId 菜单 ID
 * @returns 路径（含自身）
 */
export function menuPath(index: PermissionIndex, menuId: number): GraphMenu[] {
  const path: GraphMenu[] = [];
  let cur = index.menu.get(menuId);
  const guard = new Set<number>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.unshift(cur);
    cur = cur.parent_id ? index.menu.get(cur.parent_id) : undefined;
  }
  return path;
}

/**
 * 能访问某菜单的角色与用户（超管视为全量）
 *
 * @param index 索引
 * @param menuId 菜单 ID
 * @returns 角色与用户列表
 */
export function holdersOfMenu(index: PermissionIndex, menuId: number): { roles: GraphRole[]; users: GraphUser[] } {
  const roleIds = new Set(index.rolesOfMenu.get(menuId) ?? []);
  index.graph.roles.filter(isSuperRole).forEach(r => roleIds.add(Number(r.id)));
  const roles = [...roleIds]
    .map(id => index.role.get(id))
    .filter((r): r is GraphRole => Boolean(r) && roleActive(r));
  const userIds = new Set<number>();
  roles.forEach(r => (index.usersOfRole.get(Number(r.id)) ?? []).forEach(u => userIds.add(u)));
  return { roles, users: [...userIds].map(id => index.user.get(id)).filter((u): u is GraphUser => Boolean(u)) };
}

/** 全局体检结果 */
export interface PermissionFindings {
  /** 没有任何持有人的角色 */
  unusedRoles: GraphRole[];
  /** 没有分配角色的用户 */
  usersWithoutRole: GraphUser[];
  /** 没有任何非超管角色授予的菜单 */
  orphanMenus: GraphMenu[];
  /** 缺少权限码的按钮（接口无法按它判定） */
  buttonsWithoutCode: GraphMenu[];
  /** 叠加 3 个及以上角色的用户 */
  overlapUsers: Array<{ user: GraphUser; roles: GraphRole[] }>;
}

/**
 * 全局体检：孤立菜单、闲置角色、无角色用户、缺码按钮、角色叠加
 *
 * @param index 索引
 * @returns 各桶结果
 */
export function permissionFindings(index: PermissionIndex): PermissionFindings {
  const granted = new Set<number>();
  index.graph.roles
    .filter(r => roleActive(r) && !isSuperRole(r))
    .forEach(r => (r.menuIds ?? []).forEach(id => granted.add(Number(id))));

  return {
    unusedRoles: index.graph.roles.filter(r => !(index.usersOfRole.get(Number(r.id))?.length ?? 0)),
    usersWithoutRole: index.graph.users.filter(u => !(index.rolesOfUser.get(Number(u.id))?.length ?? 0)),
    orphanMenus: index.graph.menus.filter(m => m.status === 1 && !granted.has(m.id)),
    buttonsWithoutCode: index.graph.menus.filter(m => m.type === 'btn' && !m.permission),
    overlapUsers: index.graph.users
      .map(user => ({
        user,
        roles: (index.rolesOfUser.get(Number(user.id)) ?? [])
          .map(id => index.role.get(id))
          .filter((r): r is GraphRole => Boolean(r) && roleActive(r))
      }))
      .filter(item => item.roles.length >= 3)
  };
}
