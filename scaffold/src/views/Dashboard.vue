<script setup lang="ts">
/**
 * 工作台
 *
 * 数据全部来自 `/dashboard/summary`：用户/角色/菜单/部门计数、今日登录与失败、
 * 今日操作与成功率、7 日趋势、最近登录。没有一处是前端估算或写死的。
 *
 * 版式遵循「一页只有一个视觉主角」：顶部四个读数是主角，趋势与最近登录退为小块。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { dashboardSummary } from '@/api/monitor';
import type { DashboardSummary } from '@/api/types';

const data = ref<DashboardSummary | null>(null);
const loading = ref(true);
const errorMessage = ref('');

/**
 * 加载概览
 *
 * @returns 无
 */
async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    data.value = await dashboardSummary();
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

/** 趋势柱高度：按最大值归一，最小 6% 保证可见 */
const trendBars = computed(() => {
  const series = data.value?.trend || [];
  const max = Math.max(1, ...series.map(item => item.total));
  return series.map(item => ({
    ...item,
    height: `${Math.max(6, Math.round((item.total / max) * 100))}%`
  }));
});

onMounted(load);
</script>

<template>
  <div>
    <div class="page__head">
      <h2 class="page__title">工作台</h2>
      <span class="page__sub">系统读数与最近活动</span>
      <span class="toolbar__spacer"></span>
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="15" />
        刷新
      </button>
    </div>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <div v-if="loading && !data" class="panel">
      <div v-for="n in 6" :key="n" class="skeleton-row"></div>
    </div>

    <template v-else-if="data">
      <div class="stats">
        <div class="stat">
          <div class="stat__label">用户总数</div>
          <div class="stat__value">{{ data.users }}</div>
          <div class="stat__hint">角色 {{ data.roles }} · 部门 {{ data.depts }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">今日登录</div>
          <div class="stat__value">{{ data.todayLogins }}</div>
          <div class="stat__hint">失败 {{ data.failedLogins }}</div>
        </div>
        <div class="stat">
          <div class="stat__label">今日操作</div>
          <div class="stat__value">{{ data.todayOps }}</div>
          <div class="stat__hint">成功率 {{ data.successRate }}%</div>
        </div>
        <div class="stat">
          <div class="stat__label">活跃账号（24h）</div>
          <div class="stat__value">{{ data.activeUsers }}</div>
          <div class="stat__hint">菜单项 {{ data.menus }}</div>
        </div>
      </div>

      <div class="dash-grid">
        <section class="panel">
          <header class="panel__head">
            <span class="panel__title">近 7 日操作趋势</span>
            <span class="toolbar__spacer"></span>
            <span class="tag">按天</span>
          </header>
          <div class="panel__body">
            <div v-if="trendBars.length" class="trend">
              <div v-for="bar in trendBars" :key="bar.bucket" class="trend__col">
                <div class="trend__bar" :style="{ height: bar.height }" :title="`${bar.bucket}：${bar.total} 次`"></div>
                <span class="trend__label mono">{{ bar.bucket }}</span>
              </div>
            </div>
            <div v-else class="empty">近 7 日没有操作记录</div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__head">
            <span class="panel__title">最近登录</span>
          </header>
          <div class="panel__body">
            <ul v-if="data.recentLogins.length" class="recent">
              <li v-for="item in data.recentLogins" :key="item.id" class="recent__item">
                <span class="recent__user">{{ item.username || '未知账号' }}</span>
                <span class="recent__meta mono">{{ item.ip }}</span>
                <span class="recent__time mono">{{ new Date(item.created_at).toLocaleString('zh-CN') }}</span>
              </li>
            </ul>
            <div v-else class="empty">暂无登录记录</div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 14px;
  margin-top: 14px;
}

.trend {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 190px;
  padding-top: 8px;
}

.trend__col {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 6px;
}

.trend__bar {
  width: 100%;
  max-width: 44px;
  border-radius: 8px 8px 4px 4px;
  background: linear-gradient(180deg, var(--mauth-primary), color-mix(in srgb, var(--mauth-primary) 55%, transparent));
  transition: height 0.3s ease;
}

.trend__label {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.recent__item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--mauth-surface-2);
}

.recent__user {
  font-weight: 600;
  font-size: 13px;
}

.recent__meta {
  font-size: 12px;
  color: var(--mauth-text-soft);
  justify-self: end;
}

.recent__time {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

@media (max-width: 980px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}
</style>
