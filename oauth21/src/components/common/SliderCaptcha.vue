<script setup lang="ts">
/**
 * 滑块人机验证弹窗
 *
 * 用于请求被 __risk__ 拦截后的人机验证（替代 RiskVerifyModal 的图形码方案）。
 * 滑块滑到右端 → 调 verify-challenge（带 x-verify-token 头）→ 后端写 30min
 * 免验标记 + 更新基准 → emit('success')，由调用方重发原被拦请求。
 *
 * 拖动行为比输入字符对机器人更难（需模拟人类加速/减速曲线），但这里不做
 * 行为轨迹后端校验（仅滑块位置），真正的人机验证凭证由 verify-challenge 签发。
 * 后续可扩展：记录拖动轨迹发后端分析（人类拖动有微小抖动，机器人匀速）。
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { authApi } from '@/api/auth';

const props = defineProps({
  isOpen: Boolean,
  /** 风险响应返回的 verifyToken（必传，用于调 verify-challenge） */
  verifyToken: { type: String, default: '' },
  /** 风险原因（展示用） */
  reasons: { type: Array as () => string[], default: () => [] },
  title: { type: String, default: '安全验证' }
});

const emit = defineEmits(['close', 'success']);

const isMoving = ref(false);
const startX = ref(0);
const moveX = ref(0);
const isSuccess = ref(false);
const isVerifying = ref(false);
const errorMsg = ref('');
const trackRef = ref<HTMLElement | null>(null);

const reasonText: Record<string, string> = {
  fingerprint_changed: '检测到设备环境变更',
  ip_changed: '检测到网络环境变更',
  baseline_missing: '缺少历史环境基准'
};

const maxMove = computed(() => {
  if (!trackRef.value) return 0;
  return trackRef.value.offsetWidth - 44; // 44 = 滑块宽度
});

const onStart = (e: MouseEvent | TouchEvent) => {
  if (isSuccess.value || isVerifying.value) return;
  isMoving.value = true;
  startX.value = 'touches' in e ? e.touches[0].clientX : e.clientX;
  errorMsg.value = '';
};

const onMove = (e: MouseEvent | TouchEvent) => {
  if (!isMoving.value) return;
  const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  let x = currentX - startX.value;
  if (x < 0) x = 0;
  if (x > maxMove.value) x = maxMove.value;
  moveX.value = x;

  // 滑到右端触发验证（防止机器人直接模拟到底：实际后端 verify-challenge 才是真正校验）
  if (x >= maxMove.value && !isVerifying.value) {
    handleVerify();
  }
};

const onEnd = () => {
  if (isSuccess.value) return;
  isMoving.value = false;
  // 未滑到底自动回弹（人类松手时未完成会回退，机器人不会半途而废）
  if (!isSuccess.value && moveX.value < maxMove.value) {
    moveX.value = 0;
  }
};

/** 滑到底调 verify-challenge 完成真正的人机验证 */
const handleVerify = async () => {
  if (isVerifying.value || isSuccess.value) return;
  if (!props.verifyToken) {
    errorMsg.value = '验证令牌缺失，请刷新页面重试';
    moveX.value = 0;
    return;
  }
  isVerifying.value = true;
  try {
    await authApi.verifyChallenge(props.verifyToken);
    isMoving.value = false;
    isSuccess.value = true;
    // 滑块变绿停留 500ms，让用户看到成功反馈，再通知调用方重发原请求
    setTimeout(() => {
      emit('success');
      reset();
    }, 500);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : '验证失败，请重试';
    // 失败回弹滑块，用户可重试
    moveX.value = 0;
    isMoving.value = false;
  } finally {
    isVerifying.value = false;
  }
};

const reset = () => {
  isMoving.value = false;
  isSuccess.value = false;
  isVerifying.value = false;
  moveX.value = 0;
  errorMsg.value = '';
};

// isOpen 打开时重置状态（防止上次失败/成功状态残留）
watch(
  () => props.isOpen,
  open => {
    if (open) reset();
  }
);

onMounted(() => {
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onEnd);
  window.removeEventListener('touchmove', onMove);
  window.removeEventListener('touchend', onEnd);
});
</script>

<template>
  <Transition name="minimal-fade">
    <div v-if="isOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md" @click="emit('close')"></div>

      <!-- Captcha Card -->
      <div
        class="relative w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-slate-800 animate-minimal-in"
      >
        <div class="p-8">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h4 class="text-sm font-semibold text-slate-900 dark:text-white">{{ title }}</h4>
            </div>
            <button @click="emit('close')" class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-all">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
            {{ reasons.map(r => reasonText[r] || r).join('、') || '为保护账号安全，请完成下方验证后继续操作' }}
          </p>

          <!-- Track Area -->
          <div
            ref="trackRef"
            class="relative h-11 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <!-- Progress Overlay -->
            <div
              class="absolute inset-y-0 left-0 transition-all duration-150"
              :style="{ width: `${moveX + 44}px` }"
              :class="isSuccess
                ? 'bg-green-500/15'
                : isVerifying
                  ? 'bg-blue-500/10'
                  : 'bg-slate-900/5 dark:bg-white/5'"
            ></div>

            <!-- Text Hint -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                class="text-[11px] font-medium tracking-wide transition-all duration-300 flex items-center gap-1.5"
                :class="isSuccess ? 'text-green-600 dark:text-green-400' : 'text-slate-400'"
              >
                <svg
                  v-if="isVerifying"
                  class="animate-spin"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {{ isSuccess ? '验证成功' : isVerifying ? '验证中...' : '向右滑动完成验证' }}
              </span>
            </div>

            <!-- Slider Button -->
            <div
              class="absolute left-0 top-0 bottom-0 w-11 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 transition-shadow select-none"
              :class="[
                isSuccess
                  ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                  : isVerifying
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-white'
              ]"
              :style="{ transform: `translateX(${moveX}px)` }"
              @mousedown="onStart"
              @touchstart="onStart"
            >
              <svg
                v-if="!isSuccess && !isVerifying"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
              <svg
                v-else-if="isVerifying"
                class="animate-spin"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </div>

          <p v-if="errorMsg" class="text-center text-[11px] text-rose-500 font-medium mt-3">
            {{ errorMsg }}
          </p>

          <p class="text-center text-[10px] text-slate-400 font-medium tracking-wide mt-3">
            滑动到底端完成验证，验证通过后 30 分钟内免验
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Animations */
@keyframes minimal-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-minimal-in {
  animation: minimal-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.minimal-fade-enter-active,
.minimal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.minimal-fade-enter-from,
.minimal-fade-leave-to {
  opacity: 0;
}
</style>
