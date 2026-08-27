<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRoute, useRouter } from 'vue-router';
import { ref, onMounted, onUnmounted } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';
import { useCountdown } from '@/composables/useCountdown';
import { useCaptchaFlow } from '@/composables/useCaptchaFlow';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useRecaptcha } from '@/composables/useRecaptcha';

const { error: showError, success: showSuccess } = useMessage();

const { isEnabled: recaptchaEnabled, loadRecaptcha, getRecaptchaToken, dispose } = useRecaptcha('register');
onMounted(() => {
  if (recaptchaEnabled) loadRecaptcha();
});
onUnmounted(() => dispose());

const router = useRouter();
const route = useRoute();

// 分步状态：1 - 账号与验证码，2 - 密码与协议
const step = ref<1 | 2>(1);

const registerSchema = z
  .object({
    username: z.string({ required_error: '请输入用户名' }).min(2, '用户名至少2位'),
    email: z.string({ required_error: '请输入邮箱' }).email('请输入有效的邮箱'),
    code: z.string({ required_error: '请输入验证码' }).min(4, '验证码至少4位'),
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
    message: '两次输入的密码不一致',
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
const docType = ref<'service' | 'privacy' | null>(null);
const isEmailDuplicate = ref(false);
const { active: isCountingDown, remaining: countdown, start: startCountdown } = useCountdown(60);

// 图形验证码流程：弹窗 → 通过 → 拿 captchaKey + 启动倒计时
const { captchaKey, showCaptcha, openCaptcha: openRegCaptcha, onCaptchaSuccess } = useCaptchaFlow<'register'>(
  () => startCountdown(60)
);

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

// 发送验证码前先查重：邮箱已注册则拦截，不允许发码
const sendCode = async () => {
  if (!values.email || errors.value.email) return;
  await checkEmail(); // 强制查重（用户可能没 blur 就点按钮）
  if (isEmailDuplicate.value) {
    showError('该邮箱已被注册，请直接登录');
    return;
  }
  openRegCaptcha('register');
};

// 步骤 1 校验并前往步骤 2（用户名 + 邮箱 + 验证码 都通过且邮箱未重复）
const handleNextStep = async () => {
  const resUser = await validateField('username');
  const resEmail = await validateField('email');
  const resCode = await validateField('code');
  if (resUser.valid && resEmail.valid && resCode.valid && !isEmailDuplicate.value) {
    step.value = 2;
  }
};

const handleRegister = handleSubmit(
  async () => {
    if (!agreed.value) {
      showError('请阅读并同意协议');
      return;
    }
    if (isEmailDuplicate.value) {
      showError('邮箱已被注册');
      return;
    }
    const { confirmPassword, ...submitData } = values;
    const encryptedPassword = await rsaEncrypt(submitData.password!);
    const recaptchaToken = recaptchaEnabled ? await getRecaptchaToken() : null;
    try {
      await authApi.register({
        ...submitData,
        password: encryptedPassword,
        kid: getCachedKid(),
        captchaKey: captchaKey.value,
        ...(recaptchaToken ? { recaptchaToken } : {})
      });
      showSuccess('注册成功！现在您可以返回登录了');
      router.push('/');
    } catch (err: any) {
      showError(err?.message || '注册失败，请稍后重试');
    }
  },
  err => console.log('Validation errors:', err)
);

const openDoc = (type: 'service' | 'privacy') => {
  docType.value = type;
};
</script>

<template>
  <div class="reg-viewport">
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
          :to="{ path: '/', query: route.query }"
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
        <!-- 标题 + 步骤指示 -->
        <div class="reg-head">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="reg-title">创建新账户</h2>
              <p class="reg-sub">{{ step === 1 ? '步骤 1/2：填写账号与验证码' : '步骤 2/2：设置安全登录密码' }}</p>
            </div>
            <!-- 步骤指示小圆点（学 mini 注册页） -->
            <div class="flex items-center gap-1.5">
              <span class="reg-step-dot" :class="step === 1 ? 'reg-step-active' : ''"></span>
              <span class="reg-step-dot" :class="step === 2 ? 'reg-step-active' : ''"></span>
            </div>
          </div>
        </div>

        <!-- 表单（分步：1 账号+验证码 / 2 密码+协议） -->
        <form @submit.prevent="step === 1 ? handleNextStep() : handleRegister()" class="reg-form">
          <!-- 第一步：账号 + 验证码 -->
          <div v-if="step === 1" class="reg-step-box">
            <!-- 用户名 -->
            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.username }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <input v-model="username" v-bind="usernameProps" type="text" placeholder="用户名" autocomplete="username" class="reg-input" />
              </div>
              <div class="reg-err">{{ errors.username }}</div>
            </div>

            <!-- 邮箱 -->
            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="电子邮箱" autocomplete="email" class="reg-input" />
              </div>
              <div class="reg-err">{{ isEmailDuplicate ? '邮箱已被注册' : errors.email }}</div>
            </div>

            <!-- 验证码 -->
            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.code }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" autocomplete="one-time-code" class="reg-input" />
                <button type="button" @click="sendCode" :disabled="isCountingDown" class="reg-code-btn">
                  {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
                </button>
              </div>
              <div class="reg-err">{{ errors.code }}</div>
            </div>

            <!-- 下一步 -->
            <button type="button" @click="handleNextStep" class="reg-submit">下一步</button>
          </div>

          <!-- 第二步：密码 + 协议 -->
          <div v-else class="reg-step-box">
            <!-- 登录密码 -->
            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.password }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input v-model="password" v-bind="passwordProps" type="password" placeholder="设置密码（大写+小写+数字，8位以上）" autocomplete="new-password" class="reg-input" />
              </div>
              <div class="reg-err">{{ errors.password }}</div>
            </div>

            <!-- 确认密码 -->
            <div class="reg-cell">
              <div class="reg-field" :class="{ 'is-error': errors.confirmPassword }">
                <svg class="reg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="再次确认登录密码" autocomplete="new-password" class="reg-input" />
              </div>
              <div class="reg-err">{{ errors.confirmPassword }}</div>
            </div>

            <!-- 协议勾选 -->
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

            <!-- 上一步 + 完成注册 -->
            <div class="flex gap-3 mt-1">
              <button type="button" @click="step = 1" class="reg-back-btn">上一步</button>
              <button type="submit" class="reg-submit flex-1" :disabled="!agreed" :class="{ 'opacity-50 cursor-not-allowed': !agreed }">
                完成注册
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" :send-email="true" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />
    <!-- 服务协议 / 隐私政策 弹窗（统一组件） -->
    <AgreementModals v-model:type="docType" />
    <!-- 错误/成功提示 toast -->
    <MessageToast />
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

/* === 表单（分步：紧贴错误位，输入框位置不跳动） === */
.reg-form {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.reg-step-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* 字段单元：输入框 + 紧贴其下的错误位（固定高度，无错误也占位防抖动） */
.reg-cell {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

/* 步骤指示小圆点（学 mini 注册页） */
.reg-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #e2e8f0;
  transition: all 0.3s;
}
:global(.dark) .reg-step-dot {
  background: #334155;
}
.reg-step-dot.reg-step-active {
  width: 16px;
  background: #2563eb;
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
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
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
  color: #2563eb;
  padding-left: 16px;
  border-left: 1px solid #e2e8f0;
  white-space: nowrap;
  background: transparent;
  border-top: none;
  border-right: none;
  border-bottom: none;
  cursor: pointer;
  transition: color 0.2s;
}
:global(.dark) .reg-code-btn {
  border-left-color: #1e293b;
}
.reg-code-btn:hover:not(:disabled) {
  color: #1d4ed8;
}
.reg-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误位：紧贴输入框下方，固定高度始终预留（无错误也占位，输入框位置不跳动） */
.reg-err {
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

/* 提交按钮（蓝紫渐变，对齐 mini 注册页 #2563eb→#4f46e5） */
.reg-submit {
  height: 48px;
  width: 100%;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}
.reg-submit:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}
.reg-submit:active:not(:disabled) {
  transform: translateY(0);
}

/* 上一步按钮（次要，灰底） */
.reg-back-btn {
  height: 48px;
  padding: 0 20px;
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
:global(.dark) .reg-back-btn {
  color: #94a3b8;
  background: #1e293b;
}
.reg-back-btn:hover {
  background: #e2e8f0;
  color: #334155;
}
:global(.dark) .reg-back-btn:hover {
  background: #334155;
  color: #f1f5f9;
}

/* 协议 */
.reg-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
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
/* 复选框选中用蓝紫渐变（对齐 mini 注册页） */
.reg-checkbox.checked {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  border-color: #2563eb;
}
.reg-agree-text {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
:global(.dark) .reg-agree-text {
  color: #94a3b8;
}
.reg-link {
  color: #2563eb;
  cursor: pointer;
  transition: color 0.2s;
}
.reg-link:hover {
  color: #1d4ed8;
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
</style>
