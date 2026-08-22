<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { useRoute, useRouter } from 'vue-router';
import { ref, onMounted } from 'vue';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import AuthContainer from '@/components/common/AuthContainer.vue';
import DocModal from '@/components/common/DocModal.vue';
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

const handleRegister = handleSubmit(async () => {
  if (!agreed.value || isEmailDuplicate.value) return;
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
  router.push({ path: '/mini-login', query: route.query });
});
</script>

<template>
  <div class="w-full h-full">
    <AuthContainer :appName="(route.query.appName as string) || 'Enterprise SSO'" :showQrSwitcher="false">
      <template #header>
        <h2 class="text-xl font-bold dark:text-white">创建新账户</h2>
        <p class="text-xs text-slate-400 mt-1">填写信息，开启全功能体验</p>
      </template>

      <form @submit.prevent="handleRegister" class="flex flex-col gap-3">
        <!-- 用户名 + 邮箱 并排 -->
        <div class="grid grid-cols-2 gap-2.5">
          <div class="group relative">
            <div class="mreg-field" :class="{ 'is-error': errors.username }">
              <input v-model="username" v-bind="usernameProps" type="text" placeholder="用户名" class="mreg-input" />
            </div>
            <span v-if="errors.username" class="mreg-err">{{ errors.username }}</span>
          </div>
          <div class="group relative">
            <div class="mreg-field" :class="{ 'is-error': errors.email || isEmailDuplicate }">
              <input v-model="email" v-bind="emailProps" @blur="checkEmail" type="email" placeholder="电子邮箱" class="mreg-input" />
            </div>
            <span v-if="errors.email || isEmailDuplicate" class="mreg-err">{{ isEmailDuplicate ? '邮箱已注册' : errors.email }}</span>
          </div>
        </div>

        <!-- 验证码 + 获取 -->
        <div class="group relative">
          <div class="mreg-field" :class="{ 'is-error': errors.code }">
            <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" class="mreg-input" />
            <button type="button" @click="sendCode" :disabled="isCountingDown" class="mreg-code-btn">
              {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
            </button>
          </div>
          <span v-if="errors.code" class="mreg-err">{{ errors.code }}</span>
        </div>

        <!-- 密码 + 确认 并排 -->
        <div class="grid grid-cols-2 gap-2.5">
          <div class="group relative">
            <div class="mreg-field" :class="{ 'is-error': errors.password }">
              <input v-model="password" v-bind="passwordProps" type="password" placeholder="登录密码" class="mreg-input" />
            </div>
            <span v-if="errors.password" class="mreg-err">{{ errors.password }}</span>
          </div>
          <div class="group relative">
            <div class="mreg-field" :class="{ 'is-error': errors.confirmPassword }">
              <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="确认密码" class="mreg-input" />
            </div>
            <span v-if="errors.confirmPassword" class="mreg-err">{{ errors.confirmPassword }}</span>
          </div>
        </div>

        <!-- 提交 -->
        <button type="submit" class="mreg-submit">创建账户</button>

        <!-- 协议 -->
        <label class="mreg-agree">
          <input type="checkbox" v-model="agreed" class="hidden" />
          <span class="mreg-checkbox" :class="{ checked: agreed }">
            <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
          <span class="text-[11px] text-slate-400 leading-tight">
            已阅读并同意
            <span @click.stop.prevent="docType = 'service'" class="text-primary hover:underline">《服务协议》</span>
            与
            <span @click.stop.prevent="docType = 'privacy'" class="text-primary hover:underline">《隐私政策》</span>
          </span>
        </label>

        <!-- 返回登录 -->
        <p class="mreg-signin">
          已有账户？<router-link :to="{ path: '/mini-login', query: route.query }" class="mreg-link">立即返回登录</router-link>
        </p>
      </form>
    </AuthContainer>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

    <DocModal :is-open="docType === 'service'" title="服务协议" @close="docType = null">
      <p class="text-xs text-slate-400">最后更新：2026年8月22日</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、服务说明</h3>
      <p>CoreFlow 提供身份认证、应用授权、协作管理等企业级服务。注册即代表同意本协议。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">二、账户使用</h3>
      <p>需真实邮箱注册，对密码保密负责，不得转让出借账户。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">三、行为规范</h3>
      <p>不得发布违法信息、破坏系统安全、干扰其他用户。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">四、知识产权</h3>
      <p>服务界面代码归 CoreFlow 所有，您的原创内容归您所有。</p>
    </DocModal>

    <DocModal :is-open="docType === 'privacy'" title="隐私政策" @close="docType = null">
      <p class="text-xs text-slate-400">最后更新：2026年8月22日</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、信息收集</h3>
      <p>注册信息（邮箱、昵称）、登录信息（IP、设备）、使用数据。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">二、信息使用</h3>
      <p>仅用于提供服务、安全防护、改进体验，不售予第三方。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">三、信息保护</h3>
      <p>密码 bcrypt 哈希、RSA 传输、HttpOnly Cookie、严格权限控制。</p>
    </DocModal>
  </div>
</template>

<style scoped>
/* 输入框（对齐 MiniLogin：h-12 实色白底 border focus-within:ring） */
.mreg-field {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  gap: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  transition: all 0.2s;
}
:global(.dark) .mreg-field {
  background: #0f172a;
  border-color: #1e293b;
}
.mreg-field:focus-within {
  border-color: #4f46e5;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
}
.mreg-field.is-error {
  border-color: #ef4444;
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
  font-size: 11px;
  font-weight: 700;
  color: #4f46e5;
  padding-left: 12px;
  border-left: 1px solid #e2e8f0;
  white-space: nowrap;
}
:global(.dark) .mreg-code-btn {
  border-left-color: #1e293b;
}
.mreg-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}
.mreg-err {
  display: block;
  margin-top: 4px;
  padding-left: 4px;
  font-size: 10px;
  color: #ef4444;
  min-height: 0;
}
.mreg-submit {
  height: 44px;
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(to right, #4f46e5, #d946ef);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.25);
}
.mreg-submit:active {
  transform: scale(0.98);
}
.mreg-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.mreg-checkbox {
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
:global(.dark) .mreg-checkbox {
  border-color: #475569;
}
.mreg-checkbox.checked {
  background: #4f46e5;
  border-color: #4f46e5;
}

/* 返回登录 */
.mreg-signin {
  margin: 4px 0 0;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}
:global(.dark) .mreg-signin {
  color: #94a3b8;
}
.mreg-link {
  color: #4f46e5;
  font-weight: 500;
}
.mreg-link:hover {
  text-decoration: underline;
}
</style>
