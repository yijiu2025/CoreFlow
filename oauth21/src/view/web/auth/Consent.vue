<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { postToParent } from '@/utils/parent';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useLoginFlow } from '@/composables/useLoginFlow';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import Icons from '@/components/common/Icons.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const { error: showError } = useMessage();

// 应用配置
const appConfig = computed(() => ({
  appName: (route.query.appName as string) || (route.query.client_id as string) || '',
  lang: (route.query.lang as string) || 'zh_cn',
  theme: (route.query.theme as string) || 'light',
  notKeepLogin: route.query.notKeepLogin === 'true',
  notLoadSsoView: route.query.notLoadSsoView === 'true',
}));

// SSO 相关：是否发送消息给父窗口
const shouldSendSSOMessage = computed(() => {
  return !appConfig.value.notLoadSsoView && window.parent && window.parent !== window;
});

// 从路由参数获取 consentKey
const consentKey = computed(() => route.query.consent_key as string || '');
const clientId = computed(() => route.query.client_id as string || route.query.appName as string || '');

// 国际化同步
const locale = computed(() => appConfig.value.lang);
watch(locale, newLang => {
  if (newLang) locale.value = newLang;
}, { immediate: true });

// 表单验证 schema
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
const [password] = defineField('password');

// 登录类型
const loginType = ref<'email' | 'pwd'>('email');

// 同步 loginType → zod discriminatedUnion 的 type 字段
watch(loginType, newType => {
  type.value = newType;
});

// 图形验证码流程
const { captchaKey, showCaptcha, captchaPurpose, openCaptcha, onCaptchaSuccess } = useCaptchaFlow<'code' | 'login'>(
  purpose => {
    if (purpose === 'code') executeSendEmailCode();
    else executeLogin();
  }
);

// 登录处理
const handleLogin = handleSubmit(async () => {
  if (loginType.value === 'pwd') {
    openCaptcha('login');
  } else {
    executeLogin();
  }
});

// 登录流程
const {
  showConsent, consentState, submittingConsent, denyConsent, approveConsent,
  showEmailVerify, emailVerifyState, emailVerifyCode, emailVerifyCountdown,
  sendEmailVerifyCode, submitEmailVerify, executeLogin, notifyParentLoginSuccess
} = useLoginFlow({
  keepLogin: () => false, // 授权页面默认不记住登录
  values: () => values,
  captchaKey: () => captchaKey.value,
  clientId: () => clientId.value,
  consentKey: () => consentKey.value,
  showError: (msg: string) => showError(msg)
});

// 邮箱验证码发送
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

// 邮箱验证提交
const submitEmailVerify = async () => {
  try {
    await sendEmailVerifyCode();
    // 发送成功后自动执行登录
    executeLogin();
  } catch (err) {
    showError(t('login.verify_send_failed') || '验证码发送失败');
  }
};

// 应用父应用通过 URL 指定的初始主题
onMounted(() => {
  if (appConfig.value.theme === 'dark' || appConfig.value.theme === 'light') {
    themeStore.applyTheme(appConfig.value.theme === 'dark');
  }

  // 如果需要发送 SSO 消息，通知父窗口
  if (shouldSendSSOMessage.value) {
    postToParent({ type: 'SSO_READY' });
    console.warn('[SSO] 发送 SSO_READY 消息到父窗口');
  }
});

// 导航返回处理
const goBack = () => {
  if (shouldSendSSOMessage.value && window.parent && window.parent !== window) {
    // 发送拒绝消息给父窗口
    postToParent({
      type: 'SSO_DENIED',
      error: 'user_denied',
      description: '用户拒绝了授权申请'
    });
  }
  router.back();
};
</script>

<template>
  <div class="consent-page min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- 头部 -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12l2 2 4-4M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">应用授权</h1>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {{ consentState?.client_name || t('login.third_party') }} 想要访问您的账户
        </p>
      </div>

      <!-- 授权确认面板 -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        <!-- 应用信息 -->
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl">
            {{ (consentState?.client_name || 'A')[0].toUpperCase() }}
          </div>
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-white">
              {{ consentState?.client_name || t('login.third_party') }}
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              正在请求授权访问
            </p>
          </div>
        </div>

        <hr class="border-slate-100 dark:border-slate-700" />

        <!-- 权限列表 -->
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              {{ t('login.requesting_permissions') }}
            </h3>
            <ul class="space-y-3">
              <li
                v-for="s in (consentState?.scopeDetails || [])"
                :key="s.id"
                class="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
              >
                <Icons name="check" :size="18" class="text-green-500 mt-0.5 flex-shrink-0" />
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-900 dark:text-white">
                      {{ s.name }}
                    </span>
                    <span v-if="s.required" class="text-xs text-rose-500 font-medium">必需</span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {{ s.desc }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-3 pt-4">
          <button
            type="button"
            @click="goBack"
            class="flex-1 h-12 border border-slate-200 dark:border-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {{ t('login.deny') }}
          </button>
          <button
            type="button"
            @click="approveConsent"
            :disabled="submittingConsent"
            class="flex-1 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <span v-if="submittingConsent" class="inline-flex items-center">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              处理中...
            </span>
            <span v-else>{{ t('login.approve') }}</span>
          </button>
        </div>
      </div>

      <!-- 登录表单（当用户需要登录时显示） -->
      <div v-if="showEmailVerify" class="mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-4 text-center">环境变更验证</h3>

        <div class="text-center mb-6">
          <div class="w-12 h-12 mx-auto rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#f59e0b" stroke-width="2">
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            检测到{{ emailVerifyState?.reason }}，为保护账号安全，请验证邮箱
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            验证码已发送至 <strong>{{ emailVerifyState?.email }}</strong>
          </p>
        </div>

        <div class="space-y-4">
          <div>
            <Icons name="mail" :size="20" class="text-slate-400" />
            <input
              v-model="emailVerifyCode"
              type="text"
              maxlength="6"
              placeholder="邮箱验证码"
              class="w-full mt-1 px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              @keyup.enter="submitEmailVerify"
            />
          </div>

          <div class="flex items-center justify-between text-sm">
            <button type="button" @click="sendEmailVerifyCode" :disabled="emailVerifyCountdown.active.value"
              class="text-blue-600 disabled:text-slate-400 disabled:cursor-not-allowed">
              {{ emailVerifyCountdown.active.value ? `${emailVerifyCountdown.remaining.value}s 后重发` : '重新发送验证码' }}
            </button>
          </div>

          <button type="button" @click="submitEmailVerify"
            class="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-bold hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            验证并登录
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 动画效果 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.consent-page > div > div {
  animation: fadeIn 0.5s ease-out;
}
</style>