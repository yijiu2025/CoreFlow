/**
 * 重置密码页「版式契约」—— 业务容器 ⇄ UI 之间的唯一接口（**纯类型，无运行时**）
 *
 * === 职责划分（改版式前必读）===
 * ```
 * view/app/forgot-password/index.vue        业务容器：校验 / 发码 / 发链接 / 提交 / 路由
 *        │  传 ctx（= 本文件定义的 ForgotPasswordViewContext）
 *        ▼
 * theme/themes/<包>/forgot-password/index.vue 或 theme/themes/<包>/forgot-password/<变体>/index.vue
 *                                               版式：只渲染 ctx、只调 ctx.actions
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
 * 把裸色值透给版式反而会在换配色/切深色时漏色。
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

/**
 * 重置密码页版式注册表 —— 谁来决定"用哪套 UI"
 *
 * === 选择优先级（高 → 低；三页同形，链的唯一实现在 `./picker.ts`）===
 *   1. URL `?view=<id>`            —— 本次访问的显式意图（联调 / 灰度 / 单页预览都用它）
 *                                     （设备维度键 `view.<设备>` 已在容器侧解析完）
 *   2. 主题包声明                   —— `views['forgot-password']`
 *                                     （页面名含连字符，取属性时写 `views['forgot-password']`；
 *                                      键名必须与 `theme/views/<page>.ts` 的页面名逐字一致。
 *                                      写在包根则该包所有配色共用；写在 colors 里只覆盖那套配色）
 *   3. `VITE_FORGOT_PASSWORD_VIEW` —— 部署级默认（整站换 UI，不动代码）
 *   4. 当前包名                     —— 一个主题包 = 一种版式（不再是 `base`）
 *
 * ⚠️ 查找范围是**当前主题包 × 当前设备**（版式跟随主题包，见 `./registry.ts`）：
 *    某个包没登记这套版式时，回退的是**该包自己的**版式，不会去借别的包。
 * ⚠️ 第 1 档里**非法值不回退**：`?view=typo` 落**当前包**，而不是被第 2/3 档接管。
 *    显式参数写错时静默换用另一套 UI，比看到当前包的版式更难排查。
 *
 * ⚠️ glob 用 **`/src/...` 根绝对路径**，不要用 `../` 相对路径：本文件在 `views/` 下一层，
 *    相对路径在当前 Vite 版本下**扫不到任何文件且不报错**（版式永远加载不出来）。
 * ⚠️ 非内置包的版式是**惰性加载**的（`import.meta.glob` → 独立 chunk）；内置包的版式由容器
 *    静态引入（首屏零请求）。新增包或版式目录后要**重启 dev server**
 *    （glob 在启动时静态扫描，热更新发现不了新目录）。
 *
 * @author yijiu2025
 * @since 2026-09-24
 * @see ./picker.ts —— 取值链与回退口径的唯一实现
 */
import type { Component } from 'vue';
import { createViewRegistry } from './registry';
import { createViewPicker, type ViewPickerSource } from './picker';

/**
 * 各主题包里本页的版式实现 —— **一个主题包一种版式**（2026-09-26 收窄）
 *
 * 只有一种目录形态：`themes/<包>/<设备>/forgot-password/index.vue`。
 * 内置包的那份由容器静态引入、用不上它，但其它包只能靠这里惰性拿到
 * —— 包是运行时才定的，静态 import 钉不住。
 *
 * ⚠️ 曾有第二个模式 `.../forgot-password/<版式>/index.vue`（变体子目录），
 *    已随「变体版式使用新包」删除。
 */
const viewLoaders = import.meta.glob<{ default: Component }>(
  '/src/theme/themes/*/*/forgot-password/index.vue'
);

/** 本页版式注册表 */
export const forgotPasswordViews = createViewRegistry(viewLoaders, { page: 'forgot-password' });

/**
 * 本页的版式选择器（取值链的唯一实现在 `./picker.ts`）
 *
 * ⚠️ 环境变量必须在**这里**读并传进去：`import.meta.env` 靠构建期静态替换，
 *    包进工厂内部拿不到这个能力（会被当成普通的对象属性访问、恒为 undefined）。
 */
const picker = createViewPicker({
  registry: forgotPasswordViews,
  envView: import.meta.env.VITE_FORGOT_PASSWORD_VIEW
});

/**
 * 按优先级挑出版式 id（永远返回可用 id：最差是当前**包名**）
 *
 * 链与回退口径的唯一实现在 `./picker.ts`（三页同形）；本函数只负责"把本页的
 * 注册表与环境变量接上去"，不再自己实现一遍。
 *
 * @param source.url    `?view=`（设备维度解析**之后**）的原始值 —— 未校验
 * @param source.theme  当前配色记录声明的版式 id（`store.viewFor('forgot-password')` 取出）
 * @param source.pkg    当前主题包 id —— 查找范围的包那一段
 * @param source.device 当前设备（`'mobile' | 'standard' | 'mini'`）—— 查找范围的设备那一段
 */
export function pickForgotPasswordViewId(source: ViewPickerSource = {}): string {
  return picker.pick(source);
}

/**
 * 提前把版式 chunk 拉下来（路由守卫里调用，**不 await**）
 *
 * 非内置包的版式是动态 import，容器首帧只能先渲染静态兜底、等 chunk 到了再接管。
 * 在导航阶段就把请求发出去（与路由组件自身的 chunk 并行），绝大多数情况下容器挂载时
 * 已在模块缓存里 → 赋值发生在同一 tick 内，用户看不到切换。
 *
 * ⚠️ `source` 必须**原样**交给 `picker.preload`：漏掉 `theme`（声明档）会让预取算出
 *    一个与容器不同的 id —— 白拉一个用不上的 chunk，而真正要用的那个仍得现场等。
 */
export function preloadForgotPasswordView(source: ViewPickerSource = {}): void {
  picker.preload(source);
}
