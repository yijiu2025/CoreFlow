/**
 * 用户管理页面域声明（page: users）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * 用户页是后台里动作最多的一页：批量选择、角色/部门/岗位维护、授权记录、批量授权、
 * 导入、高危操作（删除缓冲期 / 应用注销 / 临时密码）。**全部判定都在容器里**
 * （`views/system/Users.vue`），版式拿到的是一串 `can*` 结论与已经算好的行数据。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { DeptNode, UserEditTarget, UserOptions, UserRow } from '@/api/types';

/** 列表查询条件（分页 + 三个维度筛选） */
export interface UsersQuery {
  pageNum: number;
  pageSize: number;
  keyword: string;
  deptId: number | null;
  /** 子应用筛选（null = 全部应用） */
  appId: string | null;
  status: number | null;
  /** 只看无角色账号（超管补授权入口） */
  noRole: boolean;
}

/** 左侧部门树展平后的一行 */
export interface DeptFlatItem {
  node: DeptNode;
  depth: number;
  hasChildren: boolean;
}

/** 一个「用户 + 一句话」的目标（授权记录 / 高危操作弹窗用） */
export interface UserTarget {
  id: number;
  username: string;
}

/** 用户管理版式上下文（版式只读它） */
export interface UsersViewContext {
  /** 当前渲染设备：`'mobile'` 走卡片，其余走表格 */
  device: Ref<string>;
  rows: Ref<UserRow[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  query: UsersQuery;
  /** 部门 / 角色 / 岗位候选 */
  options: Ref<UserOptions>;
  /** 筛选方式：全部用户 / 按部门 */
  filterMode: Ref<'all' | 'dept'>;
  collapsedDept: Ref<Set<number>>;
  /** 抽屉里的用户 id（null = 关闭） */
  profileId: Ref<number | null>;
  /** 左侧部门树（已按折叠状态展平） */
  deptFlat: ComputedRef<DeptFlatItem[]>;
  /** 当前筛选部门的名称（空串 = 未按部门筛） */
  currentDeptName: ComputedRef<string>;
  /** 勾选的用户 id */
  selected: Ref<Set<number>>;
  allSelected: ComputedRef<boolean>;
  someSelected: ComputedRef<boolean>;
  selectedUsers: ComputedRef<UserTarget[]>;
  grantTarget: Ref<UserTarget | null>;
  dangerTarget: Ref<UserTarget | null>;
  batchOpen: Ref<boolean>;
  importOpen: Ref<boolean>;
  /** 编辑弹窗的目标（null = 新建） */
  editingTarget: Ref<UserEditTarget | null>;
  dialogOpen: Ref<boolean>;
  pageCount: ComputedRef<number>;
  /** 授权记录里能否「调整权限」 */
  grantAdjustable: ComputedRef<boolean>;
  /** 权限判定结论（容器算好，版式不再碰 store） */
  canCreate: boolean;
  canUpdate: boolean;
  canExport: boolean;
  canImport: boolean;
  canGrants: boolean;
  canRead: boolean;
  canDeleteUser: ComputedRef<boolean>;
  canTempPassword: ComputedRef<boolean>;
  canDeactivateApp: ComputedRef<boolean>;
  /** 三个高危动作至少有一个可用（否则「更多」按钮不出现） */
  canOpenDanger: ComputedRef<boolean>;
  /** 删除某行之前的判定（能不能删、为什么不能） */
  verdictOf: (row: UserRow) => { ok: boolean; reason: string };
  /** 按钮 title：把「为什么不能点」说出来 */
  hintOf: (row: UserRow, verb: string) => string;
  /** 注销缓冲期的剩余时间文案（`2026-11-20 前可撤销`） */
  deletionHint: (iso: string) => string;
  /** 头像兜底首字母 */
  initialOf: (row: UserRow) => string;
  toggleDept: (id: number) => void;
  switchFilterMode: (mode: 'all' | 'dept') => void;
  pickDept: (deptId: number | null) => void;
  openProfile: (row: UserRow) => void;
  load: () => Promise<void>;
  search: () => void;
  resetQuery: () => void;
  /** 切换「只看无角色」并立即查询（超管补授权入口） */
  toggleNoRole: () => void;
  turnPage: (delta: number) => void;
  toggleSelect: (id: number) => void;
  toggleSelectAll: () => void;
  openGrants: (row: UserRow) => void;
  openDanger: (row: UserRow) => void;
  refreshAfterDanger: () => Promise<void>;
  onImported: (created: number) => Promise<void>;
  adjustFromGrants: () => void;
  onBatchDone: () => void;
  openCreate: () => void;
  openEdit: (row: UserRow) => void;
  onUserSaved: (message: string) => Promise<void>;
  toggleStatus: (row: UserRow) => Promise<void>;
  exportCsv: () => Promise<void>;
}

/** 页面域声明（`<ThemeView page="users">` 依赖它） */
defineThemePage({ page: 'users' });
