<script setup lang="ts">
/**
 * 桌面端标准「忘记密码 / 重置密码」—— **业务容器**
 *
 * === 分层（2026-09-25 起，与移动端 `app/forgot-password/index.vue` 对齐）===
 * 本文件只负责「重置密码这件事」：校验、发码 / 发链接、RSA 加密提交、步骤流转、路由。
 * **页面长什么样不在这里**，而在**当前主题包**里的版式组件里：
 *
 *    本容器 ──传 ctx──▶ theme/themes/<包>/standard/forgot-password/index.vue
 *                 ▲
 *                 └── 契约定在 theme/views/forgot-password.ts（各包共用这一份，版式只读它）
 *
 * 于是「换一套 UI」= 在包里加一个版式目录，本文件零改动。
 * **内置包**（`default`）的 base 由本文件**静态引入**：正常访问不产生额外请求，首帧即正确；
 * 其它包 / 其它版式都是惰性 chunk，由路由守卫提前预热。
 *
 * 与 MiniForgot（紧凑版）的区别：两者是 dispatcher 的**两种设备形态分支**，
 * 业务逻辑 95% 相同，但 UI 差异大（标准版是左右双栏卡片，紧凑版是单栏卡片）。
 * 二者各自成为独立容器，各自加载自己的版式。
 *
 * === 两种重置方式（由 VITE_PASSWORD_RESET_MODE 决定，与后端 PASSWORD_RESET_MODE 对应）===
 *   - code（3 步）：填邮箱 → 图形码 + 邮箱码 → 验证码 + 新密码 → 完成
 *   - link（4 步）：填邮箱 → 发送重置链接 → 邮箱点链接带 token 回来 → 设置新密码 → 完成
 *
 * === 与移动端的差异（刻意为之）===
 *   - 不校验 appName/client_id：重置密码是本服务自己的账号操作，与 OAuth 应用上下文无关。
 *   - 密码复杂度按**后端策略**校验（8 位 + 大小写 + 数字，见 framework/auth/password-policy.js）。
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
import BaseForgotPasswordView from '@/theme/themes/default/standard/forgot-password/index.vue';
import { forgotPasswordViews, pickForgotPasswordViewId } from '@/theme/views/forgot-password';
import { readDeviceParam } from '@/theme/views/params';
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

// 语言跟随父应用透传（与桌面端登录/注册页同一口径）
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

/** 当前步序号（1 起）：驱动进度条与副标题 */
const currentStep = computed(() => {
  if (isLinkMode) {
    return { verify: 1, sent: 2, reset: 3, done: 4 }[linkStep.value];
  }
  return { email: 1, code: 2, done: 3 }[codeStep.value];
});

/** 当前界面状态（契约字段） */
const stage = computed<ForgotPasswordStage>(() => (isLinkMode ? linkStep.value : codeStep.value));

/** 分步副标题（显式映射，避免动态拼 key 漏键时把 key 名显示给用户） */
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

/** 头部大标题：进入设置新密码步骤后改成动作性文案 */
const headerTitle = computed(() => {
  const atPasswordStep = isLinkMode ? linkStep.value === 'reset' : codeStep.value === 'code';
  const atDone = isLinkMode ? linkStep.value === 'done' : codeStep.value === 'done';
  if (atDone) return t('forgot.reset_success');
  if (atPasswordStep) return t('forgot.new_password');
  return t('forgot.title');
});

/**
 * 表单校验（zod，与注册页同一套规则，对齐后端 password-policy）
 *
 * code 是可选字段：link 模式全流程都不需要邮箱码，schema 里留成 optional。
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

// v2.20.1：忘记密码页挂载后预热 login dispatcher chunk，避免「回到登录」切换闪屏
onMounted(() => {
  void import('@/view/web/login/index.vue').catch(() => {});
});

// 密码强度（与注册页同一 composable，颜色/文案走 i18n）
const pwdStrength = usePasswordStrength(() => values.password || '', key => String(t(key)));

const isSubmitting = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

// 图形验证码流程：两种模式共用
const { captchaKey, showCaptcha, openCaptcha, onCaptchaSuccess, closeCaptcha } =
  useCaptchaFlow<'send' | 'resend'>(purpose => {
    if (isLinkMode) {
      executeSendLink();
      return;
    }
    // code 模式：verify-captcha 已带 email + type，邮箱码已发出
    codeStep.value = 'code';
    startCountdown(60);
    if (purpose === 'send') showSuccess(t('forgot.code_sent'));
  });

/** 第 1 步（两种模式通用）：先过图形码，再发码 / 发链接 */
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

/** 提交新密码：两种模式各调不同端点 */
const submitReset = async () => {
  if (isSubmitting.value) return;
  /* 三处校验必须在这里补齐，不能只靠 schema：
     ① code 模式下空验证码必须挡在发请求之前（schema 里 code 是 optional）。
     ② 「两次密码一致」是 schema 的 object 级 refine，validateField 只跑字段级规则，
        refine 不参与 —— 必须显式比对 + setFieldError。 */
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

/** 去登录页（透传 OAuth 上下文；token 不外传） */
const goLogin = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  void import('@/view/web/login/index.vue').catch(() => {});
  router.push({ path: '/login', query });
};

/** 返回：逐级回退，第一步再后退则回登录页 */
const goBack = () => {
  if (isLinkMode) {
    // 带 token 进来时没有可回退的上一步（上一步在邮件里），直接回登录
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

/**
 * 本容器的**设备身份**：文件位置即身份（`view/web/` 下都是电脑端，标准形态）。
 */
const THEME_DEVICE = 'standard' as const;

/**
 * 用哪套版式：`?view=` > 主题包声明 > VITE_FORGOT_PASSWORD_VIEW > 当前包名。
 */
const viewId = computed(() =>
  pickForgotPasswordViewId({
    url: readDeviceParam(route.query, 'view', THEME_DEVICE),
    theme: themeStore.viewFor('forgot-password'),
    pkg: themeStore.packageId,
    device: THEME_DEVICE
  })
);

watch(viewId, id => themeStore.setActivePageView('forgot-password', id), { immediate: true });

const activeView = shallowRef<Component>(BaseForgotPasswordView);
let viewEpoch = 0;
watch(
  [viewId, () => themeStore.packageId],
  ([id, pkg]) => {
    const epoch = ++viewEpoch;
    void forgotPasswordViews.load(id, pkg, THEME_DEVICE).then(loaded => {
      if (epoch !== viewEpoch) return;
      activeView.value = loaded ? markRaw(loaded) : BaseForgotPasswordView;
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

/** 编译期契约自检 */
function assertForgotPasswordContract(ctx: ForgotPasswordViewContext): ForgotPasswordViewContext {
  return ctx;
}

/** 翻译函数：只把「key + （命名参数 | 兜底文案）」这一子集交给版式 */
const translate: ForgotPasswordTranslate = (key, params) => {
  if (params === undefined) return t(key);
  return typeof params === 'string' ? t(key, params) : t(key, params as never);
};

/** 交给版式的上下文（reactive + 嵌套 ref） */
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

    // 只把版式要画的三项交出去（`color` 留在容器侧：颜色属于呈现，走 is-<level> 类）
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

  <!-- 图形验证码：code 模式通过后由 verify-captcha 顺带发邮箱码；link 模式通过后才发重置链接 -->
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
