<script setup lang="ts">
/**
 * 用户授权历史（弹窗）
 *
 * 展示的是**流水**而不是当前快照：谁在什么时候把这个用户的哪个角色授予/取消了。
 * 所以已经取消的角色也会留在列表里（灰显 + 标「已取消」），而不是消失。
 *
 * 数据来自 `GET /users/:id/grants`；写库时已快照角色名与操作人账号，
 * 因此角色改名、用户删除都不会让历史变成一串 ID。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref, watch } from 'vue';
import { userGrants } from '@/api/system';
import type { GrantLogRow } from '@/api/types';

const props = defineProps<{
  /** 目标用户 ID（null = 关闭） */
  userId: number | null;
  /** 目标用户账号（标题展示用） */
  username: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const rows = ref<GrantLogRow[]>([]);
const total = ref(0);
const loading = ref(false);
const errorMessage = ref('');
const filter = ref<'' | 'grant' | 'revoke'>('');
const pageNum = ref(1);
const PAGE_SIZE = 20;

/** 是否还有下一页 */
const hasMore = computed(() => rows.value.length < total.value);

/** 当前仍生效的角色（流水里最后一条 grant 且没有更晚的 revoke） */
const activeRoles = computed(() => {
  // 行是倒序（最新在前），从后往前扫：最后一次动作是 grant 的即为生效中
  const latest = new Map<number, GrantLogRow>();
  for (const row of [...rows.value].reverse()) latest.set(row.role_id, row);
  return new Set([...latest.values()].filter(r => r.action === 'grant').map(r => r.role_id));
});

/**
 * 加载一页
 *
 * @param append 是否追加（「加载更多」）
 */
async function load(append = false): Promise<void> {
  if (props.userId === null) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await userGrants(props.userId, {
      pageNum: pageNum.value,
      pageSize: PAGE_SIZE,
      ...(filter.value ? { action: filter.value } : {})
    });
    rows.value = append ? [...rows.value, ...page.rows] : page.rows;
    total.value = page.total;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 切换筛选（回到第一页） */
function setFilter(next: '' | 'grant' | 'revoke'): void {
  filter.value = next;
  pageNum.value = 1;
  void load();
}

/** 加载更多 */
function more(): void {
  pageNum.value += 1;
  void load(true);
}

/**
 * 时间显示（本地时区，秒级足够）
 *
 * @param iso ISO 时间串
 * @returns 形如 2026-11-10 12:34:56
 */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 打开 / 换人时重置并加载
watch(
  () => props.userId,
  id => {
    if (id === null) return;
    rows.value = [];
    total.value = 0;
    pageNum.value = 1;
    filter.value = '';
    void load();
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="userId !== null" class="modal-mask" @click.self="emit('close')">
    <div class="modal grant-modal">
      <header class="modal__head">
        <span class="modal__title">授权记录 · {{ username }}</span>
        <button class="grant-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="grant-filter tabbar" role="tablist" aria-label="筛选">
        <button type="button" role="tab" :aria-selected="filter === ''" :class="['tab', { 'is-on': filter === '' }]" @click="setFilter('')">全部</button>
        <button type="button" role="tab" :aria-selected="filter === 'grant'" :class="['tab', { 'is-on': filter === 'grant' }]" @click="setFilter('grant')">授予</button>
        <button type="button" role="tab" :aria-selected="filter === 'revoke'" :class="['tab', { 'is-on': filter === 'revoke' }]" @click="setFilter('revoke')">取消</button>
        <span class="grant-count mono">{{ total }} 条</span>
      </div>

      <div class="modal__body grant-body">
        <p v-if="errorMessage" class="field__error">{{ errorMessage }}</p>
        <p v-if="!loading && rows.length === 0" class="grant-empty">还没有授权记录</p>

        <ol class="grant-list">
          <li v-for="row in rows" :key="row.id" :class="['grant-item', `is-${row.action}`]">
            <span class="grant-dot" aria-hidden="true"></span>
            <div class="grant-main">
              <p class="grant-line">
                <b>{{ row.operator_name }}</b>
                {{ row.action === 'grant' ? '授予' : '取消' }}
                <b>{{ row.role_name }}</b>
                <span class="mono grant-code">{{ row.role_code }}</span>
                <span v-if="row.app_id && row.app_id !== 'GLOBAL'" class="tag tag--info">{{ row.app_id }}</span>
                <span v-if="row.action === 'grant' && activeRoles.has(row.role_id)" class="tag tag--ok">生效中</span>
              </p>
              <p class="grant-meta mono">{{ when(row.created_at) }}<span v-if="row.remark"> · {{ row.remark }}</span></p>
            </div>
          </li>
        </ol>

        <button v-if="hasMore" class="btn btn--sm grant-more" type="button" :disabled="loading" @click="more">
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grant-modal {
  width: min(620px, 100%);
}

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.grant-close {
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

.grant-close:hover {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.grant-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 18px;
}

.grant-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.grant-body {
  gap: 0;
  min-height: 180px;
}

.grant-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--mauth-text-faint);
}

.grant-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.grant-item {
  display: flex;
  gap: 10px;
  padding: 10px 2px;
  border-bottom: 1px dashed var(--mauth-border);
}

.grant-item:last-child {
  border-bottom: 0;
}

/* 左侧时间线圆点：授予=主色实心，取消=空心 */
.grant-dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 999px;
  background: var(--mauth-primary);
}

.grant-item.is-revoke .grant-dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--mauth-text-faint);
}

.grant-main {
  min-width: 0;
}

.grant-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  font-size: 13px;
}

.grant-line b {
  font-weight: 600;
}

.grant-code {
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.grant-meta {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.grant-more {
  margin-top: 10px;
  width: 100%;
}
</style>
