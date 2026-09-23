<script setup lang="ts">
/**
 * 移动端登录页（全屏平铺，白灰高级色 + slide 切换）
 *
 * 路由：/m/login（mobileRoutes，全屏直达）
 * 也作为 /login 分发器在窄屏 / 真机下的自动形态（见 view/web/login/index.vue）
 *
 * 与桌面版对齐的能力（历史上缺失 → 授权/二次验证时静默失败）：
 * - ConsentPanel：后端返回 action=consent 时展示授权确认
 * - 邮箱二次验证面板：action=needs_email_verify 时输入邮箱码继续登录
 * - AppNameMissing：缺 appName/client_id 时给明确提示，而不是提交后报错
 *
 * 移动端专项：
 * - 100dvh + 安全区留白（iPhone 地址栏 / 底部指示条）
 * - 输入框 16px 字号（iOS Safari 聚焦时不再自动放大页面）
 * - 可用纵向滚动（授权面板/二次验证变高时不会被裁掉）
 *
 * 视觉：与手机端注册页（view/app/register/index.vue）共用同一套样式体系
 * —— assets/styles/mobile-auth.scss 的 mauth-* 类，本组件**不再自带样式块**，
 * 两页的头部/字段/按钮/复选框只有一处定义，不会各自漂移。
 *
 * @author yijiu2025
 */
import { computed, ref, watch } from 'vue';
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
import AppNameMissing from '@/components/common/AppNameMissing.vue';
import ConsentPanel from '@/components/auth/ConsentPanel.vue';
import MauthThemeSwitch from '@/components/auth/MauthThemeSwitch.vue';
import MauthSocialRow from '@/components/auth/MauthSocialRow.vue';
import { useKeyboardAvoid } from '@/composables/useKeyboardAvoid';
import { useSocialLogin } from '@/composables/useSocialLogin';
import type { SocialProviderId } from '@/composables/useSocialLogin';

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

// 登录模式 + 切换动画方向（邮箱登录 / 密码登录）
const loginType = ref<'email' | 'pwd'>('email');
const transitionName = ref('mauth-slide-next');
// 密码可见性（移动端无鼠标，必须给显式开关）
const showPwd = ref(false);

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

// 切换登录模式（带 slide 动画方向 + 同步 discriminatedUnion 的 type 字段）
const switchType = (next: 'email' | 'pwd') => {
  if (next === loginType.value) return;
  transitionName.value = next === 'pwd' ? 'mauth-slide-next' : 'mauth-slide-prev';
  loginType.value = next;
};
watch(loginType, newType => {
  type.value = newType;
});

// 登录流程：consent/email_verify/max_sessions/notifyParent 统一在 useLoginFlow
const {
  showConsent, consentState, submittingConsent, denyConsent, approveConsent,
  showEmailVerify, emailVerifyState, emailVerifyCode, emailVerifyCountdown,
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
const onSocialSelect = (id: SocialProviderId) => {
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

/** 当前应展示的表单形态（授权 > 邮箱二次验证 > 登录表单） */
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
</script>

<template>
  <!-- 移动端登录（白灰高级色 + 全屏平铺 + slide 切换） -->
  <div class="mauth-page">
    <!-- 应用标识缺失：直接打开 /m/login 无 appName 时给明确提示 -->
    <div v-if="!hasAppName" class="mauth-missing">
      <AppNameMissing />
    </div>

    <template v-else>
      <!-- 顶部 Header（白灰，与 body 融为一体） -->
      <header class="mauth-header">
        <button class="mauth-back-btn" @click="goBack" :aria-label="t('login.back', '返回')">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <!-- 右上角主题切换（跟随系统 / 浅色 / 深色 三态）；被 iframe 嵌入时自动隐藏 -->
        <MauthThemeSwitch />
        <div class="mauth-header-content">
          <div class="mauth-logo">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 class="mauth-title">{{ headerTitle }}</h1>
          <p class="mauth-sub">{{ t('login.mobile_sub', '统一身份认证') }}</p>
        </div>
      </header>

      <!-- 表单主体（全屏平铺，无卡片浮层） -->
      <main class="mauth-body">
        <!-- ① 授权确认（后端返回 action=consent 时）：与桌面版同一面板组件 -->
        <template v-if="showConsent">
          <ConsentPanel
            :consent-state="consentState"
            :submitting="submittingConsent"
            :on-deny="denyConsent"
            :on-approve="approveConsent"
          />
        </template>

        <!-- ② 邮箱二次验证（登录环境变更） -->
        <template v-else-if="showEmailVerify">
          <div class="mauth-panel">
            <div class="mauth-panel-icon mauth-panel-icon-warn">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <p class="mauth-panel-text">{{ t('login.email_verify_hint', { reason: emailVerifyState?.reason || '' }) }}</p>
            <p class="mauth-panel-sub">
              {{ t('login.code_sent_to', '验证码已发送至') }} <strong>{{ emailVerifyState?.email }}</strong>
            </p>

            <div class="mauth-cell mt-4">
              <div class="mauth-field">
                <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input
                  v-model="emailVerifyCode"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  :placeholder="t('login.email_verify_code', '邮箱验证码')"
                  class="mauth-input"
                  @keyup.enter="submitEmailVerify"
                />
              </div>
            </div>

            <button
              type="button"
              class="mauth-resend"
              :disabled="emailVerifyCountdown.active.value"
              @click="sendEmailVerifyCode"
            >
              {{ emailVerifyCountdown.active.value
                ? t('login.code_countdown', { countdown: emailVerifyCountdown.remaining.value })
                : t('login.resend_code', '重新发送验证码') }}
            </button>

            <button type="button" class="mauth-submit" @click="submitEmailVerify">
              {{ t('login.verify_and_login', '验证并登录') }}
            </button>
          </div>
        </template>

        <!-- ③ 登录表单 -->
        <template v-else>
          <!-- 模式切换 Tab -->
          <div class="mauth-tabs">
            <button class="mauth-tab" :class="{ active: loginType === 'email' }" @click="switchType('email')">
              {{ t('login.email_login') }}
            </button>
            <button class="mauth-tab" :class="{ active: loginType === 'pwd' }" @click="switchType('pwd')">
              {{ t('login.password_login') }}
            </button>
          </div>

          <!-- 表单（slide 切换动画） -->
          <form @submit.prevent="handleLogin" class="mauth-form">
            <transition :name="transitionName" mode="out-in">
              <!-- 邮箱验证码登录 -->
              <div v-if="loginType === 'email'" key="email" class="mauth-step">
                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': errors.email }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    <input v-model="email" v-bind="emailProps" type="email" inputmode="email" :placeholder="t('login.email_placeholder')" autocomplete="email" class="mauth-input" />
                  </div>
                  <div class="mauth-err">{{ errors.email }}</div>
                </div>

                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': errors.code }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <input v-model="code" v-bind="codeProps" type="text" inputmode="numeric" :placeholder="t('login.code_placeholder')" autocomplete="one-time-code" class="mauth-input" />
                    <button type="button" @click="sendEmailCode" :disabled="isCountingDown" class="mauth-code-btn">
                      {{ isCountingDown ? t('login.code_countdown', { countdown }) : t('login.get_code') }}
                    </button>
                  </div>
                  <div class="mauth-err">{{ errors.code }}</div>
                </div>
              </div>

              <!-- 密码登录 -->
              <div v-else key="pwd" class="mauth-step">
                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': errors.username }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <input v-model="username" v-bind="usernameProps" type="text" :placeholder="t('login.username_placeholder')" autocomplete="username" class="mauth-input" />
                  </div>
                  <div class="mauth-err">{{ errors.username }}</div>
                </div>

                <div class="mauth-cell">
                  <div class="mauth-field" :class="{ 'is-error': errors.password }">
                    <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <input v-model="password" v-bind="passwordProps" :type="showPwd ? 'text' : 'password'" :placeholder="t('login.password_placeholder')" autocomplete="current-password" class="mauth-input" />
                    <!-- 密码可见性开关：移动端无 hover，必须显式可点 -->
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
                  <div class="mauth-err">{{ errors.password }}</div>
                </div>

                <!-- 忘记密码（与桌面版对齐） -->
                <button type="button" class="mauth-forgot" @click="goForgot">{{ t('login.forgot_password') }}</button>
              </div>
            </transition>

            <!-- 记住登录 + 已读协议（合并到一处，提交按钮上方） -->
            <div class="mauth-options">
              <label class="mauth-option">
                <input type="checkbox" v-model="keepLogin" class="hidden" />
                <span class="mauth-checkbox" :class="{ checked: keepLogin }">
                  <svg v-if="keepLogin" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span class="mauth-option-text">{{ t('login.keep_login') }}</span>
              </label>
              <label class="mauth-option">
                <input type="checkbox" v-model="agreed" class="hidden" />
                <span class="mauth-checkbox" :class="{ checked: agreed }">
                  <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <span class="mauth-option-text">
                  {{ t('register.agree_prefix') }}<span @click.stop.prevent="docType = 'service'" class="mauth-link">{{ t('register.agree_link_service') }}</span>{{ t('register.agree_and') }}<span @click.stop.prevent="docType = 'privacy'" class="mauth-link">{{ t('register.agree_link_privacy') }}</span>
                </span>
              </label>
            </div>

            <!-- 登录按钮 -->
            <button type="submit" :disabled="authStore.loading" class="mauth-submit">
              <span v-if="authStore.loading" class="mauth-spinner"></span>
              {{ authStore.loading ? t('login.logging_in') : t('login.submit') }}
            </button>
          </form>

          <!-- 第三方登录：未配置 providers 时整行不渲染任何 DOM。
               插在 CTA 之后，表单内的「保持登录 / 阅读同意」两行位置与行为都不受影响。 -->
          <MauthSocialRow
            :providers="socialProviders"
            :last-provider="socialLastProvider"
            :disabled="authStore.loading"
            @select="onSocialSelect"
          />

          <!-- 底部注册入口 -->
          <div class="mauth-footer">
            <span>{{ t('login.no_account', '还没有账号？') }}</span>
            <button class="mauth-register-btn" @click="goRegister">{{ t('login.register_now') }}</button>
          </div>
        </template>
      </main>
    </template>

    <!-- 图形验证码弹窗（send-email=true 时 verify-captcha 一次完成校验图形码 + 发邮箱码） -->
    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="captchaPurpose === 'code'" type="login" @close="showCaptcha = false" @success="onCaptchaSuccess" />

    <AgreementModals v-model:type="docType" />
    <MessageToast />
  </div>
</template>
