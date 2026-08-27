<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import { useRoute, useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { useLoginFlow } from '@/composables/useLoginFlow';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { error: showError } = useMessage();

// 登录模式 + 切换动画方向
const loginType = ref<'sms' | 'pwd'>('sms');
const transitionName = ref('slide-next');

// 表单校验架构 (Zod)
const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sms'),
    phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入正确的手机号'),
    code: z.string().min(4, '验证码至少4位')
  }),
  z.object({
    type: z.literal('pwd'),
    username: z.string().min(2, '账号至少2位'),
    password: z.string().min(6, '密码至少6位')
  })
]);

const { values, errors, defineField, handleSubmit } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: {
    type: 'sms' as const,
    phone: '',
    code: '',
    username: '',
    password: ''
  }
});

const [phone, phoneProps] = defineField('phone');
const [code, codeProps] = defineField('code');
const [username, usernameProps] = defineField('username');
const [password, passwordProps] = defineField('password');

const agreed = ref(false);
const keepLogin = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);
// 倒计时：发送短信验证码后 60s 禁用按钮
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

const sendSmsCode = () => {
  if (!values.phone || errors.value.phone) {
    showError(errors.value.phone || '请先输入有效的手机号');
    return;
  }
  startCountdown(60);
};

// 切换登录模式（带 slide 动画方向）
const switchType = (type: 'sms' | 'pwd') => {
  if (type === loginType.value) return;
  transitionName.value = type === 'pwd' ? 'slide-next' : 'slide-prev';
  loginType.value = type;
  values.type = type;
};

// 登录流程：consent/email_verify/max_sessions/notifyParent 统一在 useLoginFlow
const { executeLogin } = useLoginFlow({
  keepLogin: () => keepLogin.value,
  values: () => values,
  captchaKey: () => '',
  clientId: () => (route.query.client_id as string) || (route.query.appName as string),
  showError: (msg: string) => showError(msg)
});

const handleLogin = handleSubmit(async () => {
  if (!agreed.value) {
    showError('请先阅读并勾选同意相关协议');
    return;
  }
  await executeLogin();
});

const goRegister = () => router.push('/m/register');
const goBack = () => {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'SSO_CLOSE' }, '*');
  } else {
    router.back();
  }
};
</script>

<template>
  <!-- 移动端登录（白灰高级色 + 全屏平铺 + slide 切换） -->
  <div class="mlogin-page">
    <!-- 顶部 Header（白灰，非彩色渐变） -->
    <header class="mlogin-header">
      <button class="mlogin-back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div class="mlogin-header-content">
        <div class="mlogin-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 class="mlogin-title">欢迎登录</h1>
        <p class="mlogin-sub">Enterprise SSO Identity</p>
      </div>
    </header>

    <!-- 表单主体（全屏平铺，无卡片浮层） -->
    <main class="mlogin-body">
      <!-- 模式切换 Tab -->
      <div class="mlogin-tabs">
        <button class="mlogin-tab" :class="{ active: loginType === 'sms' }" @click="switchType('sms')">
          短信登录
        </button>
        <button class="mlogin-tab" :class="{ active: loginType === 'pwd' }" @click="switchType('pwd')">
          密码登录
        </button>
        <div class="mlogin-tab-indicator" :class="{ 'is-pwd': loginType === 'pwd' }"></div>
      </div>

      <!-- 表单（slide 切换动画） -->
      <form @submit.prevent="handleLogin" class="mlogin-form">
        <transition :name="transitionName" mode="out-in">
          <!-- 短信登录 -->
          <div v-if="loginType === 'sms'" key="sms" class="mlogin-step">
            <div class="mlogin-cell">
              <div class="mlogin-field" :class="{ 'is-error': errors.phone }">
                <svg class="mlogin-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h2a2 2 0 0 1 2 1.72c.127.96.356 1.903.682 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.326 1.85.555 2.81.682A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <span class="mlogin-prefix">+86</span>
                <input v-model="phone" v-bind="phoneProps" type="tel" placeholder="请输入手机号" autocomplete="username tel" class="mlogin-input" />
              </div>
              <div class="mlogin-err">{{ errors.phone }}</div>
            </div>

            <div class="mlogin-cell">
              <div class="mlogin-field" :class="{ 'is-error': errors.code }">
                <svg class="mlogin-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="code" v-bind="codeProps" type="text" placeholder="短信验证码" autocomplete="one-time-code" class="mlogin-input" />
                <button type="button" @click="sendSmsCode" :disabled="isCountingDown" class="mlogin-code-btn">
                  {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                </button>
              </div>
              <div class="mlogin-err">{{ errors.code }}</div>
            </div>
          </div>

          <!-- 密码登录 -->
          <div v-else key="pwd" class="mlogin-step">
            <div class="mlogin-cell">
              <div class="mlogin-field" :class="{ 'is-error': errors.username }">
                <svg class="mlogin-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <input v-model="username" v-bind="usernameProps" type="text" placeholder="账号 / 邮箱 / 手机号" autocomplete="username" class="mlogin-input" />
              </div>
              <div class="mlogin-err">{{ errors.username }}</div>
            </div>

            <div class="mlogin-cell">
              <div class="mlogin-field" :class="{ 'is-error': errors.password }">
                <svg class="mlogin-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="password" v-bind="passwordProps" type="password" placeholder="登录密码" autocomplete="current-password" class="mlogin-input" />
              </div>
              <div class="mlogin-err">{{ errors.password }}</div>
            </div>
          </div>
        </transition>

        <!-- 记住登录状态 -->
        <label class="mlogin-keep">
          <input type="checkbox" v-model="keepLogin" class="hidden" />
          <span class="mlogin-checkbox" :class="{ checked: keepLogin }">
            <svg v-if="keepLogin" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="mlogin-keep-text">记住登录状态（30 天免登录）</span>
        </label>

        <!-- 登录按钮 -->
        <button type="submit" :disabled="authStore.loading" class="mlogin-submit">
          <span v-if="authStore.loading" class="mlogin-spinner"></span>
          立即登录
        </button>

        <!-- 协议 -->
        <label class="mlogin-agree">
          <input type="checkbox" v-model="agreed" class="hidden" />
          <span class="mlogin-checkbox" :class="{ checked: agreed }">
            <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="mlogin-agree-text">
            已阅读并同意
            <span @click.stop.prevent="docType = 'service'" class="mlogin-link">《服务协议》</span>
            与
            <span @click.stop.prevent="docType = 'privacy'" class="mlogin-link">《隐私政策》</span>
          </span>
        </label>
      </form>

      <!-- 底部注册入口 -->
      <div class="mlogin-footer">
        <span>还没有账号？</span>
        <button class="mlogin-register-btn" @click="goRegister">立即注册</button>
      </div>
    </main>

    <AgreementModals v-model:type="docType" />
    <MessageToast />
  </div>
</template>

<style scoped>
/* === 移动端全屏（白灰高级色） === */
.mlogin-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #fafafa;
  overflow: hidden;
}
:global(.dark) .mlogin-page {
  background: #020617;
}

/* === 顶部 Header（白灰，非彩色渐变） === */
.mlogin-header {
  position: relative;
  padding: 56px 24px 32px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
  overflow: hidden;
}
:global(.dark) .mlogin-header {
  background: #0f172a;
  border-bottom-color: #1e293b;
}
.mlogin-back-btn {
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
:global(.dark) .mlogin-back-btn {
  color: #94a3b8;
  background: #1e293b;
}
.mlogin-back-btn:active {
  background: #e2e8f0;
}
:global(.dark) .mlogin-back-btn:active {
  background: #334155;
}
.mlogin-header-content {
  text-align: center;
}
.mlogin-logo {
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
:global(.dark) .mlogin-logo {
  background: linear-gradient(135deg, #334155, #1e293b);
  border: 1px solid #475569;
}
.mlogin-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #0f172a;
  letter-spacing: -0.02em;
}
:global(.dark) .mlogin-title {
  color: #f1f5f9;
}
.mlogin-sub {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  letter-spacing: 0.05em;
}

/* === 表单主体（全屏平铺，无卡片浮层） === */
.mlogin-body {
  flex: 1;
  padding: 24px 20px 32px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
:global(.dark) .mlogin-body {
  background: #0f172a;
}

/* === 模式切换 Tab === */
.mlogin-tabs {
  position: relative;
  display: flex;
  margin-bottom: 24px;
  border-bottom: 1px solid #f1f5f9;
}
:global(.dark) .mlogin-tabs {
  border-bottom-color: #1e293b;
}
.mlogin-tab {
  position: relative;
  flex: 1;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}
.mlogin-tab.active {
  color: #0f172a;
}
:global(.dark) .mlogin-tab.active {
  color: #f1f5f9;
}
.mlogin-tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 50%;
  height: 2px;
  background: #1e293b;
  transition: transform 0.3s ease;
}
:global(.dark) .mlogin-tab-indicator {
  background: #f1f5f9;
}
.mlogin-tab-indicator.is-pwd {
  transform: translateX(100%);
}

/* === 表单 === */
.mlogin-form {
  display: flex;
  flex-direction: column;
}
.mlogin-step {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mlogin-cell {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

/* 输入框（白灰） */
.mlogin-field {
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
:global(.dark) .mlogin-field {
  background: #1e293b;
  border-color: #334155;
}
.mlogin-field:focus-within {
  background: #fff;
  border-color: #475569;
  box-shadow: 0 0 0 3px rgba(71, 85, 105, 0.1);
}
:global(.dark) .mlogin-field:focus-within {
  background: #0f172a;
  border-color: #64748b;
}
.mlogin-field.is-error {
  border-color: #ef4444;
}
.mlogin-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
:global(.dark) .mlogin-icon {
  color: #64748b;
}
.mlogin-prefix {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  padding-right: 10px;
  border-right: 1px solid #e2e8f0;
}
:global(.dark) .mlogin-prefix {
  color: #f1f5f9;
  border-right-color: #334155;
}
.mlogin-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
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

/* 获取验证码按钮 */
.mlogin-code-btn {
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
:global(.dark) .mlogin-code-btn {
  color: #e2e8f0;
  border-left-color: #334155;
}
.mlogin-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误位（紧贴输入框，固定高度防抖动） */
.mlogin-err {
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

/* 记住登录状态 */
.mlogin-keep {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 16px;
  cursor: pointer;
  user-select: none;
}
.mlogin-keep-text {
  font-size: 12px;
  color: #64748b;
}
:global(.dark) .mlogin-keep-text {
  color: #94a3b8;
}

/* 复选框（白灰选中态） */
.mlogin-checkbox {
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
:global(.dark) .mlogin-checkbox {
  border-color: #475569;
}
.mlogin-checkbox.checked {
  background: #1e293b;
  border-color: #1e293b;
}
:global(.dark) .mlogin-checkbox.checked {
  background: #f1f5f9;
  border-color: #f1f5f9;
  color: #0f172a;
}

/* 登录按钮（深灰 CTA，非彩色渐变） */
.mlogin-submit {
  height: 48px;
  width: 100%;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: #1e293b;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
:global(.dark) .mlogin-submit {
  background: #f1f5f9;
  color: #0f172a;
}
.mlogin-submit:active:not(:disabled) {
  transform: scale(0.98);
}
.mlogin-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mlogin-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mlogin-spin 0.6s linear infinite;
}
:global(.dark) .mlogin-spinner {
  border-color: rgba(15, 23, 42, 0.3);
  border-top-color: #0f172a;
}
@keyframes mlogin-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 协议勾选 */
.mlogin-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  cursor: pointer;
  user-select: none;
}
.mlogin-agree-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
:global(.dark) .mlogin-agree-text {
  color: #94a3b8;
}
.mlogin-link {
  color: #1e293b;
  font-weight: 500;
  cursor: pointer;
}
:global(.dark) .mlogin-link {
  color: #e2e8f0;
}
.mlogin-link:hover {
  text-decoration: underline;
}

/* 底部注册入口 */
.mlogin-footer {
  margin-top: auto;
  padding-top: 24px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}
.mlogin-register-btn {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  background: transparent;
  border: none;
  cursor: pointer;
}
:global(.dark) .mlogin-register-btn {
  color: #f1f5f9;
}
.mlogin-register-btn:hover {
  text-decoration: underline;
}

/* === 安卓风格 slide 切换动画 === */
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
.slide-prev-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}
.slide-prev-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
