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
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, '需同时含数字和字母'),
    confirmPassword: z.string({ required_error: '请确认密码' }).min(1, '请再次输入密码')
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
    <!-- 装饰光斑（学登录页） -->
    <div class="reg-blob reg-blob-1"></div>
    <div class="reg-blob reg-blob-2"></div>

    <!-- 玻璃卡片（学登录页：856×480 glass-effect rounded-[32px]） -->
    <div class="reg-card glass-effect">
      <!-- 左面板（学登录页 p-12 flex-1） -->
      <div class="reg-panel">
        <!-- 品牌区（学登录页 brand） -->
        <div class="reg-brand">
          <div class="reg-brand-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h2 class="reg-brand-title">创建新账户</h2>
            <p class="reg-brand-sub">填写信息，开启全功能体验</p>
          </div>
        </div>

        <!-- 表单 -->
        <form @submit.prevent="handleRegister" class="reg-form">
          <!-- 用户名 + 邮箱 并排 -->
          <div class="reg-row-2">
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.username }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                <input v-model="username" v-bind="usernameProps" type="text" placeholder="用户名" autocomplete="username" class="reg-input" />
              </div>
              <span v-if="errors.username" class="reg-err">{{ errors.username }}</span>
            </div>
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 5L2 7" />
                </svg>
                <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="电子邮箱" autocomplete="email" class="reg-input" />
              </div>
              <span v-if="errors.email || isEmailDuplicate" class="reg-err">{{ isEmailDuplicate ? '邮箱已注册' : errors.email }}</span>
            </div>
          </div>

          <!-- 验证码 + 获取按钮（学登录页：分隔线 + 按钮） -->
          <div class="group relative">
            <div class="reg-field" :class="{ 'is-error': errors.code }">
              <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" autocomplete="one-time-code" class="reg-input" />
              <button type="button" @click="sendCode" :disabled="isCountingDown" class="reg-code-btn">
                {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
              </button>
            </div>
            <span v-if="errors.code" class="reg-err">{{ errors.code }}</span>
          </div>

          <!-- 密码 + 确认 并排 -->
          <div class="reg-row-2">
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.password }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input v-model="password" v-bind="passwordProps" type="password" placeholder="登录密码" autocomplete="new-password" class="reg-input" />
              </div>
              <span v-if="errors.password" class="reg-err">{{ errors.password }}</span>
            </div>
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.confirmPassword }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="确认密码" autocomplete="new-password" class="reg-input" />
              </div>
              <span v-if="errors.confirmPassword" class="reg-err">{{ errors.confirmPassword }}</span>
            </div>
          </div>

          <!-- 提交按钮（学登录页渐变） -->
          <button type="submit" class="reg-submit">创建账户</button>

          <!-- 协议 -->
          <label class="reg-agree">
            <input type="checkbox" v-model="agreed" class="hidden" />
            <span class="reg-checkbox" :class="{ checked: agreed }">
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

        <!-- 返回登录 -->
        <div class="reg-signin">
          已有账户？
          <router-link :to="{ path: isMini ? '/mini-login' : '/', query: route.query }" class="reg-link">立即返回登录</router-link>
        </div>
      </div>
    </div>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />
  </div>
</template>

<style scoped>
/* === 视口（学登录页：装饰光斑 + 居中） === */
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
}

/* 装饰光斑（学登录页 blob） */
.reg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  animation: pulse 4s ease-in-out infinite;
}
.reg-blob-1 {
  top: -8%;
  left: -5%;
  width: 360px;
  height: 360px;
  background: rgba(99, 102, 241, 0.2);
}
.reg-blob-2 {
  bottom: -8%;
  right: -5%;
  width: 320px;
  height: 320px;
  background: rgba(217, 70, 239, 0.15);
  animation-delay: 0.7s;
}
:global(.dark) .reg-blob-1 {
  background: rgba(99, 102, 241, 0.3);
}
:global(.dark) .reg-blob-2 {
  background: rgba(217, 70, 239, 0.22);
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* === 卡片（学登录页 856×480 glass-effect rounded-[32px]） === */
.reg-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 48px);
  border-radius: 32px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 20px 60px -10px rgba(15, 23, 42, 0.15);
}
:global(.dark) .reg-card {
  border-color: rgba(148, 163, 184, 0.2);
  box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.5);
}

/* 左面板（学登录页 p-12 flex flex-col） */
.reg-panel {
  padding: 32px 36px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 品牌区（学登录页 brand mb-10） */
.reg-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
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
  flex-shrink: 0;
}
.reg-brand-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin: 0;
}
:global(.dark) .reg-brand-title {
  color: #fff;
}
.reg-brand-sub {
  font-size: 12px;
  color: #64748b;
  margin: 2px 0 0;
}
:global(.dark) .reg-brand-sub {
  color: #94a3b8;
}

/* === 表单（学登录页 space-y-5） === */
.reg-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}
.reg-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* 输入框（学登录页：外层 div + focus-within:ring） */
.reg-field {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  gap: 10px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  transition: all 0.2s;
}
:global(.dark) .reg-field {
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(51, 65, 85, 0.5);
}
.reg-field:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  background: #fff;
}
:global(.dark) .reg-field:focus-within {
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.25);
}
.reg-field.is-error {
  border-color: #ef4444;
}
.reg-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
.reg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: #0f172a;
  height: 100%;
  min-width: 0;
}
:global(.dark) .reg-input {
  color: #f1f5f9;
}
.reg-input::placeholder {
  color: #94a3b8;
}

/* 获取验证码按钮（学登录页：分隔线 + text-primary） */
.reg-code-btn {
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  padding-left: 12px;
  border-left: 1px solid rgba(226, 232, 240, 0.9);
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

/* 错误提示（学登录页 absolute -bottom-5） */
.reg-err {
  position: absolute;
  bottom: -16px;
  left: 4px;
  font-size: 10px;
  color: #ef4444;
}

/* 提交按钮（学登录页渐变 from-primary to-fuchsia-600） */
.reg-submit {
  height: 44px;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(to right, #4f46e5, #d946ef);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.3);
}
.reg-submit:hover {
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
}
.reg-submit:active {
  transform: scale(0.98);
}

/* 协议 */
.reg-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
  cursor: pointer;
  user-select: none;
}
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
  flex-shrink: 0;
  transition: all 0.2s;
}
:global(.dark) .reg-checkbox {
  border-color: #475569;
}
.reg-checkbox.checked {
  background: #4f46e5;
  border-color: #4f46e5;
}
.reg-agree-text {
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}
:global(.dark) .reg-agree-text {
  color: #94a3b8;
}
.reg-link {
  color: #4f46e5;
  cursor: pointer;
}
.reg-link:hover {
  text-decoration: underline;
}

/* 返回登录 */
.reg-signin {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.8);
  text-align: center;
  font-size: 12px;
  color: #64748b;
}
:global(.dark) .reg-signin {
  border-top-color: rgba(51, 65, 85, 0.5);
  color: #94a3b8;
}

/* === mini 模式（iframe） === */
.reg-viewport.is-mini {
  padding: 0;
}
.reg-viewport.is-mini .reg-blob {
  display: none;
}
.reg-viewport.is-mini .reg-card {
  max-width: 100%;
  max-height: 100%;
  border-radius: 0;
  border: none;
  box-shadow: none;
}
.reg-viewport.is-mini .reg-panel {
  padding: 24px 28px;
  justify-content: center;
}
</style>
