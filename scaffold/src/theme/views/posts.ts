/**
 * 岗位管理页面域声明（page: posts）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * === 职责划分（改版式前必读）===
 * ```
 * views/system/Posts.vue          业务容器：取数 / 分页 / 表单校验 / 权限判定 / 增删改
 *        │ 传 ctx（= 本文件定义的 PostsViewContext）
 *        ▼
 * theme/themes/<包>/<设备>/posts/index.vue
 *                                 版式：只渲染 ctx、只调 ctx 上的回调
 * ```
 *
 * **版式里禁止出现**（违反即等于把业务复制一份，两份必然漂移）：
 *   • `@/api/*` 请求、pinia 读写（权限已由容器算成 `can*` 布尔）
 *   • 分页 / 排序 / 校验逻辑（`list` 与 `form` 是容器给的结论）
 *   • 直接 import 业务组件（阶梯由容器经 `ladder` 传入，版式不知道它从哪来）
 * 允许出现：布局、样式、装饰、纯展示用局部状态（弹窗开合由容器持有）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import type { Component, ComputedRef, Ref } from 'vue';
import { defineThemePage } from 'skinsuite/vue';
import type { ListState } from '@/composables/useListPage';

/** 岗位行（列表与阶梯共用一份字段口径） */
export interface PostRow {
  id: number;
  post_code: string;
  post_name: string;
  sort: number;
  status: number;
  remark: string | null;
  user_count: number;
}

/** 新建 / 编辑弹窗的表单字段 */
export interface PostForm {
  postCode: string;
  postName: string;
  sort: number;
  status: number;
  remark: string;
}

/** 阶梯视图需要的节点（字段名与 `PostRow` 不同：阶梯认驼峰） */
export interface PostLadderNode {
  id: number;
  postName: string;
  postCode: string;
  sort: number;
  status: number;
  userCount: number;
}

/** 岗位页版式上下文（版式只读它） */
export interface PostsViewContext {
  /** 列表状态（分页 / 加载 / 错误 / 查询条件） */
  list: ListState<PostRow>;
  /** 当前视图档：表格 / 岗梯 */
  altView: Ref<'table' | 'ladder'>;
  /**
   * 当前渲染设备（`'mobile'` 或 `'standard'`）
   *
   * 版式**不判定**设备（目录位置本身就是身份），这个值只用来画同一份实现里的
   * 「表格 vs 卡片」两态 —— 手机端和桌面端共用一套模板，少一份就少一处漂移。
   * 给 `Ref` 而不是快照：视口跨断点时容器会重算，版式要跟着重画。
   */
  device: Ref<string>;
  /** 阶梯节点（行 → 阶梯字段） */
  ladderPosts: ComputedRef<PostLadderNode[]>;
  /** 阶梯组件（异步加载，容器给） */
  ladder: Component;
  /** 有无新建 / 编辑 / 删除权限（容器算好的结论） */
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** 弹窗开合 */
  dialogOpen: Ref<boolean>;
  /** 正在编辑的岗位 id（null = 新建） */
  editingId: Ref<number | null>;
  /** 弹窗表单 */
  form: PostForm;
  /** 轻提示文案（空串 = 不显示） */
  openCreate: () => void;
  openEdit: (row: PostRow) => void;
  /** 阶梯节点 → 打开编辑（容器按 id 找回原始行） */
  editFromLadder: (post: { id: number }) => void;
  submit: () => void | Promise<void>;
  remove: (row: PostRow) => void | Promise<void>;
}

/** 页面域声明（`<ThemeView page="posts">` 依赖它） */
defineThemePage({ page: 'posts' });
