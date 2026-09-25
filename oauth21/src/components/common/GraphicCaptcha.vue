<script setup lang="ts">
import { authApi } from '@/api/auth';
import { ref, watch, nextTick } from 'vue';
import { useThemeStore } from '@/stores/theme';

const props = defineProps({
  isOpen: Boolean,
  email: String,
  type: String, // 业务类型：register/login/reset_password
  /** 验证图形码后是否顺带发送邮箱码：
   *  - true（邮箱码登录/注册）：verify-captcha 端点校验图形码 + 发邮箱码 + 消费图形码
   *  - false（密码登录）：只校验图形码（标记 verified，不消费不发码），图形码由 directLogin 消费
   */
  sendEmail: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '安全验证'
  }
});

const emit = defineEmits(['close', 'success']);

/**
 * 主题 store（v2.21.0）：用于在浮层根挂 .dark 类，
 * 让 scoped 内的 `.dark .xxx[data-v-hash]` 选择器命中（黑主题下的兜底样式）。
 *
 * ⚠️ 禁止写 `:deep(.dark) X` —— 会被 @vue/compiler-sfc 编译成裸 `.dark`，整条规则被丢弃，
 * 命中 html.dark 时 html 挂 dark 类，全局裸 `.dark` 会污染所有后代；详见全仓 c207187 教训。
 * 正确写法：组件根挂 `:class="{ dark: themeStore.activeTone === 'dark' }"`，
 *          然后在 scoped 内写 `.dark .xxx { ... }`（产物 `.dark .xxx[data-v-hash]`，作用域精确）。
 */
const themeStore = useThemeStore();

const captchaImage = ref('');
const captchaKey = ref('');
const userInput = ref('');
const error = ref('');
const isVerifying = ref(false);

const generateCaptcha = async () => {
  try {
    // request.ts 拦截器已解包 AxiosResponse.data，但 axios 类型签名仍是 AxiosResponse，
    // 这里用类型断言拿到真实 data 形状（captchaImage + captchaKey）
    const res = (await authApi.getCaptcha()) as unknown as { captchaImage: string; captchaKey: string };
    captchaImage.value = res.captchaImage;
    captchaKey.value = res.captchaKey;
    userInput.value = '';
    error.value = '';
  } catch (err) {
    console.error('Failed to get captcha', err);
    error.value = '验证码加载失败，点击图片重试';
  }
};

const handleVerify = async () => {
  if (isVerifying.value) return;
  if (userInput.value.length < 4) {
    error.value = '请输入4位验证码';
    return;
  }

  isVerifying.value = true;
  error.value = '';

  try {
    // sendEmail=false（密码登录）：不传 email，verify-captcha 只校验图形码不消费不发码
    // sendEmail=true（邮箱码登录/注册）：传 email，端点校验图形码 + 发邮箱码 + 消费图形码
    const email = props.sendEmail ? props.email : undefined;
    await authApi.verifyCaptcha(captchaKey.value, userInput.value, email, props.type);
    emit('success', { captchaKey: captchaKey.value });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '验证失败';
    error.value = msg;

    // 验证失败自动清空并刷新
    userInput.value = '';
    generateCaptcha();
  } finally {
    isVerifying.value = false;
  }
};

/** 只允许输入数字和字母，中文等立即过滤 */
const onInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  userInput.value = target.value.replace(/[^a-zA-Z0-9]/g, '');
  error.value = '';
};

// 自动检测：输入够4位自动提交
watch(userInput, val => {
  if (val.length === 4) {
    handleVerify();
  }
});

const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.isOpen,
  val => {
    if (val) {
      userInput.value = '';
      error.value = '';
      generateCaptcha();
      nextTick(() => {
        // 跨域 iframe 内访问 window.top 会抛 SecurityError，被 catch 吞掉是预期行为
        // （iframe 内不抢父页面焦点，避免影响父应用滚动）
        try {
          if (window.self === window.top) {
            inputRef.value?.focus();
          }
        } catch {
          // 跨域 iframe：window.top 不可访问，跳过 focus
        }
      });
    }
  }
);
</script>

<template>
  <Transition name="minimal-fade">
    <!--
      v2.21.0 token 化：根节点挂 .dark（与 StandardLogin/StandardRegister 一致），
      让 scoped 内 `.dark .xxx` 选择器在黑主题下命中；颜色全部走 --mauth-* token，
      主题切换由 token 自动驱动，.dark 类是兜底（token 未命中时的备用样式）。

      之前 Tailwind 硬编码 `bg-white dark:bg-slate-950/90` `bg-white dark:bg-slate-900`
      等 —— 切到 black 主题后浮层卡片显示深色但输入框/按钮等还是 slate 系，整张浮层
      "深一块浅一块"；现在统一 token，主题切换自然一致。
    -->
    <div
      v-if="isOpen"
      class="mauth-captcha-root fixed inset-0 z-[200] flex items-center justify-center p-6"
      :class="{ dark: themeStore.activeTone === 'dark' }"
    >
      <!-- Backdrop：与桌面 main.scss 同款 --mauth-canvas（v2.21.0） -->
      <div class="mauth-captcha-backdrop absolute inset-0" @click="emit('close')"></div>

      <!-- Captcha Card -->
      <div class="mauth-captcha-card relative w-full max-w-[360px] rounded-[24px] overflow-hidden animate-minimal-in">
        <div class="p-10">
          <div class="flex items-center justify-between mb-10">
            <h4 class="mauth-captcha-title text-xs font-bold uppercase tracking-[0.2em]">{{ title }}</h4>
            <button @click="emit('close')" class="mauth-captcha-close-btn w-8 h-8 flex items-center justify-center rounded-full transition-all">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-8">
            <!-- Large Image Area -->
            <div class="relative group">
              <div
                @click="generateCaptcha"
                class="mauth-captcha-image-frame h-24 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden transition-all active:scale-[0.98]"
              >
                <img
                  v-if="captchaImage"
                  :src="captchaImage"
                  class="h-14 object-contain mix-blend-multiply dark:mix-blend-normal transform scale-110 group-hover:scale-125 transition-transform duration-500"
                />
                <div
                  v-else
                  class="mauth-captcha-spinner w-6 h-6 border-2 rounded-full animate-spin"
                ></div>

                <!-- Large Refresh Overlay -->
                <div
                  class="mauth-captcha-refresh-overlay absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div class="mauth-captcha-refresh-btn p-3 rounded-full shadow-xl">
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      class="mauth-captcha-refresh-icon"
                    >
                      <path
                        d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                      ></path>
                    </svg>
                  </div>
                </div>
              </div>
              <p class="mauth-captcha-hint text-[10px] text-center mt-2 font-medium tracking-wide">看不清？点击图片更换</p>
            </div>

            <!-- Large Input Area -->
            <div class="space-y-6">
              <div class="relative">
                <input
                  ref="inputRef"
                  :value="userInput"
                  @input="onInput"
                  @keyup.enter="handleVerify"
                  type="text"
                  maxlength="4"
                  placeholder="验证码"
                  class="mauth-captcha-input"
                  :class="{ 'mauth-captcha-input--error': error }"
                />
                <Transition name="fade">
                  <p v-if="error" class="text-center text-[11px] text-mauth-danger font-bold mt-3 tracking-wide uppercase">
                    {{ error }}
                  </p>
                </Transition>
              </div>

              <button
                @click="handleVerify"
                :disabled="isVerifying"
                class="mauth-captcha-submit w-full h-14 rounded-2xl font-bold text-sm tracking-[0.1em] transition-all hover:translate-y-[-2px] active:translate-y-[1px] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <span
                  v-if="isVerifying"
                  class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                ></span>
                {{ isVerifying ? '正在验证' : '完成验证' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ============================================================================
   v2.21.0 token 化：所有色值走 var(--mauth-*)，主题切换由 token 自动驱动
   ============================================================================ */

/* 浮层根：让内部 scoped 子元素的 `.dark .xxx` 选择器命中（黑主题兜底） */
.mauth-captcha-root {
  /* 不写任何 color，让 children 自然继承 html / body 的 color */
}

/* Backdrop：使用 --mauth-canvas（与桌面 main.scss 同源 —— v2.21.0 body 改 token 化后） */
.mauth-captcha-backdrop {
  background: var(--mauth-canvas);
  opacity: 0.9;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* 卡片：surface 底 + 浅描边 + 文字色 */
.mauth-captcha-card {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  border: 1px solid var(--mauth-border);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.05);
}

/* 标题：弱色文字（v2.21.0 token 化） */
.mauth-captcha-title {
  color: var(--mauth-text-faint);
}

/* 关闭按钮：默认弱色，hover 时上提到主体色 */
.mauth-captcha-close-btn {
  background: transparent;
  border: none;
  color: var(--mauth-text-faint);
  cursor: pointer;
}
.mauth-captcha-close-btn:hover {
  background: var(--mauth-surface-2);
  color: var(--mauth-text);
}

/* 图片框：surface-2 底（与卡片 surface 形成层次），描边 + hover 强描边 */
.mauth-captcha-image-frame {
  background: var(--mauth-surface-2);
  border: 1px solid var(--mauth-border);
}
.mauth-captcha-image-frame:hover {
  border-color: var(--mauth-border-strong);
}

/* Hover 时的刷新按钮遮罩：半透 surface */
.mauth-captcha-refresh-overlay {
  background: color-mix(in srgb, var(--mauth-surface) 40%, transparent);
}

/* 刷新按钮：surface 底 + 圆点阴影 */
.mauth-captcha-refresh-btn {
  background: var(--mauth-surface);
}
.mauth-captcha-refresh-icon {
  color: var(--mauth-text);
}

/* 加载中 spinner：border 默认色 + 顶部高亮 */
.mauth-captcha-spinner {
  border-color: var(--mauth-border-strong);
  border-top-color: var(--mauth-text-mid);
}

/* 提示文字：弱色 */
.mauth-captcha-hint {
  color: var(--mauth-text-faint);
}

/* 输入框：field 体系 token（v2.21.0） */
.mauth-captcha-input {
  width: 100%;
  height: 70px;
  background: transparent;
  border: 2px solid var(--mauth-field-border);
  border-radius: 20px;
  text-align: center;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.5em;
  padding-left: 0.5em;
  color: var(--mauth-text);
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mauth-captcha-input:focus {
  border-color: var(--mauth-field-border-focus);
  background: var(--mauth-field-bg-focus);
  transform: translateY(-2px);
}

/* 错误态：红边 + 红底（v2.21.0 token 化） */
.mauth-captcha-input--error {
  border-color: var(--mauth-danger) !important;
  background: var(--mauth-danger-bg) !important;
}

/* 提交按钮：primary 单色（与 mobile 一致，去掉渐变） */
.mauth-captcha-submit {
  background: var(--mauth-primary);
  color: var(--mauth-primary-fg);
  border: none;
  cursor: pointer;
}
.mauth-captcha-submit:disabled {
  cursor: not-allowed;
}

/* ============================================================================
   黑主题兜底（v2.21.0）：组件根挂 .dark 时这些选择器命中
   token 文件理论上已自动给出黑主题样式（surface #121212、text #f5f5f5），
   此处只覆盖 token 未命中的边角（如 backdrop-filter 在纯黑上可能略偏亮）。
   ============================================================================ */
.dark .mauth-captcha-backdrop {
  /* 黑主题下 backdrop 用纯黑，避免浅色 backdrop 在纯黑页面突兀 */
  background: #000000;
  opacity: 0.92;
}

.dark .mauth-captcha-image {
  /* 黑主题下图片用 normal blend，避免 multiply 把图染成黑块 */
  mix-blend-mode: normal;
}

/* Animations */
@keyframes minimal-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-minimal-in {
  animation: minimal-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.minimal-fade-enter-active,
.minimal-fade-leave-active {
  transition: opacity 0.4s ease;
}
.minimal-fade-enter-from,
.minimal-fade-leave-to {
  opacity: 0;
}
</style>