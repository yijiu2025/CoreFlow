<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRouter, useRoute } from 'vue-router';
import { inject, ref, onMounted, onUnmounted } from 'vue';
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
import PasswordInput from '@/components/common/PasswordInput.vue';
import PasswordStrength from '@/components/common/PasswordStrength.vue';
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

onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
});
onUnmounted(() => dispose());

// 路由（template 中 :to / :appName / :is-mobile / buildMiniLoginUrl 都用 route，必须先声明）
const router = useRouter();
const route = useRoute();

// 分步状态：1 - 账号与验证码，2 - 密码与协议
const step = ref<1 | 2>(1);

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

const agreed = ref(false);
const isEmailDuplicate = ref(false);
const isEmailChecking = ref(false); // 邮箱去重检查中：防 blur 后未返回就点下一步的竞态
const COUNTDOWN_SECONDS = 60;
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(COUNTDOWN_SECONDS);
// 防双击
const submitLock = useButtonLock();
// 协议版本快照
const agreementVersion = useAgreementVersion();

// 图形验证码流程
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(
  () => startCountdown(COUNTDOWN_SECONDS)
);

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

const checkEmail = async () => {
  if (!values.email || errors.value.email) {
    isEmailDuplicate.value = false;
    return;
  }
  isEmailChecking.value = true;
  try {
    // request.ts 拦截器已解包 AxiosResponse.data，类型断言拿 isDuplicate 字段
    const res = (await authApi.checkEmail(values.email)) as unknown as { isDuplicate?: boolean };
    isEmailDuplicate.value = !!res?.isDuplicate;
  } catch (err) {
    // 网络/接口失败：保守按"未占用"处理避免阻塞流程，但记录日志便于排查
    console.warn('[MiniRegister] checkEmail failed', err);
    isEmailDuplicate.value = false;
  } finally {
    isEmailChecking.value = false;
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
  // 防竞态：邮箱去重检查未完成时点下一步，直接拒绝（避免检查返回后才知道邮箱被占）
  if (isEmailChecking.value) return;
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
  // router-link 也用此函数（footer 模板，#footer slot）
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 解构排除 confirmPassword，rest 模式合法
  const { confirmPassword, ...submitData } = values;
  // rsaEncrypt / getCaptchaToken 非 axios 操作，单独加超时（CLAUDE.md 铁律）
  const encryptedPassword = await withTimeout(rsaEncrypt(submitData.password!), 30_000, 'rsaEncrypt');
  const recaptchaToken = recaptchaEnabled
    ? await withTimeout(getCaptchaToken(), 30_000, 'getCaptchaToken')
    : null;
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
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('register.register_failed'));
  } finally {
    submitLock.unlock();
  }
});
</script>

<template>
  <div class="w-full h-full flex flex-col justify-center overflow-hidden">
    <AuthContainer :appName="(route.query.appName as string) || 'Enterprise SSO'" :is-mobile="route.query.isMobile === 'true'">
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
                <polyline points="22,6 12,13 2,6"></polyline>
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
              <input v-model="code" v-bind="codeProps" type="text" :placeholder="t('register.code')" class="mreg-input" />
              <button type="button" @click="sendCode" :disabled="isCountingDown" class="mreg-code-btn">
                {{ isCountingDown ? t('register.code_countdown', { countdown }) : t('register.get_code') }}
              </button>
            </div>
            <div class="mreg-err">{{ errors.code }}</div>
          </div>

          <!-- 下一步按钮 -->
          <button type="button" @click="handleNextStep" class="mreg-submit">{{ t('register.next') }}</button>
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

      <!-- 底部返回登录（移至 #footer 插槽，与 mini-login 结构对齐：
           按钮↔底栏间距由 AuthContainer 的 mt-6 + justify-between 统一控制） -->
      <template #footer>
        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-slate-400">{{ t('register.signin_hint') }}</span>
          <p class="mreg-signin">
            <router-link :to="{ path: '/mini-login', query: route.query }" class="mreg-highlight-link font-medium text-xs">
              {{ t('register.signin_link') }}
            </router-link>
          </p>
        </div>
      </template>
    </AuthContainer>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

    <!-- 服务协议 / 隐私政策 弹窗（统一组件） -->
    <AgreementModals v-model:type="docType" />

    <!-- 错误/成功提示 toast -->
    <MessageToast />
  </div>
</template>

<style scoped>
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

/* 完美匹配登录页输入框尺寸 (44px) 与极简边框 */
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

/* 聚焦颜色匹配主蓝 */
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

/* 错误占位，防止抖动 */
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

/* 密码强度条（输入时实时显示，3 级配色：红/黄/绿） */
.mreg-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 14px;
  margin-top: 4px;
  padding: 0 4px;
}

.mreg-strength-bar {
  flex: 1;
  height: 4px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}

:global(.dark) .mreg-strength-bar {
  background: #1e293b;
}

.mreg-strength-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.25s ease, background 0.25s ease;
}

.mreg-strength-label {
  font-size: 11px;
  font-weight: 600;
  min-width: 24px;
  text-align: right;
  transition: color 0.25s ease;
}

/* 重点修改：完全对齐图1登录页的蓝紫渐变大按钮 */
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

/* 复选框选中使用蓝紫渐变 */
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

.mreg-signin {
  margin: 0;
  font-size: 12px;
}
</style>