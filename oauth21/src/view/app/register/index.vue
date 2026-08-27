<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useRecaptcha } from '@/composables/useRecaptcha';
import { onMounted, onUnmounted, ref } from 'vue';

const { isEnabled: recaptchaEnabled, loadRecaptcha, getRecaptchaToken, dispose } = useRecaptcha('register');
const { error: showError, success: showSuccess } = useMessage();
onMounted(() => {
  if (recaptchaEnabled) loadRecaptcha();
});
onUnmounted(() => dispose());

const router = useRouter();

// 分步堆栈（安卓 Activity 风格：1 账号+验证码 → 2 密码 → 3 协议+提交）
const step = ref<1 | 2 | 3>(1);
// 页面切换方向：next 前进 slide-left / back 后退 slide-right
const transitionName = ref('slide-next');

const registerSchema = z
  .object({
    nickname: z.string().min(2, '昵称至少2位'),
    email: z.string().email('邮箱格式不正确'),
    code: z.string().min(4, '验证码至少4位'),
    password: z
      .string({ required_error: '请输入密码' })
      .min(8, '密码至少8位')
      .max(128, '密码最多128位')
      .regex(/^(?=.*[a-z])/, '密码必须包含至少一个小写字母')
      .regex(/^(?=.*[A-Z])/, '密码必须包含至少一个大写字母')
      .regex(/^(?=.*\d)/, '密码必须包含至少一个数字'),
    confirmPassword: z.string({ required_error: '请确认密码' }).min(1, '请再次输入密码')
  })
  .refine((data: any) => data.password === data.confirmPassword, {
    message: '两次输入密码不一致',
    path: ['confirmPassword']
  });

const { values, errors, defineField, handleSubmit, validateField } = useForm({
  validationSchema: toTypedSchema(registerSchema)
});

const [nickname, nicknameProps] = defineField('nickname');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

const agreed = ref(false);
const isEmailDuplicate = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);
// 图形验证码流程：弹窗 → 通过 → 拿 captchaKey + 启动倒计时
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(
  () => startCountdown(60)
);
const docType = ref<'service' | 'privacy' | null>(null);

// 邮箱查重：发码前校验，已注册则拦截
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

// 发送验证码前先查重：邮箱已注册则拦截
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail();
  if (isEmailDuplicate.value) {
    showError('该邮箱已被注册，请直接登录');
    return;
  }
  openRegCaptcha('register');
};

// 前进到下一步（校验当前步骤字段通过）
const handleNextStep = async (target: 2 | 3) => {
  let ok = true;
  if (target === 2) {
    const r1 = await validateField('nickname');
    const r2 = await validateField('email');
    const r3 = await validateField('code');
    ok = r1.valid && r2.valid && r3.valid && !isEmailDuplicate.value;
  } else if (target === 3) {
    const r4 = await validateField('password');
    const r5 = await validateField('confirmPassword');
    ok = r4.valid && r5.valid;
  }
  if (ok) {
    transitionName.value = 'slide-next';
    step.value = target;
  }
};

// 后退到上一步（安卓返回键风格）
const handleBack = () => {
  if (step.value === 1) {
    router.push('/m/login');
    return;
  }
  transitionName.value = 'slide-prev';
  step.value = (step.value - 1) as 1 | 2 | 3;
};

const handleRegister = handleSubmit(async data => {
  if (!agreed.value) {
    showError('请阅读并同意协议');
    return;
  }
  try {
    const { confirmPassword, ...submitData } = data;
    const encryptedPassword = await rsaEncrypt(submitData.password);
    const recaptchaToken = recaptchaEnabled ? await getRecaptchaToken() : null;
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    showSuccess('注册成功，即将跳转登录');
    router.push('/m/login');
  } catch (err: any) {
    showError(err?.message || '注册失败，请稍后重试');
  }
});
</script>

<template>
  <!-- 移动端全屏注册（白灰 header + 分步堆栈 + slide 切换） -->
  <div class="mreg-page">
    <!-- 顶部 Header（渐变 + 返回按钮 + 步骤指示） -->
    <header class="mreg-header">
      <div class="mreg-header-bg"></div>
      <button class="mreg-back-btn" @click="handleBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div class="mreg-header-content">
        <div class="mreg-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 class="mreg-title">创建账户</h1>
        <p class="mreg-sub">步骤 {{ step }}/3：{{ step === 1 ? '填写账号与验证码' : step === 2 ? '设置安全密码' : '确认协议并完成' }}</p>
      </div>
      <!-- 步骤进度条 -->
      <div class="mreg-progress">
        <div class="mreg-progress-bar" :style="{ width: `${(step / 3) * 100}%` }"></div>
      </div>
    </header>

    <!-- 分步表单（堆栈进退，slide 动画） -->
    <main class="mreg-body">
      <transition :name="transitionName" mode="out-in">
        <!-- 步骤 1：账号 + 验证码 -->
        <section v-if="step === 1" key="1" class="mreg-step">
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.nickname }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <input v-model="nickname" v-bind="nicknameProps" type="text" placeholder="用户昵称" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ errors.nickname }}</div>
          </div>

          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
              <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="电子邮箱" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ isEmailDuplicate ? '邮箱已被注册' : errors.email }}</div>
          </div>

          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.code }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" class="mreg-input" />
              <button type="button" @click="sendCode" :disabled="isCountingDown" class="mreg-code-btn">
                {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
              </button>
            </div>
            <div class="mreg-err">{{ errors.code }}</div>
          </div>

          <button class="mreg-next-btn" @click="handleNextStep(2)">下一步</button>
        </section>

        <!-- 步骤 2：密码 -->
        <section v-else-if="step === 2" key="2" class="mreg-step">
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.password }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input v-model="password" v-bind="passwordProps" type="password" placeholder="设置密码（大写+小写+数字，8位以上）" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ errors.password }}</div>
          </div>

          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.confirmPassword }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="再次确认登录密码" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ errors.confirmPassword }}</div>
          </div>

          <button class="mreg-next-btn" @click="handleNextStep(3)">下一步</button>
        </section>

        <!-- 步骤 3：协议 + 提交 -->
        <section v-else key="3" class="mreg-step">
          <div class="mreg-summary">
            <div class="mreg-summary-row"><span>昵称</span><strong>{{ values.nickname }}</strong></div>
            <div class="mreg-summary-row"><span>邮箱</span><strong>{{ values.email }}</strong></div>
            <div class="mreg-summary-row"><span>密码</span><strong>已设置</strong></div>
          </div>

          <label class="mreg-agree">
            <input type="checkbox" v-model="agreed" class="hidden" />
            <span class="mreg-checkbox" :class="{ checked: agreed }">
              <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="mreg-agree-text">
              已阅读并同意
              <span @click.stop.prevent="docType = 'service'" class="mreg-link">《服务协议》</span>
              与
              <span @click.stop.prevent="docType = 'privacy'" class="mreg-link">《隐私政策》</span>
            </span>
          </label>

          <button class="mreg-submit" :disabled="!agreed" :class="{ 'opacity-50': !agreed }" @click="handleRegister">
            完成注册
          </button>
        </section>
      </transition>
    </main>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />
    <AgreementModals v-model:type="docType" />
    <MessageToast />
  </div>
</template>

<style scoped>
/* === 移动端全屏页面 === */
.mreg-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f8fafc;
  overflow: hidden;
}
:global(.dark) .mreg-page {
  background: #020617;
}

/* === 顶部 Header（白灰，非彩色渐变） === */
.mreg-header {
  position: relative;
  padding: 48px 24px 20px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
  color: #0f172a;
  overflow: hidden;
}
:global(.dark) .mreg-header {
  background: #0f172a;
  border-bottom-color: #1e293b;
  color: #f1f5f9;
}
.mreg-header-bg {
  display: none;
}
.mreg-back-btn {
  position: absolute;
  top: 48px;
  left: 16px;
  z-index: 2;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s;
}
:global(.dark) .mreg-back-btn {
  color: #94a3b8;
  background: #1e293b;
}
.mreg-back-btn:active {
  background: #e2e8f0;
}
:global(.dark) .mreg-back-btn:active {
  background: #334155;
}
.mreg-header-content {
  position: relative;
  z-index: 1;
  text-align: center;
}
.mreg-logo {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  border-radius: 14px;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
:global(.dark) .mreg-logo {
  background: linear-gradient(135deg, #334155, #1e293b);
  border: 1px solid #475569;
}
.mreg-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  letter-spacing: -0.02em;
  color: #0f172a;
}
:global(.dark) .mreg-title {
  color: #f1f5f9;
}
.mreg-sub {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}
/* 步骤进度条 */
.mreg-progress {
  position: relative;
  z-index: 1;
  margin-top: 16px;
  height: 4px;
  background: #f1f5f9;
  border-radius: 2px;
  overflow: hidden;
}
:global(.dark) .mreg-progress {
  background: #1e293b;
}
.mreg-progress-bar {
  height: 100%;
  background: #1e293b;
  border-radius: 2px;
  transition: width 0.3s ease;
}
:global(.dark) .mreg-progress-bar {
  background: #f1f5f9;
}

/* === 表单主体（全屏平铺，无卡片浮层） === */
.mreg-body {
  flex: 1;
  padding: 24px 20px 32px;
  background: #fff;
  overflow: hidden;
}
:global(.dark) .mreg-body {
  background: #0f172a;
}
.mreg-step {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 字段单元：输入框 + 紧贴错误位 */
.mreg-cell {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

/* 输入框 */
.mreg-field {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 14px;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s;
}
:global(.dark) .mreg-field {
  background: #1e293b;
  border-color: #334155;
}
.mreg-field:focus-within {
  background: #fff;
  border-color: #475569;
  box-shadow: 0 0 0 3px rgba(71, 85, 105, 0.1);
}
:global(.dark) .mreg-field:focus-within {
  background: #0f172a;
  border-color: #64748b;
}
.mreg-field.is-error {
  border-color: #ef4444;
}
.mreg-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
:global(.dark) .mreg-icon {
  color: #64748b;
}
.mreg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
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

/* 获取验证码按钮 */
.mreg-code-btn {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
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
:global(.dark) .mreg-code-btn {
  color: #e2e8f0;
  border-left-color: #334155;
}
.mreg-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误位（紧贴输入框，固定高度防抖动） */
.mreg-err {
  height: 16px;
  line-height: 16px;
  margin-top: 4px;
  padding-left: 4px;
  font-size: 11px;
  color: #ef4444;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 下一步 / 提交按钮（深灰 CTA，非彩色渐变） */
.mreg-next-btn,
.mreg-submit {
  height: 48px;
  width: 100%;
  margin-top: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: #1e293b;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
:global(.dark) .mreg-next-btn,
:global(.dark) .mreg-submit {
  background: #f1f5f9;
  color: #0f172a;
}
.mreg-next-btn:active,
.mreg-submit:active:not(:disabled) {
  transform: scale(0.98);
}
.mreg-submit:disabled {
  cursor: not-allowed;
}

/* 步骤 3 信息汇总 */
.mreg-summary {
  margin-bottom: 16px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
:global(.dark) .mreg-summary {
  background: #1e293b;
  border-color: #334155;
}
.mreg-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
}
.mreg-summary-row + .mreg-summary-row {
  border-top: 1px solid #e2e8f0;
}
:global(.dark) .mreg-summary-row + .mreg-summary-row {
  border-top-color: #334155;
}
.mreg-summary-row span {
  color: #64748b;
}
:global(.dark) .mreg-summary-row span {
  color: #94a3b8;
}
.mreg-summary-row strong {
  color: #0f172a;
  font-weight: 600;
}
:global(.dark) .mreg-summary-row strong {
  color: #f1f5f9;
}

/* 协议勾选 */
.mreg-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 16px 0;
  cursor: pointer;
  user-select: none;
}
.mreg-checkbox {
  width: 18px;
  height: 18px;
  margin-top: 1px;
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
  background: #1e293b;
  border-color: #1e293b;
}
:global(.dark) .mreg-checkbox.checked {
  background: #f1f5f9;
  border-color: #f1f5f9;
  color: #0f172a;
}
.mreg-agree-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
:global(.dark) .mreg-agree-text {
  color: #94a3b8;
}
.mreg-link {
  color: #1e293b;
  cursor: pointer;
}
:global(.dark) .mreg-link {
  color: #e2e8f0;
}
.mreg-link:hover {
  text-decoration: underline;
}

/* === 安卓风格 slide 切换动画 === */
/* 前进：新页从右滑入，旧页向左滑出 */
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-next-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.slide-next-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}
/* 后退：新页从左滑入，旧页向右滑出 */
.slide-prev-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}
.slide-prev-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
