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

onMounted(() => {
  if (recaptchaEnabled.value) loadRecaptcha();
});

const router = useRouter();
const route = useRoute();

const isMini = computed(() => route.query.appName || route.path.includes('mini') || route.query.from === 'mini');

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
  if (!values.email || errors.value.email || isEmailDuplicate.value) return;
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
    const { confirmPassword, ...submitData } = values;
    const encryptedPassword = await rsaEncrypt(submitData.password!);
    const recaptchaToken = recaptchaEnabled.value ? await getRecaptchaToken() : null;
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    alert('注册成功！现在您可以返回登录了');
    if (route.query.from === 'mini') {
      router.push({ path: '/mini-login', query: route.query });
    } else {
      router.push('/');
    }
  },
  err => console.log('Validation errors:', err)
);

const openDoc = (type: 'service' | 'privacy') => {
  window.open(`/docs/${type}.html`, '_blank', 'width=800,height=600');
};
</script>

<template>
  <div class="reg-viewport" :class="{ 'is-mini': isMini }">
    <div class="reg-glow reg-glow-1"></div>
    <div class="reg-glow reg-glow-2"></div>

    <!-- 玻璃卡片（与登录页一致风格） -->
    <div class="reg-card glass-effect">
      <!-- 品牌区（与登录页一致） -->
      <div class="flex items-center gap-3.5 mb-6">
        <div class="reg-brand-icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-outfit">创建新账户</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">填写以下信息，即刻开启全功能体验</p>
        </div>
      </div>

      <!-- 表单 -->
      <form @submit.prevent="handleRegister" class="flex flex-col flex-1">
        <div class="flex-1 space-y-3">
          <!-- 用户名 + 邮箱 并排 -->
          <div class="grid grid-cols-2 gap-3">
            <div class="group relative">
              <div class="reg-input-wrap" :class="{ 'is-error': errors.username }">
                <svg class="reg-field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  v-model="username"
                  v-bind="usernameProps"
                  type="text"
                  placeholder="用户名"
                  autocomplete="username"
                  class="reg-field-input"
                />
              </div>
              <span v-if="errors.username" class="reg-error">{{ errors.username }}</span>
            </div>
            <div class="group relative">
              <div class="reg-input-wrap" :class="{ 'is-error': errors.email || isEmailDuplicate }">
                <svg class="reg-field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 5L2 7" />
                </svg>
                <input
                  v-model="email"
                  v-bind="emailProps"
                  @blur="checkEmail"
                  type="email"
                  placeholder="电子邮箱"
                  autocomplete="email"
                  class="reg-field-input"
                />
              </div>
              <span v-if="errors.email || isEmailDuplicate" class="reg-error">{{ isEmailDuplicate ? '邮箱已被注册' : errors.email }}</span>
            </div>
          </div>

          <!-- 验证码 + 获取按钮 -->
          <div class="group relative">
            <div class="reg-input-wrap" :class="{ 'is-error': errors.code }">
              <svg class="reg-field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <input
                v-model="code"
                v-bind="codeProps"
                type="text"
                placeholder="邮箱验证码"
                autocomplete="one-time-code"
                class="reg-field-input"
              />
              <button
                type="button"
                @click="sendCode"
                :disabled="isCountingDown"
                class="reg-code-btn"
              >
                {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
              </button>
            </div>
            <span v-if="errors.code" class="reg-error">{{ errors.code }}</span>
          </div>

          <!-- 密码 + 确认 并排 -->
          <div class="grid grid-cols-2 gap-3">
            <div class="group relative">
              <div class="reg-input-wrap" :class="{ 'is-error': errors.password }">
                <svg class="reg-field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  v-model="password"
                  v-bind="passwordProps"
                  type="password"
                  placeholder="登录密码"
                  autocomplete="new-password"
                  class="reg-field-input"
                />
              </div>
              <span v-if="errors.password" class="reg-error">{{ errors.password }}</span>
            </div>
            <div class="group relative">
              <div class="reg-input-wrap" :class="{ 'is-error': errors.confirmPassword }">
                <svg class="reg-field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  v-model="confirmPassword"
                  v-bind="confirmPasswordProps"
                  type="password"
                  placeholder="确认密码"
                  autocomplete="new-password"
                  class="reg-field-input"
                />
              </div>
              <span v-if="errors.confirmPassword" class="reg-error">{{ errors.confirmPassword }}</span>
            </div>
          </div>

          <!-- 提交按钮 -->
          <button type="submit" class="auth-btn mt-2">创建账户</button>

          <!-- 协议 -->
          <label class="flex items-start gap-2.5 cursor-pointer py-1.5">
            <input type="checkbox" v-model="agreed" class="hidden" />
            <div class="reg-checkbox" :class="{ 'is-checked': agreed }">
              <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              已阅读并同意
              <span @click.stop.prevent="openDoc('service')" class="text-primary hover:underline">《服务协议》</span>
              与
              <span @click.stop.prevent="openDoc('privacy')" class="text-primary hover:underline">《隐私政策》</span>
            </span>
          </label>
        </div>
      </form>

      <!-- 返回登录 -->
      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 mt-3">
        <router-link
          :to="{ path: isMini ? '/mini-login' : '/', query: route.query }"
          class="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
        >
          已有账号？立即返回登录 →
        </router-link>
      </div>
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
/* === 背景 + 光晕（主题感知） === */
.reg-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: 'Outfit', 'Inter', sans-serif;
  padding: 24px;
  box-sizing: border-box;
  background: linear-gradient(140deg, #f8fafc 0%, #e0e7ff 50%, #f8fafc 100%);
}
:global(.dark) .reg-viewport {
  background: linear-gradient(140deg, #020617 0%, #0f172a 50%, #1e1b4b 100%);
}

.reg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}
.reg-glow-1 {
  top: -8%;
  left: -5%;
  width: 380px;
  height: 380px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.22), transparent 70%);
}
.reg-glow-2 {
  bottom: -8%;
  right: -5%;
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, rgba(217, 70, 239, 0.18), transparent 70%);
}
:global(.dark) .reg-glow-1 {
  background: radial-gradient(circle, rgba(99, 102, 241, 0.32), transparent 70%);
}
:global(.dark) .reg-glow-2 {
  background: radial-gradient(circle, rgba(217, 70, 239, 0.26), transparent 70%);
}

/* === 玻璃卡片（对齐登录页 glass-effect + rounded-[32px]） === */
.reg-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 48px);
  padding: 32px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 品牌图标（对齐登录页 from-primary to-fuchsia-500） */
.reg-brand-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4f46e5, #d946ef);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.25);
}

/* === 输入框（对齐登录页：外层 div 包 input + focus-within:ring） === */
.reg-input-wrap {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  gap: 8px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 12px;
  transition: all 0.2s;
}
:global(.dark) .reg-input-wrap {
  background: rgba(15, 23, 42, 0.5);
  border-color: rgba(51, 65, 85, 0.5);
}
.reg-input-wrap:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  background: #fff;
}
:global(.dark) .reg-input-wrap:focus-within {
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.25);
}
.reg-input-wrap.is-error {
  border-color: #ef4444;
}

.reg-field-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
.reg-field-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: #0f172a;
  height: 100%;
}
:global(.dark) .reg-field-input {
  color: #f1f5f9;
}
.reg-field-input::placeholder {
  color: #94a3b8;
}

/* 获取验证码按钮（对齐登录页样式） */
.reg-code-btn {
  font-size: 11px;
  font-weight: 600;
  color: #4f46e5;
  padding-left: 12px;
  border-left: 1px solid rgba(226, 232, 240, 0.8);
  white-space: nowrap;
  transition: color 0.2s;
}
:global(.dark) .reg-code-btn {
  border-left-color: rgba(51, 65, 85, 0.5);
}
.reg-code-btn:hover:not(:disabled) {
  color: #4338ca;
}
.reg-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误提示 */
.reg-error {
  position: absolute;
  bottom: -16px;
  left: 4px;
  font-size: 10px;
  color: #ef4444;
}

/* 协议 checkbox */
.reg-checkbox {
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
  flex-shrink: 0;
}
:global(.dark) .reg-checkbox {
  border-color: #475569;
}
.reg-checkbox.is-checked {
  background: #4f46e5;
  border-color: #4f46e5;
}

/* === mini 模式（iframe 嵌入） === */
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
  padding: 24px 28px;
  justify-content: center;
}
:global(.dark) .reg-viewport.is-mini .reg-card {
  background: transparent;
}
.reg-viewport.is-mini .reg-input-wrap {
  background: rgba(255, 255, 255, 0.85);
}
:global(.dark) .reg-viewport.is-mini .reg-input-wrap {
  background: rgba(15, 23, 42, 0.6);
}
</style>
