/**
 * 角色管理页面域声明（page: roles）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 角色页有三档视图：列表（按应用分组）、权限矩阵（菜单 × 角色）、授权溯源（用户 → 角色
 * → 菜单三层下钻）。三档吃的是同一份菜单树与角色行，派生结构（分组 / 展平 / 矩阵列）
 * 只在容器算一次（`views/system/Roles.vue`）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Component, ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { MatrixRole } from '@/components/business/PermissionMatrix.vue';
import type { DeptNode, MenuNode, RoleRow } from '@/api/types';

/** 权限目录里的一项 */
export interface PermItem {
  code: string;
  label: string;
  domain: string;
  domainName: string;
}

/** 按 domain 分组的权限项 */
export interface PermGroup {
  domain: string;
  domainName: string;
  items: PermItem[];
}

/** 应用分档（列表顶部的 tab） */
export interface RoleAppTab {
  id: string;
  label: string;
  count: number;
}

/** 按应用分组的角色 */
export interface RoleGroup {
  appId: string;
  label: string;
  rows: RoleRow[];
}

/** 角色表单 */
export interface RoleForm {
  id: number;
  code: string;
  name: string;
  appId: string;
  rankLevel: number;
  description: string;
  permissions: string[];
  /** 数据范围：1 全部 / 2 自定义 / 3 本部门 / 4 本部门及以下 / 5 仅本人 */
  dataScope: number;
  /** 自定义数据范围时的部门集合 */
  deptIds: number[];
}

/** 数据范围档位 */
export interface ScopeOption {
  value: number;
  label: string;
  hint: string;
}

/** 菜单展平项（矩阵 / 授权弹窗用） */
export interface MenuFlatItem {
  node: MenuNode;
  depth: number;
}

/** 部门展平项（自定义数据范围用） */
export interface DeptFlatItem {
  node: DeptNode;
  depth: number;
}

/** 角色管理版式上下文（版式只读它） */
export interface RolesViewContext {
  /** 当前渲染设备：`'mobile'` 走卡片，其余走表格 */
  device: Ref<string>;
  /** 权限矩阵与授权溯源（异步组件，容器给） */
  matrix: Component;
  trace: Component;
  rows: Ref<RoleRow[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  /** 列表筛选 */
  keyword: Ref<string>;
  appFilter: Ref<string>;
  /** 矩阵筛选 */
  matrixKeyword: Ref<string>;
  matrixType: Ref<'' | MenuNode['type']>;
  hasFilter: ComputedRef<boolean>;
  /** 视图档位 */
  altView: Ref<'table' | 'matrix' | 'trace'>;
  /** 溯源视图聚焦的权限码 */
  traceFocus: Ref<string | null>;
  matrixSaving: Ref<boolean>;
  appTabs: ComputedRef<RoleAppTab[]>;
  roleGroups: ComputedRef<RoleGroup[]>;
  isCollapsed: (appId: string) => boolean;
  toggleCollapse: (appId: string) => void;
  clearFilters: () => void;
  /** 权限码表格（授权弹窗） */
  trees: Ref<MenuNode[]>;
  dialogOpen: Ref<boolean>;
  activeRole: Ref<RoleRow | null>;
  /** 授权弹窗里勾选的菜单 id */
  checked: Ref<number[]>;
  saving: Ref<boolean>;
  flatMenus: ComputedRef<MenuFlatItem[]>;
  /** 该角色没有对应权限码、被隐藏的菜单数 */
  hiddenMenuCount: ComputedRef<number>;
  toggleMenu: (nodeId: number, on: boolean) => void;
  openMenus: (row: RoleRow) => Promise<void>;
  submitMenus: () => Promise<void>;
  remove: (row: RoleRow) => Promise<void>;
  /** 角色表单 */
  formOpen: Ref<boolean>;
  formBuiltin: Ref<boolean>;
  formError: Ref<string>;
  submitting: Ref<boolean>;
  form: RoleForm;
  isEditing: ComputedRef<boolean>;
  SCOPE_OPTIONS: readonly ScopeOption[];
  currentScopeHint: ComputedRef<string>;
  /** 当前编码能否配数据范围（普通角色只能「仅本人」） */
  scopeConfigurable: ComputedRef<boolean>;
  /** 超管职级只读（降到 1 会把自己关在门外） */
  rankLocked: ComputedRef<boolean>;
  deptFlat: ComputedRef<DeptFlatItem[]>;
  /** 权限目录 */
  catalogLoading: Ref<boolean>;
  permKeyword: Ref<string>;
  catalogGroups: ComputedRef<PermGroup[]>;
  /** 内置角色实际持有的权限（展开通配后按 domain 分组） */
  builtinGroups: ComputedRef<PermGroup[]>;
  permissionCount: ComputedRef<number>;
  isWildcard: (code: string) => boolean;
  permChecked: (code: string) => boolean;
  togglePerm: (code: string, on: boolean) => void;
  allChecked: (items: PermItem[]) => boolean;
  toggleGroup: (items: PermItem[], on: boolean) => void;
  appFilteredCount: ComputedRef<number | null>;
  /** 矩阵列（角色）与单元格（菜单 → 角色） */
  matrixRoles: ComputedRef<MatrixRole[]>;
  matrixGrants: ComputedRef<Record<number, number[]>>;
  saveMatrix: (changes: Array<{ roleId: number; menuIds: number[] }>) => Promise<void>;
  canEdit: ComputedRef<boolean>;
  canReadMenu: ComputedRef<boolean>;
  canCreate: boolean;
  canDelete: boolean;
  load: () => Promise<void>;
  notify: (message: string) => void;
  openCreate: () => void;
  openFormEdit: (row: RoleRow) => void;
  submitForm: () => Promise<void>;
  appLabelOf: (row: RoleRow) => string;
}

/** 页面域声明（`<ThemeView page="roles">` 依赖它） */
defineThemePage({ page: 'roles' });
