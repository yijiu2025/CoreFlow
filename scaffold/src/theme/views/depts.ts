/**
 * 部门管理页面域声明（page: depts）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 部门页有两档视图：树形列表与组织架构画布（`OrgCanvas`）。两档吃的是同一份
 * `rows`（展平 + 过滤 + 折叠后的结论）与同一份 `summary` 读数 —— 只在容器算一次。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Component, ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { DeptNode, UserRow } from '@/api/types';

/** 部门查询条件 */
export interface DeptQuery {
  keyword: string;
  status: '' | 0 | 1;
}

/** 新建 / 编辑部门表单 */
export interface DeptForm {
  parentId: number;
  name: string;
  leader: string;
  phone: string;
  email: string;
  sort: number;
  status: number;
}

/** 树形列表里的一行（深度 / 是否有下级都是算好的） */
export interface DeptRowItem {
  node: DeptNode;
  depth: number;
  hasChildren: boolean;
}

/** 读数 */
export interface DeptSummary {
  count: number;
  members: number;
  disabled: number;
  depth: number;
  roots: number;
}

/** 上级部门候选 */
export interface DeptParentOption {
  id: number;
  label: string;
  depth: number;
}

/** 部门管理版式上下文（版式只读它） */
export interface DeptsViewContext {
  /** 当前渲染设备：`'mobile'` 走卡片，其余走表格 */
  device: Ref<string>;
  /** 组织架构画布（异步组件，容器给） */
  canvas: Component;
  trees: Ref<DeptNode[]>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  collapsed: Ref<Set<number>>;
  altView: Ref<'table' | 'canvas'>;
  /** 画布里选中的部门 id */
  selectedId: Ref<number | null>;
  query: DeptQuery;
  dialogOpen: Ref<boolean>;
  submitting: Ref<boolean>;
  /** 变更溯源弹窗的目标部门 */
  historyTarget: Ref<DeptNode | null>;
  editingId: Ref<number | null>;
  form: DeptForm;
  /** 表单字段级错误（键 = 字段名） */
  errors: Record<string, string>;
  /** 是否处于筛选态（筛了就忽略折叠） */
  filtering: ComputedRef<boolean>;
  /** 展平后的可见行 */
  rows: ComputedRef<DeptRowItem[]>;
  summary: ComputedRef<DeptSummary>;
  /** 选中部门在树上的路径（用于面包屑） */
  selectedPath: ComputedRef<DeptNode[] | null>;
  /** 当前选中部门 */
  selected: ComputedRef<DeptNode | null>;
  /** 选中部门的成员（画布右栏） */
  members: Ref<UserRow[]>;
  membersTotal: Ref<number>;
  membersLoading: Ref<boolean>;
  parentOptions: ComputedRef<DeptParentOption[]>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  load: () => Promise<void>;
  /** 成员条宽度（按可见行最大值归一） */
  barWidth: (node: DeptNode) => string;
  /** 含下级的成员数 */
  membersOf: (node: DeptNode) => number;
  /** 下级部门数 */
  descendantsOf: (node: DeptNode) => number;
  toggle: (id: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
  openCreate: (parent?: DeptNode) => void;
  openEdit: (node: DeptNode) => void;
  submit: () => Promise<void>;
  remove: (node: DeptNode) => Promise<void>;
}

/** 页面域声明（`<ThemeView page="depts">` 依赖它） */
defineThemePage({ page: 'depts' });
