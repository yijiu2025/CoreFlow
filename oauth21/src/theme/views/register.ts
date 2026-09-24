/**
 * 注册页「版式契约」—— 业务容器 ⇄ UI 之间的唯一接口（**纯类型，无运行时**）
 *
 * === 职责划分（改版式前必读）===
 * ```
 * view/app/register/index.vue        业务容器：状态 / 校验 / 请求 / 路由 / 验证码 / 倒计时
 *        │  传 ctx（= 本文件定义的 RegisterViewContext）
 *        ▼
 * theme/themes/<包>/register/index.vue 或 theme/themes/<包>/register/<变体>/index.vue
 *                                       版式：只渲染 ctx、只调 ctx.actions
 * ```
 *
 * **版式里禁止出现**（违反即等于把业务复制了一份，两份必然漂移）：
 *   • 任何 `@/api/*` 请求、zod/vee-validate 校验、`router.push`、pinia store 读写
 *   • 任何"提交前该不该拦"的判断 —— 那是容器的职责，容器已经拦好了
 *   • 表单字段的本地副本（v-model 必须绑 `ctx.fields.x.value`，否则改了不发出去）
 * 允许出现：布局、样式、静态装饰、纯展示用局部状态（如密码明文显示开关、折叠展开）。
 *
 * 版式**可以**做的事全在下面两个字段里：`ctx`（读状态）+ `ctx.actions`（触发行为）。
 * 需要新能力时，先在容器里实现、再扩到本文件 —— 而不是在版式里自己造。
 *
 * === 与「主题包 / 配色」的关系（2026-09-24 起版式随主题包走）===
 *   主题包（`theme/themes/<包>/`）= **一整套设计**，版式与配色都在包里，一起开发
 *   配色（包内 `colors/<配色>/`）= 只换颜色/圆角/背景图，**同一套 DOM**（靠 CSS 变量）
 *   版式（本文件定义的就是它的契约）= 换 DOM 结构与交互组织方式
 * 因此 `?view=` 只在**当前主题包内**查找：换包就换版式，两者不再是各自独立的两个维度。
 *
 * @author yijiu2025
 * @since 2026-09-23
 */

/** 分步步骤号（与容器里的 step 一一对应） */
export type RegisterStep = 1 | 2 | 3;

/** 步骤切换方向：供版式决定转场动画（下一步从右进、返回从左进） */
export type RegisterDirection = 'next' | 'prev';

/** 表单字段名（与容器里 vee-validate 的字段名一一对应，不要另起名字） */
export type RegisterField = 'username' | 'email' | 'code' | 'password' | 'confirmPassword';

/** 协议文档类型（对应协议弹窗） */
export type RegisterAgreementDoc = 'service' | 'privacy';

/**
 * 翻译函数：契约里刻意只暴露「key + （命名参数 | 缺键兜底文案）」这一子集，
 * 版式因此不依赖 vue-i18n 的内部类型；文案键仍在 `src/i18n/index.ts` 统一维护。
 *
 * 第二个参数两种形态都来自 vue-i18n 自己的重载，不是我们发明的：
 *   `t('register.username_min')`                  —— 只用 key
 *   `t('login.show_password', '显示密码')`         —— 缺键时兜底成这句中文
 *   `t('xxx', { n: 3 })`                          —— 命名参数插值
 * 其余重载（locale / plural / list）**不开放**：需要时请在容器里补一个语义化字段
 * （例如 `subtitle`），而不是把 i18n 的形状透给版式。
 */
export type RegisterTranslate = (key: string, params?: Record<string, unknown> | string) => string;

/**
 * 单个输入框交给版式的绑定三件套
 *
 * 三样都必须用上，缺一即行为变化：
 *   `attrs` 里是 vee-validate 的原生事件绑定（blur/change），漏掉 = 校验时机不对；
 *   `value` 漏掉 = 用户输入不进表单；`invalid` 漏掉 = 校验错误没有视觉反馈。
 */
export interface RegisterFieldBinding {
  /** 当前值；`v-model="ctx.fields.email.value"` 直接绑它（写回容器里的表单状态） */
  value: string;
  /** 原生事件绑定；`v-bind="ctx.fields.email.attrs"` 展开，且**必须放在 `@blur`/`@input` 之前** */
  attrs: Record<string, unknown>;
  /** 是否处于错误态（对应原来的 `:class="{ 'is-error': errors.x }"`） */
  invalid: boolean;
  /** 该字段的错误文案；无错误时为 undefined（渲染为空）。文案已由容器按字段口径算好 */
  error: string | undefined;
}

/** 版式可触发的行为。都是"通知容器去做"，版式自己不实现任何逻辑 */
export interface RegisterViewActions {
  /** 前进到指定步骤；容器内部会先校验当前步字段，不通过就停在原地 */
  nextStep(target: 2 | 3): void;
  /** 后退：第 1 步时回登录页，否则退一步 */
  back(): void;
  /** 去登录页（容器负责透传 OAuth 上下文） */
  goLogin(): void;
  /** 发送邮箱验证码（容器负责查重 → 图形码 → 发码 → 启动倒计时） */
  sendCode(): void;
  /** 邮箱查重（邮箱输入框失焦时调用，容器负责把结果落到 `invalid` / `error`） */
  checkEmail(): void;
  /** 提交注册（容器负责协议勾选校验、RSA 加密、防双击、成功跳转） */
  submit(): void;
  /** 打开协议文档弹窗（弹窗由容器渲染，版式只负责触发） */
  openAgreement(doc: RegisterAgreementDoc): void;
}

/** 版式拿到的全部上下文 */
export interface RegisterViewContext {
  /** 翻译函数 */
  t: RegisterTranslate;
  /** 当前应用名（来自 `?appName=`，可能为空串）；给需要展示品牌信息的版式用 */
  appName: string;

  // ---- 进度（只读）----
  /** 当前步骤 */
  step: RegisterStep;
  /** 总步数（用于画进度条 / 步骤点，别在版式里写死 3） */
  totalSteps: number;
  /** 切换方向（决定转场动画方向） */
  direction: RegisterDirection;
  /** 当前步的副标题（容器按步给文案，版式不要自己拼 key） */
  subtitle: string;
  /** 进度百分比 0~100（`(step / totalSteps) * 100`） */
  progress: number;

  // ---- 表单 ----
  /** 五个字段的绑定；顺序与视觉顺序一致（用户名 / 邮箱 / 验证码 / 密码 / 确认密码） */
  fields: Record<RegisterField, RegisterFieldBinding>;

  // ---- 其它状态（只读，除 `agreed`）----
  /** 「我已阅读并同意」是否勾选。**可写**：`v-model="ctx.agreed"`，容器据此决定能否提交 */
  agreed: boolean;
  /** 邮箱已被注册（用于错误提示；`fields.email.invalid/error` 已包含这一条） */
  emailDuplicate: boolean;
  /** 邮箱验证码是否已发出（未发出前验证码框与「下一步」应按容器给的状态禁用） */
  codeSent: boolean;
  /** 是否在倒计时中（决定验证码按钮显示"获取验证码"还是剩余秒数） */
  countingDown: boolean;
  /** 剩余秒数（配合 `countingDown` 显示） */
  countdown: number;
  /** 是否正在提交（按钮应显示加载态并禁用） */
  submitting: boolean;
  /** 是否允许提交（= 已勾选协议 && 未提交中）；建议直接用这个，别在版式里重算 */
  canSubmit: boolean;

  /** 可触发的行为 */
  actions: RegisterViewActions;
}

/** 版式组件的 props === 契约本身；各版式统一 `defineProps<RegisterViewProps>()` */
export interface RegisterViewProps {
  ctx: RegisterViewContext;
}

/**
 * 注册页版式注册表 —— 谁来决定"用哪套 UI"
 *
 * === 选择优先级（高 → 低）===
 *   1. URL `?view=<id>`      —— 本次访问的显式意图（联调 / 灰度 / 单页预览都用它）
 *   2. 主题包声明             —— `theme/themes/<包>/index.ts` 的 `views.register`
 *                               （写在包根则该包所有配色共用；写在 colors 里只覆盖那套配色）
 *   3. `VITE_REGISTER_VIEW`  —— 部署级默认（整站换 UI，不动代码）
 *   4. `base`                —— 基础版式（缺省）
 *
 * ⚠️ 前两档都在**当前主题包内**查找（版式跟随主题包，见 `../registry.ts`）：
 *    某个包没登记这套版式时，回退的是**该包自己的**基础版式，不会去借别的包。
 * ⚠️ 第 1 档里**非法值不回退**：`?view=typo` 直接落基础版式，而不是被第 2/3 档接管。
 *    显式参数写错时静默换用另一套 UI，比看到默认版式更难排查。
 *
 * ⚠️ 变体是**惰性加载**的（`import.meta.glob` → 独立 chunk）；内置包的基础版式由容器
 *    静态引入（首屏零请求）。新增包或版式目录后要**重启 dev server**
 *    （glob 在启动时静态扫描，热更新发现不了新目录）。
 *
 * @author yijiu2025
 */
import type { Component } from 'vue';
import { createViewRegistry } from './registry';
import { DEFAULT_THEME_DEVICE, THEME_DEVICES, type ThemeDevice } from '../index';

/**
 * 各主题包里本页的版式实现
 *
 * 基础版式在 `<page>/index.vue`，变体在 `<page>/<变体>/index.vue`。两种都扫进来：
 * 内置包的基础版式由容器静态引入、用不上它，但其它包的基础版式只能靠这里惰性拿到
 * —— 包是运行时才定的，静态 import 钉不住。glob 用两个模式合并（`index.vue` 少了
 * 一层目录，一个通配模式盖不住两种形态）。
 *
 * ⚠️ 用 **`/src/...` 根绝对路径**，不要用 `../` 相对路径：本文件在 `views/` 下一层，
 *    相对路径（`../../themes/...`）在当前 Vite 版本下**扫不到任何文件且不报错**
 *    —— 表现为「变体永远加载不出来、`list()` 恒为空」，极难排查。绝对路径不受
 *    当前文件所在层级影响（也不会再犯「数错 `../` 层数」的错）。
 */
const viewLoaders = {
  ...import.meta.glob<{ default: Component }>(
    '/src/theme/themes/*/*/register/index.vue'
  ),
  ...import.meta.glob<{ default: Component }>(
    '/src/theme/themes/*/*/register/*/index.vue'
  )
};

/** 本页版式注册表 */
export const registerViews = createViewRegistry(viewLoaders, { page: 'register' });

/** 部署级默认版式（构建期注入；未配置为 undefined） */
const ENV_VIEW: unknown = import.meta.env.VITE_REGISTER_VIEW;

/** 只把"非空字符串"当作有效外部输入 */
function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** 取当前主题包；未传则落内置包（与 `@/theme` 的回退口径一致） */
function asPackage(value: unknown): string {
  return asText(value) ?? registerViews.builtinPackage;
}

/**
 * 取当前**设备**；未传 / 传了不认识的取值都落默认设备。
 *
 * 这是第三段查找范围（包 × 设备 × 版式 id）。设备判定在容器侧完成
 * （`utils/device.ts`），这里只负责"拿到一个合法值"，判断口径不重复实现。
 */
function asDevice(value: unknown): ThemeDevice {
  return typeof value === 'string' && (THEME_DEVICES as readonly string[]).includes(value)
    ? (value as ThemeDevice)
    : DEFAULT_THEME_DEVICE;
}

/**
 * 按优先级挑出版式 id（永远返回可用 id：最差也是 `registerViews.baseId`）
 *
 * @param source.url   `?view=` 的原始值（未校验，可以是数组/undefined 等任意形态）
 * @param source.theme 主题包声明的版式 id（见 `theme/themes/<包>/index.ts` 的 `views.register`）
 * @param source.pkg   当前主题包 id（`getThemePackage(配色)`）——查找范围的包那一段
 * @param source.device 当前设备（`'mobile' | 'web'`）——查找范围的设备那一段
 *                     两者合起来决定"在哪个包里、哪种设备下"找版式
 */
export function pickRegisterViewId(
  source: { url?: unknown; theme?: unknown; pkg?: unknown; device?: unknown } = {}
): string {
  const pkg = asPackage(source.pkg);
  const device = asDevice(source.device);
  const url = asText(source.url);
  if (url) return registerViews.resolve(url, pkg, device) ?? registerViews.baseId;

  const env = asText(ENV_VIEW);
  return (
    registerViews.resolve(source.theme, pkg, device) ??
    (env ? registerViews.resolve(env, pkg, device) : null) ??
    registerViews.baseId
  );
}

/**
 * 提前把版式 chunk 拉下来（路由器守卫里调用，**不 await**）
 *
 * 变体是动态 import，容器首帧只能先渲染静态兜底、等 chunk 到了再接管。
 * 在导航阶段就把请求发出去（与路由组件自身的 chunk 并行），绝大多数情况下
 * 容器挂载时已在模块缓存里 → 赋值发生在同一 tick 内，用户看不到切换。
 *
 * 「内置包 + base」是唯一无需预热的组合：那是容器静态引入的，零请求。
 */
export function preloadRegisterView(
  source: { url?: unknown; theme?: unknown; pkg?: unknown; device?: unknown } = {}
): void {
  const pkg = asPackage(source.pkg);
  const device = asDevice(source.device);
  const id = pickRegisterViewId(source);
  // 内置包 + 默认设备 + base 是唯一零请求组合：容器静态引入的那份
  if (id === registerViews.baseId && pkg === registerViews.builtinPackage && device === DEFAULT_THEME_DEVICE)
    return;
  void registerViews.load(id, pkg, device);
}
