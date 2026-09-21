<script setup lang="ts">
/**
 * 移动端全屏注册（/m/register）
 *
 * 路由：mobileRoutes 全屏直达；同时是 /register 在窄屏 / 真机下的自动形态
 * （分发逻辑见 view/web/register/index.vue）
 *
 * 视觉：与手机端登录页（view/app/login/index.vue）共用同一套样式体系
 * —— assets/styles/mobile-auth.scss 的 mauth-* 类。本组件**不再自带样式块**，
 * 避免两套 scoped 样式各自漂移（历史上：页面底色 #fafafa vs #f8fafc、输入框 14px vs 16px、
 * 头部有无安全区、页面能否纵向滚动 —— 都是"两页看起来不一样"的来源）。
 *
 * 表单：三步堆栈（1 用户名+邮箱码 → 2 密码 → 3 协议+提交），安卓 Activity 式 slide 切换
 *
 * @author yijiu2025
 */
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useButtonLock } from '@/composables/useButtonLock';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useCaptcha } from '@/composables/useCaptcha';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

// 语言跟随父应用透传（与手机端登录页同一口径）
watch(
  () => route.query.lang as string,
  newLang => {
    if (newLang) locale.value = newLang;
  },
  { immediate: true }
);

const { isEnabled: recaptchaEnabled, load: loadCaptcha, getToken: getCaptchaToken, dispose } = useCaptcha('register');
const { error: showError, success: showSuccess } = useMessage();
onMounted(() => {
  if (recaptchaEnabled) loadCaptcha();
});
onUnmounted(() => dispose());

// 分步堆栈（安卓 Activity 风格：1 账号+验证码 → 2 密码 → 3 协议+提交）
const step = ref<1 | 2 | 3>(1);
// 页面切换方向：next 前进 slide-left / back 后退 slide-right
const transitionName = ref('mauth-slide-next');

// 分步副标题（显式映射，避免动态拼 key 漏键时把 key 名显示给用户）
const stepSub = computed(() => {
  if (step.value === 1) return t('register.mobile_sub_1');
  if (step.value === 2) return t('register.mobile_sub_2');
  return t('register.mobile_sub_3');
});

/**
 * 注册表单校验
 *
 * ⚠️ 字段必须是 username：后端 userDao.createUser 只读 request.body.username，
 * 拿不到就**静默回退成 email**（见 src/app/user/dao/user.js:55）。
 * 本页历史上叫 nickname，用户填的用户名根本没生效、账号实际以邮箱当用户名。
 */
const registerSchema = z
  .object({
    username: z
      .string({ required_error: t('register.username_min') })
      .min(5, t('register.username_min'))
      .regex(/^[A-Za-z0-9_]+$/, t('register.username_pattern')),
    email: z.string({ required_error: t('register.email_invalid') }).email(t('register.email_invalid')),
    code: z
      .string({ required_error: t('register.code_min') })
      .regex(/^\d{6}$/, t('register.code_min')),
    password: z
      .string({ required_error: t('register.password_min') })
      .min(8, t('register.password_min'))
      .max(128, t('register.password_max'))
      .regex(/^(?=.*[a-z])/, t('register.password_lowercase'))
      .regex(/^(?=.*[A-Z])/, t('register.password_uppercase'))
      .regex(/^(?=.*\d)/, t('register.password_digit')),
    confirmPassword: z
      .string({ required_error: t('register.confirm_required') })
      .min(1, t('register.confirm_required'))
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
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

const agreed = ref(false);
const isEmailDuplicate = ref(false);
const isEmailChecking = ref(false); // 邮箱查重请求进行中：防 blur 后未返回就点下一步的竞态
const codeSent = ref(false); // 邮箱码是否已发出：未发出前验证码框与"下一步"都禁用
// 密码可见性（移动端无 hover，必须给显式开关，与手机端登录页一致）
const showPwd = ref(false);
const showConfirmPwd = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
// 防双击：提交期间禁用按钮（避免重复注册请求）
const submitLock = useButtonLock();
const submitting = computed(() => submitLock.locked.value);
// 图形验证码流程：弹窗 → 通过 → 拿 captchaKey + 标记已发码 + 启动倒计时
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(() => {
  codeSent.value = true;
  startCountdown(60);
});
const docType = ref<'service' | 'privacy' | null>(null);

// 邮箱查重：发码前校验，已注册则拦截
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
  } catch {
    // 查重失败不阻断注册流程（后端注册时有唯一约束兜底）
    isEmailDuplicate.value = false;
  } finally {
    isEmailChecking.value = false;
  }
};

// 发送验证码前先查重：邮箱已注册则拦截
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError(t('register.email_duplicate'));
    return;
  }
  openRegCaptcha('register');
};

// 前进到下一步（校验当前步骤字段通过）
const handleNextStep = async (target: 2 | 3) => {
  let ok = true;
  if (target === 2) {
    if (isEmailChecking.value) return; // 查重未返回，先不放行（否则重复邮箱能溜过去）
    const r1 = await validateField('username');
    const r2 = await validateField('email');
    const r3 = await validateField('code');
    ok = r1.valid && r2.valid && r3.valid && !isEmailDuplicate.value;
  } else if (target === 3) {
    const r4 = await validateField('password');
    const r5 = await validateField('confirmPassword');
    ok = r4.valid && r5.valid;
  }
  if (ok) {
    transitionName.value = 'mauth-slide-next';
    step.value = target;
  }
};

// 去登录页（透传 OAuth 上下文，登录后才能回到授权页）
const goLogin = () => {
  const query: Record<string, string> = {};
  for (const key of ['appName', 'client_id', 'redirect_uri', 'scope', 'state', 'lang', 'redirect']) {
    const v = route.query[key];
    if (typeof v === 'string') query[key] = v;
  }
  router.push({ path: '/m/login', query });
};

// 后退到上一步（安卓返回键风格；第 1 步再后退即回登录页）
const handleBack = () => {
  if (step.value === 1) {
    goLogin();
    return;
  }
  transitionName.value = 'mauth-slide-prev';
  step.value = (step.value - 1) as 1 | 2 | 3;
};

const handleRegister = handleSubmit(async data => {
  if (!agreed.value) {
    showError(t('register.agree_required'));
    return;
  }
  if (isEmailChecking.value) return; // 查重未返回前不放行
  if (submitLock.locked.value) return; // 防双击
  submitLock.lock();
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 解构排除 confirmPassword，rest 模式合法
    const { confirmPassword, ...submitData } = data;
    const encryptedPassword = await rsaEncrypt(submitData.password);
    const recaptchaToken = recaptchaEnabled ? await getCaptchaToken() : null;
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    showSuccess(t('register.success'));
    router.push('/m/login');
  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : t('register.register_failed'));
  } finally {
    submitLock.unlock();
  }
});
</script>

<template>
  <!-- 移动端全屏注册（与手机端登录页共用 mauth-* 样式体系） -->
  <div class="mauth-page">
    <!-- 顶部 Header：返回 + 标题 + 步骤副标题 + 进度条 -->
    <header class="mauth-header">
      <button class="mauth-back-btn" :aria-label="t('register.prev')" @click="handleBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div class="mauth-header-content">
        <div class="mauth-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 class="mauth-title">{{ t('register.title') }}</h1>
        <p class="mauth-sub">{{ stepSub }}</p>
      </div>
      <!-- 步骤进度条 -->
      <div class="mauth-progress">
        <div class="mauth-progress-bar" :style="{ width: `${(step / 3) * 100}%` }"></div>
      </div>
    </header>

    <!-- 分步表单（堆栈进退，slide 动画） -->
    <main class="mauth-body">
      <transition :name="transitionName" mode="out-in">
        <!-- 步骤 1：用户名 + 邮箱 + 验证码 -->
        <section v-if="step === 1" key="1" class="mauth-step">
          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.username }">
              <svg class="mauth-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <input
                v-model="username"
                v-bind="usernameProps"
                type="text"
                autocomplete="username"
                :placeholder="t('register.username')"
                class="mauth-input"
              />
            </div>
            <div class="mauth-err">{{ errors.username }}</div>
          </div>

          <div class="mauth-cell">
            <div class="mauth-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
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
                :placeholder="t('register.email')"
                class="mauth-input"
                @blur="checkEmail"
              />
            </div>
            <div class="mauth-err">{{ isEmailDuplicate ? t('register.email_duplicate') : errors.email }}</div>
          </div>

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
                :placeholder="t('register.code')"
                :disabled="!codeSent"
                class="mauth-input"
              />
              <button type="button" @click="sendCode" :disabled="isCountingDown" class="mauth-code-btn">
                {{ isCountingDown ? t('register.code_countdown', { countdown }) : t('register.get_code') }}
              </button>
            </div>
            <div class="mauth-err">{{ errors.code }}</div>
          </div>

          <!-- 未发码前禁用：避免没收到码就往下走 -->
          <button type="button" class="mauth-next-btn" :disabled="!codeSent" @click="handleNextStep(2)">
            {{ t('register.next') }}
          </button>
        </section>

        <!-- 步骤 2：密码 -->
        <section v-else-if="step === 2" key="2" class="mauth-step">
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
                :placeholder="t('register.password')"
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
                :placeholder="t('register.confirm_password')"
                class="mauth-input"
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

          <button type="button" class="mauth-next-btn" @click="handleNextStep(3)">{{ t('register.next') }}</button>
        </section>

        <!-- 步骤 3：核对信息 + 协议 + 提交 -->
        <section v-else key="3" class="mauth-step">
          <div class="mauth-summary">
            <div class="mauth-summary-row"><span>{{ t('register.username') }}</span><strong>{{ values.username }}</strong></div>
            <div class="mauth-summary-row"><span>{{ t('register.email') }}</span><strong>{{ values.email }}</strong></div>
            <div class="mauth-summary-row"><span>{{ t('register.password_label') }}</span><strong>{{ t('register.summary_password_set') }}</strong></div>
          </div>

          <label class="mauth-agree">
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

          <button type="button" class="mauth-submit" :disabled="!agreed || submitting" @click="handleRegister">
            <span v-if="submitting" class="mauth-spinner"></span>
            {{ submitting ? t('register.submitting') : t('register.submit') }}
          </button>
        </section>
      </transition>

      <!-- 已有账号 → 回登录（透传 OAuth 上下文，登录后才能回到授权页） -->
      <div class="mauth-footer">
        <span>{{ t('register.signin_hint') }}</span>
        <button class="mauth-register-btn" @click="goLogin">{{ t('register.signin_link') }}</button>
      </div>
    </main>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />
    <AgreementModals v-model:type="docType" />
    <MessageToast />
  </div>
</template>
