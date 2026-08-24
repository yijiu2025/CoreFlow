<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useForm } from 'vee-validate';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { authApi } from '@/api/auth';
import { postToParent } from '@/utils/parent';
import QRCode from 'qrcode';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import Icons from '@/components/common/Icons.vue';
import { useMessage } from '@/composables/useMessage';

const authStore = useAuthStore();
const themeStore = useThemeStore();
const route = useRoute();
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
  initialValues: { type: 'email', email: '', code: '', username: '', password: '' } as any
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
const captchaKey = ref('');
const showCaptcha = ref(false);
const captchaPurpose = ref<'code' | 'login'>('login');
const isCountingDown = ref(false);
const countdown = ref(60);

const onCaptchaSuccess = (data: { captchaKey: string }) => {
  showCaptcha.value = false;
  captchaKey.value = data.captchaKey;

  if (captchaPurpose.value === 'code') {
    executeSendEmailCode();
  } else {
    executeLogin();
  }
};

const sendEmailCode = () => {
  if (!email.value || (errors.value as any).email) {
    showError(t('login.input_email_first') || '请先输入有效的邮箱地址');
    return;
  }
  captchaPurpose.value = 'code';
  showCaptcha.value = true;
};

const executeSendEmailCode = () => {
  isCountingDown.value = true;
  countdown.value = 60;
  const timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer);
      isCountingDown.value = false;
    }
  }, 1000);
};

// 5. 登录提交 & OAuth 同意逻辑
const showConsent = ref(false);
const consentState = ref<any>(null);
const submittingConsent = ref(false);

// 邮箱二次验证（密码登录环境异常时触发）
const showEmailVerify = ref(false);
const emailVerifyState = ref<{ verifyToken: string; email: string; reason: string } | null>(null);
const emailVerifyCode = ref('');
const emailVerifyCountdown = ref(0);
let emailVerifyTimer: ReturnType<typeof setInterval> | null = null;

const startEmailVerifyCountdown = () => {
  emailVerifyCountdown.value = 60;
  if (emailVerifyTimer) clearInterval(emailVerifyTimer);
  emailVerifyTimer = setInterval(() => {
    emailVerifyCountdown.value--;
    if (emailVerifyCountdown.value <= 0) {
      clearInterval(emailVerifyTimer!);
      emailVerifyTimer = null;
    }
  }, 1000);
};

const sendEmailVerifyCode = async () => {
  if (!emailVerifyState.value?.email || emailVerifyCountdown.value > 0) return;
  try {
    await authApi.sendEmailCode(emailVerifyState.value.email);
    startEmailVerifyCountdown();
    showError('验证码已发送至邮箱');
  } catch (err: any) {
    showError(err.message || '验证码发送失败');
  }
};

const submitEmailVerify = async () => {
  if (!emailVerifyState.value || emailVerifyCode.value.length < 4) {
    showError('请输入4位验证码');
    return;
  }
  try {
    const res: any = await authApi.verifyEmailLogin(
      emailVerifyState.value.verifyToken,
      emailVerifyCode.value
    );
    showEmailVerify.value = false;
    emailVerifyState.value = null;
    emailVerifyCode.value = '';
    if (emailVerifyTimer) clearInterval(emailVerifyTimer);
    notifyParentLoginSuccess(res);
  } catch (err: any) {
    showError(err.message || '验证码错误');
  }
};

const handleLogin = handleSubmit(async () => {
  if (!agreed.value) {
    showError('请先阅读并勾选同意相关协议');
    return;
  }
  if (loginType.value === 'pwd') {
    captchaPurpose.value = 'login';
    showCaptcha.value = true;
  } else {
    executeLogin();
  }
});

function notifyParentLoginSuccess(res: any) {
  if (!(window.parent && window.parent !== window)) return;
  const token = res.access_token || res.data?.accessToken;
  const sessionToken = res.session_token || res.data?.session_token;
  const user = res.user || res.data?.user || {};
  postToParent({
    type: 'LOGIN_SUCCESS',
    token,
    sessionToken,
    user: { id: user.id, username: user.username, name: user.name, email: user.email, avatar: user.avatar },
    data: res
  });
}

const executeLogin = async () => {
  try {
    const loginPayload = {
      ...values,
      keepLogin: keepLogin.value,
      captchaKey: captchaKey.value,
      client_id: route.query.client_id || route.query.appName,
      scope: (route.query.scope as string) || 'openid profile email'
    };
    const res = await authStore.login(loginPayload as any);
    if (res && res.action === 'consent') {
      consentState.value = res;
      showConsent.value = true;
    } else if (res && res.action === 'needs_email_verify') {
      emailVerifyState.value = {
        verifyToken: res.verifyToken,
        email: res.email,
        reason: res.reason || '登录环境变更'
      };
      emailVerifyCode.value = '';
      showEmailVerify.value = true;
      sendEmailVerifyCode();
    } else if (res && res.action === 'max_sessions') {
      if (window.parent && window.parent !== window) {
        postToParent({
          type: 'MAX_SESSIONS',
          sessions: res.sessions,
          maxSessions: res.maxSessions
        });
      }
    } else {
      notifyParentLoginSuccess(res);
    }
  } catch (err: any) {
    showError(err.message || t('login.login_failed') || '登录失败');
  }
};

const denyConsent = () => {
  showConsent.value = false;
  consentState.value = null;
  if (window.parent && window.parent !== window) {
    postToParent({ type: 'SSO_DENIED', error: 'user_denied', description: t('login.consent_denied') });
  }
};

const approveConsent = async () => {
  if (!consentState.value) return;
  submittingConsent.value = true;
  try {
    const res: any = await authApi.confirmConsent(consentState.value.consentKey);
    showConsent.value = false;
    consentState.value = null;
    notifyParentLoginSuccess(res);
  } catch (err: any) {
    showError(err.message || t('login.consent_failed') || '授权确认失败');
  } finally {
    submittingConsent.value = false;
  }
};

// 6. 二维码生成与轮询
const qrKey = ref('');
const qrDataUrl = ref('');
const qrStatus = ref<'pending' | 'scanned' | 'confirmed' | 'expired'>('pending');
let qrPollTimer: ReturnType<typeof setInterval> | null = null;

const qrClientId = computed(() => (route.query.client_id as string) || (route.query.appName as string) || '');
const qrScope = computed(() => (route.query.scope as string) || 'openid profile email');

async function generateQR() {
  try {
    const res: any = await authApi.generateQR({
      client_id: qrClientId.value,
      scope: qrScope.value
    });
    qrKey.value = res.qrKey;
    qrStatus.value = 'pending';
    qrDataUrl.value = await QRCode.toDataURL(res.qrContent || res.qrKey, { width: 220, margin: 1 });
    startQRPolling();
  } catch {
    showError(t('login.qr_generate_failed') || '二维码生成失败');
  }
}

function startQRPolling() {
  if (qrPollTimer) clearInterval(qrPollTimer);
  qrPollTimer = setInterval(async () => {
    if (!qrKey.value) return;
    try {
      const res: any = await authApi.checkQRStatus(qrKey.value);
      if (res?.access_token || res?.session_token || res?.status === 'CONFIRMED') {
        qrStatus.value = 'confirmed';
        clearInterval(qrPollTimer!);
        qrPollTimer = null;
        notifyParentLoginSuccess(res);
      } else if (res?.status === 'EXPIRED' || res?.status === 'ERROR') {
        qrStatus.value = 'expired';
        clearInterval(qrPollTimer!);
        qrPollTimer = null;
        showError(t('login.qr_expired') || '二维码已过期');
      } else {
        qrStatus.value = (res?.status || 'PENDING').toLowerCase() as any;
      }
    } catch {}
  }, 2000);
}

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
  if (window.parent && window.parent !== window) {
    postToParent({ type: 'SSO_READY' });
  }
});

onUnmounted(() => {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
});
</script>

<template>
  <div class="standard-login-root">
    <!-- 错误场景：应用标识缺失 -->
    <div v-if="!hasAppName" class="flex flex-col items-center justify-center text-center p-8 mt-20">
      <div class="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-[24px] flex items-center justify-center mb-6 shadow-sm">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">应用标识缺失</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">缺少 appName 参数，无法提供登录授权服务。</p>
    </div>

    <!-- 主登录容器 -->
    <div v-else class="relative group">
    <!-- 背景流光动画装饰 -->
    <div class="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>

    <div class="relative w-[856px] min-h-[480px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[32px] overflow-hidden flex shadow-2xl border border-white/40 dark:border-slate-800">
      
      <!-- 左侧面板：登录/授权表达面板 -->
      <div class="flex-1 p-10 flex flex-col justify-between relative">
        
        <!-- OAuth 授权确认视图 -->
        <template v-if="showConsent">
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-600 font-bold text-xl">
                {{ (consentState?.client_name || 'A')[0].toUpperCase() }}
              </div>
              <div>
                <h2 class="text-xl font-bold dark:text-white leading-tight">
                  {{ t('login.consent_title') || '应用授权确认' }}
                </h2>
                <p class="text-xs text-slate-400 mt-1">
                  {{ t('login.consent_desc', { app: consentState?.client_name || t('login.third_party') }) }}
                </p>
              </div>
            </div>

            <div class="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {{ t('login.requesting_permissions') || '该应用将获取以下权限：' }}
              </p>
              <ul class="space-y-2.5">
                <li
                  v-for="s in (consentState?.scopeDetails || [])"
                  :key="s.id"
                  class="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"
                >
                  <Icons name="check" :size="16" class="text-green-500 shrink-0 mt-0.5" />
                  <span>
                    <strong class="font-semibold">{{ s.name }}</strong>
                    <span class="text-slate-400 dark:text-slate-500">— {{ s.desc }}</span>
                    <span v-if="s.required" class="ml-1 text-[10px] text-slate-400">（必需）</span>
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div class="flex gap-4 mt-8">
            <button
              type="button"
              @click="denyConsent"
              class="flex-1 h-12 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              {{ t('login.deny') || '拒绝' }}
            </button>
            <button
              type="button"
              @click="approveConsent"
              :disabled="submittingConsent"
              class="flex-1 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all"
            >
              <span v-if="submittingConsent" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ t('login.approve') || '同意并授权' }}
            </button>
          </div>
        </template>

        <!-- 邮箱二次验证（密码登录环境异常） -->
        <template v-else-if="showEmailVerify">
          <div class="flex flex-col items-center justify-center py-8 space-y-5">
            <div class="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#f59e0b" stroke-width="2">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <div class="text-center space-y-1">
              <h3 class="text-lg font-bold dark:text-white">环境变更验证</h3>
              <p class="text-xs text-slate-400">检测到{{ emailVerifyState?.reason }}，为保护账号安全，请验证邮箱</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">验证码已发送至 <strong>{{ emailVerifyState?.email }}</strong></p>
            </div>

            <div class="w-full std-field" :class="{ 'is-error': false }">
              <Icons name="mail" :size="18" class="std-icon" />
              <input
                v-model="emailVerifyCode"
                type="text"
                maxlength="6"
                placeholder="邮箱验证码"
                class="std-input"
                @keyup.enter="submitEmailVerify"
              />
            </div>

            <div class="w-full flex items-center justify-between text-xs">
              <button type="button" @click="sendEmailVerifyCode" :disabled="emailVerifyCountdown > 0"
                class="text-primary disabled:text-slate-400 disabled:cursor-not-allowed font-medium">
                {{ emailVerifyCountdown > 0 ? `${emailVerifyCountdown}s 后重发` : '重新发送验证码' }}
              </button>
            </div>

            <button type="button" @click="submitEmailVerify" class="auth-btn w-full">
              验证并登录
            </button>
          </div>
        </template>

        <!-- 标准登录表单视图 -->
        <template v-else>
          <div>
            <!-- 品牌 Header（优化对齐与比例） -->
            <div class="flex items-center gap-3.5 mb-6">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1 7-2 2.5 1 5 2 7 2a1 1 0 0 1 1 1z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div class="flex flex-col justify-center">
                <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                  {{ t('login.welcome') || '欢迎登录' }}
                </h2>
                <p class="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-none">Enterprise Identity System</p>
              </div>
            </div>

            <!-- Tab 切换 -->
            <div class="relative flex p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl mb-6">
              <button
                type="button"
                @click="loginType = 'email'"
                :class="loginType === 'email' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700'"
                class="flex-1 py-2 text-xs rounded-lg transition-all"
              >
                {{ t('login.email_login') || '邮箱验证码登录' }}
              </button>
              <button
                type="button"
                @click="loginType = 'pwd'"
                :class="loginType === 'pwd' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700'"
                class="flex-1 py-2 text-xs rounded-lg transition-all"
              >
                {{ t('login.password_login') || '账号密码登录' }}
              </button>
            </div>

            <!-- 表单输入区域 -->
            <form @submit.prevent="handleLogin" class="space-y-4">
              <!-- 字段 1：邮箱 / 账号 -->
              <div class="std-cell">
                <div class="std-field" :class="{ 'is-error': errors.email || errors.username }">
                  <Icons v-if="loginType === 'email'" name="mail" :size="18" class="std-icon" />
                  <Icons v-else name="user" :size="18" class="std-icon" />
                  <input
                    v-if="loginType === 'email'"
                    v-model="email"
                    v-bind="emailProps"
                    type="email"
                    :placeholder="t('login.email_placeholder') || '请输入电子邮箱'"
                    autocomplete="username"
                    class="std-input"
                  />
                  <input
                    v-else
                    v-model="username"
                    v-bind="usernameProps"
                    type="text"
                    :placeholder="t('login.username_placeholder') || '账号 / 邮箱 / 手机号'"
                    autocomplete="username"
                    class="std-input"
                  />
                </div>
                <div class="std-err">{{ errors.email || errors.username }}</div>
              </div>

              <!-- 字段 2：验证码 / 密码 -->
              <div class="std-cell">
                <div class="std-field" :class="{ 'is-error': errors.code || errors.password }">
                  <Icons name="lock" :size="18" class="std-icon" />
                  <input
                    v-if="loginType === 'email'"
                    v-model="code"
                    v-bind="codeProps"
                    type="text"
                    :placeholder="t('login.code_placeholder') || '请输入验证码'"
                    autocomplete="one-time-code"
                    class="std-input"
                  />
                  <input
                    v-else
                    v-model="password"
                    v-bind="passwordProps"
                    type="password"
                    :placeholder="t('login.password_placeholder') || '请输入密码'"
                    autocomplete="current-password"
                    class="std-input"
                  />
                  <button
                    type="button"
                    v-if="loginType === 'email'"
                    @click="sendEmailCode"
                    :disabled="isCountingDown"
                    class="std-code-btn"
                  >
                    {{ isCountingDown ? `${countdown}s` : t('login.get_code') || '获取验证码' }}
                  </button>
                </div>
                <div class="std-err">{{ errors.code || errors.password }}</div>
              </div>

              <!-- 登录提交按钮 -->
              <button
                type="submit"
                :disabled="authStore.loading"
                class="std-submit-btn flex items-center justify-center gap-2"
              >
                <span v-if="authStore.loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                {{ authStore.loading ? (t('login.logging_in') || '登录中...') : (t('login.submit') || '安全登录') }}
              </button>
            </form>
          </div>
          <!-- 底部控制与服务协议 -->
          <div class="std-bottom">
            <!-- 行 1：记住登录 + 忘记密码 -->
            <div class="std-row">
              <label class="std-check-label">
                <input type="checkbox" v-model="keepLogin" class="hidden" />
                <span class="std-checkbox" :class="{ checked: keepLogin }">
                  <Icons v-if="keepLogin" name="check" :size="10" />
                </span>
                <span class="std-sub-text">{{ t('login.keep_login') || '保持登录' }}</span>
              </label>

              <router-link
                :to="{ path: '/forgot-password', query: { ...$route.query, fromLogin: 'standard' } }"
                class="std-forgot-link"
              >
                {{ t('login.forgot_password') || '忘记密码？' }}
              </router-link>
            </div>

            <!-- 行 2：协议卡片 + 立即注册（保持左侧复选框完美对齐） -->
            <div class="std-agreement-card">
              <label class="std-check-label flex-1 min-w-0">
                <input type="checkbox" v-model="agreed" class="hidden" />
                <span class="std-checkbox" :class="{ checked: agreed }">
                  <Icons v-if="agreed" name="check" :size="10" />
                </span>
                <span class="std-sub-text truncate">
                  同意 <a href="#" class="std-link-primary" @click.stop.prevent="docType = 'service'">《服务协议》</a> 与 <a href="#" class="std-link-primary" @click.stop.prevent="docType = 'privacy'">《隐私政策》</a>
                </span>
              </label>

              <router-link
                :to="{ path: '/register', query: { ...$route.query } }"
                class="std-register-link"
              >
                {{ t('login.register_now') || '立即注册' }}
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </router-link>
            </div>
          </div>
        </template>
      </div>

      <!-- 右侧面板：扫码登录面板 (对齐 MiniLogin 逻辑) -->
      <div class="w-[340px] bg-slate-50/70 dark:bg-slate-800/40 border-l border-slate-200/80 dark:border-slate-800 flex flex-col items-center justify-center p-8">
        <div class="text-center mb-6">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {{ t('login.qr_title') || '扫码快捷登录' }}
          </h3>
          <p class="text-xs text-slate-400">
            {{ t('login.qr_desc') || '使用移动客户端扫描二维码' }}
          </p>
        </div>

        <!-- 二维码显示区 -->
        <div
          class="relative p-3.5 bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-700 cursor-pointer overflow-hidden group"
          :class="{ 'border-rose-300': qrStatus === 'expired' }"
          @click="qrStatus === 'expired' && generateQR()"
        >
          <!-- 动态扫描线 -->
          <div v-if="qrStatus !== 'expired'" class="absolute top-0 left-0 w-full h-[2px] bg-blue-600 blur-[2px] animate-scan z-10"></div>

          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            class="w-44 h-44 transition-opacity"
            :class="qrStatus === 'expired' ? 'opacity-20' : 'opacity-95 group-hover:opacity-100'"
          />
          <div v-else class="w-44 h-44 flex items-center justify-center">
            <div class="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>

          <!-- 过期刷新遮罩 -->
          <div
            v-if="qrStatus === 'expired'"
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-rose-500 animate-bounce">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            <span class="text-xs font-semibold text-rose-500">二维码已失效，点击刷新</span>
          </div>
        </div>

        <p class="mt-6 text-xs text-slate-400 text-center leading-relaxed">
          {{ t('login.qr_scan_hint', { app: appConfig.appName }) || `打开手机客户端扫码登录 ${appConfig.appName}` }}
        </p>
      </div>

    </div>

    <!-- 暗黑模式切换按钮 (非嵌入场景下可用) -->
    <button
      v-if="!isEmbedded"
      @click="themeStore.toggleTheme"
      class="absolute -bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-xs font-medium hover:scale-105 transition-all"
    >
      <Icons v-if="themeStore.isDark" name="moon" :size="14" />
      <Icons v-else name="sun" :size="14" />
      <span>{{ themeStore.isDark ? 'Dark Mode' : 'Light Mode' }}</span>
    </button>
  </div>

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

  <!-- 服务协议 / 隐私政策 弹窗（统一组件，正文在 AgreementModals 单一维护） -->
  <AgreementModals v-model:type="docType" />
  </div>
</template>

<style scoped>
/* ==========================================================================
   1. 头部 Brand Header 精准垂直居中样式
   ========================================================================== */
.brand-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brand-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin: 0;
}

:global(.dark) .brand-title {
  color: #ffffff;
}

.brand-sub {
  font-size: 12px;
  line-height: 1.2;
  color: #64748b;
  margin-top: 4px;
}

:global(.dark) .brand-sub {
  color: #94a3b8;
}

/* ==========================================================================
   2. 输入框 & 按钮通用样式
   ========================================================================== */
.std-cell {
  display: flex;
  flex-direction: column;
}

.std-field {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 14px;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s ease;
}

:global(.dark) .std-field {
  background: #0f172a;
  border-color: #1e293b;
}

.std-field:focus-within {
  background: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

:global(.dark) .std-field:focus-within {
  background: #0f172a;
}

.std-field.is-error {
  border-color: #ef4444;
  background: #fef2f2;
}

:global(.dark) .std-field.is-error {
  background: rgba(239, 68, 68, 0.1);
}

.std-icon {
  color: #94a3b8;
  flex-shrink: 0;
}

.std-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: #0f172a;
  height: 100%;
  min-width: 0;
}

:global(.dark) .std-input {
  color: #f1f5f9;
}

.std-input::placeholder {
  color: #94a3b8;
}

.std-code-btn {
  font-size: 12px;
  font-weight: 600;
  padding-left: 12px;
  border-left: 1px solid #cbd5e1;
  color: #2563eb;
  white-space: nowrap;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.std-code-btn:hover {
  color: #1d4ed8;
}

:global(.dark) .std-code-btn {
  border-left-color: #334155;
}

.std-code-btn:disabled {
  color: #94a3b8 !important;
  cursor: not-allowed;
}

.std-err {
  height: 16px;
  line-height: 16px;
  margin-top: 2px;
  padding-left: 4px;
  font-size: 11px;
  color: #ef4444;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.std-submit-btn {
  height: 46px;
  width: 100%;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  border: none;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
}

.std-submit-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

/* ==========================================================================
   3. 底部完美左对齐（解决“保持登录”与“同意协议”对不齐问题）
   ========================================================================== */
.std-bottom {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

/* 1) 记住登录行：添加与下方卡片完全一致的 12px 边距 */
.std-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px; /* 核心：12px Padding 让 Checkbox X轴完全对齐 */
}

/* 2) 协议卡片行：左 Padding 为 12px */
.std-agreement-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px; /* 核心：12px Padding */
  /* background: #f8fafc; */
  border-radius: 12px;
  transition: all 0.2s ease;
}

.std-agreement-card:hover {
  background: #f1f5f9;
}

/* Checkbox Label 结构 */
.std-check-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  line-height: 1;
}

.std-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;
  background: #ffffff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.std-checkbox:hover {
  border-color: #2563eb;
}

.std-checkbox.checked {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  border-color: #2563eb;
}

/* 底部链接与文本 */
.std-sub-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1; /* 保证垂直对齐不偏移 */
}

.std-forgot-link {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
  white-space: nowrap;
  transition: color 0.2s ease;
}

.std-forgot-link:hover {
  color: #2563eb;
}

.std-link-primary {
  color: #2563eb;
  font-weight: 500;
  text-decoration: none;
}

.std-link-primary:hover {
  text-decoration: underline;
}

.std-register-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.std-register-link:hover {
  color: #1d4ed8;
  transform: translateX(2px);
}

/* 二维码扫描动画 */
@keyframes scan {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.animate-scan {
  animation: scan 2.5s linear infinite;
}
</style>

<style>
/* 非 scoped 作用域 - 深色模式覆盖 */
html.dark .standard-login-root .std-field {
  background: #0f172a;
  border-color: #1e293b;
}
html.dark .standard-login-root .std-field:focus-within {
  background: #0f172a;
}
html.dark .standard-login-root .std-field.is-error {
  background: rgba(239, 68, 68, 0.1);
}
html.dark .standard-login-root .std-input {
  color: #f1f5f9;
}

html.dark .standard-login-root .std-agreement-card {
  background: rgba(15, 23, 42, 0.6);
}

html.dark .standard-login-root .std-agreement-card:hover {
  background: rgba(30, 41, 59, 0.8);
}

html.dark .standard-login-root .std-checkbox {
  background: #0f172a;
  border-color: #475569;
}

html.dark .standard-login-root .std-sub-text,
html.dark .standard-login-root .std-forgot-link {
  color: #94a3b8;
  margin-right: 10px;
}

html.dark .standard-login-root .std-forgot-link:hover,
html.dark .standard-login-root .std-link-primary,
html.dark .standard-login-root .std-register-link {
  color: #60a5fa;
}
</style>