<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRoute, useRouter } from 'vue-router';
import { ref, onMounted } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import AgreementModals from '@/components/common/AgreementModals.vue';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useRecaptcha } from '@/composables/useRecaptcha';
import MessageToast from '@/components/common/MessageToast.vue';
import { useMessage } from '@/composables/useMessage';

const { isEnabled: recaptchaEnabled, loadRecaptcha, getRecaptchaToken } = useRecaptcha();
const { error: showError, success: showSuccess } = useMessage();
onMounted(() => {
  if (recaptchaEnabled.value) loadRecaptcha();
});

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
    message: '两次密码不一致',
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
const showCaptcha = ref(false);
const captchaKey = ref('');
const isCountingDown = ref(false);
const countdown = ref(60);
const docType = ref<'service' | 'privacy' | null>(null);

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

// 步骤 1 校验并前往步骤 2
const handleNextStep = async () => {
  const resUser = await validateField('username');
  const resEmail = await validateField('email');
  const resCode = await validateField('code');

  if (resUser.valid && resEmail.valid && resCode.valid && !isEmailDuplicate.value) {
    step.value = 2;
  }
};

const handleRegister = handleSubmit(async () => {
  if (!agreed.value || isEmailDuplicate.value) return;
  const { confirmPassword, ...submitData } = values;
  const encryptedPassword = await rsaEncrypt(submitData.password!);
  const recaptchaToken = recaptchaEnabled.value ? await getRecaptchaToken() : null;
  try {
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    showSuccess('注册成功，即将跳转登录');
    router.push({ path: '/mini-login', query: route.query });
  } catch (err: any) {
    showError(err?.message || '注册失败，请稍后重试');
  }
});
</script>

<template>
  <div class="w-full h-full flex flex-col justify-center overflow-hidden">
    <AuthContainer :appName="(route.query.appName as string) || 'Enterprise SSO'" :showQrSwitcher="false">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold dark:text-white leading-tight">创建新账户</h2>
            <p class="text-xs text-slate-400 mt-1">
              {{ step === 1 ? '步骤 1/2：填写账号与验证码' : '步骤 2/2：设置安全登录密码' }}
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
              <input v-model="username" v-bind="usernameProps" type="text" placeholder="用户名" class="mreg-input" />
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
              <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="邮箱地址" class="mreg-input" />
            </div>
            <div class="mreg-err">{{ isEmailDuplicate ? '邮箱已被注册' : errors.email }}</div>
          </div>

          <!-- 验证码 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.code }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <input v-model="code" v-bind="codeProps" type="text" placeholder="验证码" class="mreg-input" />
              <button type="button" @click="sendCode" :disabled="isCountingDown" class="mreg-code-btn">
                {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
              </button>
            </div>
            <div class="mreg-err">{{ errors.code }}</div>
          </div>

          <!-- 下一步按钮 -->
          <button type="button" @click="handleNextStep" class="mreg-submit">下一步</button>
        </div>

        <!-- 第二步：密码与协议 -->
        <div v-else class="mreg-step-box">
          <!-- 登录密码 -->
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

          <!-- 确认密码 -->
          <div class="mreg-cell">
            <div class="mreg-field" :class="{ 'is-error': errors.confirmPassword }">
              <svg class="mreg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="再次确认登录密码" class="mreg-input" />
            </div>
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
                我已阅读并同意 <span @click.stop.prevent="docType = 'service'" class="mreg-highlight-link">《服务协议》</span> 与 <span @click.stop.prevent="docType = 'privacy'" class="mreg-highlight-link">《隐私政策》</span>
              </span>
            </label>
          </div>

          <!-- 提交/上一步按钮组 -->
          <div class="flex gap-2.5 mt-2">
            <button type="button" @click="step = 1" class="mreg-back-btn">上一步</button>
            <button type="submit" class="mreg-submit flex-1" :disabled="!agreed" :class="{ 'opacity-50 cursor-not-allowed': !agreed }">
              完成注册
            </button>
          </div>
        </div>
      </form>

      <!-- 底部返回登录（移至 #footer 插槽，与 mini-login 结构对齐：
           按钮↔底栏间距由 AuthContainer 的 mt-6 + justify-between 统一控制） -->
      <template #footer>
        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-slate-400">已有账号？</span>
          <p class="mreg-signin">
            <router-link :to="{ path: '/mini-login', query: route.query }" class="mreg-highlight-link font-medium text-xs">
              立即登录
            </router-link>
          </p>
        </div>
      </template>
    </AuthContainer>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

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