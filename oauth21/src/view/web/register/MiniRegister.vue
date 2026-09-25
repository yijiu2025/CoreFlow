<script setup lang="ts">
/**
 * 桌面端紧凑注册（iframe 弹窗场景）—— **业务容器**
 *
 * 与 StandardRegister 业务 95% 相同，差异仅在 UI 与少量特有逻辑（footer 指向 /mini-login、
 * 无「标准版双栏」而用单栏卡片）。本文件只负责「注册这件事」，UI 在
 * `theme/themes/<包>/mini/register/index.vue`。
 *
 * @author yijiu2025
 */
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { computed, inject, markRaw, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useButtonLock } from '@/composables/useButtonLock';
import { useCaptcha } from '@/composables/useCaptcha';
import { useAgreementVersion, captureAgreementVersion } from '@/composables/useAgreementVersion';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useThemeStore } from '@/stores/theme';
import BaseMiniRegisterView from '@/theme/themes/default/mini/register/index.vue';
import { pickRegisterViewId, registerViews } from '@/theme/views/register';
import type { RegisterDirection, RegisterTranslate, RegisterViewContext } from '@/theme/views/register';
import type { Component, Ref } from 'vue';

/** 步骤总数：web 端两步（账号+验证码 → 密码+协议） */
const TOTAL_STEPS = 2;

// ================================
// 常量定义
// ================================
const COUNTDOWN_SECONDS = 60; // 验证码倒计时秒数
const RECAPTCHA_TIMEOUT = 30_000; // 获取验证码超时时间（毫秒）
const RSA_ENCRYPT_TIMEOUT = 30_000; // RSA 加密超时时间（毫秒）

// ================================
// 路由和上下文
// ================================
const router = useRouter();
const route = useRoute();
const { t, locale } = useI18n();
const themeStore = useThemeStore();

// 父组件透传的注册上下文（dispatcher provide）
interface RegisterContext {
  appName: string;
  clientId: string;
  redirectUri: string;
  redirect: string;
  scope: string;
  state: string;
  invite: string;
  lang: string;
  isMobile?: boolean;
  query?: Record<string, string>;
}

const registerContext = inject<RegisterContext>('registerContext', {
  appName: 'Enterprise SSO',
  clientId: '',
  redirectUri: '',
  redirect: '',
  scope: '',
  state: '',
  invite: '',
  lang: 'zh_cn'
});

// 跟随父组件透传的 lang 切换 locale
if (registerContext.lang) locale.value = registerContext.lang;

// ================================
// 分步状态管理
// ================================
const step = ref<1 | 2>(1);
const direction = ref<RegisterDirection>('next');

// 分步副标题（显式映射）
const stepSub = computed(() => {
  if (step.value === 1) return t('register.sub_step1');
  return t('register.sub_step2');
});

// ================================
// 表单验证
// ================================
const registerSchema = z
  .object({
    username: z
      .string({ required_error: t('register.username_min') })
      .min(5, t('register.username_min'))
      .regex(/^[A-Za-z0-9_]+$/, t('register.username_pattern')),
    email: z.string({ required_error: t('register.email') }).email(t('register.email_invalid')),
    code: z
      .string({ required_error: t('register.code') })
      .regex(/^\d{6}$/, t('register.code_min')),
    password: z
      .string({ required_error: t('register.password_min') })
      .min(8, t('register.password_min'))
      .max(128, t('register.password_max'))
      .regex(/^(?=.*[a-z])/, t('register.password_lowercase'))
      .regex(/^(?=.*[A-Z])/, t('register.password_uppercase'))
      .regex(/^(?=.*\d)/, t('register.password_digit')),
    confirmPassword: z.string({ required_error: t('register.confirm_required') }).min(1, t('register.confirm_required'))
  })
  .refine((data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword, {
    message: t('register.password_mismatch'),
    path: ['confirmPassword']
  });

const { values, errors, defineField, handleSubmit, validateField } = useForm({
  validationSchema: toTypedSchema(registerSchema)
});

const [username, usernameProps] = defineField('username');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

// ================================
// 验证码和状态管理
// ================================
const agreed = ref(false);
const isEmailDuplicate = ref(false);
const isEmailChecking = ref(false);
const codeSent = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);

const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(COUNTDOWN_SECONDS);
const submitLock = useButtonLock();
const agreementVersion = useAgreementVersion();
const submitting = computed(() => submitLock.locked.value);

// 人机验证（reCAPTCHA）
const { isEnabled: recaptchaEnabled, load: loadCaptcha, getToken: getCaptchaToken, dispose } = useCaptcha('register');
const { error: showError, success: showSuccess } = useMessage();

// 图形验证码流程
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(() => {
  codeSent.value = true;
  startCountdown(COUNTDOWN_SECONDS);
});

// ================================
// 工具函数
// ================================
function withTimeout<T>(p: Promise<T>, ms: number, op: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${op} timeout (${ms}ms)`)), ms))
  ]);
}

/**
 * 注册后回跳（OAuth 同源白名单，防开放重定向）
 * 非法回跳降级到 /mini-login 并保留 OAuth 上下文
 */
function safeRedirect(): string {
  const r = registerContext.redirectUri || registerContext.redirect;
  if (r && r.startsWith('/') && !r.startsWith('//') && !r.includes('://')) {
    return r;
  }
  return buildMiniLoginUrl();
}

/**
 * 拼 /mini-login URL，保留当前路由的 OAuth 上下文
 */
function buildMiniLoginUrl(): string {
  const preservedQuery: Record<string, string> = {};
  for (const k of ['appName', 'client_id', 'scope', 'state', 'redirect_uri', 'lang']) {
    const v = route.query[k];
    if (typeof v === 'string') preservedQuery[k] = v;
  }
  preservedQuery.from = 'register';
  const queryStr = new URLSearchParams(preservedQuery).toString();
  return `/mini-login${queryStr ? '?' + queryStr : ''}`;
}

// ================================
// 业务逻辑函数
// ================================

/**
 * 检查邮箱是否已被注册
 */
const checkEmail = async () => {
  if (!values.email || errors.value.email) {
    isEmailDuplicate.value = false;
    return;
  }
  isEmailChecking.value = true;
  try {
    const res = (await authApi.checkEmail(values.email)) as unknown as { isDuplicate?: boolean };
    isEmailDuplicate.value = !!res?.isDuplicate;
  } catch (err) {
    console.warn('[MiniRegister] checkEmail failed', err);
    isEmailDuplicate.value = false;
  } finally {
    isEmailChecking.value = false;
  }
};

/**
 * 发送验证码：先查重，再走图形验证码弹窗
 */
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError(t('register.email_duplicate'));
    return;
  }
  openRegCaptcha('register');
};

/**
 * 前进到第 2 步
 */
const handleNextStep = async (target: 2) => {
  if (isEmailChecking.value) return;
  const r1 = await validateField('username');
  const r2 = await validateField('email');
  const r3 = await validateField('code');
  const ok = r1.valid && r2.valid && r3.valid && !isEmailDuplicate.value;
  if (ok) {
    direction.value = 'next';
    step.value = target;
  }
};

/**
 * 后退到第 1 步
 */
const handleBack = () => {
  direction.value = 'prev';
  step.value = 1;
};

/**
 * 去登录页（mini 场景指向 /mini-login）
 */
const goLogin = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'scope', 'state', 'redirect_uri', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  void import('@/view/web/login/index.vue').catch(() => {});
  router.push({ path: '/mini-login', query: { ...query, from: 'register' } });
};

/**
 * 处理注册表单提交
 */
const handleRegister = handleSubmit(async () => {
  if (!agreed.value || isEmailDuplicate.value) return;
  if (submitLock.locked.value) return;
  submitLock.lock();

  // 解构排除 confirmPassword（`_` 前缀 = 有意不使用）：它只用于本地一致性校验，不发往后端
  const { confirmPassword: _confirmPassword, ...submitData } = values;

  try {
    const encryptedPassword = await withTimeout(rsaEncrypt(submitData.password!), RSA_ENCRYPT_TIMEOUT, 'rsaEncrypt');
    const recaptchaToken = recaptchaEnabled
      ? await withTimeout(getCaptchaToken(), RECAPTCHA_TIMEOUT, 'getCaptchaToken')
      : null;

    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      agreementVersion: captureAgreementVersion(agreementVersion),
      invite: registerContext.invite || undefined,
      appName: registerContext.appName,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });

    showSuccess(t('register.success'));
    router.push(safeRedirect());
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('register.register_failed'));
  } finally {
    submitLock.unlock();
  }
});

// ================================
// 生命周期钩子
// ================================
onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
});

onUnmounted(() => dispose());

/* ============================================================================
   版式（UI）加载 + 契约组装
   ========================================================================== */

/** 本容器的设备身份：mini */
const THEME_DEVICE = 'mini' as const;

const viewId = computed(() =>
  pickRegisterViewId({
    url: route.query.view,
    pkg: themeStore.packageId,
    device: THEME_DEVICE
  })
);

watch(viewId, id => themeStore.setActivePageView('register', id), { immediate: true });

const activeView = shallowRef<Component>(BaseMiniRegisterView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void registerViews.load(id, pkg, THEME_DEVICE).then(loaded => {
      if (epoch !== viewEpoch) return;
      activeView.value = loaded ? markRaw(loaded) : BaseMiniRegisterView;
    });
  },
  { immediate: true }
);

/** 契约里字段绑定的内部构造形态 */
interface FieldSource {
  value: Ref<string>;
  attrs: Ref<Record<string, unknown>>;
  invalid: Ref<boolean>;
  error: Ref<string | undefined>;
}

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

function assertRegisterContract(ctx: RegisterViewContext): RegisterViewContext {
  return ctx;
}

const translate: RegisterTranslate = (key, params) => {
  if (params === undefined) return t(key);
  return typeof params === 'string' ? t(key, params) : t(key, params as never);
};

const ctx = assertRegisterContract(
  reactive({
    t: translate,
    appName: computed(() => registerContext.appName),

    step: computed(() => step.value),
    totalSteps: TOTAL_STEPS,
    direction: computed(() => direction.value),
    subtitle: computed(() => stepSub.value),
    progress: computed(() => (step.value / TOTAL_STEPS) * 100),

    fields: {
      username: bindField(
        username,
        usernameProps,
        computed(() => !!errors.value.username),
        computed(() => errors.value.username)
      ),
      email: bindField(
        email,
        emailProps,
        computed(() => !!errors.value.email || isEmailDuplicate.value),
        computed(() => (isEmailDuplicate.value ? t('register.email_duplicate') : errors.value.email))
      ),
      code: bindField(code, codeProps, computed(() => !!errors.value.code), computed(() => errors.value.code)),
      password: bindField(
        password,
        passwordProps,
        computed(() => !!errors.value.password),
        computed(() => errors.value.password)
      ),
      confirmPassword: bindField(
        confirmPassword,
        confirmPasswordProps,
        computed(() => !!errors.value.confirmPassword),
        computed(() => errors.value.confirmPassword)
      )
    } satisfies Record<string, FieldSource>,

    agreed,
    emailDuplicate: computed(() => isEmailDuplicate.value),
    codeSent: computed(() => codeSent.value),
    countingDown: computed(() => isCountingDown.value),
    countdown: computed(() => countdown.value),
    submitting: computed(() => submitting.value),
    canSubmit: computed(() => agreed.value && !submitting.value),

    actions: {
      nextStep: handleNextStep,
      back: handleBack,
      goLogin,
      sendCode,
      checkEmail,
      submit: handleRegister,
      openAgreement: (doc: 'service' | 'privacy') => {
        docType.value = doc;
      }
    }
  })
);
</script>

<template>
  <!-- 业务容器只做两件事：把 ctx 交给当前版式；渲染与版式无关的业务浮层 -->
  <component :is="activeView" :ctx="ctx" />

  <!-- 图形验证码弹窗 -->
  <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

  <!-- 服务协议 / 隐私政策 弹窗 -->
  <AgreementModals v-model:type="docType" />

  <!-- 错误/成功提示 toast -->
  <MessageToast />
</template>
