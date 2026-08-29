<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRouter, useRoute } from 'vue-router';
import { inject, ref, onMounted, onUnmounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useCaptcha } from '@/composables/useCaptcha';
import MessageToast from '@/components/common/MessageToast.vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useButtonLock } from '@/composables/useButtonLock';
import { usePasswordStrength } from '@/composables/usePasswordStrength';
import { useAgreementVersion, captureAgreementVersion } from '@/composables/useAgreementVersion';

const { isEnabled: recaptchaEnabled, load: loadCaptcha, getToken: getCaptchaToken, dispose } = useCaptcha('register');
const { error: showError, success: showSuccess } = useMessage();
const { t, locale } = useI18n();

// 父组件透传的注册上下文
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
if (ctx.lang) locale.value = ctx.lang;

// 客户端环境（AuthContainer props + 注册上下文聚合）
const appConfig = computed(() => ({ appName: ctx.appName, isMobile: route.query.isMobile === 'true', styleType: ((route.query.styleType as 'horizontal' | 'split' | 'vertical') || 'horizontal') }));


onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
});
onUnmounted(() => dispose());

// 路由（route 在 appConfig computed 中使用，必须先声明）
const router = useRouter();
const route = useRoute();

// 分步状态：1 - 账号与验证码，2 - 密码与协议
const step = ref<1 | 2>(1);

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
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

const agreed = ref(false);
const isEmailDuplicate = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
// 密码强度（实时检测）
const passwordStrength = usePasswordStrength(() => values.password);
// 防双击
const submitLock = useButtonLock();
// 协议版本快照
const agreementVersion = useAgreementVersion();

// 图形验证码流程
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

const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError(t('register.email_duplicate'));
    return;
  }
  openRegCaptcha('register');
};
const docType = ref<'service' | 'privacy' | null>(null);

const handleNextStep = async () => {
  const resUser = await validateField('username');
  const resEmail = await validateField('email');
  const resCode = await validateField('code');
  if (resUser.valid && resEmail.valid && resCode.valid && !isEmailDuplicate.value) {
    step.value = 2;
  }
};

/**
 * 注册后回跳（OAuth 同源白名单，防开放重定向）
 * 优先用 ctx.redirectUri（OAuth 标准字段，iframe 父应用必传）
 * fallback ctx.redirect（兼容旧字段名）
 * 非法回跳降级到 /mini-login 并保留 OAuth 上下文（防"应用标识缺失"）
 */
function safeRedirect(): string {
  const r = ctx.redirectUri || ctx.redirect;
  if (r && r.startsWith('/') && !r.startsWith('//') && !r.includes('://')) {
    return r; // 同源相对路径
  }
  // fallback：从当前 route 重新拼 OAuth 上下文跳 /mini-login（保 appName 不丢）
  // router-link 也用此函数（line 298）
  return buildMiniLoginUrl();
}

/**
 * 拼 /mini-login URL，保留当前路由的 OAuth 上下文
 * 给 safeRedirect 兜底 + footer 的"立即登录"链接复用
 */
function buildMiniLoginUrl(): string {
  const preservedQuery: Record<string, string> = {};
  for (const k of ['appName', 'client_id', 'scope', 'state', 'redirect_uri', 'lang']) {
    const v = route.query[k];
    if (typeof v === 'string') preservedQuery[k] = v;
  }
  preservedQuery.from = 'register';
  const queryStr = new URLSearchParams(preservedQuery).toString();
  return `/mini-login${queryStr ? '?' + queryStr : ''}`;
}

const handleRegister = handleSubmit(async () => {
  if (!agreed.value || isEmailDuplicate.value) return;
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
      // 协议版本快照 + OAuth appName + invite
      agreementVersion: captureAgreementVersion(agreementVersion),
      invite: ctx.invite || undefined,
      appName: ctx.appName,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    showSuccess(t('register.success'));
    // OAuth 场景：跳回原应用；否则跳 mini-login
    router.push(safeRedirect());
  } catch (err: any) {
    showError(err?.message || t('register.register_failed'));
  } finally {
    submitLock.unlock();
  }
});
</script>

<template>
  <AuthContainer
    :appName="ctx.appName"
    :isMobile="appConfig.isMobile"
    :styleType="appConfig.styleType"
    :showQrSwitcher="false"
  >
    <!-- 左侧品牌 slot（窄屏自动隐藏，宽屏显示） -->
    <template #branding>
      <div class="mreg-brand-logo">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2 class="mreg-brand-title">
        {{ t('register.brand_title') }}<br />{{ t('register.brand_title_br') }}
      </h2>
      <p class="mreg-brand-desc">{{ t('register.brand_desc') }}</p>
      <ul class="mreg-brand-features">
        <li><span class="mreg-check"></span>{{ t('register.brand_feature_1') }}</li>
        <li><span class="mreg-check"></span>{{ t('register.brand_feature_2') }}</li>
        <li><span class="mreg-check"></span>{{ t('register.brand_feature_3') }}</li>
      </ul>
      <!-- 立即登录（OAuth 场景跳转回原应用） -->
      <router-link
        v-if="ctx.redirectUri || ctx.redirect"
        :to="{ path: '/mini-login', query: { ...route.query, from: 'register' } }"
        class="mreg-brand-signin"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        {{ t('register.signin_link') }}
      </router-link>
    </template>

    <!-- 顶部标题 slot -->
    <template #header>
      <div class="mreg-head">
        <div class="mreg-head-top">
          <h2 class="mreg-title">
            {{ ctx.appName !== 'Enterprise SSO' ? `${ctx.appName} · ` : '' }}{{ t('register.title') }}
          </h2>
          <div class="mreg-step-dots">
            <span class="mreg-step-dot" :class="step === 1 ? 'mreg-step-active' : ''"></span>
            <span class="mreg-step-dot" :class="step === 2 ? 'mreg-step-active' : ''"></span>
          </div>
        </div>
        <p class="mreg-sub">{{ step === 1 ? t('register.sub_step1') : t('register.sub_step2') }}</p>
      </div>
    </template>

    <!-- 主表单（默认 slot） -->
    <form @submit.prevent="step === 1 ? handleNextStep() : handleRegister()" class="mreg-form">
      <!-- 步骤 1：账号信息 -->
      <div v-if="step === 1" class="mreg-step-box">
        <div class="mreg-cell">
          <div class="mreg-field" :class="{ 'is-error': errors.username }">
            <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <input v-model="username" v-bind="usernameProps" type="text" :placeholder="t('register.username')" class="mreg-input" />
          </div>
          <div class="mreg-err">{{ errors.username }}</div>
        </div>

        <div class="mreg-cell">
          <div class="mreg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
            <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" :placeholder="t('register.email')" class="mreg-input" />
          </div>
          <div class="mreg-err">{{ isEmailDuplicate ? t('register.email_duplicate') : errors.email }}</div>
        </div>

        <div class="mreg-cell">
          <div class="mreg-field" :class="{ 'is-error': errors.code }">
            <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <input v-model="code" v-bind="codeProps" type="text" :placeholder="t('register.code')" class="mreg-input" />
            <button type="button" @click="sendCode" :disabled="isCountingDown || submitLock.locked.value" class="mreg-code-btn">
              {{ isCountingDown ? `${countdown}s` : t('register.get_code') }}
            </button>
          </div>
          <div class="mreg-err">{{ errors.code }}</div>
        </div>

        <button type="button" @click="handleNextStep" :disabled="submitLock.locked.value" class="mreg-submit">
          {{ t('register.next') }}
        </button>
      </div>

      <!-- 步骤 2：密码 + 协议 -->
      <div v-else class="mreg-step-box">
        <div class="mreg-cell">
          <div class="mreg-field" :class="{ 'is-error': errors.password }">
            <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <input v-model="password" v-bind="passwordProps" type="password" :placeholder="t('register.password')" class="mreg-input" />
          </div>
          <div class="mreg-err">{{ errors.password }}</div>
        </div>

        <!-- 密码强度条 -->
        <div v-if="values.password" class="mreg-pwd-strength" :data-level="passwordStrength.level">
          <div class="mreg-pwd-bar" :style="{ width: passwordStrength.percent + '%', background: passwordStrength.color }"></div>
          <span class="mreg-pwd-text" :style="{ color: passwordStrength.color }">{{ passwordStrength.label }}</span>
        </div>

        <div class="mreg-cell">
          <div class="mreg-field" :class="{ 'is-error': errors.confirmPassword }">
            <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" :placeholder="t('register.confirm_password')" class="mreg-input" />
          </div>
          <div class="mreg-err">{{ errors.confirmPassword }}</div>
        </div>

        <!-- 协议勾选 -->
        <div class="mreg-cell pt-1">
          <label class="mreg-agree">
            <input type="checkbox" v-model="agreed" class="hidden" />
            <span class="mreg-checkbox" :class="{ checked: agreed }">
              <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="text-xs text-slate-500">
              {{ t('register.agree_prefix') }}
              <span @click.stop.prevent="docType = 'service'" class="mreg-highlight-link">{{ t('register.agree_link_service') }}</span>
              {{ t('register.agree_and') }}
              <span @click.stop.prevent="docType = 'privacy'" class="mreg-highlight-link">{{ t('register.agree_link_privacy') }}</span>
            </span>
          </label>
        </div>

        <!-- 提交/上一步按钮组（防双击禁用） -->
        <div class="flex gap-2.5 mt-2">
          <button type="button" @click="step = 1" :disabled="submitLock.locked.value" class="mreg-back-btn">
            {{ t('register.prev') }}
          </button>
          <button
            type="submit"
            :disabled="!agreed || submitLock.locked.value"
            :class="['mreg-submit flex-1', { 'opacity-50 cursor-not-allowed': !agreed || submitLock.locked.value }]"
          >
            {{ t('register.submit') }}
          </button>
        </div>
      </div>
    </form>

    <!-- 底部"已有账号？立即登录"（无 OAuth 上下文时也显示） -->
    <template #footer>
      <div class="mreg-footer">
        <span class="text-xs text-slate-400">{{ t('register.signin_hint') }}</span>
        <router-link :to="safeRedirect()" class="mreg-highlight-link font-medium text-xs">
          {{ t('register.signin_link') }}
        </router-link>
      </div>
    </template>
  </AuthContainer>

  <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

  <AgreementModals v-model:type="docType" />
  <MessageToast />
</template>

<style scoped>


.mreg-form { display: flex; flex-direction: column; }
.mreg-step-box { display: flex; flex-direction: column; gap: 2px; }
.mreg-cell { display: flex; flex-direction: column; }

.mreg-field {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s;
}
:global(.dark) .mreg-field { background: #0f172a; border-color: #1e293b; }
.mreg-field:focus-within {
  background: #fff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
:global(.dark) .mreg-field:focus-within { background: #0f172a; }
.mreg-field.is-error { border-color: #ef4444; background: #fef2f2; }
:global(.dark) .mreg-field.is-error { background: rgba(239, 68, 68, 0.1); }

.mreg-icon { color: #94a3b8; flex-shrink: 0; }
:global(.dark) .mreg-icon { color: #64748b; }

.mreg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: #0f172a;
  height: 100%;
  min-width: 0;
}
:global(.dark) .mreg-input { color: #f1f5f9; }
.mreg-input::placeholder { color: #94a3b8; }

.mreg-code-btn {
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
:global(.dark) .mreg-code-btn { border-left-color: #334155; }
.mreg-code-btn:hover:not(:disabled) { color: #1d4ed8; }
.mreg-code-btn:disabled { color: #94a3b8 !important; cursor: not-allowed; }

.mreg-err {
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

/* 密码强度条 */
.mreg-pwd-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 18px;
  margin-top: 4px;
  padding-left: 4px;
}
.mreg-pwd-bar {
  height: 4px;
  flex: 1;
  border-radius: 2px;
  transition: width 0.3s, background 0.3s;
}
.mreg-pwd-text { font-size: 11px; font-weight: 600; flex-shrink: 0; }

.mreg-submit {
  height: 44px;
  width: 100%;
  margin-top: 4px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  border: none;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  cursor: pointer;
  transition: all 0.2s;
}
.mreg-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35); }
.mreg-submit:disabled, .mreg-submit.opacity-50 { opacity: 0.5; cursor: not-allowed; transform: none; }

.mreg-back-btn {
  height: 44px;
  padding: 0 16px;
  margin-top: 4px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
:global(.dark) .mreg-back-btn { background: #1e293b; color: #94a3b8; }
.mreg-back-btn:hover:not(:disabled) { background: #e2e8f0; }
.mreg-back-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mreg-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.mreg-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: all 0.2s;
}
:global(.dark) .mreg-checkbox { border-color: #475569; }
.mreg-checkbox.checked { background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%); border-color: #2563eb; }
.mreg-highlight-link { color: #2563eb; cursor: pointer; transition: color 0.2s; }
.mreg-highlight-link:hover { color: #1d4ed8; text-decoration: underline; }

.mreg-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}
:global(.dark) .mreg-footer { border-top-color: #1e293b; }
</style>
