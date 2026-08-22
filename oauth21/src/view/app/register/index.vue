<script setup lang="ts">
import { authApi } from '@/api/auth';
import { useForm } from 'vee-validate';
import { z } from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import GraphicCaptcha from '@/components/common/GraphicCaptcha.vue';
import DocModal from '@/components/common/DocModal.vue';
import { rsaEncrypt, getCachedKid } from '@/utils/crypto';
import { useRecaptcha } from '@/composables/useRecaptcha';
import { onMounted, ref } from 'vue';

const { isEnabled: recaptchaEnabled, loadRecaptcha, getRecaptchaToken } = useRecaptcha();
onMounted(() => {
  if (recaptchaEnabled.value) loadRecaptcha();
});

const router = useRouter();

const registerSchema = z
  .object({
    nickname: z.string().min(2, '昵称至少2位'),
    email: z.string().email('邮箱格式不正确'),
    code: z.string().min(4, '验证码至少4位'),
    password: z.string().min(6, '密码至少6位'),
    confirmPassword: z.string().min(6, '请确认密码')
  })
  .refine((data: any) => data.password === data.confirmPassword, {
    message: '两次输入密码不一致',
    path: ['confirmPassword']
  });

const { values, errors, defineField, handleSubmit } = useForm({
  validationSchema: toTypedSchema(registerSchema)
});

const [nickname, nicknameProps] = defineField('nickname');
const [email, emailProps] = defineField('email');
const [code, codeProps] = defineField('code');
const [password, passwordProps] = defineField('password');
const [confirmPassword, confirmPasswordProps] = defineField('confirmPassword');

const agreed = ref(false);
const isCountingDown = ref(false);
const countdown = ref(60);
const showCaptcha = ref(false);
const captchaKey = ref('');
const docType = ref<'service' | 'privacy' | null>(null);

const sendCode = () => {
  if (!values.email || errors.value.email) {
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

const handleRegister = handleSubmit(async data => {
  if (!agreed.value) {
    return;
  }
  try {
    const { confirmPassword, ...submitData } = data;
    const encryptedPassword = await rsaEncrypt(submitData.password);
    const recaptchaToken = recaptchaEnabled.value ? await getRecaptchaToken() : null;
    await authApi.register({
      ...submitData,
      password: encryptedPassword,
      kid: getCachedKid(),
      captchaKey: captchaKey.value,
      ...(recaptchaToken ? { recaptchaToken } : {})
    });
    router.push('/m/login');
  } catch (err: any) {
    alert(err.message);
  }
});
</script>

<template>
  <!-- iframe 弹窗场景：左右分栏，856×484 撑满 -->
  <div class="mreg-viewport">
    <!-- 左品牌栏 -->
    <div class="mreg-brand">
      <div class="mreg-brand-bg"></div>
      <div class="mreg-brand-content">
        <div class="mreg-logo">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 class="mreg-title">开启您的<br />数字之旅</h2>
        <p class="mreg-desc">加入万千企业的选择，即刻开启安全、高效的云端工作空间。</p>
      </div>
      <router-link to="/m/login" class="mreg-back">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        已有账户？立即返回登录
      </router-link>
    </div>

    <!-- 右表单栏 -->
    <div class="mreg-panel">
      <div class="mreg-head">
        <h3 class="mreg-form-title">创建新账户</h3>
        <p class="mreg-form-sub">填写信息，开启全功能体验</p>
      </div>

      <form @submit.prevent="handleRegister" class="mreg-form">
        <!-- 用户名 + 邮箱 并排 -->
        <div class="mreg-row-2">
          <div class="mreg-field" :class="{ 'is-error': errors.nickname }">
            <input v-model="nickname" v-bind="nicknameProps" type="text" placeholder="用户名" class="mreg-input" />
          </div>
          <div class="mreg-field" :class="{ 'is-error': errors.email }">
            <input v-model="email" v-bind="emailProps" type="email" placeholder="电子邮箱" class="mreg-input" />
          </div>
        </div>
        <p v-if="errors.nickname || errors.email" class="mreg-err">{{ errors.nickname || errors.email }}</p>

        <!-- 验证码 + 获取 -->
        <div class="mreg-field" :class="{ 'is-error': errors.code }">
          <input v-model="code" v-bind="codeProps" type="text" placeholder="邮箱验证码" class="mreg-input" />
          <button type="button" @click="sendCode" :disabled="isCountingDown" class="mreg-code-btn">
            {{ isCountingDown ? `${countdown}s` : '获取验证码' }}
          </button>
        </div>
        <p v-if="errors.code" class="mreg-err">{{ errors.code }}</p>

        <!-- 密码 + 确认 并排 -->
        <div class="mreg-row-2">
          <div class="mreg-field" :class="{ 'is-error': errors.password }">
            <input v-model="password" v-bind="passwordProps" type="password" placeholder="登录密码" class="mreg-input" />
          </div>
          <div class="mreg-field" :class="{ 'is-error': errors.confirmPassword }">
            <input v-model="confirmPassword" v-bind="confirmPasswordProps" type="password" placeholder="确认密码" class="mreg-input" />
          </div>
        </div>
        <p v-if="errors.password || errors.confirmPassword" class="mreg-err">{{ errors.password || errors.confirmPassword }}</p>

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
          <span class="mreg-agree-text">
            已阅读并同意
            <span @click.stop.prevent="docType = 'service'" class="mreg-link">《服务协议》</span>
            与
            <span @click.stop.prevent="docType = 'privacy'" class="mreg-link">《隐私政策》</span>
          </span>
        </label>
      </form>
    </div>

    <GraphicCaptcha :is-open="showCaptcha" :email="values.email" type="register" @close="showCaptcha = false" @success="onCaptchaSuccess" />

    <DocModal :is-open="docType === 'service'" title="服务协议" @close="docType = null">
      <p class="text-xs text-slate-400">最后更新：2026年8月22日</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、服务说明</h3>
      <p>CoreFlow 由 CoreFlow 团队运营，提供身份认证、应用授权、协作管理等企业级服务。注册即代表同意本协议。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">二、账户注册与使用</h3>
      <p>1. 需提供真实邮箱注册，对密码保密负责。</p>
      <p>2. 不得转让、出借账户，泄露损失自负。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">三、行为规范</h3>
      <p>不得发布违法信息、破坏系统安全、干扰其他用户。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">四、知识产权</h3>
      <p>服务界面、代码归 CoreFlow 所有，您的原创内容归您所有。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">五、变更与终止</h3>
      <p>我们可变更或停止服务并公告；您违约时我们可限制账户。</p>
    </DocModal>

    <DocModal :is-open="docType === 'privacy'" title="隐私政策" @close="docType = null">
      <p class="text-xs text-slate-400">最后更新：2026年8月22日</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、信息收集</h3>
      <p>注册信息（邮箱、昵称）、登录信息（IP、设备）、使用数据。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">二、信息使用</h3>
      <p>仅用于提供服务、安全防护、改进体验，不售予第三方。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">三、信息保护</h3>
      <p>密码 bcrypt 哈希、RSA 传输、HttpOnly Cookie、严格权限控制。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">四、信息共享</h3>
      <p>不售予第三方，仅经授权或法律要求时共享。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">五、您的权利</h3>
      <p>可访问、更正、删除个人信息。</p>
    </DocModal>
  </div>
</template>

<style scoped>
.mreg-viewport {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  background: #fff;
}
:global(.dark) .mreg-viewport {
  background: #0f172a;
}

/* === 左品牌栏 === */
.mreg-brand {
  width: 280px;
  flex-shrink: 0;
  position: relative;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #fff;
  overflow: hidden;
  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #8b5cf6 100%);
}
.mreg-brand-bg {
  position: absolute;
  inset: 0;
  opacity: 0.1;
  background: radial-gradient(circle at 50% -20%, #fff, transparent 60%);
  pointer-events: none;
}
.mreg-brand-content {
  position: relative;
  z-index: 1;
}
.mreg-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}
.mreg-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  margin: 0 0 10px;
  letter-spacing: -0.02em;
}
.mreg-desc {
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
  max-width: 200px;
}
.mreg-back {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  text-decoration: none;
  transition: color 0.2s;
}
.mreg-back:hover {
  color: rgba(255, 255, 255, 0.85);
}

/* === 右表单栏 === */
.mreg-panel {
  flex: 1;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}
.mreg-head {
  margin-bottom: 18px;
}
.mreg-form-title {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}
:global(.dark) .mreg-form-title {
  color: #fff;
}
.mreg-form-sub {
  font-size: 12px;
  color: #64748b;
  margin: 4px 0 0;
}
:global(.dark) .mreg-form-sub {
  color: #94a3b8;
}

/* === 表单 === */
.mreg-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mreg-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* 输入框（对齐登录页：h-12 实色白底 border focus-within:ring） */
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
  background: #1e293b;
  border-color: #334155;
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

/* 获取验证码按钮 */
.mreg-code-btn {
  font-size: 11px;
  font-weight: 700;
  color: #4f46e5;
  padding-left: 12px;
  border-left: 1px solid #e2e8f0;
  white-space: nowrap;
  transition: color 0.2s;
}
:global(.dark) .mreg-code-btn {
  border-left-color: #334155;
}
.mreg-code-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

/* 错误提示 */
.mreg-err {
  margin: -8px 0 0;
  padding: 0 4px;
  font-size: 11px;
  color: #ef4444;
}

/* 提交按钮 */
.mreg-submit {
  height: 44px;
  margin-top: 4px;
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
.mreg-submit:hover {
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.35);
}
.mreg-submit:active {
  transform: scale(0.98);
}

/* 协议 */
.mreg-agree {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 4px;
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
.mreg-agree-text {
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}
:global(.dark) .mreg-agree-text {
  color: #94a3b8;
}
.mreg-link {
  color: #4f46e5;
  cursor: pointer;
}
.mreg-link:hover {
  text-decoration: underline;
}
</style>
