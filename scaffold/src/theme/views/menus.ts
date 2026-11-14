/**
 * 菜单管理页面域声明（page: menus）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 菜单页有两档视图：表格（树形缩进）与导航星系（`MenuStarMap`）；两者吃的是**同一份**
 * 扁平化结果 `flat` —— 展平口径只在容器里算一次，版式不各自 walk 一遍树。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Component, ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { MenuNode } from '@/api/types';

/** 应用（菜单归属：决定权限码命名空间与树的归属） */
export interface MenuApp {
  id: string;
  name: string;
  /** 当前账号对该应用是否有管理权限（false 时该应用只读） */
  writable: boolean;
}

/** 权限码选项（来自当前应用已注册的权限） */
export interface MenuPermissionOption {
  code: string;
  label: string;
  type: string;
}

/** 新建 / 编辑表单 */
export interface MenuForm {
  parentId: number;
  appId: string;
  name: string;
  type: MenuNode['type'];
  icon: string;
  path: string;
  component: string;
  permission: string;
  sort: number;
  visible: number;
  status: number;
}

/** 展平后的一行（树形缩进 / 折叠状态都是算好的） */
export interface MenuFlatItem {
  node: MenuNode;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

/** 上级菜单候选（已排除自身子树与按钮） */
export interface MenuParentOption {
  id: number;
  name: string;
  depth: number;
}

/** 菜单管理版式上下文（版式只读它） */
export interface MenusViewContext {
  /** 当前渲染设备：`'mobile'` 走卡片，其余走表格 */
  device: Ref<string>;
  permissionOptions: Ref<MenuPermissionOption[]>;
  apps: Ref<MenuApp[]>;
  /** 当前筛的应用 id（空串 = 全部） */
  appFilter: Ref<string>;
  /** 可写的应用（新建时只能挂到这些下面） */
  writableApps: ComputedRef<MenuApp[]>;
  /** 当前筛选的应用是否可写（决定「新建菜单」是否可点） */
  currentAppWritable: ComputedRef<boolean>;
  /** 导航星系视图组件（容器给，版式不认识它从哪来） */
  starMap: Component;
  altView: Ref<'table' | 'star'>;
  trees: Ref<MenuNode[]>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  toast: Ref<string>;
  dialogOpen: Ref<boolean>;
  editingId: Ref<number | null>;
  form: MenuForm;
  /** 有子项可折的行 id（决定「折叠全部」按钮出不出现） */
  expandableIds: ComputedRef<number[]>;
  allCollapsed: ComputedRef<boolean>;
  /** 菜单总条数（含按钮，页头统计用） */
  totalCount: ComputedRef<number>;
  /** 展平后的可见行（折叠的子项不在里面） */
  flat: ComputedRef<MenuFlatItem[]>;
  parentOptions: ComputedRef<MenuParentOption[]>;
  /** 类型中文名 */
  TYPE_TEXT: Record<MenuNode['type'], string>;
  dialogTitle: ComputedRef<string>;
  /** 图标候选（含当前值） */
  iconOptions: ComputedRef<string[]>;
  /** 表单里填的权限码不在本应用权限表里时的提示（空串 = 没问题） */
  permissionWarning: ComputedRef<string>;
  /** 权限判定结论（容器算好） */
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  appLabelOf: (appId: string) => string;
  toggleCollapse: (id: number) => void;
  toggleAll: () => void;
  onAppChange: () => void;
  openCreate: (parent?: MenuNode) => void;
  openEdit: (node: MenuNode) => void;
  refreshAll: () => void | Promise<void>;
  submit: () => Promise<void>;
  remove: (node: MenuNode) => Promise<void>;
  toggleVisible: (node: MenuNode, value: boolean) => Promise<void>;
  onPickApp: (event: Event) => void;
}

/** 页面域声明（`<ThemeView page="menus">` 依赖它） */
defineThemePage({ page: 'menus' });
