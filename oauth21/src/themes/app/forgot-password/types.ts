/**
 * 重置密码页「版式契约」—— 业务容器 ⇄ UI 之间的唯一接口（**纯类型，无运行时**）
 *
 * === 职责划分（改版式前必读）===
 * ```
 * view/app/forgot-password/index.vue        业务容器：校验 / 发码 / 发链接 / 提交 / 路由
 *        │  传 ctx（= 本文件定义的 ForgotPasswordViewContext）
 *        ▼
 * themes/app/forgot-password/<id>/index.vue 版式：只渲染 ctx、只调 ctx.actions
 * ```
 *
 * **版式里禁止出现**（违反即等于把业务复制了一份，两份必然漂移）：
 *   • 任何 `@/api/*` 请求、zod/vee-validate 校验、`router.push`、pinia store 读写
 *   • 任何"该不该拦"的判断（验证码空没空、两次密码一不一致、token 有没有）
 *   • 表单字段的本地副本（v-model 必须绑 `ctx.fields.x.value`）
 * 允许出现：布局、样式、静态装饰、纯展示用局部状态（密码明文开关、进度条怎么画）。
 *
 * === 为什么用「stage」而不是一堆布尔量 ===
 * 本页有两种重置方式（验证码 3 步 / 邮件链接 4 步），共 6 个界面状态。把它们暴露成
 * `showEmail`/`showCode`/`showSent`… 一堆布尔量，版式就又要自己判"谁盖住谁" ——
 * 那正是改造前模板里 `v-if/v-else-if` 链的写法，每套 UI 抄一遍就多一处写错的机会。
 * 容器只给一个 `stage`，版式照着渲染。
 *
 * @author yijiu2025
 * @since 2026-09-24
 */
/** 重置方式（与后端 `PASSWORD_RESET_MODE` 对应，由 `VITE_PASSWORD_RESET_MODE` 决定） */
export type ForgotPasswordMode = 'code' | 'link';

/**
 * 当前界面状态
 *
 * - `code` 模式：`email` → `code` → `done`
 * - `link` 模式：`verify` → `sent` → `reset` → `done`
 * `done` 两种模式共用；同一时刻 `mode` 只有一侧的 stage 会被取到（另一种模式的
 * 步骤变量仍然存在但不参与渲染）。
 */
export type ForgotPasswordStage = 'email' | 'code' | 'done' | 'verify' | 'sent' | 'reset';

/** 表单字段名（与容器里 vee-validate 的字段名一一对应） */
export type ForgotPasswordField = 'email' | 'code' | 'password' | 'confirmPassword';

/**
 * 翻译函数：只暴露「key + （命名参数 | 缺键兜底文案）」这一子集，
 * 版式因此不依赖 vue-i18n 的内部类型；文案键仍在 `src/i18n/index.ts` 统一维护。
 */
export type ForgotPasswordTranslate = (key: string, params?: Record<string, unknown> | string) => string;

/**
 * 单个输入框交给版式的绑定三件套
 *
 * 三样都必须用上，缺一即行为变化：`attrs` 里是 vee-validate 的原生事件绑定（blur/change），
 * 漏掉 = 校验时机不对；`value` 漏掉 = 用户输入不进表单；`invalid` 漏掉 = 错误没有视觉反馈。
 */
export interface ForgotPasswordFieldBinding {
  /** 当前值；`v-model="ctx.fields.password.value"` 直接绑它（写回容器里的表单状态） */
  value: string;
  /** 原生事件绑定；`v-bind="ctx.fields.password.attrs"` 展开，且**必须放在 `@blur`/`@input` 之前** */
  attrs: Record<string, unknown>;
  /** 是否处于错误态（对应原来的 `:class="{ 'is-error': errors.password }"`） */
  invalid: boolean;
  /** 该字段的错误文案；无错误时为 undefined（渲染为空） */
  error: string | undefined;
}

/**
 * 密码强度（容器用 `usePasswordStrength` 算好，版式只管画）
 *
 * 刻意**不暴露 `color`**：颜色属于呈现，底座版本用 `is-<level>` 类交给样式表决定，
 * 把裸色值透给版式反而会在换皮肤/切深色时漏色。
 */
export interface ForgotPasswordStrength {
  /** 等级：weak / medium / strong（用来拼 `is-<level>` 类名） */
  level: 'weak' | 'medium' | 'strong';
  /** 0~4 分，对应四段进度条点亮的段数 */
  score: number;
  /** 已 i18n 化的文字标签 */
  label: string;
}

/** 版式可触发的行为。都是"通知容器去做"，版式自己不实现任何逻辑 */
export interface ForgotPasswordViewActions {
  /** 第一步：校验邮箱 → 弹图形码 → 通过后按模式发邮箱码 / 发重置链接 */
  submitEmail(): void;
  /** 重发（邮箱码 / 重置链接都走它，容器按当前模式决定发什么） */
  resendEmail(): void;
  /** 提交新密码（容器负责验证码非空、两次一致、RSA 加密、防双击） */
  submit(): void;
  /** 去登录页（容器负责透传 OAuth 上下文；链接里的 token **不外传**） */
  goLogin(): void;
  /** 返回：逐级回退，第一步再后退则回登录页 */
  back(): void;
}

/** 版式拿到的全部上下文 */
export interface ForgotPasswordViewContext {
  /** 翻译函数 */
  t: ForgotPasswordTranslate;

  // ---- 进度（只读）----
  /** 当前重置方式；版式据此决定渲染哪一套步骤 */
  mode: ForgotPasswordMode;
  /** 当前界面状态（见 `ForgotPasswordStage` 的说明） */
  stage: ForgotPasswordStage;
  /** 当前步序号（1 起），用于进度条 */
  step: number;
  /** 总步数（code 模式 3 / link 模式 4，**别在版式里写死**） */
  totalSteps: number;
  /** 进度百分比 0~100 */
  progress: number;
  /** 头部大标题（容器按阶段给文案，版式不要自己拼 key） */
  title: string;
  /** 头部副标题（同 `title`） */
  subtitle: string;

  // ---- 表单 ----
  /** 四个字段的绑定（`code` 在 link 模式全程用不到，但仍提供，避免版式按形态取字段） */
  fields: Record<ForgotPasswordField, ForgotPasswordFieldBinding>;
  /** 密码强度（`level` / `score` / `label`），输入为空时仍是 weak 档 */
  strength: ForgotPasswordStrength;

  // ---- 其它状态（只读）----
  /** 是否正在提交新密码（按钮应显示加载态并禁用） */
  submitting: boolean;
  /** 是否在倒计时中（决定「重发」按钮显示什么） */
  countingDown: boolean;
  /** 剩余秒数（配合 `countingDown` 显示） */
  countdown: number;

  /** 可触发的行为 */
  actions: ForgotPasswordViewActions;
}

/** 版式组件的 props === 契约本身；各版式统一 `defineProps<ForgotPasswordViewProps>()` */
export interface ForgotPasswordViewProps {
  ctx: ForgotPasswordViewContext;
}
