<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRoute, useRouter } from 'vue-router';
import { ref, computed, onMounted } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useRecaptcha } from '@/composables/useRecaptcha';

const { isEnabled: recaptchaEnabled, loadRecaptcha, getRecaptchaToken } = useRecaptcha();

// 预加载 hCaptcha SDK（启用时，提前 warm up 避免提交时才加载）
onMounted(() => {
  if (recaptchaEnabled.value) loadRecaptcha();
});

const router = useRouter();
const route = useRoute();

const isMini = computed(() => route.query.appName || route.path.includes('mini') || route.query.from === 'mini');

// 校验架构
const registerSchema = z
  .object({
    username: z.string({ required_error: '请输入用户名' }).min(2, '用户名至少2位'),
    email: z.string({ required_error: '请输入邮箱' }).email('请输入有效的邮箱'),
    code: z.string({ required_error: '请输入验证码' }).min(4, '验证码至少4位'),
    password: z
      .string({ required_error: '请输入密码' })
      .min(8, '密码至少8位')
      .max(20, '密码最多20位')
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, '密码必须同时包含数字和字母'),
    confirmPassword: z.string({ required_error: '请确认密码' }).min(1, '请再次输入密码以确认')
  })
  .refine((data: any) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  });

const { values, errors, defineField, handleSubmit } = useForm({
  validationSchema: toTypedSchema(registerSchema)
});

const [username, usernameProps] = defineField('username');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

const agreed = ref(false);
const isEmailDuplicate = ref(false);
const showCaptcha = ref(false);
const captchaKey = ref('');
const isCountingDown = ref(false);
const countdown = ref(60);

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

const sendCode = () => {
  if (!values.email || errors.value.email || isEmailDuplicate.value) {
    return;
  }
  showCaptcha.value = true;
};

const onCaptchaSuccess = async (data: { captchaKey: string }) => {
  captchaKey.value = data.captchaKey;
  showCaptcha.value = false;
  isCountingDown.value = true;
  countdown.value = 60;
  const timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer);
      isCountingDown.value = false;
    }
  }, 1000);
};

const handleRegister = handleSubmit(
  async () => {
    if (!agreed.value) {
      alert('请阅读并同意协议');
      return;
    }
    if (isEmailDuplicate.value) {
      alert('邮箱已被注册');
      return;
    }

    executeRegister();
  },
  err => {
    console.log('Validation errors:', err);
  }
);

const executeRegister = async () => {
  try {
    const { confirmPassword, ...submitData } = values;
    const encryptedPassword = await rsaEncrypt(submitData.password!);
    // 人机验证（仅 RECAPTCHA_ENABLED=true 时取 token，后端校验）
    const recaptchaToken = recaptchaEnabled.value ? await getRecaptchaToken() : null;
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value, // 回传 captchaKey，后端校验邮箱码 sessionId 一致性
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    alert('注册成功！现在您可以返回登录了');

    if (route.query.from === 'mini') {
      // 注册成功后，直接回到登录界面
      router.push({ path: '/mini-login', query: route.query });
    } else {
      router.push('/');
    }
  } catch (err: any) {
    alert(err.message || '注册失败');
  }
};

const openDoc = (type: 'service' | 'privacy') => {
  const url = `/docs/${type}.html`;
  window.open(url, '_blank', 'width=800,height=600');
};
</script>

<template>
  <div class="reg-viewport" :class="{ 'is-mini': isMini }">
    <!-- 背景光晕 -->
    <div class="reg-glow reg-glow-1"></div>
    <div class="reg-glow reg-glow-2"></div>

    <!-- 卡片 -->
    <div class="reg-card">
      <!-- 顶部返回 -->
      <router-link
        :to="{ path: isMini ? '/mini-login' : '/', query: route.query }"
        class="reg-back"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        返回登录
      </router-link>

      <!-- 标题 -->
      <div class="reg-header">
        <h1 class="reg-title">创建新账户</h1>
        <p class="reg-subtitle">填写以下信息，即刻开启全功能体验</p>
      </div>

      <!-- 表单 -->
      <form @submit.prevent="handleRegister" class="reg-form">
        <!-- 用户名 + 邮箱 并排 -->
        <div class="reg-row">
          <div class="reg-field">
            <input
              v-model="username"
              v-bind="usernameProps"
              type="text"
              placeholder="用户名"
              autocomplete="username"
              class="reg-input"
              :class="{ 'is-error': errors.username }"
            />
            <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div class="reg-field">
            <input
              v-model="email"
              v-bind="emailProps"
              @blur="checkEmail"
              type="email"
              placeholder="电子邮箱"
              autocomplete="email"
              class="reg-input"
              :class="{ 'is-error': errors.email || isEmailDuplicate }"
            />
            <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 5L2 7" />
            </svg>
          </div>
        </div>

        <!-- 验证码 + 获取按钮 -->
        <div class="reg-row">
          <div class="reg-field">
            <input
              v-model="code"
              v-bind="codeProps"
              type="text"
              placeholder="验证码"
              autocomplete="one-time-code"
              class="reg-input"
              :class="{ 'is-error': errors.code }"
            />
            <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 12l2 2 4-4" /><rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </div>
          <button
            type="button"
            @click="sendCode"
            :disabled="isCountingDown"
            class="reg-code-btn"
          >
            {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
          </button>
        </div>

        <!-- 密码 + 确认 并排 -->
        <div class="reg-row">
          <div class="reg-field">
            <input
              v-model="password"
              v-bind="passwordProps"
              type="password"
              placeholder="登录密码"
              autocomplete="new-password"
              class="reg-input"
              :class="{ 'is-error': errors.password }"
            />
            <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div class="reg-field">
            <input
              v-model="confirmPassword"
              v-bind="confirmPasswordProps"
              type="password"
              placeholder="确认密码"
              autocomplete="new-password"
              class="reg-input"
              :class="{ 'is-error': errors.confirmPassword }"
            />
            <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        <!-- 错误提示（统一一行） -->
        <p v-if="errors.username || errors.email || errors.code || errors.password || errors.confirmPassword || isEmailDuplicate" class="reg-errors">
          {{ errors.username || (isEmailDuplicate ? '邮箱已被注册' : errors.email) || errors.code || errors.password || errors.confirmPassword }}
        </p>

        <!-- 提交按钮 -->
        <button type="submit" class="reg-submit">
          创建账户
        </button>

        <!-- 协议 -->
        <label class="reg-agree">
          <input type="checkbox" v-model="agreed" class="hidden" />
          <span class="reg-checkbox" :class="{ 'is-checked': agreed }">
            <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="reg-agree-text">
            已阅读并同意
            <span @click.stop.prevent="openDoc('service')" class="reg-link">《服务协议》</span>
            与
            <span @click.stop.prevent="openDoc('privacy')" class="reg-link">《隐私政策》</span>
          </span>
        </label>
      </form>
    </div>

    <GraphicCaptcha
      :is-open="showCaptcha"
      :email="values.email"
      type="register"
      @close="showCaptcha = false"
      @success="onCaptchaSuccess"
    />
  </div>
</template>

<style scoped>
/* === 背景：深色渐变 + 光晕（主题感知） === */
.reg-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(140deg, #f8fafc 0%, #e0e7ff 50%, #f8fafc 100%);
  font-family: 'Outfit', 'Inter', sans-serif;
  padding: 24px;
  box-sizing: border-box;
}

:global(.dark) .reg-viewport {
  background: linear-gradient(140deg, #020617 0%, #0f172a 50%, #1e1b4b 100%);
}

/* 光晕装饰 */
.reg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}
.reg-glow-1 {
  top: -10%;
  left: -5%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.25), transparent 70%);
}
.reg-glow-2 {
  bottom: -10%;
  right: -5%;
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.2), transparent 70%);
}
:global(.dark) .reg-glow-1 {
  background: radial-gradient(circle, rgba(99, 102, 241, 0.35), transparent 70%);
}
:global(.dark) .reg-glow-2 {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.28), transparent 70%);
}

/* === 卡片：居中玻璃质感 === */
.reg-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 48px);
  padding: 28px 32px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 20px 50px -10px rgba(15, 23, 42, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
:global(.dark) .reg-card {
  background: rgba(15, 23, 42, 0.7);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.5);
}

/* 返回 */
.reg-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  margin-bottom: 16px;
  transition: color 0.2s;
}
.reg-back:hover {
  color: #4f46e5;
}
:global(.dark) .reg-back {
  color: #94a3b8;
}

/* 标题 */
.reg-header {
  margin-bottom: 20px;
}
.reg-title {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}
:global(.dark) .reg-title {
  color: #f1f5f9;
}
.reg-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}

/* === 表单 === */
.reg-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reg-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.reg-field {
  position: relative;
}
.reg-input {
  width: 100%;
  height: 40px;
  padding: 0 14px 0 38px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  color: #0f172a;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}
:global(.dark) .reg-input {
  background: rgba(15, 23, 42, 0.5);
  border-color: rgba(148, 163, 184, 0.2);
  color: #f1f5f9;
}
.reg-input::placeholder {
  color: #94a3b8;
}
.reg-input:focus {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
  background: #fff;
}
:global(.dark) .reg-input:focus {
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.25);
}
.reg-input.is-error {
  border-color: #ef4444;
}
.reg-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

/* 获取验证码按钮 */
.reg-code-btn {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(79, 70, 229, 0.3);
  background: rgba(79, 70, 229, 0.08);
  color: #4f46e5;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.reg-code-btn:hover:not(:disabled) {
  background: rgba(79, 70, 229, 0.15);
}
.reg-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 错误提示 */
.reg-errors {
  margin: -2px 0 0;
  padding: 0 4px;
  font-size: 11px;
  color: #ef4444;
  min-height: 14px;
}

/* 提交按钮 */
.reg-submit {
  height: 42px;
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}
.reg-submit:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}
.reg-submit:active {
  transform: translateY(0);
}

/* 协议 */
.reg-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  cursor: pointer;
  user-select: none;
}
.reg-checkbox {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 4px;
  border: 1.5px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.2s;
}
.reg-checkbox.is-checked {
  background: #4f46e5;
  border-color: #4f46e5;
}
.reg-agree-text {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}
.reg-link {
  color: #4f46e5;
  cursor: pointer;
}
.reg-link:hover {
  text-decoration: underline;
}

/* === mini 模式（iframe 嵌入）：撑满 + 紧凑 === */
.reg-viewport.is-mini {
  padding: 0;
  background: transparent;
}
.reg-viewport.is-mini .reg-glow {
  display: none;
}
.reg-viewport.is-mini .reg-card {
  max-width: 100%;
  max-height: 100%;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
  border: none;
  box-shadow: none;
  padding: 20px 24px;
  justify-content: center;
}
:global(.dark) .reg-viewport.is-mini .reg-card {
  background: transparent;
}
.reg-viewport.is-mini .reg-input {
  background: rgba(255, 255, 255, 0.8);
}
:global(.dark) .reg-viewport.is-mini .reg-input {
  background: rgba(15, 23, 42, 0.6);
}
</style>
