<script setup lang="ts">
/**
 * 我的操作日志
 *
 * 只显示**本人**产生的记录：后端 `/admin/v1/my-logs` 把用户范围钉在会话里的 userId 上，
 * 页面不传、也传不了用户参数 —— 所以这里没有"筛选用户"控件，那不是遗漏。
 *
 * 为什么单独一页而不是塞进「账号与安全」：这是一张会翻页的长表，混在开关型设置里
 * 会把那一页撑成两米长；而"我最近干了什么"本身是独立的问题。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { computed, onMounted, ref } from 'vue';
import { History, RefreshCw, Search } from 'lucide-vue-next';
import { myLogs } from '@/api/session';
import type { MyLogRow } from '@/api/session';
import PersonalPage from '@/components/business/PersonalPage.vue';

/** 时间档：value 是"往前多少小时"，null = 不限 */
const RANGES = [
  { id: '24h', label: '近 24 小时', hours: 24 },
  { id: '7d', label: '近 7 天', hours: 24 * 7 },
  { id: '30d', label: '近 30 天', hours: 24 * 30 },
  { id: 'all', label: '全部', hours: null }
] as const;

const rows = ref<MyLogRow[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = 20;
const keyword = ref('');
const range = ref<(typeof RANGES)[number]['id']>('7d');
const loading = ref(false);
const error = ref('');

/** 总页数（至少 1，避免"第 1 / 0 页"） */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

/**
 * 时间档 → 起始时间（ISO）
 *
 * 用本地时间算再 `toISOString()`：用户看到的是本地时间，按 UTC 切档会让"近 24 小时"
 * 在时区边界上少/多算几个小时。
 *
 * @returns 起始时间字符串；空串表示不限
 */
function startTimeOf(): string {
  const hit = RANGES.find(item => item.id === range.value);
  if (!hit?.hours) return '';
  return new Date(Date.now() - hit.hours * 3600_000).toISOString();
}

/**
 * 拉取当前页
 *
 * @returns {Promise<void>}
 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const data = await myLogs({
      pageNum: pageNum.value,
      pageSize,
      keyword: keyword.value.trim() || undefined,
      startTime: startTimeOf() || undefined
    });
    rows.value = data.rows;
    total.value = data.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
    rows.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/**
 * 重新从第一页查（条件变了必须回第一页，否则会停在空页上）
 *
 * @returns {Promise<void>}
 */
async function reload(): Promise<void> {
  pageNum.value = 1;
  await load();
}

/**
 * 翻页
 *
 * @param delta 相对页码（-1 / +1）
 * @returns {Promise<void>}
 */
async function turn(delta: number): Promise<void> {
  const next = pageNum.value + delta;
  if (next < 1 || next > pageCount.value) return;
  pageNum.value = next;
  await load();
}

/**
 * 时间显示（本地时区，秒精度）
 *
 * @param iso ISO 时间串
 * @returns 展示文本
 */
function when(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 动作标签：后端存的是事件名（如 `user.update`），统一转小写便于阅读
 *
 * @param action 事件名
 * @returns 展示文本
 */
function actionLabel(action: string): string {
  return action || '—';
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PersonalPage title="我的操作日志" sub="只显示你自己产生的记录，可随时核对最近做过什么">
    <section class="panel">
      <header class="panel__head">
        <span class="panel__title">操作记录</span>
        <span class="panel__note">共 {{ total }} 条</span>
        <div class="panel__actions">
          <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
            <RefreshCw :size="13" aria-hidden="true" />
            刷新
          </button>
        </div>
      </header>

      <div class="panel__body">
        <div class="filters">
          <label class="filters__search">
            <Search :size="14" aria-hidden="true" class="filters__ico" />
            <input
              v-model="keyword"
              class="input"
              placeholder="搜索动作 / IP / 模块 / 设备码"
              maxlength="64"
              @keyup.enter="reload"
            />
          </label>

          <select v-model="range" class="select" @change="reload">
            <option v-for="item in RANGES" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>

          <button class="btn btn--primary btn--sm" type="button" :disabled="loading" @click="reload">查询</button>
        </div>

        <p v-if="error" class="field__error">{{ error }}</p>

        <div class="table-wrap">
          <table class="table log-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>模块</th>
                <th>动作</th>
                <th>请求</th>
                <th>耗时</th>
                <th>结果</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td class="mono">{{ when(row.created_at) }}</td>
                <td :title="row.module">{{ row.module }}</td>
                <td class="mono" :title="row.detail">{{ actionLabel(row.action) }}</td>
                <td class="mono req" :title="`${row.method} ${row.path}`">
                  <span v-if="row.method" class="req__verb">{{ row.method }}</span>
                  <span class="req__path">{{ row.path || '—' }}</span>
                </td>
                <td class="mono">{{ row.cost_ms }} ms</td>
                <td>
                  <span v-if="row.status === 1" class="tag tag--ok">成功</span>
                  <span v-else class="tag tag--off">失败</span>
                </td>
                <td class="mono">{{ row.ip || '—' }}</td>
              </tr>

              <tr v-if="loading">
                <td colspan="7">
                  <div class="empty">加载中…</div>
                </td>
              </tr>
              <tr v-else-if="!rows.length && !error">
                <td colspan="7" class="table-empty-cell">
                  <div class="table-empty">
                    <History :size="24" aria-hidden="true" />
                    <p class="table-empty__title">这段时间没有操作记录</p>
                    <span class="table-empty__sub">换一个时间档或清空关键词再试</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="pager">
          <span class="pager__info">第 {{ pageNum }} / {{ pageCount }} 页</span>
          <button class="btn btn--sm" type="button" :disabled="loading || pageNum <= 1" @click="turn(-1)">
            上一页
          </button>
          <button
            class="btn btn--sm"
            type="button"
            :disabled="loading || pageNum >= pageCount"
            @click="turn(1)"
          >
            下一页
          </button>
        </footer>
      </div>
    </section>
  </PersonalPage>
</template>

<style scoped>
/* 面板头：标题与计数靠左、动作吸右（这三个类在别处是页面内定义，sFC 样式不外溢） */
.panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.panel__note {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 筛选条：搜索框吃掉剩余宽度，两个控件保持自然宽度 */
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.filters__search {
  position: relative;
  flex: 1;
  min-width: 180px;
}

.filters__ico {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--mauth-text-faint);
  pointer-events: none;
}

.filters__search .input {
  padding-left: 30px;
}

/* 请求列：动词与路径同一行，路径过长时省略，完整值在 title 里 */
.req {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
}

.req__verb {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--mauth-hover);
  color: var(--mauth-text-soft);
  font-size: 11px;
}

.req__path {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.pager__info {
  margin-right: auto;
  font-size: 12px;
  color: var(--mauth-text-faint);
}
</style>
