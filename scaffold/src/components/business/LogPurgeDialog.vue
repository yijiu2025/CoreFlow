<script setup lang="ts">
/**
 * 清除日志（弹窗）
 *
 * 这是后台里**唯一不可逆**的批量操作：删掉的审计记录找不回来，而审计本身是
 * 追查"谁做了什么"的最后依据。所以它固定走三步，每一步都不能省：
 *
 * 1. **说清范围**：把筛选条件翻成人话 + 明确告诉操作者命中多少条；
 * 2. **二次验证**：邮箱验证码或登录密码（复用 `StepUpField`）；
 * 3. **留痕**：由后端在同一事务里写 `LOG_PURGE` 审计（删除与留痕要么都成、要么都不成）。
 *
 * 🔴 `filters` 在"发码"和"执行"两步必须是**同一个对象**。后端用它派生范围指纹并
 *    绑在凭据上，条件改过就会被拒 —— 这正是防止"为清 A 范围验证、去删 B 范围"的机制。
 *    所以弹窗打开时条件就固定了：要改条件请先关掉重来，而不是边改边删。
 *
 * @author yijiu2025
 * @since 2026-11-12
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { AlertTriangle, ShieldAlert, X } from 'lucide-vue-next';
import { loginPurge, loginPurgeChallenge, operPurge, operPurgeChallenge } from '@/api/monitor';
import { describeLogFilters } from '@/utils/logFilters';
import StepUpField from '@/components/business/StepUpField.vue';
import type { LogFilters, StepUpChallenge, StepUpPayload } from '@/api/types';

const props = defineProps<{
  /** 日志类型（决定调哪一组接口、文案怎么写） */
  scope: 'oper' | 'login';
  /** 筛选条件（null = 关闭） */
  filters: LogFilters | null;
  /** 当前条件下的命中条数（与列表用的是同一套条件） */
  matched: number;
}>();

const emit = defineEmits<{ (e: 'close'): void; (e: 'done', removed: number): void }>();

/** 子组件暴露的 buildPayload / reset */
const stepUpRef = ref<InstanceType<typeof StepUpField> | null>(null);

const busy = ref(false);
const errorMessage = ref('');

/** 日志类型的中文名 */
const scopeLabel = computed(() => (props.scope === 'oper' ? '操作日志' : '登录日志'));

/**
 * 是否是"删除全部"
 *
 * 后端要求至少一个条件（否则一条命令就能清空审计），所以前端用「1970-01-01」这个
 * 足够早的起点表示"不限时间"。对操作者必须说清楚这是**全部**，而不是让他看到
 * 一个莫名其妙的 1970 年。
 */
const isPurgeAll = computed(() => {
  const f = props.filters;
  if (!f) return false;
  return Object.keys(f).length === 1 && f.startTime === '1970-01-01 00:00:00';
});

/** 条件的人话描述 */
const conditionText = computed(() => {
  if (!props.filters) return '';
  if (isPurgeAll.value) return '全部记录 —— 不限账号、IP、事件与时间';
  return describeLogFilters(props.filters);
});

/**
 * 条件指纹（仅本地用）
 *
 * 让 `StepUpField` 在条件变化时作废旧凭据。**不是**后端那套算法 —— 它只做变更检测，
 * 服务端的指纹永远是服务端自己从条件算的。
 */
const targetKey = computed(() => (props.filters ? JSON.stringify(props.filters) : ''));

/** 命中 0 条时不该让用户走完验证流程（删 0 条没有意义） */
const nothingToDelete = computed(() => props.matched <= 0);

/**
 * 发码（注入给 StepUpField）
 *
 * @param method 验证方式
 * @returns 挑战信息
 */
function issue(method: 'email' | 'password'): Promise<StepUpChallenge> {
  const filters = props.filters;
  if (!filters) return Promise.reject(new Error('筛选条件已失效，请重新打开'));
  return props.scope === 'oper' ? operPurgeChallenge(filters, method) : loginPurgeChallenge(filters, method);
}

/**
 * 执行清除
 *
 * 凭据是**一次性**的：失败后必须重新领，所以出错时顺手 reset。
 */
async function confirm(): Promise<void> {
  const filters = props.filters;
  if (!filters || busy.value) return;
  const payload: StepUpPayload | null = stepUpRef.value?.buildPayload() ?? null;
  if (!payload) {
    errorMessage.value = stepUpRef.value?.hint() ?? '请先完成二次验证';
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    const result = props.scope === 'oper' ? await operPurge(filters, payload) : await loginPurge(filters, payload);
    emit('done', result.removed);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '清除失败';
    // 凭据已被消费或已失效：重发一次才能再试
    stepUpRef.value?.reset();
  } finally {
    busy.value = false;
  }
}

/**
 * Esc 关闭
 *
 * @param event 键盘事件
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.filters && !busy.value) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div v-if="filters" class="modal-mask" v-mask-close="() => !busy && emit('close')">
    <div class="modal purge" role="dialog" aria-modal="true" aria-labelledby="purge-title">
      <header class="modal__head">
        <span id="purge-title" class="modal__title"> {{ isPurgeAll ? '删除全部' : '清除' }}{{ scopeLabel }} </span>
        <button class="purge__close" type="button" aria-label="关闭" :disabled="busy" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div class="modal__body purge__body">
        <!-- ① 风险 + 范围：先把"删什么、删多少"钉死，再让人去做验证 -->
        <div class="purge__danger">
          <AlertTriangle :size="16" />
          <div>
            <p class="purge__danger-title">
              {{ isPurgeAll ? '将删除全部日志，且不可恢复' : '此操作不可恢复' }}
            </p>
            <p class="purge__danger-text">
              被清除的{{ scopeLabel }}无法找回。清除动作本身会写入操作日志（谁、什么时候、按什么条件、
              删了多少条），供事后审计。
            </p>
          </div>
        </div>

        <section class="purge__block">
          <h3 class="purge__label">清除范围</h3>
          <p class="purge__condition">{{ conditionText || '（未设置条件）' }}</p>
          <p class="purge__count">
            命中 <strong>{{ matched }}</strong> 条{{ scopeLabel }}
            <span v-if="nothingToDelete" class="purge__count-hint">当前条件下没有记录，无需清除</span>
          </p>
        </section>

        <!-- ② 二次验证：没通过这里，后端不会执行任何删除。
             分区标题不另写 —— StepUpField 自己就带着「二次验证」标签，
             两层标题叠在一起是第一版真实存在的排版问题 -->
        <section class="purge__block">
          <StepUpField
            ref="stepUpRef"
            action="log.purge"
            :target-id="null"
            :target-key="targetKey"
            :issue="issue"
            :disabled="busy || nothingToDelete"
          />
          <p class="purge__hint">
            <ShieldAlert :size="13" />
            验证码只对这一组筛选条件有效；改了条件需要重新获取。
          </p>
        </section>

        <p v-if="errorMessage" class="purge__error">{{ errorMessage }}</p>
      </div>

      <footer class="modal__foot">
        <button class="btn btn--ghost btn--sm" type="button" :disabled="busy" @click="emit('close')">取消</button>
        <button
          class="btn btn--danger btn--sm"
          type="button"
          :disabled="busy || nothingToDelete || !stepUpRef?.ready"
          @click="confirm"
        >
          {{ busy ? '删除中…' : `确认删除 ${matched} 条` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.purge {
  width: min(560px, 100%);
}

.purge__close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.purge__close:hover:not(:disabled) {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.purge__body {
  gap: 16px;
}

/* 危险提示：整张弹窗最该先看到的东西，给它警示色与足够留白 */
.purge__danger {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--mauth-radius-sm);
  border: 1px solid color-mix(in srgb, #dc2626 28%, transparent);
  background: color-mix(in srgb, #dc2626 6%, var(--mauth-surface));
  color: #b91c1c;
}

.purge__danger-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 650;
}

.purge__danger-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: color-mix(in srgb, #b91c1c 78%, var(--mauth-text));
}

.purge__label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: var(--mauth-track-eyebrow);
  color: var(--mauth-text-faint);
}

.purge__condition {
  margin: 0 0 8px;
  padding: 9px 11px;
  border-radius: var(--mauth-radius-xs);
  background: color-mix(in srgb, var(--mauth-text) 4%, transparent);
  color: var(--mauth-text);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.purge__count {
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

.purge__count strong {
  font-size: 16px;
  font-weight: 700;
  color: var(--mauth-text);
  font-variant-numeric: tabular-nums;
}

.purge__count-hint {
  margin-left: 8px;
  color: var(--mauth-text-faint);
}

.purge__hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.purge__error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}
</style>
