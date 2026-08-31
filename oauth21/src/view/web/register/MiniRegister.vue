<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRouter, useRoute } from 'vue-router';
import { inject, ref, onMounted, onUnmounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';

// ================================
// 组件导入
// ================================
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import PasswordInput from '@/components/common/PasswordInput.vue';
import PasswordStrength from '@/components/common/PasswordStrength.vue';

// ================================
// Composables 导入
// ================================
import { useCaptcha } from '@/composables/useCaptcha';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useButtonLock } from '@/composables/useButtonLock';
import { useAgreementVersion, captureAgreementVersion } from '@/composables/useAgreementVersion';

// ================================
// 常量定义
// ================================
const COUNTDOWN_SECONDS = 60; // 验证码倒计时秒数
const RECAPTCHA_TIMEOUT = 30_000; // 获取验证码超时时间（毫秒）
const RSA_ENCRYPT_TIMEOUT = 30_000; // RSA 加密超时时间（毫秒）

// ================================
// Composables 初始化
// ================================
const { isEnabled: recaptchaEnabled, load: loadCaptcha, getToken: getCaptchaToken, dispose } = useCaptcha('register');
const { error: showError, success: showSuccess } = useMessage();
const { t, locale } = useI18n();
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(COUNTDOWN_SECONDS);
const submitLock = useButtonLock();
const agreementVersion = useAgreementVersion();

// ================================
// 类型定义
// ================================
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
  isMobile?: boolean;
  query?: Record<string, string>;
}

// ================================
// 路由和上下文
// ================================
const router = useRouter();
const route = useRoute();

// 获取注册上下文
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

// 设置语言
if (ctx.lang) locale.value = ctx.lang;

// 模板使用的变量（不直接读取 route.query）
const templateAppName = ctx.appName || 'Enterprise SSO';
const templateIsMobile = (ctx.isMobile === true) || (ctx.query?.isMobile === 'true');

// 构建 router-link 透传给 /mini-login 的 query 参数
const oauthQuery = computed(() => {
  const query: Record<string, string> = {};

  // 优先从 ctx.query 获取（父组件注入的）
  if (ctx.query) {
    Object.assign(query, ctx.query);
  }

  // 兜底：从当前 route.query 提取 OAuth 相关参数
  for (const key of ['appName', 'client_id', 'scope', 'state', 'redirect_uri', 'lang', 'isMobile', 'from']) {
    const value = route.query[key];
    if (typeof value === 'string' && !query[key]) {
      query[key] = value;
    }
  }

  // 标记来源为注册页
  if (!query.from) {
    query.from = 'register';
  }

  return query;
});

// ================================
// 分步状态管理
// ================================
const step = ref<1 | 2>(1);

// ================================
// 表单验证
// ================================
const registerSchema = z
  .object({
    username: z
      .string({ required_error: t('register.username_min') })
      .min(5, t('register.username_min'))
      .regex(/^[A-Za-z0-9_]+$/, t('register.username_pattern')),
    email: z.string({ required_error: t('register.email') }).email(t('register.email_invalid')),
    code: z
      .string({ required_error: t('register.code') })
      .regex(/^\d{6}$/, t('register.code_min')),
    password: z
      .string({ required_error: t('register.password_min') })
      .min(8, t('register.password_min'))
      .max(128, t('register.password_max'))
      .regex(/^(?=.*[a-z])/, t('register.password_lowercase'))
      .regex(/^(?=.*[A-Z])/, t('register.password_uppercase'))
      .regex(/^(?=.*\d)/, t('register.password_digit')),
    confirmPassword: z.string({ required_error: t('register.confirm_required') }).min(1, t('register.confirm_required'))
  })
  .refine((data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword, {
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

// ================================
// 验证码和状态管理
// ================================
const agreed = ref(false);
const isEmailDuplicate = ref(false);
const isEmailChecking = ref(false); // 邮箱去重检查中：防 blur 后未返回就点下一步的竞态
const codeSent = ref(false); // 验证码是否已成功发送（前端拦截：未发码前 input 和下一步按钮都禁用）
const docType = ref<'service' | 'privacy' | null>(null);

// 图形验证码流程
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(
  () => {
    codeSent.value = true;
    startCountdown(COUNTDOWN_SECONDS);
  }
);

// ================================
// 工具函数
// ================================
/**
 * 异步操作超时保护（CLAUDE.md 铁律：所有可能阻塞的异步操作设置超时兜底）
 * 超时统一抛带 op 名的 Error，便于上层 try/catch 区分。
 */
function withTimeout<T>(p: Promise<T>, ms: number, op: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${op} timeout (${ms}ms)`)), ms))
  ]);
}

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

// ================================
// 业务逻辑函数
// ================================

/**
 * 检查邮箱是否已被注册
 */
const checkEmail = async () => {
  if (!values.email || errors.value.email) {
    isEmailDuplicate.value = false;
    return;
  }
  isEmailChecking.value = true;
  try {
    const res = (await authApi.checkEmail(values.email)) as unknown as { isDuplicate?: boolean };
    isEmailDuplicate.value = !!res?.isDuplicate;
  } catch (err) {
    console.warn('[MiniRegister] checkEmail failed', err);
    isEmailDuplicate.value = false;
  } finally {
    isEmailChecking.value = false;
  }
};

/**
 * 发送验证码
 */
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError(t('register.email_duplicate'));
    return;
  }
  openRegCaptcha('register');
};

/**
 * 处理下一步按钮点击
 */
const handleNextStep = async () => {
  if (isEmailChecking.value) return;
  const resUser = await validateField('username');
  const resEmail = await validateField('email');
  const resCode = await validateField('code');
  if (resUser.valid && resEmail.valid && resCode.valid && !isEmailDuplicate.value) {
    step.value = 2;
  }
};

/**
 * 处理注册表单提交
 */
const handleRegister = handleSubmit(async () => {
  if (!agreed.value || isEmailDuplicate.value) return;
  if (submitLock.locked.value) return;
  submitLock.lock();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { confirmPassword, ...submitData } = values;

  try {
    const encryptedPassword = await withTimeout(rsaEncrypt(submitData.password!), RSA_ENCRYPT_TIMEOUT, 'rsaEncrypt');
    const recaptchaToken = recaptchaEnabled
      ? await withTimeout(getCaptchaToken(), RECAPTCHA_TIMEOUT, 'getCaptchaToken')
      : null;

    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      agreementVersion: captureAgreementVersion(agreementVersion),
      invite: ctx.invite || undefined,
      appName: ctx.appName,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });

    showSuccess(t('register.success'));
    router.push(safeRedirect());
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('register.register_failed'));
  } finally {
    submitLock.unlock();
  }
});

// ================================
// 生命周期钩子
// ================================
onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
});

onUnmounted(() => dispose());
</script>

<template>
  <div class="w-full h-full flex flex-col justify-center overflow-hidden">
    <AuthContainer :appName="templateAppName" :is-mobile="templateIsMobile">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold dark:text-white leading-tight">{{ t('register.title') }}</h2>
            <p class="text-xs text-slate-400 mt-1">
              {{ step === 1 ? t('register.sub_step1') : t('register.sub_step2') }}
            </p>
          </div>
          <!-- 步骤指示小圆点 -->
          <div class="flex items-center gap-1.5 mr-2">
            <span class="h-2 rounded-full transition-all duration-300" :class="step === 1 ? 'bg-[#2563eb] w-4' : 'w-2 bg-slate-200 dark:bg-slate-700'"></span>
            <span class="h-2 rounded-full transition-all duration-300" :class="step === 2 ? 'bg-[#2563eb] w-4' : 'w-2 bg-slate-200 dark:bg-slate-700'"></span>
          </div>
        </div>
      </template>

      <form @submit.prevent="step === 1 ? handleNextStep() : handleRegister()" class="mreg-form">
        <!-- 第一步：基本账号信息 -->
        <div v-if="step === 1" class="mreg-step-box">
          <!-- 用户名 -->
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

          <!-- 邮箱 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12 13 2 6"></polyline>
              </svg>
              <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" :placeholder="t('register.email')" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ isEmailDuplicate ? t('register.email_duplicate') : errors.email }}</div>
          </div>

          <!-- 验证码 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.code }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input
                v-model="code"
                v-bind="codeProps"
                type="text"
                :placeholder="t('register.code')"
                :disabled="!codeSent"
                class="mreg-input disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button type="button" @click="sendCode" :disabled="isCountingDown" class="mreg-code-btn">
                {{ isCountingDown ? t('register.code_countdown', { countdown }) : t('register.get_code') }}
              </button>
            </div>
            <div class="mreg-err">{{ errors.code }}</div>
          </div>

          <!-- 下一步按钮（未发验证码前禁用） -->
          <button
            type="button"
            @click="handleNextStep"
            :disabled="!codeSent"
            class="mreg-submit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ t('register.next') }}
          </button>
        </div>

        <!-- 第二步：密码与协议 -->
        <div v-else class="mreg-step-box">
          <!-- 登录密码 -->
          <div class="mreg-cell">
            <PasswordInput
              v-model="password"
              :has-error="!!errors.password"
              :placeholder="t('register.password')"
            />
            <div class="mreg-err">{{ errors.password }}</div>
            <!-- 密码强度条 + 悬浮窗规则列表 -->
            <PasswordStrength :password="values.password" />
          </div>

          <!-- 确认密码 -->
          <div class="mreg-cell">
            <PasswordInput
              v-model="confirmPassword"
              :has-error="!!errors.confirmPassword"
              :placeholder="t('register.confirm_password')"
            />
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
                {{ t('register.agree_prefix') }}<span @click.stop.prevent="docType = 'service'" class="mreg-highlight-link">{{ t('register.agree_link_service') }}</span>{{ t('register.agree_and') }}<span @click.stop.prevent="docType = 'privacy'" class="mreg-highlight-link">{{ t('register.agree_link_privacy') }}</span>
              </span>
            </label>
          </div>

          <!-- 提交/上一步按钮组 -->
          <div class="flex gap-2.5 mt-2">
            <button type="button" @click="step = 1" class="mreg-back-btn">{{ t('register.prev') }}</button>
            <button type="submit" class="mreg-submit flex-1" :disabled="!agreed" :class="{ 'opacity-50 cursor-not-allowed': !agreed }">
              {{ t('register.submit') }}
            </button>
          </div>
        </div>
      </form>

      <!-- 底部返回登录 -->
      <template #footer>
        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-slate-400">{{ t('register.signin_hint') }}</span>
          <p class="mreg-signin">
            <router-link :to="{ path: '/mini-login', query: oauthQuery }" class="mreg-highlight-link font-medium text-xs">
              {{ t('register.signin_link') }}
            </router-link>
          </p>
        </div>
      </template>
    </AuthContainer>

    <!-- 图形验证码弹窗 -->
    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

    <!-- 服务协议 / 隐私政策 弹窗 -->
    <AgreementModals v-model:type="docType" />

    <!-- 错误/成功提示 toast -->
    <MessageToast />
  </div>
</template>

<style scoped>
/* ================================
   表单布局
   ================================ */
.mreg-form {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}

.mreg-step-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mreg-cell {
  display: flex;
  flex-direction: column;
}

/* ================================
   输入框样式
   ================================ */
.mreg-field {
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

:global(.dark) .mreg-field {
  background: #0f172a;
  border-color: #1e293b;
}

.mreg-field:focus-within {
  background: #fff;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

:global(.dark) .mreg-field:focus-within {
  background: #0f172a;
}

.mreg-field.is-error {
  border-color: #ef4444;
  background: #fef2f2;
}

:global(.dark) .mreg-field.is-error {
  background: rgba(239, 68, 68, 0.1);
}

.mreg-icon {
  color: #94a3b8;
  flex-shrink: 0;
}

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

:global(.dark) .mreg-input {
  color: #f1f5f9;
}

.mreg-input::placeholder {
  color: #94a3b8;
}

/* ================================
   验证码按钮样式
   ================================ */
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

.mreg-code-btn:hover {
  color: #1d4ed8;
}

:global(.dark) .mreg-code-btn {
  border-left-color: #334155;
}

.mreg-code-btn:disabled {
  color: #94a3b8 !important;
  cursor: not-allowed;
}

/* ================================
   错误提示样式
   ================================ */
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

/* ================================
   按钮样式
   ================================ */
.mreg-submit {
  height: 44px;
  width: 100%;
  margin-top: 4px;
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

.mreg-submit:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.mreg-submit:active:not(:disabled) {
  transform: translateY(0);
}

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

.mreg-back-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

/* ================================
   协议勾选样式
   ================================ */
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

:global(.dark) .mreg-checkbox {
  border-color: #475569;
}

.mreg-checkbox.checked {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  border-color: #2563eb;
}

.mreg-highlight-link {
  color: #2563eb;
  cursor: pointer;
  transition: color 0.2s;
}

.mreg-highlight-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

/* ================================
   底部链接样式
   ================================ */
.mreg-signin {
  margin: 0;
  font-size: 12px;
}
</style>