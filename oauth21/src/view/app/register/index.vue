<script setup lang="ts">
import { useAuthStore } from '@/stores/auth';
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

const authStore = useAuthStore();
const router = useRouter();

const registerSchema = z
  .object({
    nickname: z.string().min(2, '昵称至少2位'),
    email: z.string().email('邮箱格式不正确'),
    code: z.string().min(4, '验证码至少4位'),
    password: z.string().min(6, '密码至少6位'),
    confirmPassword: z.string().min(6, '请确认密码')
  })
  .refine(data => data.password === data.confirmPassword, {
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

// 协议弹窗
const docType = ref<'service' | 'privacy' | null>(null);

const sendCode = () => {
  if (!values.email || errors.value.email) {
    alert('请先输入有效的邮箱');
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
    alert('请同意协议');
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
    alert('注册成功！');
    router.push('/m/login');
  } catch (err: any) {
    alert(err.message);
  }
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans pb-safe">
    <!-- Header（压缩间距，避免滚动） -->
    <div class="px-6 pt-8 pb-4">
      <router-link to="/m/login" class="inline-flex items-center text-slate-400 mb-4">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        <span class="text-sm font-medium ml-1">返回登录</span>
      </router-link>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white font-outfit">创建新账户</h1>
      <p class="text-slate-400 text-xs mt-1">开启您的企业级协作之旅</p>
    </div>

    <!-- Form（压缩 space-y 和输入框高度） -->
    <form @submit.prevent="handleRegister" class="flex-1 px-6 space-y-3">
      <div class="relative">
        <input
          v-model="nickname"
          v-bind="nicknameProps"
          type="text"
          placeholder="设置用户昵称"
          autocomplete="nickname"
          class="w-full h-12 bg-white dark:bg-slate-900 rounded-xl px-5 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all text-sm"
        />
        <span v-if="errors.nickname" class="absolute -bottom-4 left-2 text-[10px] text-destructive">{{ errors.nickname }}</span>
      </div>

      <div class="relative">
        <input
          v-model="email"
          v-bind="emailProps"
          type="email"
          placeholder="输入邮箱地址"
          autocomplete="email"
          class="w-full h-12 bg-white dark:bg-slate-900 rounded-xl px-5 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all text-sm"
        />
        <span v-if="errors.email" class="absolute -bottom-4 left-2 text-[10px] text-destructive">{{ errors.email }}</span>
      </div>

      <div class="flex gap-2 items-start relative">
        <div class="flex-1">
          <input
            v-model="code"
            v-bind="codeProps"
            type="text"
            placeholder="邮箱验证码"
            autocomplete="one-time-code"
            class="w-full h-12 bg-white dark:bg-slate-900 rounded-xl px-5 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all text-sm"
          />
        </div>
        <button
          type="button"
          @click="sendCode"
          :disabled="isCountingDown"
          class="h-12 px-5 bg-white dark:bg-slate-900 rounded-xl font-bold text-xs text-primary shadow-sm active:scale-95 transition-all disabled:text-slate-400 whitespace-nowrap"
        >
          {{ isCountingDown ? `${countdown}s` : '获取' }}
        </button>
        <span v-if="errors.code" class="absolute -bottom-4 left-2 text-[10px] text-destructive">{{ errors.code }}</span>
      </div>

      <div class="relative">
        <input
          v-model="password"
          v-bind="passwordProps"
          type="password"
          placeholder="设置登录密码 (6位以上)"
          autocomplete="new-password"
          class="w-full h-12 bg-white dark:bg-slate-900 rounded-xl px-5 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all text-sm"
        />
      </div>

      <div class="relative">
        <input
          v-model="confirmPassword"
          v-bind="confirmPasswordProps"
          type="password"
          placeholder="再次确认您的密码"
          autocomplete="new-password"
          class="w-full h-12 bg-white dark:bg-slate-900 rounded-xl px-5 border border-transparent focus:border-primary/30 outline-none shadow-sm transition-all text-sm"
        />
        <span v-if="errors.confirmPassword" class="absolute -bottom-4 left-2 text-[10px] text-destructive">{{ errors.confirmPassword }}</span>
      </div>

      <button
        type="submit"
        class="w-full h-12 bg-gradient-to-r from-primary to-fuchsia-600 text-white rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all text-sm mt-2"
      >
        立即注册
      </button>

      <!-- 协议（点击打开弹窗） -->
      <label class="flex items-start gap-2.5 cursor-pointer py-2">
        <input type="checkbox" v-model="agreed" class="hidden" />
        <div
          class="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 flex items-center justify-center transition-all flex-shrink-0"
          :class="{ 'bg-primary border-primary': agreed }"
        >
          <svg v-if="agreed" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" stroke-width="4">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <span class="text-[11px] text-slate-400 leading-tight">
          已阅读并同意
          <span @click.stop.prevent="docType = 'service'" class="text-primary hover:underline">《服务协议》</span>
          与
          <span @click.stop.prevent="docType = 'privacy'" class="text-primary hover:underline">《隐私政策》</span>
        </span>
      </label>
    </form>

    <GraphicCaptcha
      :is-open="showCaptcha"
      :email="values.email"
      type="register"
      @close="showCaptcha = false"
      @success="onCaptchaSuccess"
    />

    <!-- 服务协议弹窗 -->
    <DocModal
      :is-open="docType === 'service'"
      title="服务协议"
      @close="docType = null"
    >
      <p class="text-xs text-slate-400">最后更新：2026年8月22日</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、服务说明</h3>
      <p>CoreFlow（以下简称"本服务"）由 CoreFlow 团队运营，为用户提供身份认证、应用授权、协作管理等企业级服务。注册即代表您同意本协议各项条款。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">二、账户注册与使用</h3>
      <p>1. 您需提供真实、准确的邮箱地址用于注册，并对账户密码保密负责。</p>
      <p>2. 您不得将账户转让、出借给他人使用，因账户泄露造成的损失由您自行承担。</p>
      <p>3. 如发现账户被盗用或异常登录，请立即修改密码并联系客服。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">三、用户行为规范</h3>
      <p>您承诺不利用本服务从事以下行为：</p>
      <p>· 发布违法、侵权或有害信息；</p>
      <p>· 破坏系统安全、尝试未授权访问；</p>
      <p>· 干扰其他用户正常使用；</p>
      <p>· 其他违反法律法规的行为。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">四、知识产权</h3>
      <p>本服务的界面、代码、标识等知识产权归 CoreFlow 团队所有，未经授权不得复制、传播或用于商业用途。您在本服务中产生的原创内容，知识产权归您所有。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">五、服务变更与终止</h3>
      <p>1. 我们可随时变更或停止部分服务，并提前公告。</p>
      <p>2. 您违反本协议时，我们有权限制或终止您的账户。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">六、免责声明</h3>
      <p>因不可抗力、系统维护或第三方原因导致服务中断，我们不承担赔偿责任，但会尽快恢复。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">七、协议修改</h3>
      <p>本协议可能不时更新，更新后我们将在服务内公告，继续使用即视为同意新协议。</p>
    </DocModal>

    <!-- 隐私政策弹窗 -->
    <DocModal
      :is-open="docType === 'privacy'"
      title="隐私政策"
      @close="docType = null"
    >
      <p class="text-xs text-slate-400">最后更新：2026年8月22日</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200 pt-2">一、信息收集</h3>
      <p>我们收集以下信息用于提供服务：</p>
      <p>· <strong>注册信息</strong>：邮箱地址、用户昵称；</p>
      <p>· <strong>登录信息</strong>：登录时间、IP 地址、设备类型（用于安全审计）；</p>
      <p>· <strong>使用数据</strong>：您主动创建的作品、配置等。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">二、信息使用</h3>
      <p>我们仅将您的信息用于：</p>
      <p>· 提供身份认证与应用授权服务；</p>
      <p>· 安全防护（异常登录检测、防暴力破解）；</p>
      <p>· 改进服务体验（不用于出售给第三方）。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">三、信息存储与保护</h3>
      <p>1. 密码采用 bcrypt 哈希存储，传输采用 RSA 加密，我们无法获取您的明文密码。</p>
      <p>2. 敏感数据存储在受保护的服务器，访问受严格权限控制。</p>
      <p>3. 会话凭证存储在 HttpOnly Cookie，防止 XSS 窃取。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">四、信息共享</h3>
      <p>我们不会将您的个人信息出售给第三方。仅在以下情形共享：</p>
      <p>· 经您明确授权；</p>
      <p>· 法律法规要求或行政/司法机关要求；</p>
      <p>· 为完成您授权的第三方应用对接（您可随时撤销）。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">五、您的权利</h3>
      <p>您有权访问、更正、删除自己的个人信息，可随时在个人中心操作或联系客服。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">六、Cookie 使用</h3>
      <p>我们使用 Cookie 维持登录状态，不用于跨站追踪。您可在浏览器设置中管理 Cookie。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">七、未成年人保护</h3>
      <p>本服务不面向 14 岁以下未成年人，如发现未成年注册，我们将注销账户。</p>
      <h3 class="font-bold text-slate-800 dark:text-slate-200">八、政策更新</h3>
      <p>本政策可能更新，更新后将在服务内公告。</p>
    </DocModal>
  </div>
</template>
