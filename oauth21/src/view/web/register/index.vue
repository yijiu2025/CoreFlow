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

    <!-- 玻璃卡片（学登录页：856×480 glass-effect rounded-[32px] 左右分栏） -->
    <div class="reg-card glass-effect">
      <!-- 左品牌栏（学登录页渐变品牌区） -->
      <div class="reg-brand-panel">
        <div class="reg-brand-bg"></div>
        <div class="reg-brand-content">
          <div class="reg-brand-logo">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 class="reg-brand-title">开启您的<br />数字之旅</h2>
          <p class="reg-brand-desc">加入万千企业的选择，即刻开启安全、高效的云端工作空间。</p>
          <ul class="reg-brand-features">
            <li><span class="reg-check"></span>企业级数据加密</li>
            <li><span class="reg-check"></span>多应用统一身份</li>
            <li><span class="reg-check"></span>随时撤销授权</li>
          </ul>
        </div>

        <!-- 左下角：返回登录 -->
        <router-link
          :to="{ path: isMini ? '/mini-login' : '/', query: route.query }"
          class="reg-brand-signin"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          已有账户？立即返回登录
        </router-link>
      </div>

      <!-- 右表单栏 -->
      <div class="reg-panel">
        <!-- iframe 模式：顶部返回登录（左品牌栏隐藏时用） -->
        <router-link
          v-if="isMini"
          :to="{ path: '/mini-login', query: route.query }"
          class="reg-back-mini"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          返回登录
        </router-link>

        <!-- 标题 -->
        <div class="reg-head">
          <h2 class="reg-title">创建新账户</h2>
          <p class="reg-sub">填写信息，开启全功能体验</p>
        </div>

        <!-- 表单 -->
        <form @submit.prevent="handleRegister" class="reg-form">
          <!-- 用户名 + 邮箱 并排 -->
          <div class="reg-row-2">
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.username }">
                <input v-model="username" v-bind="usernameProps" type="text" placeholder="用户名" autocomplete="username" class="reg-input" />
              </div>
              <span v-if="errors.username" class="reg-err">{{ errors.username }}</span>
            </div>
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
                <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="电子邮箱" autocomplete="email" class="reg-input" />
              </div>
              <span v-if="errors.email || isEmailDuplicate" class="reg-err">{{ isEmailDuplicate ? '邮箱已注册' : errors.email }}</span>
            </div>
          </div>

          <!-- 验证码 + 获取按钮 -->
          <div class="group relative">
            <div class="reg-field" :class="{ 'is-error': errors.code }">
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
                <input v-model="password" v-bind="passwordProps" type="password" placeholder="登录密码" autocomplete="new-password" class="reg-input" />
              </div>
              <span v-if="errors.password" class="reg-err">{{ errors.password }}</span>
            </div>
            <div class="group relative">
              <div class="reg-field" :class="{ 'is-error': errors.confirmPassword }">
                <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="确认密码" autocomplete="new-password" class="reg-input" />
              </div>
              <span v-if="errors.confirmPassword" class="reg-err">{{ errors.confirmPassword }}</span>
            </div>
          </div>

          <!-- 提交按钮 -->
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

/* === 卡片（学登录页 glass-effect rounded-[32px] 左右分栏） === */
.reg-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 856px;
  min-height: 520px;
  max-height: calc(100vh - 48px);
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 20px 60px -10px rgba(15, 23, 42, 0.15);
}
:global(.dark) .reg-card {
  border-color: rgba(148, 163, 184, 0.2);
  box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.5);
}

/* 左品牌栏（白灰色调，对齐登录页，不用彩色渐变） */
.reg-brand-panel {
  width: 300px;
  flex-shrink: 0;
  position: relative;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #0f172a;
  overflow: hidden;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}
:global(.dark) .reg-brand-panel {
  color: #f1f5f9;
  background: #0f172a;
  border-right-color: #1e293b;
}
.reg-brand-bg {
  display: none;
}
.reg-brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
}
/* logo：对齐登录页渐变方块 from-primary to-fuchsia-500 */
.reg-brand-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4f46e5, #d946ef);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.25);
  margin-bottom: 24px;
}
.reg-brand-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0 0 12px;
  color: #0f172a;
}
:global(.dark) .reg-brand-title {
  color: #f1f5f9;
}
.reg-brand-desc {
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
  margin: 0 0 24px;
  max-width: 200px;
}
:global(.dark) .reg-brand-desc {
  color: #94a3b8;
}
.reg-brand-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reg-brand-features li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
}
:global(.dark) .reg-brand-features li {
  color: #94a3b8;
}
.reg-check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}
:global(.dark) .reg-check {
  background: #1e293b;
  border-color: #334155;
}
.reg-check::after {
  content: '';
  width: 6px;
  height: 3px;
  border-left: 1.5px solid #4f46e5;
  border-bottom: 1.5px solid #4f46e5;
  transform: rotate(-45deg) translate(1px, -1px);
}

/* 右表单栏 */
.reg-panel {
  flex: 1;
  padding: 36px 40px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-width: 0;
  justify-content: space-between;
}

/* 标题区 */
.reg-head {
  margin-bottom: 20px;
}

/* iframe 模式顶部返回 */
.reg-back-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  margin-bottom: 12px;
  transition: color 0.2s;
}
:global(.dark) .reg-back-mini {
  color: #94a3b8;
}
.reg-back-mini:hover {
  color: #4f46e5;
}
.reg-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin: 0;
}
:global(.dark) .reg-title {
  color: #fff;
}
.reg-sub {
  font-size: 12px;
  color: #64748b;
  margin: 4px 0 0;
}
:global(.dark) .reg-sub {
  color: #94a3b8;
}

/* === 表单（学登录页 space-y-5 + h-12 输入框） === */
.reg-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
}
.reg-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* 输入框（严格对齐登录页：h-12 实色白底 border-slate-200 focus-within:ring） */
.reg-field {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  gap: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s;
}
:global(.dark) .reg-field {
  background: #0f172a;
  border-color: #1e293b;
}
.reg-field:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
}
.reg-field.is-error {
  border-color: #ef4444;
}
.reg-icon {
  color: #94a3b8;
  flex-shrink: 0;
}
:global(.dark) .reg-icon {
  color: #64748b;
}
.reg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
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

/* 获取验证码按钮（对齐登录页：text-xs font-bold text-primary border-l） */
.reg-code-btn {
  font-size: 12px;
  font-weight: 700;
  color: #4f46e5;
  padding-left: 16px;
  border-left: 1px solid #e2e8f0;
  white-space: nowrap;
  transition: color 0.2s;
}
:global(.dark) .reg-code-btn {
  border-left-color: #1e293b;
}
.reg-code-btn:hover:not(:disabled) {
  color: #4338ca;
}
:global(.dark) .reg-code-btn:hover:not(:disabled) {
  color: #818cf8;
}
.reg-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误提示（对齐登录页 absolute -bottom-5 text-[10px]） */
.reg-err {
  position: absolute;
  bottom: -18px;
  left: 4px;
  font-size: 10px;
  color: #ef4444;
}

/* 提交按钮（对齐登录页 h-12 渐变 from-primary to-fuchsia-600） */
.reg-submit {
  height: 48px;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(to right, #4f46e5, #d946ef);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.25);
}
.reg-submit:hover {
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.35);
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

/* 左下角返回登录（品牌栏底部，白色） */
.reg-brand-signin {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-top: 20px;
  border-top: 1px solid #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  text-decoration: none;
  transition: color 0.2s;
}
:global(.dark) .reg-brand-signin {
  border-top-color: #1e293b;
  color: #94a3b8;
}
.reg-brand-signin:hover {
  color: #4f46e5;
}

/* === mini 模式（iframe 弹窗，from=mini）：保留品牌栏，紧凑撑满 856×484 === */
.reg-viewport.is-mini {
  padding: 0;
  background: transparent;
}
.reg-viewport.is-mini .reg-blob {
  display: none;
}
.reg-viewport.is-mini .reg-card {
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}
:global(.dark) .reg-viewport.is-mini .reg-card {
  background: transparent;
}
/* iframe 里品牌栏窄一点（保留，对齐登录页配色） */
.reg-viewport.is-mini .reg-brand-panel {
  width: 240px;
  padding: 24px 22px;
}
.reg-viewport.is-mini .reg-brand-title {
  font-size: 20px;
}
.reg-viewport.is-mini .reg-brand-desc {
  font-size: 11px;
}
.reg-viewport.is-mini .reg-panel {
  flex: 1;
  padding: 24px 28px;
  justify-content: center;
}
/* iframe 紧凑：输入框矮一点 */
.reg-viewport.is-mini .reg-field {
  height: 40px;
  padding: 0 12px;
}
.reg-viewport.is-mini .reg-input {
  font-size: 13px;
}
.reg-viewport.is-mini .reg-submit {
  height: 40px;
}
.reg-viewport.is-mini .reg-form {
  gap: 14px;
}
.reg-viewport.is-mini .reg-row-2 {
  gap: 10px;
}
/* iframe 模式不显示顶部返回（左品牌栏底部已有） */
.reg-viewport.is-mini .reg-back-mini {
  display: none;
}
</style>
