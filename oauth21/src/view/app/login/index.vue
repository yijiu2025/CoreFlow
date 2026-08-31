<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
import { useRoute, useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { useLoginFlow } from '@/composables/useLoginFlow';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { postToParent } from '@/utils/parent';
import AgreementModals from '@/components/common/AgreementModals.vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import MessageToast from '@/components/common/MessageToast.vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { error: showError } = useMessage();

// 登录模式 + 切换动画方向（邮箱登录 / 密码登录）
const loginType = ref<'email' | 'pwd'>('email');
const transitionName = ref('slide-next');

// 表单校验架构 (Zod discriminatedUnion，学 web 端 MiniLogin)
const loginSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    email: z.string().email('请输入有效的邮箱'),
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
    type: 'email' as const,
    email: '',
    code: '',
    username: '',
    password: ''
  }
});

const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [username, usernameProps] = defineField('username');
const [password, passwordProps] = defineField('password');
const [type] = defineField('type');

const agreed = ref(false);
const keepLogin = ref(false);
const docType = ref<'service' | 'privacy' | null>(null);
// 倒计时：发送邮箱验证码后 60s 禁用按钮
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

// 图形验证码流程：弹窗 → 通过 → 按 purpose（code 发邮箱码 / login 登录）继续
const { captchaKey, showCaptcha, captchaPurpose, openCaptcha, onCaptchaSuccess } = useCaptchaFlow<'code' | 'login'>(
  purpose => {
    if (purpose === 'code') executeSendEmailCode();
    else executeLogin();
  }
);

// 发送邮箱验证码（先弹图形码，通过后由 verify-captcha 端点发邮箱码 + 启动倒计时）
const sendEmailCode = () => {
  if (!email.value || (errors.value as Record<string, string | undefined>).email) {
    showError('请先输入有效的邮箱地址');
    return;
  }
  openCaptcha('code');
};

// 图形码通过 → 启动 60s 倒计时（邮箱码已由 verify-captcha 端点发出）
const executeSendEmailCode = () => {
  startCountdown(60);
};

// 切换登录模式（带 slide 动画方向 + 同步 discriminatedUnion 的 type 字段）
const switchType = (t: 'email' | 'pwd') => {
  if (t === loginType.value) return;
  transitionName.value = t === 'pwd' ? 'slide-next' : 'slide-prev';
  loginType.value = t;
};
watch(loginType, newType => {
  type.value = newType;
});

// 登录流程：consent/email_verify/max_sessions/notifyParent 统一在 useLoginFlow
const { executeLogin } = useLoginFlow({
  keepLogin: () => keepLogin.value,
  values: () => values,
  captchaKey: () => captchaKey.value,
  clientId: () => (route.query.client_id as string) || (route.query.appName as string),
  showError: (msg: string) => showError(msg)
});

const handleLogin = handleSubmit(async () => {
  if (!agreed.value) {
    showError('请先阅读并勾选同意相关协议');
    return;
  }
  // 密码登录需先过图形验证码，邮箱登录直接执行
  if (loginType.value === 'pwd') {
    openCaptcha('login');
  } else {
    executeLogin();
  }
});

const goRegister = () => router.push('/m/register');
const goBack = () => {
  if (window.parent && window.parent !== window) {
    // 用 postToParent 走白名单 origin 校验，禁用 '*' 避免恶意父窗口截获
    postToParent({ type: 'SSO_CLOSE' });
  } else {
    router.back();
  }
};
</script>

<template>
  <!-- 移动端登录（白灰高级色 + 全屏平铺 + slide 切换） -->
  <div class="mlog-page">
    <!-- 顶部 Header（白灰，与 body 融为一体） -->
    <header class="mlog-header">
      <button class="mlog-back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <div class="mlog-header-content">
        <div class="mlog-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 class="mlog-title">欢迎登录</h1>
        <p class="mlog-sub">Enterprise SSO Identity</p>
      </div>
    </header>

    <!-- 表单主体（全屏平铺，无卡片浮层） -->
    <main class="mlog-body">
      <!-- 模式切换 Tab -->
      <div class="mlog-tabs">
        <button class="mlog-tab" :class="{ active: loginType === 'email' }" @click="switchType('email')">
          邮箱登录
        </button>
        <button class="mlog-tab" :class="{ active: loginType === 'pwd' }" @click="switchType('pwd')">
          密码登录
        </button>
      </div>

      <!-- 表单（slide 切换动画） -->
      <form @submit.prevent="handleLogin" class="mlog-form">
        <transition :name="transitionName" mode="out-in">
          <!-- 邮箱验证码登录 -->
          <div v-if="loginType === 'email'" key="email" class="mlog-step">
            <div class="mlog-cell">
              <div class="mlog-field" :class="{ 'is-error': errors.email }">
                <svg class="mlog-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input v-model="email" v-bind="emailProps" type="email" placeholder="电子邮箱" autocomplete="email" class="mlog-input" />
              </div>
              <div class="mlog-err">{{ errors.email }}</div>
            </div>

            <div class="mlog-cell">
              <div class="mlog-field" :class="{ 'is-error': errors.code }">
                <svg class="mlog-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" autocomplete="one-time-code" class="mlog-input" />
                <button type="button" @click="sendEmailCode" :disabled="isCountingDown" class="mlog-code-btn">
                  {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                </button>
              </div>
              <div class="mlog-err">{{ errors.code }}</div>
            </div>
          </div>

          <!-- 密码登录 -->
          <div v-else key="pwd" class="mlog-step">
            <div class="mlog-cell">
              <div class="mlog-field" :class="{ 'is-error': errors.username }">
                <svg class="mlog-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <input v-model="username" v-bind="usernameProps" type="text" placeholder="账号 / 邮箱" autocomplete="username" class="mlog-input" />
              </div>
              <div class="mlog-err">{{ errors.username }}</div>
            </div>

            <div class="mlog-cell">
              <div class="mlog-field" :class="{ 'is-error': errors.password }">
                <svg class="mlog-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="password" v-bind="passwordProps" type="password" placeholder="登录密码" autocomplete="current-password" class="mlog-input" />
              </div>
              <div class="mlog-err">{{ errors.password }}</div>
            </div>
          </div>
        </transition>

        <!-- 记住登录 + 已读协议（合并到一处，提交按钮上方） -->
        <div class="mlog-options">
          <label class="mlog-option">
            <input type="checkbox" v-model="keepLogin" class="hidden" />
            <span class="mlog-checkbox" :class="{ checked: keepLogin }">
              <svg v-if="keepLogin" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="mlog-option-text">记住登录</span>
          </label>
          <label class="mlog-option">
            <input type="checkbox" v-model="agreed" class="hidden" />
            <span class="mlog-checkbox" :class="{ checked: agreed }">
              <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="mlog-option-text">
              已同意
              <span @click.stop.prevent="docType = 'service'" class="mlog-link">《服务协议》</span>
              与
              <span @click.stop.prevent="docType = 'privacy'" class="mlog-link">《隐私政策》</span>
            </span>
          </label>
        </div>

        <!-- 登录按钮 -->
        <button type="submit" :disabled="authStore.loading" class="mlog-submit">
          <span v-if="authStore.loading" class="mlog-spinner"></span>
          立即登录
        </button>
      </form>

      <!-- 底部注册入口 -->
      <div class="mlog-footer">
        <span>还没有账号？</span>
        <button class="mlog-register-btn" @click="goRegister">立即注册</button>
      </div>
    </main>

    <!-- 图形验证码弹窗（send-email=true 时 verify-captcha 一次完成校验图形码 + 发邮箱码） -->
    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="captchaPurpose === 'code'" type="login" @close="showCaptcha = false" @success="onCaptchaSuccess" />

    <AgreementModals v-model:type="docType" />
    <MessageToast />
  </div>
</template>

<style scoped>
/* === 移动端全屏（白灰高级色） === */
.mlog-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #fafafa;
  overflow: hidden;
}
:global(.dark) .mlog-page {
  background: #020617;
}

/* === 顶部 Header（白灰，无分隔线，与 body 融为一体） === */
.mlog-header {
  position: relative;
  padding: 56px 24px 32px;
  background: #fff;
  overflow: hidden;
}
:global(.dark) .mlog-header {
  background: #0f172a;
}
.mlog-back-btn {
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
:global(.dark) .mlog-back-btn {
  color: #94a3b8;
  background: #1e293b;
}
.mlog-back-btn:active {
  background: #e2e8f0;
}
:global(.dark) .mlog-back-btn:active {
  background: #334155;
}
.mlog-header-content {
  text-align: center;
}
.mlog-logo {
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
:global(.dark) .mlog-logo {
  background: linear-gradient(135deg, #334155, #1e293b);
  border: 1px solid #475569;
}
.mlog-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #0f172a;
  letter-spacing: -0.02em;
}
:global(.dark) .mlog-title {
  color: #f1f5f9;
}
.mlog-sub {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
  letter-spacing: 0.05em;
}

/* === 表单主体（全屏平铺，无卡片浮层） === */
.mlog-body {
  flex: 1;
  padding: 24px 20px 32px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
:global(.dark) .mlog-body {
  background: #0f172a;
}

/* === 模式切换 Tab（无底部分隔线，用间距区分） === */
.mlog-tabs {
  position: relative;
  display: flex;
  margin-bottom: 24px;
}
.mlog-tab {
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
.mlog-tab.active {
  color: #0f172a;
}
:global(.dark) .mlog-tab.active {
  color: #f1f5f9;
}
.mlog-tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 50%;
  height: 2px;
  background: #1e293b;
  transition: transform 0.3s ease;
}
:global(.dark) .mlog-tab-indicator {
  background: #f1f5f9;
}
.mlog-tab-indicator.is-pwd {
  transform: translateX(100%);
}

/* === 表单 === */
.mlog-form {
  display: flex;
  flex-direction: column;
}
.mlog-step {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mlog-cell {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

/* 输入框（白灰） */
.mlog-field {
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
:global(.dark) .mlog-field {
  background: #1e293b;
  border-color: #334155;
}
.mlog-field:focus-within {
  background: #fff;
  border-color: #475569;
  box-shadow: 0 0 0 3px rgba(71, 85, 105, 0.1);
}
:global(.dark) .mlog-field:focus-within {
  background: #0f172a;
  border-color: #64748b;
}
.mlog-field.is-error {
  border-color: #ef4444;
}
.mlog-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
:global(.dark) .mlog-icon {
  color: #64748b;
}
.mlog-prefix {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  padding-right: 10px;
  border-right: 1px solid #e2e8f0;
}
:global(.dark) .mlog-prefix {
  color: #f1f5f9;
  border-right-color: #334155;
}
.mlog-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  color: #0f172a;
  height: 100%;
  min-width: 0;
}
:global(.dark) .mlog-input {
  color: #f1f5f9;
}
.mlog-input::placeholder {
  color: #94a3b8;
}

/* 获取验证码按钮 */
.mlog-code-btn {
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
:global(.dark) .mlog-code-btn {
  color: #e2e8f0;
  border-left-color: #334155;
}
.mlog-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误位（紧贴输入框，固定高度防抖动） */
.mlog-err {
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

/* 记住登录 + 已读协议（合并一处，提交按钮上方） */
.mlog-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 4px 0 20px;
}
.mlog-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.mlog-option-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
:global(.dark) .mlog-option-text {
  color: #94a3b8;
}

/* 复选框（白灰选中态） */
.mlog-checkbox {
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
:global(.dark) .mlog-checkbox {
  border-color: #475569;
}
.mlog-checkbox.checked {
  background: #1e293b;
  border-color: #1e293b;
}
:global(.dark) .mlog-checkbox.checked {
  background: #f1f5f9;
  border-color: #f1f5f9;
  color: #0f172a;
}

/* 登录按钮（深灰 CTA，非彩色渐变） */
.mlog-submit {
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
:global(.dark) .mlog-submit {
  background: #f1f5f9;
  color: #0f172a;
}
.mlog-submit:active:not(:disabled) {
  transform: scale(0.98);
}
.mlog-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mlog-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mlog-spin 0.6s linear infinite;
}
:global(.dark) .mlog-spinner {
  border-color: rgba(15, 23, 42, 0.3);
  border-top-color: #0f172a;
}
@keyframes mlog-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 协议链接（在 mlog-option-text 内） */
.mlog-link {
  color: #1e293b;
  font-weight: 500;
  cursor: pointer;
}
:global(.dark) .mlog-link {
  color: #e2e8f0;
}
.mlog-link:hover {
  text-decoration: underline;
}

/* 底部注册入口 */
.mlog-footer {
  margin-top: auto;
  padding-top: 24px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}
.mlog-register-btn {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  background: transparent;
  border: none;
  cursor: pointer;
}
:global(.dark) .mlog-register-btn {
  color: #f1f5f9;
}
.mlog-register-btn:hover {
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
