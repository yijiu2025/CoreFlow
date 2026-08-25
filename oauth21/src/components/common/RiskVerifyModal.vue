<script setup lang="ts">
/**
 * 风险人机验证弹窗
 *
 * 请求被 __risk__ 拦截（指纹变更）时弹出。用户完成图形验证码后，
 * 调 /auth/v1/verify-challenge（带 x-verify-token 头）确认 → 后端写 30min 免验标记
 * + 更新基准。emit('success') 后由调用方重发原被拦请求。
 *
 * 不走邮箱码（那是登录二次验证，走 verifyEmailLogin）；这里是访问风险验证，
 * 图形码即可。
 */
import { ref, watch } from 'vue';
import { authApi } from '@/api/auth';

const props = defineProps({
  isOpen: Boolean,
  /** 风险响应返回的 verifyToken */
  verifyToken: { type: String, default: '' },
  /** 风险原因（fingerprint_changed 等），用于展示 */
  reasons: { type: Array as () => string[], default: () => [] }
});

const emit = defineEmits(['close', 'success']);

const captchaImage = ref('');
const captchaKey = ref('');
const userInput = ref('');
const errorMsg = ref('');
const loading = ref(false);

const reasonText: Record<string, string> = {
  fingerprint_changed: '检测到设备环境变更',
  ip_changed: '检测到网络环境变更',
  baseline_missing: '缺少历史环境基准'
};

const loadCaptcha = async () => {
  errorMsg.value = '';
  userInput.value = '';
  try {
    const res: any = await authApi.getCaptcha();
    captchaImage.value = res.captchaImage;
    captchaKey.value = res.captchaKey;
  } catch {
    errorMsg.value = '验证码加载失败，请重试';
  }
};

const handleSubmit = async () => {
  if (loading.value) return;
  if (userInput.value.trim().length < 4) {
    errorMsg.value = '请输入正确的验证码';
    return;
  }
  if (!props.verifyToken) {
    errorMsg.value = '验证令牌缺失，请刷新页面重试';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    // 先校验图形码（verify-captcha 标记 verified，不消费不发码）
    await authApi.verifyCaptcha(captchaKey.value, userInput.value.trim());
    // 再调 verify-challenge 带 token 确认 → 写 30min 免验 + 更新基准
    await authApi.verifyChallenge(props.verifyToken, captchaKey.value);
    emit('success');
  } catch (err: any) {
    errorMsg.value = err.message || '验证失败，请重试';
    await loadCaptcha();
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.isOpen,
  async open => {
    if (open) await loadCaptcha();
  }
);
</script>

<template>
  <Transition name="rv-fade">
    <div v-if="isOpen" class="rv-mask" @click.self="emit('close')">
      <div class="rv-modal">
        <div class="rv-header">
          <div class="rv-icon-wrap">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4" />
              <circle cx="12" cy="16" r="0.5" />
            </svg>
          </div>
          <h3 class="rv-title">安全验证</h3>
        </div>

        <p class="rv-desc">
          {{ reasons.map(r => reasonText[r] || r).join('、') || '为保护账号安全，请完成人机验证后继续操作' }}
        </p>

        <div class="rv-captcha-row">
          <input
            v-model="userInput"
            type="text"
            placeholder="请输入图形验证码"
            class="rv-input"
            maxlength="6"
            @keyup.enter="handleSubmit"
          />
          <img
            v-if="captchaImage"
            :src="captchaImage"
            alt="验证码"
            class="rv-captcha-img"
            @click="loadCaptcha"
            title="点击刷新"
          />
          <div v-else class="rv-captcha-placeholder" @click="loadCaptcha">点击加载</div>
        </div>

        <p v-if="errorMsg" class="rv-error">{{ errorMsg }}</p>

        <div class="rv-actions">
          <button type="button" class="rv-btn rv-btn-cancel" @click="emit('close')">取消</button>
          <button type="button" class="rv-btn rv-btn-submit" :disabled="loading" @click="handleSubmit">
            {{ loading ? '验证中...' : '确认验证' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rv-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.rv-modal {
  width: 360px;
  background: #fff;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
:global(.dark) .rv-modal {
  background: #1e293b;
}
.rv-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.rv-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.rv-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}
:global(.dark) .rv-title {
  color: #f1f5f9;
}
.rv-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
  margin: 0 0 16px;
}
:global(.dark) .rv-desc {
  color: #94a3b8;
}
.rv-captcha-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.rv-input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  font-size: 13px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}
.rv-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
:global(.dark) .rv-input {
  color: #f1f5f9;
  background: #0f172a;
  border-color: #334155;
}
.rv-captcha-img,
.rv-captcha-placeholder {
  height: 40px;
  width: 100px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.rv-captcha-img {
  border: 1px solid #e2e8f0;
}
.rv-captcha-placeholder {
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
:global(.dark) .rv-captcha-placeholder {
  background: #0f172a;
}
.rv-error {
  font-size: 11px;
  color: #ef4444;
  margin: 8px 0 0;
  min-height: 16px;
}
.rv-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.rv-btn {
  flex: 1;
  height: 40px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.rv-btn-cancel {
  color: #64748b;
  background: #f1f5f9;
}
.rv-btn-cancel:hover {
  background: #e2e8f0;
}
:global(.dark) .rv-btn-cancel {
  color: #94a3b8;
  background: #0f172a;
}
.rv-btn-submit {
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
}
.rv-btn-submit:hover:not(:disabled) {
  opacity: 0.95;
}
.rv-btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rv-fade-enter-active,
.rv-fade-leave-active {
  transition: opacity 0.2s;
}
.rv-fade-enter-from,
.rv-fade-leave-to {
  opacity: 0;
}
</style>
