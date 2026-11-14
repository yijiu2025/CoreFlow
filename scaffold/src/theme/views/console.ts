/**
 * 后台壳页面域声明（page: console）+ 「版式契约」
 *
 * 与 oauth21 的 `views/login.ts` 同一机制：`defineThemePage({ page })` 一次声明，
 * 即把本页注册进页面域（`<ThemeView>` 的 `page` 依赖）。
 *
 * === 职责划分（改版式前必读）===
 * ```
 * components/layout/AppShell.vue        业务容器：判设备 / 拉菜单 / 路由跳转 / 权限过滤
 *        │ 传 ctx（= 本文件定义的 ConsoleViewContext）
 *        ▼
 * theme/themes/<包>/<设备>/console/index.vue
 *                                       版式：只渲染 ctx、只调 ctx 上的回调
 * ```
 *
 * 2026-11-14 之前 console **只有一套版式**，壳层直接用 `<ThemeScope>` 只取 token；
 * 现在多了「微信」包（手机端换成导航栏 + 底部 TabBar + cell 列表），按机制要求
 * 把壳升格成页面域：版式住在包里，宿主只准备 ctx。
 *
 * **版式里禁止出现**（违反即等于把业务逻辑复制一份，两份必然漂移）：
 *   • `@/api/*` 请求、`auth` / `theme` 之外的 pinia 读写
 *   • 菜单权限过滤（`groups` 已是过滤后的结论，版式不再判断能不能进）
 *   • 设备判定（`useRenderDevice` 归宿主；版式目录位置本身就是设备身份）
 * 允许出现：布局、样式、装饰、纯展示用局部状态（抽屉开合、更多面板开关）。
 *
 * === 版式怎么切 ===
 * 换版式 = 换主题包：`?th=wechat`，或在「我 / 个人设置」里选界面风格（落本地，
 * 下次启动恢复）。配色仍按 `?th_color=` 走。
 *
 * 现成版式：
 *   • `default` —— 珍珠玻璃：桌面侧栏 + 顶栏，手机端侧栏改抽屉（两设备同一实现）
 *   • `wechat`  —— 微信：手机端导航栏 + 底部 TabBar + cell 列表（桌面无本包版式，
 *                  回退 default 的壳，只换配色）
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import type { Component } from 'vue';
import { defineThemePage } from 'skinsuite/vue';

/** 侧栏 / 导航里的一条入口（已按权限与可见性过滤过） */
export interface ConsoleNavItem {
  /** 菜单 ID（列表 key） */
  id: number;
  /** 显示名 */
  name: string;
  /** 目标路径（一定已注册路由 —— 未注册的入口在宿主就被筛掉） */
  path: string;
  /** 图标名（lucide 名字，见 `ui/icon-registry.ts`） */
  icon: string;
}

/** 侧栏分组（顶层 `dir` 即一组；无目录归属的菜单归「导航」组） */
export interface ConsoleNavGroup {
  key: string;
  title: string;
  items: ConsoleNavItem[];
}

/**
 * 壳版式上下文（版式只读它）
 *
 * 所有字段都是"容器算好的结论"，版式不再做二次判断。
 */
export interface ConsoleViewContext {
  /** 当前页标题（路由 `meta.title`；菜单名可能因权限裁剪缺失） */
  title: string;
  /** 侧栏 / 导航入口（已过滤：下架、无权限、路由未注册的都不在里面） */
  groups: ConsoleNavGroup[];
  /** 当前路径（高亮用；精确匹配，不做前缀猜测） */
  activePath: string;
  /**
   * 是否是"压栈进来的"页面（`meta.stack`）
   *
   * 手机端详情页左上角该出现返回箭头而不是汉堡；桌面端不区分。
   * 微信版式另外用它决定 TabBar 是否让位（微信的二级页没有 TabBar）。
   */
  stack: boolean;
  /** 当前是否深色（版式里的图标与配色跟着切） */
  isDark: boolean;
  /** 顶栏身份信息（未拿到 `me` 时为 null —— 边界防护拦下时是这种状态） */
  user: { name: string; avatar: string } | null;
  /**
   * 页面内容组件（内部是 `<RouterView />`）
   *
   * 版式负责给它让出位置 —— 不能直接用 `<router-view>`：版式与 AppShell 处在同一
   * 嵌套深度，两处各写一个会把当前页渲染两遍。
   */
  content: Component;
  /** 跳转到某条入口（版式不用管重复点击，宿主会短路同路径） */
  nav: (path: string) => void;
  /**
   * 这条路径当前账号进不进得去（路由未注册 / 权限码不满足 → false）
   *
   * 版式需要"临时造一个入口"时（微信壳的 TabBar 是固定四档，不走菜单数据）用它 ——
   * 判据仍是宿主的：路由 `meta.permission` + 账号权限码，版式不做二次判断。
   */
  can: (path: string) => boolean;
  /** 返回上一屏（无历史时回落到所属列表） */
  back: () => void;
  /** 切换明暗 */
  toggleTheme: () => void;
  /** 退出登录 */
  signOut: () => void;
}

/** 页面域声明（`<ThemeView page="console">` 依赖它） */
defineThemePage({ page: 'console' });
