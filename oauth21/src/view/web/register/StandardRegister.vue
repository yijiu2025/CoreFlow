<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRoute, useRouter } from 'vue-router';
import { inject, ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useButtonLock } from '@/composables/useButtonLock';
import { useAgreementVersion, captureAgreementVersion } from '@/composables/useAgreementVersion';
import PasswordInput from '@/components/common/PasswordInput.vue';
import PasswordStrength from '@/components/common/PasswordStrength.vue';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useCaptcha } from '@/composables/useCaptcha';

const { t, locale } = useI18n();
const { error: showError, success: showSuccess } = useMessage();

// 父组件（view/web/register/index.vue）透传的注册上下文
interface RegisterContext {
  appName: string;
  clientId: string;
  /** OAuth 标准字段，iframe 父应用跳注册时必传 */
  redirectUri: string;
  /** 兼容旧字段名 */
  redirect: string;
  scope: string;
  state: string;
  invite: string;
  lang: string;
}
const ctx = inject<RegisterContext>('registerContext', {
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
if (ctx.lang) locale.value = ctx.lang;

const { isEnabled: recaptchaEnabled, load: loadCaptcha, getToken: getCaptchaToken, dispose } = useCaptcha('register');
onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
});
onUnmounted(() => dispose());

const router = useRouter();
const route = useRoute();

// 分步状态：1 - 账号与验证码，2 - 密码与协议
const step = ref<1 | 2>(1);

// 协议版本快照：用户勾选时记录当时协议版本 + 时间戳
const agreementVersion = useAgreementVersion();

const registerSchema = z
  .object({
    username: z.string({ required_error: t('register.username_min') }).min(2, t('register.username_min')),
    email: z.string({ required_error: t('register.email') }).email(t('register.email_invalid')),
    code: z.string({ required_error: t('register.code') }).min(4, t('register.code_min')),
    password: z
      .string({ required_error: t('register.password_min') })
      .min(8, t('register.password_min'))
      .max(128, t('register.password_max'))
      .regex(/^(?=.*[a-z])/, t('register.password_lowercase'))
      .regex(/^(?=.*[A-Z])/, t('register.password_uppercase'))
      .regex(/^(?=.*\d)/, t('register.password_digit')),
    confirmPassword: z.string({ required_error: t('register.confirm_required') }).min(1, t('register.confirm_required'))
  })
  .refine((data: any) => data.password === data.confirmPassword, {
    message: t('register.password_mismatch'),
    path: ['confirmPassword']
  });

const { values, errors, defineField, handleSubmit, validateField } = useForm({
  validationSchema: toTypedSchema(registerSchema)
});

const [username, usernameProps] = defineField('username');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password] = defineField('password');
const [confirmPassword] = defineField('confirmPassword');

const agreed = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);
const isEmailDuplicate = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
// 防双击：handleSubmit 提交期间禁用按钮
const submitLock = useButtonLock();

// 图形验证码流程：弹窗 → 通过 → 拿 captchaKey + 启动倒计时
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(
  () => startCountdown(60)
);

const checkEmail = async () => {
  if (!values.email || errors.value.email) {
    isEmailDuplicate.value = false;
    return;
  }
  try {
    const res: any = await authApi.checkEmail(values.email);
    isEmailDuplicate.value = res?.isDuplicate;
  } catch {
    isEmailDuplicate.value = false;
  }
};

// 发送验证码前先查重：邮箱已注册则拦截，不允许发码
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError(t('register.email_duplicate'));
    return;
  }
  openRegCaptcha('register');
};

// 步骤 1 校验并前往步骤 2
const handleNextStep = async () => {
  const resUser = await validateField('username');
  const resEmail = await validateField('email');
  const resCode = await validateField('code');
  if (resUser.valid && resEmail.valid && resCode.valid && !isEmailDuplicate.value) {
    step.value = 2;
  }
};

/**
 * 注册后回跳（同源白名单，防开放重定向）
 * - 必须以 / 开头（相对路径）
 * - 排除 //evil.com（协议相对 URL）
 * - 排除 http://evil.com / javascript: 等（含 :// 的绝对 URL）
 */
function safeRedirect(): string {
  // 优先 redirectUri（OAuth 标准），fallback redirect（兼容旧字段）
  const r = ctx.redirectUri || ctx.redirect;
  if (r && r.startsWith('/') && !r.startsWith('//') && !r.includes('://')) {
    return r;
  }
  // 缺 redirectUri：iframe 场景下不能简单跳 /（会丢 appName 报"应用标识缺失"）
  // 从当前 route.query 重新拼 OAuth 上下文（appName/client_id/redirect_uri/scope/state）
  // 让父应用跳注册时即使没显式带 redirect_uri，也能链回登录页保留 OAuth 上下文
  const preservedQuery: Record<string, string> = {};
  for (const k of ['appName', 'client_id', 'scope', 'state', 'redirect_uri', 'lang', 'from']) {
    const v = route.query[k];
    if (typeof v === 'string') preservedQuery[k] = v;
  }
  preservedQuery.from = 'register';
  const queryStr = new URLSearchParams(preservedQuery).toString();
  return `/mini-login${queryStr ? '?' + queryStr : ''}`;
}

const handleRegister = handleSubmit(
  async () => {
    if (!agreed.value) {
      showError(t('forgot.code_required'));
      return;
    }
    if (isEmailDuplicate.value) {
      showError(t('register.email_duplicate'));
      return;
    }
    // 防双击
    if (submitLock.locked.value) return;
    submitLock.lock();
    const { confirmPassword, ...submitData } = values;
    const encryptedPassword = await rsaEncrypt(submitData.password!);
    const recaptchaToken = recaptchaEnabled ? await getCaptchaToken() : null;
    try {
      await authApi.register({
        ...submitData,
        password: encryptedPassword,
        kid: getCachedKid(),
        captchaKey: captchaKey.value,
        // 协议版本快照：注册时记录用户同意的协议版本
        agreementVersion: captureAgreementVersion(agreementVersion),
        // 邀请码 + OAuth appName（父应用注册场景）
        invite: ctx.invite || undefined,
        appName: ctx.appName,
        ...(recaptchaToken ? { recaptchaToken } : {})
      });
      showSuccess(t('register.success'));
      // OAuth 场景：跳回原应用（safeRedirect 白名单校验）；普通注册：跳首页
      router.push(safeRedirect());
    } catch (err: any) {
      showError(err?.message || t('register.register_failed'));
    } finally {
      submitLock.unlock();
    }
  },
  err => console.warn('[Register] 表单验证失败:', err)
);
</script>

<template>
  <div class="reg-viewport">
    <div class="reg-blob reg-blob-1"></div>
    <div class="reg-blob reg-blob-2"></div>
    <div class="reg-card glass-effect">
      <div class="reg-brand-panel">
        <div class="reg-brand-bg"></div>
        <div class="reg-brand-content">
          <div class="reg-brand-logo">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 class="reg-brand-title">
            {{ t('register.brand_title') }}<br />{{ t('register.brand_title_br') }}
          </h2>
          <p class="reg-brand-desc">{{ t('register.brand_desc') }}</p>
          <ul class="reg-brand-features">
            <li><span class="reg-check"></span>{{ t('register.brand_feature_1') }}</li>
            <li><span class="reg-check"></span>{{ t('register.brand_feature_2') }}</li>
            <li><span class="reg-check"></span>{{ t('register.brand_feature_3') }}</li>
          </ul>
          <!-- 已有账号？立即登录（OAuth 注册场景跳转回原应用） -->
          <router-link
            v-if="ctx.redirectUri || ctx.redirect"
            :to="{ path: '/mini-login', query: { ...route.query, from: 'register' } }"
            class="reg-brand-signin"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            {{ t('register.signin_link') }}
          </router-link>
          <router-link v-else to="/mini-login" class="reg-brand-signin">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            {{ t('register.signin_link') }}
          </router-link>
        </div>
      </div>

      <div class="reg-panel">
        <div class="reg-head">
          <div class="flex items-center justify-between">
            <div>
              <!-- OAuth 场景：标题带 appName（告知用户在哪个应用注册） -->
              <h2 class="reg-title">{{ ctx.appName !== 'Enterprise SSO' ? `${ctx.appName} · ` : '' }}{{ t('register.title') }}</h2>
              <p class="reg-sub">{{ step === 1 ? t('register.sub_step1') : t('register.sub_step2') }}</p>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="reg-step-dot" :class="step === 1 ? 'reg-step-active' : ''"></span>
              <span class="reg-step-dot" :class="step === 2 ? 'reg-step-active' : ''"></span>
            </div>
          </div>
        </div>

        <form @submit.prevent="step === 1 ? handleNextStep() : handleRegister()" class="reg-form">
          <div v-if="step === 1" class="reg-step-box">
            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.username }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <input v-model="username" v-bind="usernameProps" type="text" :placeholder="t('register.username')" autocomplete="username" class="reg-input" />
              </div>
              <div class="reg-err">{{ errors.username }}</div>
            </div>

            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" :placeholder="t('register.email')" autocomplete="email" class="reg-input" />
              </div>
              <div class="reg-err">{{ isEmailDuplicate ? t('register.email_duplicate') : errors.email }}</div>
            </div>

            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.code }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="code" v-bind="codeProps" type="text" :placeholder="t('register.code')" autocomplete="one-time-code" class="reg-input" />
                <button type="button" @click="sendCode" :disabled="isCountingDown || submitLock.locked.value" class="reg-code-btn">
                  {{ isCountingDown ? `${countdown}s` : t('register.get_code') }}
                </button>
              </div>
              <div class="reg-err">{{ errors.code }}</div>
            </div>

            <button type="button" @click="handleNextStep" :disabled="submitLock.locked.value" class="reg-next-btn">
              {{ t('register.next') }}
            </button>
          </div>

          <div v-else class="reg-step-box">
            <div class="reg-cell">
              <PasswordInput
                v-model="password"
                :has-error="!!errors.password"
                :placeholder="t('register.password')"
              />
              <div class="reg-err">{{ errors.password }}</div>
            </div>

            <!-- 密码强度条 + 悬浮窗规则列表 -->
            <PasswordStrength :password="values.password" />

            <div class="reg-cell">
              <PasswordInput
                v-model="confirmPassword"
                :has-error="!!errors.confirmPassword"
                :placeholder="t('register.confirm_password')"
              />
              <div class="reg-err">{{ errors.confirmPassword }}</div>
            </div>

            <label class="reg-agree">
              <input type="checkbox" v-model="agreed" class="hidden" />
              <span class="reg-checkbox" :class="{ checked: agreed }">
                <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
              <span class="reg-agree-text">
                {{ t('register.agree_prefix') }}
                <span @click.stop.prevent="docType = 'service'" class="reg-link">{{ t('register.agree_link_service') }}</span>
                {{ t('register.agree_and') }}
                <span @click.stop.prevent="docType = 'privacy'" class="reg-link">{{ t('register.agree_link_privacy') }}</span>
              </span>
            </label>

            <div class="flex gap-2.5 mt-2">
              <button type="button" @click="step = 1" :disabled="submitLock.locked.value" class="reg-back-btn">
                {{ t('register.prev') }}
              </button>
              <button type="submit" :disabled="!agreed || submitLock.locked.value" :class="{ 'reg-disabled': !agreed || submitLock.locked.value }" class="reg-submit flex-1">
                {{ t('register.submit') }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>

  <GraphicCaptcha
    :is-open="showCaptcha"
    :email="values.email"
    type="register"
    @close="showCaptcha = false"
    @success="onCaptchaSuccess"
  />

  <!-- 服务协议 / 隐私政策 弹窗（统一组件） -->
  <AgreementModals v-model:type="docType" />

  <!-- 错误/成功提示 toast -->
  <MessageToast />
</template>

<style scoped>
.reg-viewport {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%);
  position: relative;
  overflow: hidden;
  padding: 24px;
}
:global(.dark) .reg-viewport {
  background: linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%);
}
.reg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  z-index: 0;
  pointer-events: none;
}
.reg-blob-1 { width: 480px; height: 480px; background: #4f46e5; top: -120px; left: -120px; }
.reg-blob-2 { width: 420px; height: 420px; background: #d946ef; bottom: -120px; right: -120px; }
.reg-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1100px;
  min-height: 600px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 32px;
  box-shadow: 0 25px 60px -12px rgba(79, 70, 229, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.6);
  display: grid;
  grid-template-columns: 1.1fr 1.4fr;
  overflow: hidden;
}
:global(.dark) .reg-card {
  background: rgba(15, 23, 42, 0.9);
  border-color: rgba(71, 85, 105, 0.3);
  box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.5);
}
.reg-brand-panel {
  position: relative;
  padding: 56px 48px;
  background: linear-gradient(135deg, #4f46e5 0%, #d946ef 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.reg-brand-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(255,255,255,0.15) 0%, transparent 50%);
  z-index: 0;
}
.reg-brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.reg-brand-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 28px;
}
.reg-brand-title {
  font-size: 36px;
  font-weight: 800;
  line-height: 1.2;
  margin: 0 0 16px;
  letter-spacing: -0.02em;
}
.reg-brand-desc {
  font-size: 14px;
  line-height: 1.6;
  opacity: 0.9;
  margin: 0 0 32px;
  max-width: 320px;
}
.reg-brand-features {
  list-style: none;
  padding: 0;
  margin: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.reg-brand-features li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
}
.reg-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.reg-check::after {
  content: '✓';
  font-size: 11px;
  font-weight: bold;
}
.reg-brand-signin {
  margin-top: 32px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  text-decoration: none;
  transition: background 0.2s;
}
.reg-brand-signin:hover {
  background: rgba(255, 255, 255, 0.3);
}
.reg-panel {
  padding: 48px 56px;
  display: flex;
  flex-direction: column;
  background: #fff;
}
:global(.dark) .reg-panel {
  background: #0f172a;
}
.reg-head { margin-bottom: 32px; }
.reg-title {
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 8px;
  color: #0f172a;
  letter-spacing: -0.02em;
}
:global(.dark) .reg-title { color: #f1f5f9; }
.reg-sub { font-size: 13px; color: #94a3b8; margin: 0; }
.reg-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e2e8f0;
  transition: all 0.3s;
}
:global(.dark) .reg-step-dot { background: #334155; }
.reg-step-active {
  background: #4f46e5;
  width: 24px;
  border-radius: 4px;
}
.reg-form { display: flex; flex-direction: column; }
.reg-step-box { display: flex; flex-direction: column; gap: 4px; }
.reg-cell { display: flex; flex-direction: column; }
.reg-field {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 14px;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  transition: all 0.2s;
}
:global(.dark) .reg-field {
  background: #0f172a;
  border-color: #1e293b;
}
.reg-field:focus-within {
  background: #fff;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
:global(.dark) .reg-field:focus-within {
  background: #0f172a;
  border-color: #818cf8;
}
.reg-field.is-error {
  border-color: #ef4444;
  background: #fef2f2;
}
:global(.dark) .reg-field.is-error {
  background: rgba(239, 68, 68, 0.1);
}
.reg-icon { color: #94a3b8; flex-shrink: 0; }
:global(.dark) .reg-icon { color: #64748b; }
.reg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  color: #0f172a;
  height: 100%;
  min-width: 0;
}
:global(.dark) .reg-input { color: #f1f5f9; }
.reg-input::placeholder { color: #94a3b8; }
.reg-code-btn {
  font-size: 13px;
  font-weight: 600;
  color: #4f46e5;
  padding-left: 12px;
  border-left: 1px solid #e2e8f0;
  white-space: nowrap;
  background: transparent;
  border-top: none;
  border-right: none;
  border-bottom: none;
  cursor: pointer;
  transition: color 0.2s;
}
:global(.dark) .reg-code-btn { color: #818cf8; border-left-color: #334155; }
.reg-code-btn:hover:not(:disabled) { color: #4338ca; }
.reg-code-btn:disabled { color: #94a3b8; cursor: not-allowed; }
.reg-err {
  height: 18px;
  line-height: 18px;
  margin-top: 4px;
  padding-left: 4px;
  font-size: 11px;
  color: #ef4444;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.reg-next-btn {
  height: 50px;
  width: 100%;
  margin-top: 16px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  border: none;
  background: linear-gradient(135deg, #4f46e5, #d946ef);
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.25);
  cursor: pointer;
  transition: all 0.2s;
}
.reg-next-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(79, 70, 229, 0.3); }
.reg-next-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 密码强度条 */
.reg-pwd-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
  margin-top: 4px;
  padding-left: 4px;
}
.reg-pwd-bar {
  height: 4px;
  flex: 1;
  border-radius: 2px;
  transition: width 0.3s, background 0.3s;
}
.reg-pwd-text {
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.reg-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  margin-top: 12px;
}
.reg-checkbox {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: all 0.2s;
}
:global(.dark) .reg-checkbox { border-color: #475569; }
.reg-checkbox.checked { background: #4f46e5; border-color: #4f46e5; }
.reg-link { color: #4f46e5; font-weight: 500; cursor: pointer; }
.reg-link:hover { text-decoration: underline; }

.reg-back-btn {
  height: 50px;
  padding: 0 20px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
:global(.dark) .reg-back-btn { background: #1e293b; color: #94a3b8; }
.reg-back-btn:hover:not(:disabled) { background: #e2e8f0; }
.reg-back-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.reg-submit {
  height: 50px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  border: none;
  background: linear-gradient(135deg, #4f46e5, #d946ef);
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.25);
  cursor: pointer;
  transition: all 0.2s;
}
.reg-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(79, 70, 229, 0.3); }
.reg-submit:disabled, .reg-disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* 响应式 */
@media (max-width: 900px) {
  .reg-card { grid-template-columns: 1fr; max-width: 480px; }
  .reg-brand-panel { padding: 32px; }
  .reg-brand-title { font-size: 28px; }
  .reg-panel { padding: 32px 24px; }
}
</style>
