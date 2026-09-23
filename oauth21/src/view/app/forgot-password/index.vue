<script setup lang="ts">
/**
 * 移动端重置密码（/m/forgot-password）
 *
 * 路由：mobileRoutes 全屏直达；同时是 /forgot-password 在窄屏 / 真机下的自动形态
 * （分发逻辑见 view/web/forgot-password/index.vue）。
 * 邮件里的重置链接指向 `/reset-password?token=…`，该路径重定向到这里（见 router/routes.ts）。
 *
 * 视觉：与手机端登录页（view/app/login/index.vue）、注册页（view/app/register/index.vue）
 * 共用同一套样式体系 —— assets/styles/mobile-auth.scss 的 mauth-* 类。本组件**不自带样式块**，
 * 三页的头部/字段/按钮/进度条只有一处定义。
 *
 * 两种重置方式（由 VITE_PASSWORD_RESET_MODE 决定，与后端 PASSWORD_RESET_MODE 对应，
 * 与桌面版读同一个环境变量）：
 *   - code（3 步）：填邮箱 → 图形码 + 邮箱码 → 验证码 + 新密码 → 完成
 *   - link（4 步）：填邮箱 → 发送重置链接 → 邮箱点链接带 token 回来 → 设置新密码 → 完成
 *
 * 与桌面版的差异（刻意为之）：
 *   - 不校验 appName/client_id：重置密码是本服务自己的账号操作，与 OAuth 应用上下文无关，
 *     邮件链接里也不会有 appName —— 加这道校验会让链接模式在真机上直接不可用。
 *   - 密码复杂度按**后端策略**校验（8 位 + 大小写 + 数字，见 framework/auth/password-policy.js），
 *     桌面版只校验了「≥6 位」—— 过松的前端校验会让用户提交后才被后端拒绝，这里不复制该行为。
 *
 * @author yijiu2025
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { authApi } from '@/api/auth';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import MauthThemeSwitch from '@/components/auth/MauthThemeSwitch.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';
import { usePasswordStrength } from '@/composables/usePasswordStrength';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { error: showError, success: showSuccess } = useMessage();

// 键盘弹出时把聚焦的输入框滚进可视区（iOS 键盘只覆盖视口、不缩视口高度）
useKeyboardAvoid();

// 语言跟随父应用透传（与手机端登录/注册页同一口径）
watch(
  () => route.query.lang as string,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

/** 重置方式：与后端 PASSWORD_RESET_MODE 对应，与桌面版同一环境变量 */
const resetMode = (import.meta.env.VITE_PASSWORD_RESET_MODE || 'code') as 'code' | 'link';
const isLinkMode = resetMode === 'link';

/** 邮件链接里的 token（从邮箱点进来的那次访问才有） */
const linkToken = ref((route.query.token as string) || '');

// 步骤状态：两种模式各一套，互不影响（切换模式时另一个不会被读到）
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

/**
 * 分步副标题
 *
 * 显式映射而非拼接 key：漏键时渲染出的是 key 名本身，用户会看到「forgot.mobile_sub_2」。
 */
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

/** 头部大标题：进入设置新密码步骤后改成动作性文案，避免仍是「重置密码」显得没进展 */
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
 * code 是可选字段：link 模式全流程都不需要邮箱码，schema 里留成 optional，
 * 各步骤用 validateField 按需校验，不会因为某个字段没填就卡住另一条流程。
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

// 密码强度（与注册页同一 composable，颜色/文案走 i18n）
const strength = usePasswordStrength(() => values.password || '', key => String(t(key)));

// 密码可见性（移动端无 hover，必须给显式开关）
const showPwd = ref(false);
const showConfirmPwd = ref(false);

const isSubmitting = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

// 图形验证码流程：两种模式共用（code 模式通过后发邮箱码，link 模式通过后发重置链接）
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

     ① 邮箱码在 link 模式用不到，schema 里是 optional —— 单字段校验自然放行空值。
        code 模式下空验证码必须挡在发请求之前，否则用户白等一次后端拒绝。
     ② 「两次密码一致」是 schema 的 **object 级 refine**，而 validateField 只跑字段级规则，
        refine 不参与 —— 不补这一句，两次不一致会静默按第一次输入提交，
        confirmPassword 成了纯装饰（实测复现：确认框填不同值仍走到发请求）。
     用 setFieldError 而非 toast：移动端要让错误定位到出问题的那个输入框。 */
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

/** 去登录页（透传 OAuth 上下文，登录后才能回到授权页；token 不外传） */
const goLogin = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  router.push({ path: '/m/login', query });
};

/** 返回：逐级回退，第一步再后退回登录页（安卓返回键风格，与注册页一致） */
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
</script>

<template>
  <!-- 移动端全屏重置密码（与手机端登录/注册页共用 mauth-* 样式体系） -->
  <div class="mauth-page">
    <!-- 顶部 Header：返回 + 主题切换 + 标题 + 步骤副标题 + 进度条 -->
    <header class="mauth-header">
      <button class="mauth-back-btn" :aria-label="t('forgot.back_to_login')" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <!-- 右上角主题切换（跟随系统 / 浅色 / 深色 三态）；被 iframe 嵌入时自动隐藏 -->
      <MauthThemeSwitch />
      <div class="mauth-header-content">
        <div class="mauth-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h1 class="mauth-title">{{ headerTitle }}</h1>
        <p class="mauth-sub">{{ stepSub }}</p>
      </div>
      <!-- 步骤进度条 -->
      <div class="mauth-progress">
        <div class="mauth-progress-bar" :style="{ width: `${(currentStep / totalSteps) * 100}%` }"></div>
      </div>
    </header>

    <main class="mauth-body">
      <!-- ===== 方式一：验证码重置（3 步） ===== -->
      <template v-if="!isLinkMode">
        <!-- 步骤 1：输入邮箱 -->
        <section v-if="codeStep === 'email'" class="mauth-step">
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.email }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input
                v-model="email"
                v-bind="emailProps"
                type="email"
                inputmode="email"
                autocomplete="email"
                :placeholder="t('login.email_placeholder')"
                class="mauth-input"
                @keyup.enter="requestEmailAction('send')"
              />
            </div>
            <div class="mauth-err">{{ errors.email }}</div>
          </div>

          <button type="button" class="mauth-submit" @click="requestEmailAction('send')">
            {{ t('forgot.send_code') }}
          </button>
        </section>

        <!-- 步骤 2：邮箱验证码 + 新密码 -->
        <section v-else-if="codeStep === 'code'" class="mauth-step">
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.code }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="code"
                v-bind="codeProps"
                type="text"
                inputmode="numeric"
                maxlength="6"
                autocomplete="one-time-code"
                :placeholder="t('login.code_placeholder')"
                class="mauth-input"
              />
              <button type="button" :disabled="isCountingDown" class="mauth-code-btn" @click="requestEmailAction('resend')">
                {{ isCountingDown ? t('login.code_countdown', { countdown }) : t('forgot.resend') }}
              </button>
            </div>
            <div class="mauth-err">{{ errors.code }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.password }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="password"
                v-bind="passwordProps"
                :type="showPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('forgot.new_password_rule')"
                class="mauth-input"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showPwd ? t('login.hide_password', '隐藏密码') : t('login.show_password', '显示密码')"
                @click="showPwd = !showPwd"
              >
                <svg v-if="showPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <!-- 密码强度：4 段条 + 文字（移动端无 hover，不做桌面版那种悬浮规则窗） -->
            <div v-if="password" class="mauth-strength">
              <div class="mauth-strength-bars">
                <span
                  v-for="i in 4"
                  :key="i"
                  class="mauth-strength-bar"
                  :class="i <= strength.score ? `is-${strength.level}` : ''"
                ></span>
              </div>
              <p class="mauth-strength-text" :class="`is-${strength.level}`">
                {{ t('register.password_strength_label', { level: strength.label }) }}
              </p>
            </div>
            <div class="mauth-err">{{ errors.password }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.confirmPassword }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <input
                v-model="confirmPassword"
                v-bind="confirmPasswordProps"
                :type="showConfirmPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('forgot.confirm_password')"
                class="mauth-input"
                @keyup.enter="submitReset"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showConfirmPwd ? t('login.hide_password', '隐藏密码') : t('login.show_password', '显示密码')"
                @click="showConfirmPwd = !showConfirmPwd"
              >
                <svg v-if="showConfirmPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div class="mauth-err">{{ errors.confirmPassword }}</div>
          </div>

          <button type="button" class="mauth-submit" :disabled="isSubmitting" @click="submitReset">
            <span v-if="isSubmitting" class="mauth-spinner"></span>
            {{ t('forgot.reset_password') }}
          </button>
        </section>

        <!-- 步骤 3：完成 -->
        <section v-else class="mauth-step">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-ok">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <p class="mauth-panel-text">{{ t('forgot.success_desc') }}</p>
          </div>
          <button type="button" class="mauth-submit" @click="goLogin">{{ t('forgot.back_to_login') }}</button>
        </section>
      </template>

      <!-- ===== 方式二：邮件链接重置（4 步） ===== -->
      <template v-else>
        <!-- 步骤 1：验证身份（输入邮箱） -->
        <section v-if="linkStep === 'verify'" class="mauth-step">
          <p class="mauth-panel-text mauth-step-desc">{{ t('forgot.link_desc') }}</p>
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.email }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input
                v-model="email"
                v-bind="emailProps"
                type="email"
                inputmode="email"
                autocomplete="email"
                :placeholder="t('login.email_placeholder')"
                class="mauth-input"
                @keyup.enter="requestEmailAction('send')"
              />
            </div>
            <div class="mauth-err">{{ errors.email }}</div>
          </div>

          <button type="button" class="mauth-submit" @click="requestEmailAction('send')">
            {{ t('forgot.send_link') }}
          </button>
        </section>

        <!-- 步骤 2：已发送 -->
        <section v-else-if="linkStep === 'sent'" class="mauth-step">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-info">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <p class="mauth-panel-text">{{ t('forgot.link_sent_to') }}</p>
            <p class="mauth-panel-sub"><strong>{{ values.email }}</strong></p>
            <p class="mauth-panel-sub">{{ t('forgot.link_hint') }}</p>
          </div>

          <button type="button" class="mauth-resend" :disabled="isCountingDown" @click="requestEmailAction('resend')">
            {{ isCountingDown ? `${t('forgot.resend')} (${countdown}s)` : t('forgot.resend') }}
          </button>
          <button type="button" class="mauth-submit" @click="goLogin">{{ t('forgot.back_to_login') }}</button>
        </section>

        <!-- 步骤 3：设置新密码（从邮件链接带 token 进入） -->
        <section v-else-if="linkStep === 'reset'" class="mauth-step">
          <p class="mauth-panel-text mauth-step-desc">{{ t('forgot.reset_desc') }}</p>
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.password }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="password"
                v-bind="passwordProps"
                :type="showPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('forgot.new_password_rule')"
                class="mauth-input"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showPwd ? t('login.hide_password', '隐藏密码') : t('login.show_password', '显示密码')"
                @click="showPwd = !showPwd"
              >
                <svg v-if="showPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div v-if="password" class="mauth-strength">
              <div class="mauth-strength-bars">
                <span
                  v-for="i in 4"
                  :key="i"
                  class="mauth-strength-bar"
                  :class="i <= strength.score ? `is-${strength.level}` : ''"
                ></span>
              </div>
              <p class="mauth-strength-text" :class="`is-${strength.level}`">
                {{ t('register.password_strength_label', { level: strength.label }) }}
              </p>
            </div>
            <div class="mauth-err">{{ errors.password }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.confirmPassword }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <input
                v-model="confirmPassword"
                v-bind="confirmPasswordProps"
                :type="showConfirmPwd ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('forgot.confirm_password')"
                class="mauth-input"
                @keyup.enter="submitReset"
              />
              <button
                type="button"
                class="mauth-pwd-toggle"
                :aria-label="showConfirmPwd ? t('login.hide_password', '隐藏密码') : t('login.show_password', '显示密码')"
                @click="showConfirmPwd = !showConfirmPwd"
              >
                <svg v-if="showConfirmPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div class="mauth-err">{{ errors.confirmPassword }}</div>
          </div>

          <button type="button" class="mauth-submit" :disabled="isSubmitting" @click="submitReset">
            <span v-if="isSubmitting" class="mauth-spinner"></span>
            {{ t('forgot.reset_password') }}
          </button>
        </section>

        <!-- 步骤 4：完成 -->
        <section v-else class="mauth-step">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-ok">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <p class="mauth-panel-text">{{ t('forgot.success_desc') }}</p>
          </div>
          <button type="button" class="mauth-submit" @click="goLogin">{{ t('forgot.back_to_login') }}</button>
        </section>
      </template>

      <!-- 底部返回登录入口（与手机端登录/注册页同款 footer） -->
      <div v-if="currentStep < totalSteps" class="mauth-footer">
        <span>{{ t('forgot.remembered') }}</span>
        <button class="mauth-register-btn" @click="goLogin">{{ t('forgot.back_to_login') }}</button>
      </div>
    </main>

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
  </div>
</template>
