<script setup lang="ts">
/**
 * 桌面端紧凑「忘记密码 / 重置密码」（iframe 弹窗场景）—— **业务容器**
 *
 * 与 StandardForgot 业务 95% 相同，差异仅在 UI 与少量特有逻辑（footer 指向 /mini-login、
 * 无「标准版双栏」而用单栏卡片）。本文件只负责「重置密码这件事」，UI 在
 * `theme/themes/<包>/mini/forgot-password/index.vue`。
 *
 * @author yijiu2025
 */
import { computed, markRaw, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { authApi } from '@/api/auth';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { usePasswordStrength } from '@/composables/usePasswordStrength';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useThemeStore } from '@/stores/theme';
import BaseMiniForgotPasswordView from '@/theme/themes/default/mini/forgot-password/index.vue';
import { forgotPasswordViews, pickForgotPasswordViewId } from '@/theme/views/forgot-password';
import type {
  ForgotPasswordStage,
  ForgotPasswordTranslate,
  ForgotPasswordViewContext
} from '@/theme/views/forgot-password';
import type { Component, Ref } from 'vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { error: showError, success: showSuccess } = useMessage();

// 语言跟随父应用透传
watch(
  () => route.query.lang as string,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

/** 重置方式：与后端 PASSWORD_RESET_MODE 对应 */
const resetMode = (import.meta.env.VITE_PASSWORD_RESET_MODE || 'code') as 'code' | 'link';
const isLinkMode = resetMode === 'link';

/** 邮件链接里的 token（从邮箱点进来的那次访问才有） */
const linkToken = ref((route.query.token as string) || '');

// 步骤状态：两种模式各一套，互不影响
const codeStep = ref<'email' | 'code' | 'done'>('email');
const linkStep = ref<'verify' | 'sent' | 'reset' | 'done'>(linkToken.value ? 'reset' : 'verify');

const totalSteps = computed(() => (isLinkMode ? 4 : 3));

/** 当前步序号（1 起） */
const currentStep = computed(() => {
  if (isLinkMode) {
    return { verify: 1, sent: 2, reset: 3, done: 4 }[linkStep.value];
  }
  return { email: 1, code: 2, done: 3 }[codeStep.value];
});

/** 当前界面状态（契约字段） */
const stage = computed<ForgotPasswordStage>(() => (isLinkMode ? linkStep.value : codeStep.value));

/** 分步副标题 */
const stepSub = computed(() => {
  if (isLinkMode) {
    if (linkStep.value === 'verify') return t('forgot.mobile_sub_link_1');
    if (linkStep.value === 'sent') return t('forgot.mobile_sub_link_2');
    if (linkStep.value === 'reset') return t('forgot.mobile_sub_link_3');
    return t('forgot.mobile_sub_link_4');
  }
  if (codeStep.value === 'email') return t('forgot.mobile_sub_code_1');
  if (codeStep.value === 'code') return t('forgot.mobile_sub_code_2');
  return t('forgot.mobile_sub_code_3');
});

/** 头部大标题 */
const headerTitle = computed(() => {
  const atPasswordStep = isLinkMode ? linkStep.value === 'reset' : codeStep.value === 'code';
  const atDone = isLinkMode ? linkStep.value === 'done' : codeStep.value === 'done';
  if (atDone) return t('forgot.reset_success');
  if (atPasswordStep) return t('forgot.new_password');
  return t('forgot.title');
});

/**
 * 表单校验（zod，对齐后端 password-policy）
 */
const resetSchema = z
  .object({
    email: z
      .string({ required_error: t('validation.email_invalid') })
      .email(t('validation.email_invalid')),
    code: z.string().optional(),
    password: z
      .string({ required_error: t('register.password_min') })
      .min(8, t('register.password_min'))
      .max(128, t('register.password_max'))
      .regex(/[a-z]/, t('register.password_lowercase'))
      .regex(/[A-Z]/, t('register.password_uppercase'))
      .regex(/\d/, t('register.password_digit')),
    confirmPassword: z.string({ required_error: t('register.confirm_required') }).min(1, t('register.confirm_required'))
  })
  .refine((data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword, {
    message: t('register.password_mismatch'),
    path: ['confirmPassword']
  });

const { values, errors, defineField, validateField, setFieldError } = useForm({
  validationSchema: toTypedSchema(resetSchema)
});

const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

onMounted(() => {
  void import('@/view/web/login/index.vue').catch(() => {});
});

const pwdStrength = usePasswordStrength(() => values.password || '', key => String(t(key)));

const isSubmitting = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

const { captchaKey, showCaptcha, openCaptcha, onCaptchaSuccess, closeCaptcha } =
  useCaptchaFlow<'send' | 'resend'>(purpose => {
    if (isLinkMode) {
      executeSendLink();
      return;
    }
    codeStep.value = 'code';
    startCountdown(60);
    if (purpose === 'send') showSuccess(t('forgot.code_sent'));
  });

/** 第 1 步：先过图形码，再发码 / 发链接 */
const requestEmailAction = async (purpose: 'send' | 'resend' = 'send') => {
  const { valid } = await validateField('email');
  if (!valid) return;
  openCaptcha(purpose);
};

/** 图形码通过后发送重置链接（link 模式） */
const executeSendLink = async () => {
  try {
    await authApi.sendResetLink(values.email as string, captchaKey.value);
    showSuccess(t('forgot.link_sent'));
    linkStep.value = 'sent';
    startCountdown(60);
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('forgot.send_failed'));
  }
};

/** 提交新密码 */
const submitReset = async () => {
  if (isSubmitting.value) return;
  if (!isLinkMode && !String(values.code || '').trim()) {
    setFieldError('code', t('forgot.code_required'));
    return;
  }

  const checked = [await validateField('password'), await validateField('confirmPassword')];
  if (!checked.every(r => r.valid)) return;

  if (values.password !== values.confirmPassword) {
    setFieldError('confirmPassword', t('register.password_mismatch'));
    return;
  }

  isSubmitting.value = true;
  try {
    const encryptedPassword = await rsaEncrypt(values.password as string);
    if (isLinkMode) {
      await authApi.resetPasswordByLink(linkToken.value, encryptedPassword, getCachedKid());
      linkStep.value = 'done';
    } else {
      await authApi.resetPassword(
        values.email as string,
        values.code as string,
        encryptedPassword,
        captchaKey.value,
        getCachedKid()
      );
      codeStep.value = 'done';
    }
    showSuccess(t('forgot.reset_success'));
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('forgot.reset_failed'));
  } finally {
    isSubmitting.value = false;
  }
};

/** 去登录页（mini 场景指向 /mini-login） */
const goLogin = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  void import('@/view/web/login/index.vue').catch(() => {});
  router.push({ path: '/mini-login', query });
};

/** 返回：逐级回退，第一步再后退则回登录页 */
const goBack = () => {
  if (isLinkMode) {
    if (linkToken.value || linkStep.value === 'verify') {
      goLogin();
      return;
    }
    linkStep.value = linkStep.value === 'sent' ? 'verify' : 'sent';
    return;
  }
  if (codeStep.value === 'email') {
    goLogin();
    return;
  }
  codeStep.value = codeStep.value === 'code' ? 'email' : 'code';
};

/* ============================================================================
   版式（UI）加载 + 契约组装
   ========================================================================== */

const themeStore = useThemeStore();

/** 本容器的设备身份：mini */
const THEME_DEVICE = 'mini' as const;

const viewId = computed(() =>
  pickForgotPasswordViewId({
    url: route.query.view,
    theme: themeStore.viewFor('forgot-password'),
    pkg: themeStore.packageId,
    device: THEME_DEVICE
  })
);

watch(viewId, id => themeStore.setActivePageView('forgot-password', id), { immediate: true });

const activeView = shallowRef<Component>(BaseMiniForgotPasswordView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void forgotPasswordViews.load(id, pkg, THEME_DEVICE).then(loaded => {
      if (epoch !== viewEpoch) return;
      activeView.value = loaded ? markRaw(loaded) : BaseMiniForgotPasswordView;
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

function assertForgotPasswordContract(ctx: ForgotPasswordViewContext): ForgotPasswordViewContext {
  return ctx;
}

const translate: ForgotPasswordTranslate = (key, params) => {
  if (params === undefined) return t(key);
  return typeof params === 'string' ? t(key, params) : t(key, params as never);
};

const ctx = assertForgotPasswordContract(
  reactive({
    t: translate,

    mode: resetMode,
    stage,
    step: currentStep,
    totalSteps,
    progress: computed(() => (currentStep.value / totalSteps.value) * 100),
    title: headerTitle,
    subtitle: stepSub,

    fields: {
      email: bindField(email, emailProps, computed(() => !!errors.value.email), computed(() => errors.value.email)),
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

    strength: computed(() => ({
      level: pwdStrength.value.level,
      score: pwdStrength.value.score,
      label: pwdStrength.value.label
    })),

    submitting: computed(() => isSubmitting.value),
    countingDown: computed(() => isCountingDown.value),
    countdown: computed(() => countdown.value),

    actions: {
      submitEmail: () => {
        void requestEmailAction('send');
      },
      resendEmail: () => {
        void requestEmailAction('resend');
      },
      submit: () => {
        void submitReset();
      },
      goLogin,
      back: goBack
    }
  })
);
</script>

<template>
  <!-- 业务容器只做两件事：把 ctx 交给当前版式；渲染与版式无关的业务浮层 -->
  <component :is="activeView" :ctx="ctx" />

  <!-- 图形验证码 -->
  <GraphicCaptcha
    :is-open="showCaptcha"
    :email="values.email"
    :send-email="!isLinkMode"
    type="reset_password"
    :title="t('forgot.captcha_title', '安全验证')"
    @close="closeCaptcha"
    @success="onCaptchaSuccess"
  />
  <MessageToast />
</template>
