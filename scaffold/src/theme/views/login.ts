/**
 * 登录页「版式契约」—— 业务容器 ⇄ 版式之间的唯一接口（**纯类型，无运行时**）
 *
 * === 职责划分（改版式前必读）===
 * ```
 * views/Login.vue                 业务容器：SSO 握手 / 绑定会话 / 路由跳转 / 错误分类
 *        │ 传 ctx（= 本文件定义的 LoginViewContext）
 *        ▼
 * theme/themes/<包>/<设备>/login/index.vue
 *                                 版式：只渲染 ctx、只调 ctx 上的回调
 * ```
 *
 * **版式里禁止出现**（违反即等于把登录逻辑复制了一份，两份必然漂移）：
 *   • 任何 `@/api/*` 请求、`useSsoLogin`、`router.replace`、pinia 读写
 *   • 判断"这次失败是不是没权限"（`denied` 已由容器算好）
 *   • iframe 的 `src` 拼接（`loginUrl` 由容器算好，含主题参数与随机数）
 * 允许出现：布局、样式、装饰、纯展示用局部状态（如展开一条说明）。
 *
 * === 与「主题包 / 配色」的关系 ===
 * 主题包 = 一整套设计（版式住在包里），配色 = 只换颜色（同一套 DOM）。
 * 换版式 = `?th=<包名>`；换配色 = `?th_color=<配色 id>` —— 与 oauth21 那边**同一套开关**，
 * 登录页因此不需要另立参数（也便于两个前端用同一条链接对齐外观）。
 *
 * 现成两套版式：
 *   • `default`   —— 居中承台：SSO 卡片在页面中轴，上方一行字标 + 一句定位
 *   • `spotlight` —— 左深右浅：叙事放左侧深色面板，卡片落在右栏
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { defineThemePage } from 'skinsuite/vue';

/**
 * 登录页上下文（版式只读它）
 *
 * 所有字段都是"容器算好的结论"，版式不再做二次判断。
 */
export interface LoginViewContext {
  /** iframe 尚未握手完成（`SSO_READY` 未到） */
  loading: boolean;
  /** 已收到 `LOGIN_SUCCESS`、正在换 Cookie / 拉用户 */
  busy: boolean;
  /** 失败文案（空串 = 无错误） */
  errorMessage: string;
  /** 失败是否属于「已认证但没有后台权限」（403）；决定语气与可用动作 */
  denied: boolean;
  /** iframe 的 src（含 `appName`、可选主题参数、随机数） */
  loginUrl: string;
  /** 是否开发环境（页脚/胶囊上标出来，避免把测试实例当生产） */
  isDev: boolean;
  /**
   * 绑定 iframe 元素
   *
   * 元素在版式里渲染、逻辑在容器里（要拿 `event.source` 与它比对），
   * 所以必须由版式把 ref 交回容器：`<iframe :ref="ctx.bindIframe" … />`。
   */
  bindIframe: (el: unknown) => void;
  /** iframe `load` 回调（启动握手兜底超时） */
  onIframeLoad: () => void;
  /** 重建 iframe（换账号 / 重试） */
  reload: () => void;
}

/** 版式组件收到的 props（与 oauth21 同形：只有 ctx 一个） */
export interface LoginViewProps {
  ctx: LoginViewContext;
}

defineThemePage({ page: 'login' });
