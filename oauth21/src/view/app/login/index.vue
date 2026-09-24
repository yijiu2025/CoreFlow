<script setup lang="ts">
/**
 * 移动端登录页（/m/login）—— **业务容器**
 *
 * 路由：mobileRoutes 全屏直达；同时是 /login 在窄屏 / 真机下的自动形态
 * （分发逻辑见 view/web/login/index.vue —— 它按 `isMobile` / `from=mini` / 设备判定
 * 挑组件，挑到本容器时下面这套 UI 机制同样生效）。
 *
 * === 分层（2026-09-24 架构调整；版式改随主题包走）===
 * 本文件只负责"登录这件事"：表单校验、登录流程（授权确认 / 邮箱二次验证 / 最大会话数）、
 * 图形验证码、第三方登录、协议勾选、路由跳转。
 * **页面长什么样不在这里**，而在**当前主题包**里的版式组件里：
 *
 *    本容器 ──传 ctx──▶ theme/themes/<包>/login/<版式>/index.vue
 *                 ▲
 *                 └── 契约定在 theme/views/login.ts（各包共用这一份，版式只读它）
 *
 * 于是「换一套 UI」= 在包里加一个版式目录，本文件零改动。选择优先级见
 * `theme/views/login.ts`（`?view=` > 主题包声明 > 环境变量 > 基础版式）。
 * **内置包**（`default`）的 base 由本文件**静态引入**：正常访问不产生额外请求，首帧即正确；
 * 其它包 / 其它版式都是惰性 chunk，由路由守卫提前预热。
 *
 * === 与桌面版对齐的能力（历史上缺失 → 授权/二次验证时静默失败）===
 *   - ConsentPanel：后端返回 action=consent 时展示授权确认
 *   - 邮箱二次验证面板：action=needs_email_verify 时输入邮箱码继续登录
 *   - AppNameMissing：缺 appName/client_id 时给明确提示，而不是提交后报错
 *     （判据 `hasAppName` 经契约交给版式，版式不自己读 query）
 *
 * 移动端专项（都在样式层，见 assets/styles/mobile-auth.scss）：
 * 100dvh + 安全区留白、输入框 16px 字号（iOS 聚焦不放大）、可纵向滚动。
 *
 * === 浮层 ===
 * 图形验证码 / 协议文档 / 全局提示都由本容器渲染（它们由业务状态驱动，
 * 且都是 `position: fixed` 或 Teleport 到 body，渲染位置不影响呈现），
 * 版式因此完全不必知道"有验证码弹窗这回事"。
 *
 * @author yijiu2025
 */
import { computed, markRaw, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { useLoginFlow } from '@/composables/useLoginFlow';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { postToParent } from '@/utils/parent';
import AgreementModals from '@/components/common/AgreementModals.vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';
import { useSocialLogin } from '@/composables/useSocialLogin';
import { useThemeStore } from '@/stores/theme';
/**
 * 静态引入**内置包**的基础版式 —— 首屏零请求的那条路径
 *
 * 路径里的 `default` 必须写死：静态 import 在编译期就要定下来，而"当前是哪个包"
 * 是运行时才知道的（URL / 后端下发 / localStorage）。运行时的那份判定在
 * `loginViews.builtinPackage`，两者必须是同一个包。
 */
import BaseLoginView from '@/theme/themes/default/login/index.vue';
import { loginViews, pickLoginViewId } from '@/theme/views/login';
import type { LoginDirection, LoginPanel, LoginTranslate, LoginViewContext } from '@/theme/views/login';
import type { SocialProviderId } from '@/composables/useSocialLogin';
import type { Component, Ref } from 'vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();
const { error: showError } = useMessage();

// 键盘弹出时把聚焦的输入框滚进可视区（iOS 键盘只覆盖视口、不缩视口高度）
useKeyboardAvoid();

// 第三方登录：providers 解析不出来时整行不渲染，默认外观零变化
const {
  providers: socialProviders,
  lastProvider: socialLastProvider,
  startLogin: startSocialLogin
} = useSocialLogin();

// 应用配置：缺 appName/client_id 时无法开展登录（与桌面版一致给明确提示）
const clientId = computed(() => (route.query.client_id as string) || (route.query.appName as string) || '');
const hasAppName = computed(() => !!clientId.value);

// 语言跟随父应用透传
watch(
  () => route.query.lang as string,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

// 登录模式 + 切换方向（邮箱登录 / 密码登录）
const loginType = ref<'email' | 'pwd'>('email');
// 方式切换方向：只给语义（切到密码=next），具体用哪个动画类由版式决定
const direction = ref<LoginDirection>('next');

// 表单校验架构 (Zod discriminatedUnion，学 web 端 MiniLogin)
const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email(t('validation.email_invalid') || '请输入有效的邮箱'),
    code: z.string().min(4, t('validation.code_min') || '验证码至少4位')
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, t('validation.username_min') || '账号至少2位'),
    password: z.string().min(6, t('validation.password_min') || '密码至少6位')
  })
]);

/**
 * 表单字段类型：schema 是 `z.discriminatedUnion`，`z.infer` 因此推出的是**联合**；
 * 但表单实例自始至终持有全部字段（切换登录模式不重建表单、已填值也不清空），
 * 所以这里显式给 `useForm` 一个"并集"类型。不传的话 vee-validate 只认第一个分支 ——
 * `initialValues` 里的 `username`/`password` 会被判为多余属性，`values.email` 也会被判为不存在。
 * ⚠️ 只影响编译期，运行时行为与不传泛型完全一致（schema 仍是那个判别联合）。
 */
type LoginFormValues = {
  type: 'email' | 'pwd';
  email?: string;
  code?: string;
  username?: string;
  password?: string;
};

const { values, errors, defineField, handleSubmit } = useForm<LoginFormValues>({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: {
    type: 'email' as const,
    email: '',
    code: '',
    username: '',
    password: ''
  }
});

const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [username, usernameProps] = defineField('username');
const [password, passwordProps] = defineField('password');
const [type] = defineField('type');

const agreed = ref(false);
const keepLogin = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);
// 倒计时：发送邮箱验证码后 60s 禁用按钮
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

// 图形验证码流程：弹窗 → 通过 → 按 purpose（code 发邮箱码 / login 登录）继续
const { captchaKey, showCaptcha, captchaPurpose, openCaptcha, onCaptchaSuccess } = useCaptchaFlow<'code' | 'login'>(
  purpose => {
    if (purpose === 'code') executeSendEmailCode();
    else executeLogin();
  }
);

// 发送邮箱验证码（先弹图形码，通过后由 verify-captcha 端点发邮箱码 + 启动倒计时）
const sendEmailCode = () => {
  if (!email.value || (errors.value as Record<string, string | undefined>).email) {
    showError(t('login.input_email_first') || '请先输入有效的邮箱地址');
    return;
  }
  openCaptcha('code');
};

// 图形码通过 → 启动 60s 倒计时（邮箱码已由 verify-captcha 端点发出）
const executeSendEmailCode = () => {
  startCountdown(60);
};

// 切换登录模式（带方向语义 + 同步 discriminatedUnion 的 type 字段）
const switchType = (next: 'email' | 'pwd') => {
  if (next === loginType.value) return;
  direction.value = next === 'pwd' ? 'next' : 'prev';
  loginType.value = next;
};
watch(loginType, newType => {
  type.value = newType;
});

// 登录流程：consent/email_verify/max_sessions/notifyParent 统一在 useLoginFlow
const {
  showConsent, consentState, submittingConsent, denyConsent, approveConsent,
  showEmailVerify, emailVerifyState, emailVerifyCode, emailVerifyCountdown: emailVerifyTimer,
  sendEmailVerifyCode, submitEmailVerify, executeLogin
} = useLoginFlow({
  keepLogin: () => keepLogin.value,
  values: () => values,
  captchaKey: () => captchaKey.value,
  clientId: () => clientId.value,
  showError: (msg: string) => showError(msg),
  // 全屏直连：守卫带的 ?redirect=（如 /authorize?...）登录后原路返回；iframe 内不生效
  redirectTo: () => (route.query.redirect as string) || null
});

/**
 * 第三方登录：去哪儿交给 useSocialLogin 决定（授权端点 / 父应用）
 *
 * 没配授权端点时明确提示，而不是让用户点了没反应 —— 静默失败会被当成「按钮坏了」。
 */
const selectSocial = (id: SocialProviderId) => {
  if (startSocialLogin(id) === 'unconfigured') {
    showError(t('login.social_unconfigured', '该登录方式尚未配置授权地址'));
  }
};

const handleLogin = handleSubmit(async () => {
  if (!agreed.value) {
    showError(t('login.agree_required') || '请先阅读并勾选同意相关协议');
    return;
  }
  // 密码登录需先过图形验证码，邮箱登录直接执行
  if (loginType.value === 'pwd') {
    openCaptcha('login');
  } else {
    executeLogin();
  }
});

/**
 * 当前展示哪块面板 —— 优先级就是这里的书写顺序（授权 > 二次验证 > 登录表单）
 *
 * 版式拿到的是一个**单值**而不是三个布尔量：把"谁盖住谁"收在一处，
 * 免得每套 UI 各写一遍 v-if 链、写漏一个条件就同时渲染两块面板。
 */
const panel = computed<LoginPanel>(() => {
  if (showConsent.value) return 'consent';
  if (showEmailVerify.value) return 'emailVerify';
  return 'form';
});

const headerTitle = computed(() => {
  if (showConsent.value) return t('login.consent_title');
  if (showEmailVerify.value) return t('login.email_verify_title');
  return t('login.welcome');
});

const goRegister = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  router.push({ path: '/m/register', query });
};

const goForgot = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  // 直连移动端路由：宽视口下它自己会跳电脑版（desktopWhenWide，query 原样透传），
  // 不在这里做设备判断，避免"两个地方各判一次"产生两套标准
  router.push({ path: '/m/forgot-password', query });
};

const goBack = () => {
  if (window.parent && window.parent !== window) {
    // 用 postToParent 走白名单 origin 校验，禁用 '*' 避免恶意父窗口截获
    postToParent({ type: 'SSO_CLOSE' });
    return;
  }
  // 直接打开（无站内历史）时 back() 会离开站点甚至白屏，退化为回登录首页
  if (window.history.length > 1) router.back();
  else router.replace('/login');
};

/* ============================================================================
   版式（UI）加载 + 契约组装
   ========================================================================== */

const themeStore = useThemeStore();
/**
 * 用哪套版式：`?view=` > 主题包声明（theme/themes/<包>/index.ts 的 views.login）
 * > VITE_LOGIN_VIEW > base。解析细节与安全边界见 registry.ts。
 *
 * 做成 computed 而不是 setup 里取一次，是因为主题是**运行时**才定的：
 * 后端下发的换配色配置在 App.vue 的 onMounted 之后才到（可能晚于本页 setup），
 * 取一次就会漏掉"主题包声明了版式"这种情况。
 *
 * `pkg` 决定**在哪个包里找**：版式跟随主题包，同一个 `?view=compact` 在不同包里
 * 指向不同实现，所以包变了就要重新解析（依赖 `packageId` 让 computed 自动重算）。
 */
const viewId = computed(() =>
  pickLoginViewId({
    url: route.query.view,
    theme: themeStore.viewFor('login'),
    pkg: themeStore.packageId
  })
);

/**
 * 当前渲染的版式组件
 *
 * 默认是**内置包的基础版式**：它由本文件静态引入，首帧直接正确（不会先白屏再闪一下）。
 * 变体、以及非内置包的版式都是动态 chunk，加载完成后接管；路由守卫已提前预热
 * （preloadLoginView），因此绝大多数情况下这一步在同一 tick 内完成 —— 用户看不到切换。
 *
 * `viewEpoch` 用于丢弃过期结果（版式 A→B→A 连续变化时先发出的 A 可能后返回）。
 *
 * ⚠️ 必须**同时**盯住主题包：版式只在当前包内查找，换了包但解析出的 id 字符串没变
 *    （两边都是 `base`）时，渲染的组件其实换了一整套 —— 只盯 id 会漏掉这一整类切换。
 */
const activeView = shallowRef<Component>(BaseLoginView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void loginViews.load(id, pkg).then(loaded => {
      if (epoch !== viewEpoch) return;
      // null = 用静态引入的内置包基础版式（首屏零请求那条路径）
      activeView.value = loaded ? markRaw(loaded) : BaseLoginView;
    });
  },
  { immediate: true }
);

/** 契约里字段绑定的**内部构造形态**：值与错误都是 ref，交给 reactive 自动解包成契约里的标量 */
interface FieldSource {
  value: Ref<string>;
  attrs: Ref<Record<string, unknown>>;
  invalid: Ref<boolean>;
  error: Ref<string | undefined>;
}

/**
 * 把一个字段打成交给版式的"绑定三件套"
 *
 * - `value` 包一层可写 computed：vee-validate 给的值 ref 是 `string | undefined`
 *   （一次都没填过就是 undefined），而契约承诺版式拿到的一定是字符串 —— 读时兜底成
 *   `''`，写时原样回填进表单（`v-model` 仍写回同一个 ref，校验/取值链路不变）。
 * - `attrs` **整个 ref 原样存下来**，不提前取 `.value`：vee-validate 里它是 `computed`，
 *   取值时可能产出新对象，提前取会拿到过期快照。
 */
function bindField(
  value: Ref<string | undefined>,
  attrs: Ref<Record<string, unknown>>,
  invalid: Ref<boolean>,
  error: Ref<string | undefined>
): FieldSource {
  return {
    value: computed({
      get: () => value.value ?? '',
      set: next => {
        value.value = next;
      }
    }),
    attrs,
    invalid,
    error
  };
}

/**
 * 编译期契约自检
 *
 * 容器组装的 ctx 必须**结构上满足** `theme/views/login.ts` 声明的契约：
 * 少一个字段、类型对不上，都会在这行报错。这样"版式契约"才是真的有约束力，
 * 而不是一份会过期的文档。改契约后容器与所有版式会一起报错，不会悄悄跑偏。
 */
function assertLoginContract(ctx: LoginViewContext): LoginViewContext {
  return ctx;
}

/** 翻译函数：只把「key + （命名参数 | 兜底文案）」这一子集交给版式（版式因此不依赖 i18n 内部类型） */
const translate: LoginTranslate = (key, params) => {
  if (params === undefined) return t(key);
  return typeof params === 'string' ? t(key, params) : t(key, params as never);
};

/**
 * 交给版式的上下文
 *
 * reactive + 嵌套 ref：契约里声明的是**标量**（`mode`、`fields.x.value: string`），
 * 而这些标量在容器里都是 ref —— `reactive` 会自动解包，版式侧写 `ctx.mode`、
 * `v-model="ctx.fields.email.value"` 即可，不必到处 `.value`。
 */
const ctx = assertLoginContract(
  reactive({
    t: translate,
    appName: clientId,
    hasAppName,

    panel,
    title: headerTitle,
    subtitle: computed(() => t('login.mobile_sub', '统一身份认证')),

    mode: computed(() => loginType.value),
    direction: computed(() => direction.value),
    fields: {
      email: bindField(email, emailProps, computed(() => !!errors.value.email), computed(() => errors.value.email)),
      code: bindField(code, codeProps, computed(() => !!errors.value.code), computed(() => errors.value.code)),
      username: bindField(
        username,
        usernameProps,
        computed(() => !!errors.value.username),
        computed(() => errors.value.username)
      ),
      password: bindField(
        password,
        passwordProps,
        computed(() => !!errors.value.password),
        computed(() => errors.value.password)
      )
    } satisfies Record<string, FieldSource>,
    keepLogin,
    agreed,
    countingDown: computed(() => isCountingDown.value),
    countdown: computed(() => countdown.value),
    submitting: computed(() => authStore.loading),

    socialProviders,
    socialLastProvider,

    consentState: computed(() => consentState.value as LoginViewContext['consentState']),
    consentSubmitting: computed(() => submittingConsent.value),

    // 只把版式要展示的两项交出去（verifyToken 是凭据，留在容器里）
    emailVerifyState: computed(() => {
      const s = emailVerifyState.value;
      return s ? { email: s.email, reason: s.reason } : null;
    }),
    emailVerifyCode,
    emailVerifyCountingDown: computed(() => emailVerifyTimer.active.value),
    emailVerifyCountdown: computed(() => emailVerifyTimer.remaining.value),

    actions: {
      switchMode: switchType,
      submit: handleLogin,
      sendCode: sendEmailCode,
      goRegister,
      goForgot,
      back: goBack,
      openAgreement: (doc: 'service' | 'privacy') => {
        docType.value = doc;
      },
      selectSocial,
      approveConsent,
      denyConsent,
      sendEmailVerifyCode,
      submitEmailVerify
    }
  })
);
</script>

<template>
  <!-- 业务容器只做两件事：把 ctx 交给当前版式；渲染与版式无关的业务浮层 -->
  <component :is="activeView" :ctx="ctx" />

  <!-- 图形验证码弹窗（send-email=true 时 verify-captcha 一次完成校验图形码 + 发邮箱码） -->
  <GraphicCaptcha
    :is-open="showCaptcha"
    :email="values.email"
    :send-email="captchaPurpose === 'code'"
    type="login"
    @close="showCaptcha = false"
    @success="onCaptchaSuccess"
  />
  <AgreementModals v-model:type="docType" />
  <MessageToast />
</template>
