<script setup lang="ts">
/**
 * 桌面端标准登录 —— **业务容器**
 *
 * === 分层（2026-09-25 起，与移动端 `app/login/index.vue` 对齐）===
 * 本文件只负责「登录这件事」：表单校验、登录流程（授权确认 / 邮箱二次验证 / 最大会话数）、
 * 图形验证码、二维码登录、协议勾选、路由跳转。
 * **页面长什么样不在这里**，而在**当前主题包**里的版式组件里：
 *
 *    本容器 ──传 ctx──▶ theme/themes/<包>/standard/login/index.vue
 *                 ▲
 *                 └── 契约定在 theme/views/login.ts（各包共用这一份，版式只读它）
 *
 * 于是「换一套 UI」= 在包里加一个版式目录，本文件零改动。
 * **内置包**（`default`）的 base 由本文件**静态引入**：正常访问不产生额外请求，首帧即正确；
 * 其它包 / 其它版式都是惰性 chunk，由路由守卫提前预热。
 *
 * 与 MiniLogin（紧凑版）的区别：两者是 dispatcher 的**两种设备形态分支**，
 * 业务逻辑 90% 相同，但 UI 差异大（标准版是左右双栏 + 扫码面板，紧凑版是单栏卡片）。
 * 二者各自成为独立容器，各自加载自己的版式。
 *
 * @author yijiu2025
 */
import { computed, markRaw, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useQrLogin } from '@/composables/useQrLogin';
import { useLoginFlow } from '@/composables/useLoginFlow';
import BaseLoginView from '@/theme/themes/default/standard/login/index.vue';
import { loginViews, pickLoginViewId } from '@/theme/views/login';
import { readDeviceParam } from '@/theme/views/params';
import type { LoginTranslate, LoginViewContext } from '@/theme/views/login';
import type { Component, Ref } from 'vue';

const authStore = useAuthStore();
const themeStore = useThemeStore();
const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();
const { error: showError } = useMessage();

// 1. 应用配置与接入校验
const hasAppName = computed(() => !!(route.query.appName || route.query.client_id));
const appConfig = computed(() => ({
  appName: (route.query.appName as string) || (route.query.client_id as string) || '',
  lang: (route.query.lang as string) || 'zh_cn',
  qrCodeFirst: route.query.qrCodeFirst === 'true',
  notKeepLogin: route.query.notKeepLogin === 'true'
}));

// 2. 国际化同步
watch(
  () => appConfig.value.lang,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

// 3. 登录模式 & 表单校验 SCHEMA
const loginType = ref<'email' | 'pwd'>('email');
const keepLogin = ref(false);
const agreed = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);

const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email(t('validation.email_invalid') || '请输入有效的邮箱地址'),
    code: z.string().min(4, t('validation.code_min') || '验证码至少4位')
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, t('validation.username_min') || '账号至少2位'),
    password: z.string().min(6, t('validation.password_min') || '密码至少6位')
  })
]);

const { values, handleSubmit, errors, defineField } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: { type: 'email', email: '', code: '', username: '', password: '' } as Record<string, string>
});

const [type] = defineField('type');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [username, usernameProps] = defineField('username');
const [password, passwordProps] = defineField('password');

watch(loginType, newType => {
  type.value = newType;
});

// 4. 图形验证码 & 邮箱验证码发送
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

const { captchaKey, showCaptcha, captchaPurpose, openCaptcha, onCaptchaSuccess } = useCaptchaFlow<'code' | 'login'>(
  purpose => {
    if (purpose === 'code') executeSendEmailCode();
    else executeLogin();
  }
);

const sendEmailCode = () => {
  if (!email.value || (errors.value as Record<string, string | undefined>).email) {
    showError(t('login.input_email_first') || '请先输入有效的邮箱地址');
    return;
  }
  openCaptcha('code');
};

const executeSendEmailCode = () => {
  startCountdown(60);
};

// 5. 登录流程：consent/email_verify/max_sessions/notifyParent 统一在 useLoginFlow
const {
  showConsent, consentState, submittingConsent, denyConsent, approveConsent,
  showEmailVerify, emailVerifyState, emailVerifyCode, emailVerifyCountdown,
  sendEmailVerifyCode, submitEmailVerify, executeLogin, notifyParentLoginSuccess
} = useLoginFlow({
  keepLogin: () => keepLogin.value,
  values: () => values,
  captchaKey: () => captchaKey.value,
  clientId: () => (route.query.client_id as string) || (route.query.appName as string),
  showError: (msg: string) => showError(msg),
  redirectTo: () => (route.query.redirect as string) || null
});

const handleLogin = handleSubmit(async () => {
  if (!agreed.value) {
    showError('请先阅读并勾选同意相关协议');
    return;
  }
  if (loginType.value === 'pwd') {
    openCaptcha('login');
  } else {
    executeLogin();
  }
});

// 6. 二维码生成与轮询
const qrClientId = computed(() => (route.query.client_id as string) || (route.query.appName as string) || '');

const { qrDataUrl, qrStatus, generate: generateQR, reset: resetQR } = useQrLogin(
  () => qrClientId.value,
  (res: unknown) => notifyParentLoginSuccess(res),
  () => showError(t('login.qr_expired') || '二维码已过期')
);

// 7. 生命周期与辅助计算
const isEmbedded = computed(() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
});

onMounted(() => {
  if (appConfig.value.notKeepLogin) keepLogin.value = false;
  if (hasAppName.value) generateQR();
});

onUnmounted(() => {
  resetQR();
});

/* ============================================================================
   版式（UI）加载 + 契约组装
   ========================================================================== */

/** 本容器的设备身份：文件位置即身份（`view/web/` 下都是电脑端） */
const THEME_DEVICE = 'standard' as const;

const viewId = computed(() =>
  pickLoginViewId({
    url: readDeviceParam(route.query, 'view', THEME_DEVICE),
    theme: themeStore.viewFor('login'),
    pkg: themeStore.packageId,
    device: THEME_DEVICE
  })
);

watch(viewId, id => themeStore.setActivePageView('login', id), { immediate: true });

/**
 * 当前渲染的版式组件（同 `app/login/index.vue` 的机制）
 * 默认是内置包的基础版式（静态引入）；变体/其它包惰性加载。
 * `viewEpoch` 丢弃过期结果，`markRaw` 避免无谓 reactive 代理。
 */
const activeView = shallowRef<Component>(BaseLoginView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void loginViews.load(id, pkg, THEME_DEVICE).then(loaded => {
      if (epoch !== viewEpoch) return;
      activeView.value = loaded ? markRaw(loaded) : BaseLoginView;
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

function assertLoginContract(ctx: LoginViewContext): LoginViewContext {
  return ctx;
}

const translate: LoginTranslate = (key, params) => {
  if (params === undefined) return t(key);
  return typeof params === 'string' ? t(key, params) : t(key, params as never);
};

const ctx = assertLoginContract(
  reactive({
    t: translate,
    appName: computed(() => appConfig.value.appName),
    hasAppName,

    panel: computed(() => {
      if (showConsent.value) return 'consent';
      if (showEmailVerify.value) return 'emailVerify';
      return 'form';
    }),
    title: computed(() => {
      if (showConsent.value) return t('login.consent_title');
      if (showEmailVerify.value) return t('login.email_verify_title');
      return t('login.welcome');
    }),
    subtitle: computed(() => t('login.fill_credentials', '请填写您的登录凭据')),

    mode: computed(() => loginType.value),
    direction: computed(() => (loginType.value === 'pwd' ? 'next' : 'prev') as 'next' | 'prev'),
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

    socialProviders: computed(() => [] as never[]),
    socialLastProvider: null,

    consentState: computed(() => consentState.value as LoginViewContext['consentState']),
    consentSubmitting: computed(() => submittingConsent.value),

    emailVerifyState: computed(() => {
      const s = emailVerifyState.value;
      return s ? { email: s.email, reason: s.reason } : null;
    }),
    emailVerifyCode,
    emailVerifyCountingDown: computed(() => emailVerifyCountdown.active.value),
    emailVerifyCountdown: computed(() => emailVerifyCountdown.remaining.value),

    qrDataUrl: computed(() => qrDataUrl.value),
    qrStatus: computed(() => qrStatus.value),
    showQr: computed(() => appConfig.value.qrCodeFirst),
    isEmbedded,
    isDark: computed(() => themeStore.isDark),

    actions: {
      switchMode: (mode: 'email' | 'pwd') => {
        loginType.value = mode;
      },
      submit: handleLogin,
      sendCode: sendEmailCode,
      goRegister: () => {
        const query: Record<string, string> = {};
        for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang']) {
          const v = route.query[key];
          if (typeof v === 'string') query[key] = v;
        }
        void import('@/view/web/register/index.vue').catch(() => {});
        router.push({ path: '/register', query });
      },
      goForgot: () => {
        const query: Record<string, string> = {};
        for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
          const v = route.query[key];
          if (typeof v === 'string') query[key] = v;
        }
        void import('@/view/web/forgot-password/index.vue').catch(() => {});
        router.push({ path: '/forgot-password', query });
      },
      back: () => {},
      openAgreement: (doc: 'service' | 'privacy') => {
        docType.value = doc;
      },
      selectSocial: () => {},
      approveConsent,
      denyConsent,
      sendEmailVerifyCode,
      submitEmailVerify,
      generateQr: () => generateQR(),
      resetQr: () => resetQR(),
      toggleQr: () => {},
      toggleTheme: () => themeStore.toggleTheme()
    }
  })
);
</script>

<template>
  <!-- 业务容器只做两件事：把 ctx 交给当前版式；渲染与版式无关的业务浮层 -->
  <component :is="activeView" :ctx="ctx" />

  <!-- 图形验证码弹窗与全局 Toast -->
  <GraphicCaptcha
    :is-open="showCaptcha"
    :email="captchaPurpose === 'code' ? email : undefined"
    :send-email="captchaPurpose === 'code'"
    type="login"
    @close="showCaptcha = false"
    @success="onCaptchaSuccess"
  />
  <MessageToast />
  <AgreementModals v-model:type="docType" />
</template>
