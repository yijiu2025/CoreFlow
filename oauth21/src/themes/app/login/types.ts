/**
 * 登录页「版式契约」—— 业务容器 ⇄ UI 之间的唯一接口（**纯类型，无运行时**）
 *
 * === 职责划分（改版式前必读）===
 * ```
 * view/app/login/index.vue        业务容器：表单校验 / useLoginFlow / 图形码 / 第三方登录 / 路由
 *        │  传 ctx（= 本文件定义的 LoginViewContext）
 *        ▼
 * themes/app/login/<id>/index.vue 版式：只渲染 ctx、只调 ctx.actions
 * ```
 *
 * **版式里禁止出现**（违反即等于把业务复制了一份，两份必然漂移）：
 *   • 任何 `@/api/*` 请求、zod/vee-validate 校验、`router.push`、pinia store 读写
 *   • 任何"提交前该不该拦"的判断（勾没勾协议、能不能提交）—— 那是容器的职责
 *   • 表单字段的本地副本（v-model 必须绑 `ctx.fields.x.value`，否则改了不发出去）
 * 允许出现：布局、样式、静态装饰、纯展示用局部状态（如密码明文显示开关、转场动画名）。
 *
 * === 与「皮肤」（themes/<id>/）的区别 ===
 *   皮肤 = 换颜色/圆角/背景图，**同一套 DOM**（靠 CSS 变量，见 themes/README.md）
 *   版式 = 换 DOM 结构与交互组织方式（本文件）
 * 两者正交，可任意组合：`?theme=ocean&view=compact`。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
import type { SocialProviderId } from '@/composables/useSocialLogin';

/**
 * 第三方登录渠道 id
 *
 * **刻意不重写联合**：直接复用实现里的类型（`useSocialLogin` 是渠道清单的唯一来源）。
 * 复制一份到这里看着更"解耦"，代价是新增渠道时契约静默过期 —— 版式拿到的渠道清单
 * 与实现不一致，且没有任何编译期信号。`import type` 编译后被完全擦除，不引入运行时依赖。
 */
export type LoginSocialProviderId = SocialProviderId;

/** 登录方式（与容器里 vee-validate 的 `type` 字段一一对应，不要另起名字） */
export type LoginMode = 'email' | 'pwd';

/**
 * 当前展示哪一块面板 —— **由容器判定，版式只负责渲染**
 *
 * 优先级就是下面的书写顺序（授权确认 > 邮箱二次验证 > 登录表单），
 * 与改造前的 `v-if / v-else-if / v-else` 完全一致。
 */
export type LoginPanel = 'consent' | 'emailVerify' | 'form';

/** 方式切换方向：供版式映射转场动画（切到密码=next，切回验证码=prev） */
export type LoginDirection = 'next' | 'prev';

/** 表单字段名（与容器里 vee-validate 的字段名一一对应） */
export type LoginField = 'email' | 'code' | 'username' | 'password';

/** 协议文档类型（对应协议弹窗） */
export type LoginAgreementDoc = 'service' | 'privacy';

/**
 * 翻译函数：只暴露「key + （命名参数 | 缺键兜底文案）」这一子集，
 * 版式因此不依赖 vue-i18n 的内部类型；文案键仍在 `src/i18n/index.ts` 统一维护。
 */
export type LoginTranslate = (key: string, params?: Record<string, unknown> | string) => string;

/**
 * 单个输入框交给版式的绑定三件套
 *
 * 三样都必须用上，缺一即行为变化：`attrs` 里是 vee-validate 的原生事件绑定（blur/change），
 * 漏掉 = 校验时机不对；`value` 漏掉 = 用户输入不进表单；`invalid` 漏掉 = 错误没有视觉反馈。
 */
export interface LoginFieldBinding {
  /** 当前值；`v-model="ctx.fields.email.value"` 直接绑它（写回容器里的表单状态） */
  value: string;
  /** 原生事件绑定；`v-bind="ctx.fields.email.attrs"` 展开，且**必须放在 `@blur`/`@input` 之前** */
  attrs: Record<string, unknown>;
  /** 是否处于错误态（对应原来的 `:class="{ 'is-error': errors.email }"`） */
  invalid: boolean;
  /** 该字段的错误文案；无错误时为 undefined（渲染为空） */
  error: string | undefined;
}

/** 授权确认要展示的权限项（结构对齐 ConsentPanel 的 props） */
export interface LoginConsentScopeDetail {
  id: string;
  name: string;
  desc: string;
  required?: boolean;
}

/**
 * 授权确认状态（后端 `action=consent` 的响应）
 *
 * 只列出版式渲染要用的字段：面板是共享组件 `ConsentPanel`，它需要的正是这些。
 */
export interface LoginConsentState {
  consentKey: string;
  client_name: string;
  scopeDetails?: LoginConsentScopeDetail[];
}

/** 邮箱二次验证面板要展示的信息（不含验证码本身 —— 那是可写字段，见 `emailVerifyCode`） */
export interface LoginEmailVerifyState {
  email: string;
  reason: string;
}

/** 版式可触发的行为。都是"通知容器去做"，版式自己不实现任何逻辑 */
export interface LoginViewActions {
  /** 切换登录方式（容器同步表单的 `type` 字段与切换方向，版式不必知道这件事） */
  switchMode(mode: LoginMode): void;
  /** 提交登录（容器负责协议勾选校验、密码模式先过图形码、Loading 态） */
  submit(): void;
  /** 发送邮箱验证码（容器先弹图形码，通过后由后端发码 + 启动倒计时） */
  sendCode(): void;
  /** 去注册页（容器负责透传 OAuth 上下文） */
  goRegister(): void;
  /** 去重置密码页（同上） */
  goForgot(): void;
  /** 返回：iframe 内通知父应用关闭，站内则有历史就 back、否则回登录首页 */
  back(): void;
  /** 打开协议文档弹窗（弹窗由容器渲染，版式只负责触发） */
  openAgreement(doc: LoginAgreementDoc): void;
  /** 点击第三方渠道（容器决定去哪：授权端点 / 父应用；未配置时给出明确提示） */
  selectSocial(id: LoginSocialProviderId): void;
  /** 同意授权（提交后由容器收尾：通知父窗口 / 回跳 redirect） */
  approveConsent(): void;
  /** 拒绝授权 */
  denyConsent(): void;
  /** 重发邮箱二次验证码 */
  sendEmailVerifyCode(): void;
  /** 提交邮箱二次验证码 */
  submitEmailVerify(): void;
}

/** 版式拿到的全部上下文 */
export interface LoginViewContext {
  /** 翻译函数 */
  t: LoginTranslate;
  /** 应用标识（`client_id`，缺省回退 `?appName=`）；仅用于展示品牌信息 */
  appName: string;
  /** 应用标识是否齐备；**false 时版式应只渲染「应用标识缺失」提示**（容器已判定，别自己再判） */
  hasAppName: boolean;

  // ---- 当前面板（只读）----
  /** 展示哪一块：授权确认 / 邮箱二次验证 / 登录表单 */
  panel: LoginPanel;
  /** 头部大标题（容器按面板给文案，版式不要自己拼 key） */
  title: string;
  /** 头部副标题 */
  subtitle: string;

  // ---- 登录表单 ----
  /** 当前登录方式（只读；切换请调 `actions.switchMode`） */
  mode: LoginMode;
  /** 方式切换方向（供版式决定转场动画） */
  direction: LoginDirection;
  /** 四个字段的绑定；前两个属于验证码模式，后两个属于密码模式（两边都提供，按需渲染） */
  fields: Record<LoginField, LoginFieldBinding>;
  /** 「保持登录」是否勾选。**可写**：`v-model="ctx.keepLogin"`，容器提交时读取 */
  keepLogin: boolean;
  /** 「我已阅读并同意」是否勾选。**可写**：`v-model="ctx.agreed"`，容器据此决定能否提交 */
  agreed: boolean;
  /** 验证码是否在倒计时中（决定按钮显示"获取验证码"还是剩余秒数） */
  countingDown: boolean;
  /** 剩余秒数（配合 `countingDown` 显示） */
  countdown: number;
  /** 是否正在登录（按钮应显示加载态并禁用；也用于禁用第三方登录行） */
  submitting: boolean;

  // ---- 第三方登录 ----
  /** 本次要展示的渠道（**空数组 → 版式应整行不渲染**）；来源与过滤规则在容器/composable 里 */
  socialProviders: LoginSocialProviderId[];
  /** 上次登录用过的渠道（命中时加「上次登录」徽标） */
  socialLastProvider: LoginSocialProviderId | null;

  // ---- 授权确认（panel === 'consent' 时有值）----
  consentState: LoginConsentState | null;
  /** 授权确认是否正在提交 */
  consentSubmitting: boolean;

  // ---- 邮箱二次验证（panel === 'emailVerify' 时有值）----
  emailVerifyState: LoginEmailVerifyState | null;
  /** 用户输入的邮箱验证码。**可写**：`v-model="ctx.emailVerifyCode"` */
  emailVerifyCode: string;
  /** 二次验证码是否在倒计时中（决定「重新发送」按钮是否禁用） */
  emailVerifyCountingDown: boolean;
  /** 二次验证码剩余秒数 */
  emailVerifyCountdown: number;

  /** 可触发的行为 */
  actions: LoginViewActions;
}

/** 版式组件的 props === 契约本身；各版式统一 `defineProps<LoginViewProps>()` */
export interface LoginViewProps {
  ctx: LoginViewContext;
}
