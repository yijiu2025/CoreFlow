<script setup lang="ts">
/**
 * 风险拦截人机验证弹窗
 *
 * 后端在"设备/指纹变更 + 高风险写操作"时回 403 并带 `__risk__`（`verifyToken` +
 * `verifyUrl` + `verifyHeader`）。这里负责把用户的操作补齐：滑到底 → 调验证接口
 * → 后端写 30 分钟免验标记并更新环境基准 → emit success，由 http 层重发原请求。
 *
 * 为什么是滑块而不是图形码：本场景的用户**已经登录**，要证明的是"你还在这个设备上"，
 * 而不是"你能认出字符"。滑块一步完成，认知成本最低。
 *
 * 走全局 `.modal-mask` / `.modal`：验证框必须和后台其它弹窗长得一样，
 * 否则会像"外部插件弹的窗"，反而让人怀疑是不是钓鱼。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ShieldAlert, Loader2, ArrowRight, Check } from 'lucide-vue-next';
import { verifyRisk, type RiskPayload } from '@/api/http';

const props = defineProps<{
  /** 后端 `__risk__` 载荷（含 verifyToken / verifyUrl / verifyHeader） */
  payload: RiskPayload;
}>();

const emit = defineEmits<{ (e: 'success'): void; (e: 'close'): void }>();

/** 风险原因 → 人话（后端给的是机器码，不该直接展示给用户） */
const REASON_TEXT: Record<string, string> = {
  fingerprint_changed: '设备环境发生变化',
  device_id_missing: '设备标识丢失',
  device_id_changed: '设备标识发生变化',
  ip_changed: '网络环境发生变化',
  no_baseline: '缺少历史环境记录'
};

const reasonText = computed(() => {
  const list = (props.payload.reasons || []).map(r => REASON_TEXT[r] || r);
  return list.length > 0 ? list.join('、') : '当前环境与登录时不一致';
});

const trackRef = ref<HTMLElement | null>(null);
/** 滑块位移（px） */
const offset = ref(0);
const dragging = ref(false);
const verifying = ref(false);
const done = ref(false);
const errorMessage = ref('');

/** 可滑动最大位移：轨道宽 - 滑块宽（44 是滑块尺寸，与样式里的 --thumb 同一值） */
const maxOffset = computed(() => {
  const width = trackRef.value?.clientWidth ?? 0;
  return Math.max(width - 44, 0);
});

/** 进度（用于轨道填充宽度与文案淡出） */
const progress = computed(() => (maxOffset.value > 0 ? offset.value / maxOffset.value : 0));

let startX = 0;
let startOffset = 0;

/**
 * 统一用 Pointer Events 收口鼠标 / 触摸 / 触控笔
 *
 * 分开写 mousedown+touchstart 会在"触屏笔记本"上触发两次（先 touch 再合成 mouse），
 * 位移直接翻倍。Pointer Events 天然只有一个来源。
 *
 * move/up 监听挂在 window 上而不是滑块自身：手指一滑出那 44px 的滑块，
 * 元素就收不到事件了（指针捕获能兜住，但捕获本身可能失败 —— 见下方 try/catch），
 * 挂 window 是唯一不依赖捕获的可靠做法。
 */
function onPointerDown(event: PointerEvent): void {
  if (verifying.value || done.value) return;
  dragging.value = true;
  startX = event.clientX;
  startOffset = offset.value;
  errorMessage.value = '';
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  /*
   * 捕获指针：可以让"快速拖动后松手在轨道外"也正确结算。
   * try/catch 是必要的 —— 指针捕获要求 pointerId 对应一个**正在活跃**的指针，
   * 合成事件（自动化测试、部分手写笔）传进来的 id 不存在，会抛 NotFoundError，
   * 而这里抛异常会让整个滑动彻底失效。
   */
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    /* 合成指针无法捕获，靠上面的 window 监听兜底 */
  }
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  const next = Math.min(Math.max(startOffset + (event.clientX - startX), 0), maxOffset.value);
  offset.value = next;
  // 触底即验证：不让用户"滑到底还要再点一下"，那一步对判定毫无贡献
  if (maxOffset.value > 0 && next >= maxOffset.value - 1) void submit();
}

function onPointerUp(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  if (!dragging.value) return;
  dragging.value = false;
  // 没滑到底自动回弹：人类松手未完成会回退，脚本模拟"滑一半"没有意义
  if (!done.value && offset.value < maxOffset.value) offset.value = 0;
}

/**
 * 键盘可达性
 *
 * 只有鼠标能通过验证 = 键盘/读屏用户被彻底挡在门外（这类"安全"改动最容易漏掉）。
 */
function onKeydown(event: KeyboardEvent): void {
  if (verifying.value || done.value) return;
  const step = Math.max(maxOffset.value / 10, 1);
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    offset.value = Math.min(offset.value + step, maxOffset.value);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    offset.value = Math.max(offset.value - step, 0);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    offset.value = maxOffset.value;
    void submit();
  }
}

/**
 * 调验证接口
 *
 * 成功后停在绿色态 420ms 再通知调用方重发 —— 立刻重发会让弹窗"闪一下就消失"，
 * 用户根本来不及确认自己到底验过了没有。
 */
async function submit(): Promise<void> {
  if (verifying.value || done.value) return;
  if (!props.payload.verifyToken) {
    errorMessage.value = '验证令牌缺失，请刷新页面后重试';
    offset.value = 0;
    return;
  }
  verifying.value = true;
  try {
    await verifyRisk(props.payload);
    done.value = true;
    verifyTimer = setTimeout(() => emit('success'), 420);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '验证失败，请重试';
    offset.value = 0;
  } finally {
    verifying.value = false;
  }
}

let verifyTimer: ReturnType<typeof setTimeout> | null = null;

/** Esc 关闭 */
function onEsc(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !verifying.value) emit('close');
}

onMounted(() => window.addEventListener('keydown', onEsc));
onUnmounted(() => {
  if (verifyTimer) clearTimeout(verifyTimer);
  window.removeEventListener('keydown', onEsc);
  // 拖动中被卸载（验证成功后由 http 层销毁）时 window 上的监听要一并摘掉，
  // 否则会残留一组闭包在已销毁组件的响应式状态上
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
});
</script>

<template>
  <div class="modal-mask" role="dialog" aria-modal="true" aria-labelledby="risk-title">
    <div class="modal risk-modal">
      <div class="modal__head">
        <span class="risk-icon" aria-hidden="true"><ShieldAlert :size="16" /></span>
        <span id="risk-title" class="modal__title">安全验证</span>
      </div>

      <div class="modal__body risk-body">
        <p class="risk-reason">
          {{ reasonText }}。为确认是你本人操作，请完成下方验证。
        </p>

        <div
          ref="trackRef"
          class="risk-track"
          :class="{ 'is-done': done, 'is-busy': verifying }"
        >
          <span class="risk-track__fill" :style="{ width: `${offset + 44}px` }" aria-hidden="true"></span>
          <span class="risk-track__hint" :style="{ opacity: String(1 - progress) }">
            <Loader2 v-if="verifying" class="risk-spin" :size="13" />
            {{ done ? '验证通过' : verifying ? '验证中…' : '向右滑动完成验证' }}
          </span>
          <button
            type="button"
            class="risk-thumb"
            role="slider"
            :aria-label="'向右滑动完成验证'"
            aria-valuemin="0"
            :aria-valuemax="maxOffset"
            :aria-valuenow="Math.round(offset)"
            :aria-valuetext="done ? '验证通过' : verifying ? '验证中' : '未验证'"
            :style="{ transform: `translateX(${offset}px)` }"
            @pointerdown="onPointerDown"
            @keydown="onKeydown"
          >
            <Loader2 v-if="verifying" class="risk-spin" :size="15" />
            <Check v-else-if="done" :size="16" />
            <ArrowRight v-else :size="16" />
          </button>
        </div>

        <p v-if="errorMessage" class="risk-error" role="alert">{{ errorMessage }}</p>
        <p class="risk-hint">验证通过后 30 分钟内免验，同时把当前设备环境登记为新的基准。</p>
      </div>

      <div class="modal__foot">
        <button class="btn btn--ghost btn--sm" type="button" :disabled="verifying" @click="emit('close')">
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.risk-modal {
  width: min(384px, 100%);
}

.risk-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #b45309;
}

.risk-body {
  gap: 10px;
}

.risk-reason {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--mauth-text-mid);
}

/* 轨道：与输入框同一套半径与描边，视觉上属于同一个控件语言 */
.risk-track {
  position: relative;
  height: 44px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
  overflow: hidden;
  touch-action: none; /* 否则手机上横滑会被当成页面滚动，滑块永远拿不到 pointermove */
  user-select: none;
}

.risk-track.is-done {
  border-color: color-mix(in srgb, #10b981 55%, var(--mauth-border-strong));
}

.risk-track__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--mauth-primary) 12%, transparent);
  transition: background 0.16s var(--ease);
}

.risk-track.is-done .risk-track__fill {
  background: color-mix(in srgb, #10b981 16%, transparent);
}

.risk-track__hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mauth-text-faint);
  transition: opacity 0.16s var(--ease);
  pointer-events: none;
}

.risk-track.is-done .risk-track__hint {
  color: #047857;
  font-weight: 600;
}

.risk-thumb {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 100%;
  padding: 0;
  border: none;
  border-right: 1px solid var(--mauth-border);
  border-radius: 0;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  cursor: grab;
  touch-action: none;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.risk-thumb:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--mauth-primary-soft);
}

.risk-track.is-busy .risk-thumb {
  cursor: progress;
  color: var(--mauth-primary);
}

.risk-track.is-done .risk-thumb {
  background: #10b981;
  border-right-color: transparent;
  color: #fff;
  cursor: default;
}

.risk-error {
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}

.risk-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--mauth-text-faint);
}

.risk-spin {
  animation: risk-spin 0.9s linear infinite;
}

@keyframes risk-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .risk-spin {
    animation: none;
  }
}
</style>
