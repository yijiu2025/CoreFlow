<script setup lang="ts">
/**
 * 部门变更历史（弹窗）
 *
 * 组织架构是数据权限的根：「本部门及以下」的范围由它决定，改父级或停用都会悄悄改变
 * 一批人的可见范围。所以每个部门都要能回答"这棵树是谁、什么时候、改成什么样"。
 *
 * 数据来自审计表（`GET /depts/:id/history`），`from → to` 已由后端翻译成可读文本
 * （状态 1/0 → 启用/停用、parent_id → 部门名）。前端只负责呈现，不再做二次映射。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref, watch } from 'vue';
import { deptHistory } from '@/api/system';
import type { DeptHistoryRow } from '@/api/types';

const props = defineProps<{
  /** 部门 ID（null = 关闭） */
  deptId: number | null;
  /** 部门名（标题展示） */
  deptName: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const rows = ref<DeptHistoryRow[]>([]);
const loading = ref(false);
const errorMessage = ref('');

/** 事件 → 展示文案与色调 */
const EVENT_META: Record<DeptHistoryRow['event'], { label: string; tone: 'ok' | 'info' | 'off' }> = {
  DEPT_CREATE: { label: '新建', tone: 'ok' },
  DEPT_UPDATE: { label: '编辑', tone: 'info' },
  DEPT_DELETE: { label: '删除', tone: 'off' }
};

/** 时间显示（本地时区，秒级足够） */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 加载历史
 */
async function load(): Promise<void> {
  if (props.deptId === null) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await deptHistory(props.deptId);
    rows.value = page.rows;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 只有「编辑」才有字段级变更；新建/删除展示的是快照 */
const hasChanges = computed(() => rows.value.some(row => row.changes.length > 0));

watch(
  () => props.deptId,
  id => {
    if (id === null) return;
    rows.value = [];
    void load();
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="deptId !== null" class="modal-mask" v-mask-close="() => emit('close')">
    <div class="modal dept-history">
      <header class="modal__head">
        <span class="modal__title">变更历史 · {{ deptName }}</span>
        <button class="dept-history__close" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="modal__body dept-history__body">
        <p v-if="errorMessage" class="field__error">{{ errorMessage }}</p>
        <p v-if="loading" class="dept-history__empty">加载中…</p>
        <p v-else-if="rows.length === 0" class="dept-history__empty">
          还没有变更记录（这条审计从本次上线开始记，之前的改动不会有）
        </p>

        <ol v-else class="dept-history__list">
          <li v-for="row in rows" :key="row.id" class="dept-event">
            <span class="dept-event__dot" :class="`is-${EVENT_META[row.event].tone}`" aria-hidden="true"></span>
            <div class="dept-event__main">
              <p class="dept-event__line">
                <span class="tag" :class="`tag--${EVENT_META[row.event].tone}`">{{ EVENT_META[row.event].label }}</span>
                <b>{{ row.operator_name || '系统' }}</b>
                <span v-if="row.operator_email" class="dept-event__email">{{ row.operator_email }}</span>
                <span v-if="row.operator_deleted" class="tag tag--off">账号已删除</span>
                <span class="dept-event__time mono">{{ when(row.created_at) }}</span>
              </p>
              <p v-if="row.operator_deleted === false && row.ip" class="dept-event__meta mono">来自 {{ row.ip }}</p>

              <!-- 字段级 diff：改了什么、从什么改成什么 -->
              <ul v-if="row.changes.length" class="dept-event__changes">
                <li v-for="change in row.changes" :key="change.field">
                  <span class="dept-event__field">{{ change.label }}</span>
                  <span class="dept-event__from">{{ change.from }}</span>
                  <span class="dept-event__arrow" aria-hidden="true">→</span>
                  <span class="dept-event__to">{{ change.to }}</span>
                </li>
              </ul>
              <p v-else-if="row.event === 'DEPT_DELETE'" class="dept-event__meta">
                删除时的名称：{{ row.dept_name || '（未记录）' }}
              </p>
            </div>
          </li>
        </ol>

        <p v-if="!loading && rows.length > 0 && !hasChanges" class="dept-history__hint">
          这里只记了「新建 / 删除」这类整体事件，没有字段级变更 —— 字段 diff 从上一次编辑开始才会有。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dept-history {
  width: min(620px, 100%);
}

.dept-history__close {
  flex: none;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--mauth-text-mid);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.dept-history__close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.dept-history__body {
  gap: 0;
  min-height: 160px;
}

.dept-history__empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--mauth-text-faint);
}

.dept-history__hint {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.dept-history__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dept-event {
  display: flex;
  gap: 10px;
  padding: 9px 2px;
  border-bottom: 1px dashed var(--mauth-border);
}

.dept-event:last-child {
  border-bottom: 0;
}

/* 左侧时间线圆点：新建=绿、编辑=主色、删除=红 */
.dept-event__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--mauth-text-faint);
}

.dept-event__dot.is-ok {
  background: var(--mauth-success);
}

.dept-event__dot.is-info {
  background: var(--mauth-primary);
}

.dept-event__dot.is-off {
  background: var(--mauth-danger);
}

.dept-event__main {
  min-width: 0;
  flex: 1;
}

.dept-event__line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
}

.dept-event__email {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.dept-event__time {
  margin-left: auto;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.dept-event__meta {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 变更项：一行一个字段，from → to 用弱化+强调区分 */
.dept-event__changes {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dept-event__changes li {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}

.dept-event__field {
  min-width: 60px;
  color: var(--mauth-text-soft);
}

.dept-event__from {
  color: var(--mauth-text-faint);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--mauth-text-faint) 60%, transparent);
}

.dept-event__arrow {
  color: var(--mauth-text-faint);
  font-size: 11px;
}

.dept-event__to {
  color: var(--mauth-text);
  font-weight: 600;
}
</style>
