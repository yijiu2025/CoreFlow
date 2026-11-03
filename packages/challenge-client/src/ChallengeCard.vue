<script setup lang="ts">
/**
 * 人机挑战卡片（纯展示组件，无副作用）
 *
 * 契约：**只渲染 props，不发请求**。所有时序在 `useChallenge()` 里，页面只做
 * `<ChallengeCard v-bind="state" @retry="state.retry" />`，这样组件可以单独预览/截图。
 *
 * 主题：全部取宿主 CSS 变量并带兜底值（`--modal-bg` / `--text` / `--primary` 等），
 * 因此在 firewall（深/浅色双主题）与 admin 里都跟着各自的配色走，不硬编码深色。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */
import { computed } from 'vue';
import type { ChallengePhase } from './useChallenge';

const props = withDefaults(
  defineProps<{
    /** 当前阶段 */
    phase: ChallengePhase;
    /** 求解进度 0~1 */
    progress?: number;
    /** 失败原因（服务端 reason） */
    reason?: string;
    /** 已自动重试次数 */
    retries?: number;
    /** 自动重试上限（0 = 不自动重试） */
    maxRetries?: number;
    /** 验证通过后要返回的页面地址（仅展示） */
    returnPath?: string;
    /** 工作量证明难度（前导零个数），>0 时展示该行 */
    difficulty?: number;
    /** 左上角产品名 */
    productName?: string;
    /** 触发原因文案（不同站点可覆盖） */
    triggerLabel?: string;
    /** 错误码展示 */
    errorCode?: string;
  }>(),
  {
    progress: 0,
    reason: '',
    retries: 0,
    maxRetries: 3,
    returnPath: '/',
    difficulty: 0,
    productName: 'CORE FLOW',
    triggerLabel: '请求频率超出阈值',
    errorCode: 'FW-428'
  }
);

const emit = defineEmits<{ retry: [] }>();

const isOk = computed(() => props.phase === 'ok');
const isError = computed(() => props.phase === 'error');

const title = computed(() => {
  if (isOk.value) return '验证通过';
  if (isError.value) return '验证未通过';
  return '安全验证';
});

const subtitle = computed(() => {
  if (isOk.value) return '正在带你回到刚才的页面，本次验证 30 分钟内有效。';
  if (isError.value) {
    return props.retries >= props.maxRetries && props.maxRetries > 0
      ? '多次验证未通过，可能是网络环境在验证过程中反复变化，也可能该地址已被策略限制。请联系管理员处理。'
      : '可能是网络环境在验证过程中发生了变化，或本次验证已过期，请重试一次。';
  }
  return '你的访问触发了边界防护策略，完成一次计算验证即可继续。';
});

const statusText = computed(() => {
  if (isOk.value) return '已验证，正在返回原页面…';
  if (isError.value) return `验证失败：${props.reason || '未知原因'}`;
  if (props.phase === 'verifying') return '正在提交验证结果…';
  if (props.phase === 'solving') return '正在进行工作量证明计算…';
  return '正在准备验证…';
});

const percent = computed(() => {
  if (isOk.value) return 100;
  if (isError.value) return 0;
  if (props.phase === 'verifying') return 90;
  return Math.max(4, Math.round(Math.min(1, Math.max(0, props.progress)) * 90));
});

const counterText = computed(() => {
  if (props.maxRetries <= 0) return '';
  if (props.retries <= 0) return '';
  if (props.retries >= props.maxRetries) return '自动重试已用尽';
  return `自动重试 ${props.retries}/${props.maxRetries}`;
});
</script>

<template>
  <div class="fwc-wrap">
    <div class="fwc-card" role="region" aria-label="人机验证">
      <div class="fwc-brand">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>{{ productName }} · 边界防护</span>
      </div>

      <div class="fwc-badge" :class="{ 'is-ok': isOk, 'is-error': isError }">
        <svg
          v-if="isOk"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <svg
          v-else-if="isError"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        <svg
          v-else
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      </div>

      <h1 class="fwc-title">{{ title }}</h1>
      <p class="fwc-sub">{{ subtitle }}</p>

      <ul v-if="!isOk && !isError" class="fwc-checks">
        <li
          v-for="line in [
            '绑定当前设备与网络，令牌不可转移',
            '验证通过后 30 分钟内无需重复验证',
            '不采集、不上传任何本地数据'
          ]"
          :key="line"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{{ line }}</span>
        </li>
      </ul>

      <div class="fwc-bar"><i :style="{ width: percent + '%' }" /></div>

      <dl class="fwc-rows">
        <div>
          <dt>触发原因</dt>
          <dd>{{ triggerLabel }}</dd>
        </div>
        <div v-if="difficulty > 0">
          <dt>验证难度</dt>
          <dd>{{ difficulty }} 位前导零</dd>
        </div>
        <div>
          <dt>验证后返回</dt>
          <dd class="fwc-mono">{{ returnPath }}</dd>
        </div>
        <div>
          <dt>错误码</dt>
          <dd class="fwc-mono">{{ errorCode }}</dd>
        </div>
      </dl>

      <p class="fwc-status" :class="{ 'is-ok': isOk, 'is-error': isError }" role="status" aria-live="polite">
        {{ statusText }}
      </p>

      <button v-if="isError" type="button" class="fwc-btn" @click="emit('retry')">重新验证</button>

      <div class="fwc-foot">
        <span>多次失败请联系管理员</span>
        <span v-if="counterText" class="fwc-mono">{{ counterText }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fwc-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  min-height: 100%;
}
.fwc-card {
  width: 100%;
  max-width: 440px;
  padding: 32px 28px 24px;
  border-radius: var(--border-radius-lg, 20px);
  border: 1px solid var(--modal-border, rgba(6, 182, 212, 0.22));
  background: var(--modal-bg, #0f172a);
  color: var(--text, #f1f5f9);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.fwc-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--muted, #94a3b8);
}
.fwc-badge {
  width: 52px;
  height: 52px;
  margin: 0 auto 18px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary, #06b6d4);
  background: color-mix(in srgb, var(--primary, #06b6d4) 12%, transparent);
}
.fwc-badge.is-ok {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
}
.fwc-badge.is-error {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}
.fwc-title {
  margin: 0 0 8px;
  font-size: 21px;
  font-weight: 600;
  text-align: center;
  letter-spacing: -0.01em;
}
.fwc-sub {
  margin: 0 0 22px;
  font-size: 13.5px;
  line-height: 1.6;
  text-align: center;
  color: var(--muted, #94a3b8);
}
.fwc-checks {
  margin: 0 0 20px;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--muted, #94a3b8);
}
.fwc-checks li {
  display: flex;
  gap: 10px;
  padding: 4px 0;
}
.fwc-checks svg {
  flex: none;
  margin-top: 3px;
  color: var(--primary, #06b6d4);
}
.fwc-bar {
  height: 4px;
  margin-bottom: 20px;
  border-radius: 2px;
  overflow: hidden;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.fwc-bar > i {
  display: block;
  height: 100%;
  background: var(--primary, #06b6d4);
  transition: width 0.35s ease;
}
.fwc-rows {
  margin: 0 0 20px;
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}
.fwc-rows > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  font-size: 13px;
}
.fwc-rows dt {
  flex: none;
  color: var(--muted, #94a3b8);
}
.fwc-rows dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}
.fwc-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.fwc-status {
  margin: 0;
  min-height: 20px;
  text-align: center;
  font-size: 13.5px;
  color: var(--muted, #94a3b8);
}
.fwc-status.is-ok {
  color: #22c55e;
}
.fwc-status.is-error {
  color: #ef4444;
}
.fwc-btn {
  width: 100%;
  margin-top: 14px;
  padding: 11px 16px;
  border-radius: 12px;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--primary, #06b6d4);
  border: 1px solid color-mix(in srgb, var(--primary, #06b6d4) 45%, transparent);
  background: color-mix(in srgb, var(--primary, #06b6d4) 12%, transparent);
  transition: background 0.2s ease;
}
.fwc-btn:hover {
  background: color-mix(in srgb, var(--primary, #06b6d4) 20%, transparent);
}
.fwc-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  font-size: 12px;
  color: color-mix(in srgb, currentColor 55%, transparent);
}
@media (max-width: 480px) {
  .fwc-card {
    padding: 26px 20px 20px;
  }
}
</style>
