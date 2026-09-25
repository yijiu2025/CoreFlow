<script setup lang="ts">
/**
 * 桌面端紧凑登录（iframe 弹窗场景）—— **业务容器**
 *
 * 与 StandardLogin 业务 90% 相同，差异仅在 UI 与少量特有逻辑（showQR 切换、URL 初始主题）。
 * 本文件只负责「登录这件事」，UI 在 `theme/themes/default/mini/login/index.vue`。
 *
 * @author yijiu2025
 */
import { computed, markRaw, onMounted, reactive, ref, shallowRef, watch } from 'vue';
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
import BaseMiniLoginView from '@/theme/themes/default/mini/login/index.vue';
import { loginViews, pickLoginViewId } from '@/theme/views/login';
import type { LoginTranslate, LoginViewContext } from '@/theme/views/login';
import type { Component, Ref } from 'vue';

const authStore = useAuthStore();
const themeStore = useThemeStore();
const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();
const { error: showError } = useMessage();

const hasAppName = computed(() => !!route.query.appName);
const appConfig = computed(() => ({
  appName: (route.query.appName as string) || '',
  lang: (route.query.lang as string) || 'zh_cn',
  qrCodeFirst: route.query.qrCodeFirst === 'true',
  isMobile: route.query.isMobile === 'true',
  notKeepLogin: route.query.notKeepLogin === 'true',
  theme: (route.query.theme as string) || ''
}));

const showQR = ref(false);
const loginType = ref<'email' | 'pwd'>('email');
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
const keepLogin = ref(false);
const agreed = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);

watch(
  () => appConfig.value.lang,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email(t('validation.email_invalid')),
    code: z.string().min(4, t('validation.code_min'))
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, t('validation.username_min')),
    password: z.string().min(6, t('validation.password_min'))
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

const { captchaKey, showCaptcha, captchaPurpose, openCaptcha, onCaptchaSuccess } = useCaptchaFlow<'code' | 'login'>(
  purpose => {
    if (purpose === 'code') executeSendEmailCode();
    else executeLogin();
  }
);

const sendEmailCode = () => {
  if (!email.value || (errors.value as Record<string, string | undefined>).email) {
    showError(t('login.input_email_first'));
    return;
  }
  openCaptcha('code');
};

const executeSendEmailCode = () => {
  startCountdown(60);
};

const handleLogin = handleSubmit(async () => {
  if (loginType.value === 'pwd') {
    openCaptcha('login');
  } else {
    executeLogin();
  }
});

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

const qrClientId = computed(() => (route.query.client_id as string) || (route.query.appName as string) || '');

const { qrDataUrl, qrStatus, generate: generateQR, reset: resetQR } = useQrLogin(
  () => qrClientId.value,
  (res: unknown) => notifyParentLoginSuccess(res),
  () => showError(t('login.qr_expired') || '二维码已过期')
);

onMounted(() => {
  if (appConfig.value.theme === 'dark' || appConfig.value.theme === 'light') {
    themeStore.applyTheme(appConfig.value.theme === 'dark');
  }
  showQR.value = appConfig.value.qrCodeFirst;
  if (appConfig.value.notKeepLogin) keepLogin.value = false;
  if (showQR.value) generateQR(() => showError(t('login.qr_generate_failed') || '二维码生成失败'));
});

watch(showQR, val => {
  if (val) {
    generateQR(() => showError(t('login.qr_generate_failed') || '二维码生成失败'));
  } else {
    resetQR();
  }
});

/* ============================================================================
   版式（UI）加载 + 契约组装
   ========================================================================== */

const THEME_DEVICE = 'mini' as const;

const viewId = computed(() =>
  pickLoginViewId({
    url: route.query.view,
    theme: themeStore.viewFor('login'),
    pkg: themeStore.packageId,
    device: THEME_DEVICE
  })
);

watch(viewId, id => themeStore.setActivePageView('login', id), { immediate: true });

const activeView = shallowRef<Component>(BaseMiniLoginView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void loginViews.load(id, pkg, THEME_DEVICE).then(loaded => {
      if (epoch !== viewEpoch) return;
      activeView.value = loaded ? markRaw(loaded) : BaseMiniLoginView;
    });
  },
  { immediate: true }
);

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
      if (showQR.value) return t('login.qr_title');
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
    showQr: computed(() => showQR.value),
    isEmbedded: computed(() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    }),
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
        router.push({ path: '/register', query: { ...query, from: 'mini' } });
      },
      goForgot: () => {
        const query: Record<string, string> = {};
        for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
          const v = route.query[key];
          if (typeof v === 'string') query[key] = v;
        }
        void import('@/view/web/forgot-password/index.vue').catch(() => {});
        router.push({ path: '/forgot-password', query: { ...query, fromLogin: 'mini' } });
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
      toggleQr: () => {
        showQR.value = !showQR.value;
      },
      toggleTheme: () => themeStore.toggleTheme()
    }
  })
);
</script>

<template>
  <component :is="activeView" :ctx="ctx" />

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
