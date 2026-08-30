<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useForm } from 'vee-validate';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { postToParent } from '@/utils/parent';
import AuthContainer from '@/components/common/AuthContainer.vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import PasswordInput from '@/components/common/PasswordInput.vue';
import Icons from '@/components/common/Icons.vue';
import AppNameMissing from '@/components/common/AppNameMissing.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useQrLogin } from '@/composables/useQrLogin';
import { useLoginFlow } from '@/composables/useLoginFlow';

const authStore = useAuthStore();
const themeStore = useThemeStore();
const route = useRoute();
const { locale, t } = useI18n();
const { error: showError } = useMessage();

const hasAppName = computed(() => !!route.query.appName);
const appConfig = computed(() => ({
  appName: (route.query.appName as string) || '',
  lang: (route.query.lang as string) || 'zh_cn',
  qrCodeFirst: route.query.qrCodeFirst === 'true',
  isMobile: route.query.isMobile === 'true',
  notKeepLogin: route.query.notKeepLogin === 'true',
  // 父应用通过 URL 指定初始主题（dark/light），iframe 首屏就带主题不闪白
  // 优先级：URL theme > 父 postMessage 同步 > 本地 localStorage > 系统偏好
  theme: (route.query.theme as string) || ''
}));

const showQR = ref(false);
const loginType = ref<'email' | 'pwd'>('email');
// 倒计时：发送邮箱验证码后 60s 禁用按钮
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
const keepLogin = ref(false);

// qrKey/qrDataUrl/qrStatus/qrPollTimer 由 useQrLogin 管理（下方声明）

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
  initialValues: { type: 'email', email: '', code: '', username: '', password: '' } as any
});

const [type] = defineField('type');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [username, usernameProps] = defineField('username');
const [password] = defineField('password');

// 同步 loginType → zod discriminatedUnion 的 type 字段
watch(loginType, newType => {
  type.value = newType;
});

// 图形验证码流程：弹窗 → 通过 → 按 purpose（code 发邮箱码 / login 登录）继续
const { captchaKey, showCaptcha, captchaPurpose, openCaptcha, onCaptchaSuccess } = useCaptchaFlow<'code' | 'login'>(
  purpose => {
    if (purpose === 'code') executeSendEmailCode();
    else executeLogin();
  }
);

const sendEmailCode = () => {
  if (!email.value || (errors.value as any).email) {
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

// 登录流程：consent/email_verify/max_sessions/notifyParent 统一在 useLoginFlow
const {
  showConsent, consentState, submittingConsent, denyConsent, approveConsent,
  showEmailVerify, emailVerifyState, emailVerifyCode, emailVerifyCountdown,
  sendEmailVerifyCode, submitEmailVerify, executeLogin, notifyParentLoginSuccess
} = useLoginFlow({
  keepLogin: () => keepLogin.value,
  values: () => values,
  captchaKey: () => captchaKey.value,
  clientId: () => (route.query.client_id as string) || (route.query.appName as string),
  showError: (msg: string) => showError(msg)
});

const qrClientId = computed(() => (route.query.client_id as string) || (route.query.appName as string) || '');

// 二维码登录：生成（scope 后端从 client 查，不前端传）+ 轮询 + 确认后通知父窗口
const { qrDataUrl, qrStatus, generate: generateQR, reset: resetQR } = useQrLogin(
  () => qrClientId.value,
  (res: any) => notifyParentLoginSuccess(res),
  () => showError(t('login.qr_expired') || '二维码已过期')
);

onMounted(() => {
  // 应用父应用通过 URL 指定的初始主题（dark/light），iframe 首屏就带主题不闪白
  // 仅当 URL 带 theme 参数时覆盖；不带则走 theme store 默认（localStorage/系统偏好/父 postMessage）
  if (appConfig.value.theme === 'dark' || appConfig.value.theme === 'light') {
    themeStore.applyTheme(appConfig.value.theme === 'dark');
  }
  showQR.value = appConfig.value.qrCodeFirst;
  if (appConfig.value.notKeepLogin) keepLogin.value = false;
  if (showQR.value) generateQR(() => showError(t('login.qr_generate_failed') || '二维码生成失败'));
  if (window.parent && window.parent !== window) {
    postToParent({ type: 'SSO_READY' });
  }
});

watch(showQR, val => {
  if (val) {
    generateQR(() => showError(t('login.qr_generate_failed') || '二维码生成失败'));
  } else {
    resetQR();
  }
});
</script>

<template>
  <div class="mini-login-root w-full h-full">
    <AppNameMissing v-if="!hasAppName" />
    <AuthContainer
      v-else
      :appName="appConfig.appName"
      :isMobile="appConfig.isMobile"
    >
      <template #header>
        <h2 class="text-xl font-bold dark:text-white leading-tight">
          {{ showConsent ? t('login.consent_title') : showQR ? t('login.qr_title') : t('login.welcome') }}
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          {{
            showConsent
              ? t('login.consent_desc', { app: consentState?.client_name || t('login.third_party') })
              : showQR
                ? t('login.qr_desc')
                : t('login.fill_credentials')
          }}
        </p>
      </template>

      <!-- 扫码/表单切换按钮（授权确认时不显示） -->
      <template #header-extra v-if="!showConsent">
        <button
          type="button"
          @click="showQR = !showQR"
          class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/80 text-slate-400 hover:text-[#2563eb] transition-all border border-slate-100 dark:border-slate-800"
          :title="showQR ? t('login.qr_title') : t('login.welcome')"
        >
          <svg v-if="!showQR" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </button>
      </template>

      <!-- 二维码面板（showQR && !showConsent 时显示，否则走表单/consent） -->
      <div v-if="showQR && !showConsent" class="qr-container flex flex-col items-center justify-center flex-1 py-4">
          <div
            class="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative group overflow-hidden cursor-pointer"
            :class="{ 'border-rose-300': qrStatus === 'expired' }"
            @click="qrStatus === 'expired' && generateQR()"
          >
            <div class="absolute top-0 left-0 w-full h-[2px] bg-[#2563eb] blur-[2px] animate-scan z-10" v-if="qrStatus !== 'expired'"></div>
            <img
              v-if="qrDataUrl"
              :src="qrDataUrl"
              class="w-40 h-40 transition-opacity"
              :class="qrStatus === 'expired' ? 'opacity-30' : 'opacity-90 group-hover:opacity-100'"
            />
            <div v-else class="w-40 h-40 flex items-center justify-center">
              <div class="w-8 h-8 border-2 border-slate-200 border-t-[#2563eb] rounded-full animate-spin"></div>
            </div>
            <div
              v-if="qrStatus === 'expired'"
              class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/60 dark:bg-slate-900/60"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" class="text-rose-500">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              <span class="text-xs font-medium text-rose-500">点击刷新</span>
            </div>
          </div>
          <p class="mt-6 text-xs text-slate-500 text-center">
            {{ t('login.qr_scan_hint', { app: appConfig.appName }) }}
          </p>
      </div>

      <!-- 授权确认面板 -->
      <div v-else-if="showConsent" class="flex-1 flex flex-col justify-center py-2 space-y-5 w-full">
        <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#2563eb]/10 flex items-center justify-center text-[#2563eb] font-bold text-lg">
              {{ (consentState?.client_name || 'A')[0].toUpperCase() }}
            </div>
            <div>
              <h3 class="text-sm font-bold dark:text-white">
                {{ consentState?.client_name || t('login.third_party') }}
              </h3>
              <p class="text-xs text-slate-400">{{ t('login.requesting_auth') }}</p>
            </div>
          </div>
          <hr class="border-slate-100 dark:border-slate-800" />
          <div class="space-y-2">
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {{ t('login.requesting_permissions') }}
            </p>
            <ul class="space-y-1.5">
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

        <div class="flex gap-3">
          <button
            type="button"
            @click="denyConsent"
            class="flex-1 h-11 border border-slate-200 dark:border-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {{ t('login.deny') }}
          </button>
          <button
            type="button"
            @click="approveConsent"
            :disabled="submittingConsent"
            class="mlogin-submit flex-1 h-11 text-xs"
          >
            <span v-if="submittingConsent" class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ t('login.approve') }}
          </button>
        </div>
      </div>

      <!-- 邮箱二次验证（密码登录环境异常） -->
      <div v-else-if="showEmailVerify" class="flex-1 flex flex-col justify-center py-2 space-y-4 w-full">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 mx-auto rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <h3 class="text-sm font-bold dark:text-white">环境变更验证</h3>
          <p class="text-xs text-slate-400">检测到{{ emailVerifyState?.reason }}，为保护账号安全，请验证邮箱</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">验证码已发送至 <strong>{{ emailVerifyState?.email }}</strong></p>
        </div>

        <div class="mlogin-field">
          <Icons name="mail" :size="18" class="mlogin-icon" />
          <input
            v-model="emailVerifyCode"
            type="text"
            maxlength="6"
            placeholder="邮箱验证码"
            class="mlogin-input"
            @keyup.enter="submitEmailVerify"
          />
        </div>

        <div class="flex items-center justify-between text-xs">
          <button type="button" @click="sendEmailVerifyCode" :disabled="emailVerifyCountdown.active.value"
            class="text-[#2563eb] disabled:text-slate-400 disabled:cursor-not-allowed font-medium">
            {{ emailVerifyCountdown.active.value ? `${emailVerifyCountdown.remaining.value}s 后重发` : '重新发送验证码' }}
          </button>
        </div>

        <button type="button" @click="submitEmailVerify" class="mlogin-submit h-11 text-xs">
          验证并登录
        </button>
      </div>

      <!-- 登录表单 -->
      <form v-else @submit.prevent="handleLogin" class="form-container flex-1 flex flex-col justify-center mt-3">
        <!-- 登录类型 Tab -->
        <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 border border-slate-200/60 dark:border-slate-700/60">
          <button
            type="button"
            @click="loginType = 'email'"
            :class="loginType === 'email' ? 'bg-white dark:bg-slate-700 text-[#2563eb] shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-300'"
            class="flex-1 py-2 text-sm rounded-lg transition-all"
          >
            {{ t('login.email_login') }}
          </button>
          <button
            type="button"
            @click="loginType = 'pwd'"
            :class="loginType === 'pwd' ? 'bg-white dark:bg-slate-700 text-[#2563eb] shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-300'"
            class="flex-1 py-2 text-sm rounded-lg transition-all"
          >
            {{ t('login.password_login') }}
          </button>
        </div>

        <!-- 字段 1：邮箱/账号 -->
        <div class="mlogin-cell">
          <div class="mlogin-field" :class="{ 'is-error': errors.email || errors.username }">
            <Icons v-if="loginType === 'email'" name="mail" :size="18" class="mlogin-icon" />
            <Icons v-else name="user" :size="18" class="mlogin-icon" />
            <input
              v-if="loginType === 'email'"
              v-model="email"
              v-bind="emailProps"
              type="email"
              :placeholder="t('login.email_placeholder')"
              autocomplete="username"
              class="mlogin-input"
            />
            <input
              v-else
              v-model="username"
              v-bind="usernameProps"
              type="text"
              :placeholder="t('login.username_placeholder')"
              autocomplete="username"
              class="mlogin-input"
            />
          </div>
          <div class="mlogin-err">{{ errors.email || errors.username }}</div>
        </div>

        <!-- 字段 2：验证码/密码 -->
        <div class="mlogin-cell">
          <div v-if="loginType === 'email'" class="mlogin-field" :class="{ 'is-error': errors.code }">
            <input
              v-model="code"
              v-bind="codeProps"
              type="text"
              :placeholder="t('login.code_placeholder')"
              autocomplete="one-time-code"
              class="mlogin-input"
            />
            <button
              type="button"
              @click="sendEmailCode"
              :disabled="isCountingDown"
              class="mlogin-code-btn"
            >
              {{ isCountingDown ? `${countdown}s` : t('login.get_code') }}
            </button>
          </div>
          <PasswordInput
            v-else
            v-model="password"
            :has-error="!!errors.password"
            :placeholder="t('login.password_placeholder')"
            autocomplete="current-password"
            input-class="mlogin-input"
          />
          <div class="mlogin-err">{{ errors.code || errors.password }}</div>
        </div>

        <!-- 提交按钮 -->
        <button type="submit" :disabled="authStore.loading" class="mlogin-submit flex items-center justify-center gap-2 mt-1">
          <span v-if="authStore.loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ authStore.loading ? t('login.logging_in') : t('login.submit') }}
        </button>
      </form>

      <!-- 底部控制与跳转插槽 -->
      <template #footer v-if="!showConsent">
        <div class="flex items-center justify-between pt-1">
          <label class="mlogin-checkbox-label">
            <input type="checkbox" v-model="keepLogin" class="hidden" />
            <span class="mlogin-checkbox" :class="{ checked: keepLogin }">
              <svg v-if="keepLogin" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="text-xs text-slate-400 hover:text-slate-500 transition-colors">{{ t('login.keep_login') }}</span>
          </label>

          <div class="flex items-center gap-3">
            <router-link
              :to="{ path: '/forgot-password', query: { ...$route.query, fromLogin: 'mini' } }"
              class="text-xs text-slate-400 hover:text-[#2563eb] transition-colors"
            >
              {{ t('login.forgot_password') }}
            </router-link>
            <span class="text-slate-300 dark:text-slate-700">|</span>
            <router-link
              :to="{ path: '/register', query: { ...$route.query, from: 'mini' } }"
              class="mlogin-highlight-link text-xs font-semibold"
            >
              {{ t('login.register_now') }}
            </router-link>
          </div>
        </div>
      </template>
    </AuthContainer>

    <GraphicCaptcha
      :is-open="showCaptcha"
      :email="captchaPurpose === 'code' ? email : undefined"
      :send-email="captchaPurpose === 'code'"
      type="login"
      @close="showCaptcha = false"
      @success="onCaptchaSuccess"
    />

    <MessageToast />
  </div>
</template>

<style scoped>
.mlogin-cell {
  display: flex;
  flex-direction: column;
}

.mlogin-field {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s ease;
}

:global(.dark) .mlogin-field {
  background: #0f172a;
  border-color: #1e293b;
}

.mlogin-field:focus-within {
  background: #fff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

:global(.dark) .mlogin-field:focus-within {
  background: #0f172a;
}

.mlogin-field.is-error {
  border-color: #ef4444;
  background: #fef2f2;
}

:global(.dark) .mlogin-field.is-error {
  background: rgba(239, 68, 68, 0.1);
}

.mlogin-icon {
  color: #94a3b8;
  flex-shrink: 0;
}

.mlogin-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: #0f172a;
  height: 100%;
  min-width: 0;
}

:global(.dark) .mlogin-input {
  color: #f1f5f9;
}

.mlogin-input::placeholder {
  color: #94a3b8;
}

.mlogin-code-btn {
  font-size: 12px;
  font-weight: 600;
  padding-left: 12px;
  border-left: 1px solid #cbd5e1;
  color: #2563eb;
  white-space: nowrap;
  background: transparent;
  border-top: none;
  border-right: none;
  border-bottom: none;
  cursor: pointer;
  transition: color 0.2s;
}

.mlogin-code-btn:hover {
  color: #1d4ed8;
}

:global(.dark) .mlogin-code-btn {
  border-left-color: #334155;
}

.mlogin-code-btn:disabled {
  color: #94a3b8 !important;
  cursor: not-allowed;
}

/* 错误提示固定占位（防晃动） */
.mlogin-err {
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

/* 与注册页对齐的蓝紫渐变主按钮 */
.mlogin-submit {
  height: 44px;
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

.mlogin-submit:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.mlogin-submit:active:not(:disabled) {
  transform: translateY(0);
}

.mlogin-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.mlogin-checkbox {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: all 0.2s;
}

:global(.dark) .mlogin-checkbox {
  border-color: #475569;
}

.mlogin-checkbox.checked {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  border-color: #2563eb;
}

.mlogin-highlight-link {
  color: #2563eb;
  cursor: pointer;
  transition: color 0.2s;
}

.mlogin-highlight-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}
</style>