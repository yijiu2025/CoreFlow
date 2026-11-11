<script setup lang="ts">
/**
 * 工作台
 *
 * 数据全部来自 `/dashboard/summary`：用户/角色/菜单/部门计数、今日登录与失败、
 * 今日操作与成功率、7 日趋势、最近登录。没有一处是前端估算或写死的。
 *
 * === 版式：从"三块等权"改成"一眼看懂当下状态" ===
 *   ① 欢迎区：谁 + 什么时候 + 现在系统什么状况（今天登录/失败/操作），右侧是常用入口；
 *   ② 读数卡：每个数字配一枚图标与一句解释，操作卡带 7 日迷你柱；
 *   ③ 主图：7 日操作趋势，成功/失败**堆叠**（只看总量看不出"今天是否异常"）；
 *   ④ 最近登录：头像首字母 + 相对时间，扫一眼就知道"刚才是谁进来的"。
 *
 * 刻意不引图表库：这里只需要柱状与迷你条，CSS 就够；为七根柱子多下一个 chunk
 * 不划算（首屏体积比图表精致度重要）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, onMounted, ref } from 'vue';
import { Activity, LogIn, Radio, RefreshCw, ShieldCheck, Users } from 'lucide-vue-next';
import { dashboardSummary } from '@/api/monitor';
import { useAuthStore } from '@/stores/auth';
import type { DashboardSummary } from '@/api/types';

const auth = useAuthStore();

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

/** 问候语：按小时分档，比"欢迎回来"更像人说的话 */
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '凌晨好';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

/** 今天（本地时区，带星期） */
const today = computed(() => {
  const now = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
  return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${week}`;
});

/** 一句话状态：把"今天发生了什么"讲清楚，而不是堆四个数字 */
const statusLine = computed(() => {
  if (!data.value) return '';
  const { todayLogins, failedLogins, todayOps } = data.value;
  if (todayLogins === 0 && todayOps === 0) return '今天还没有活动，系统安静待命中。';
  const fail = failedLogins > 0 ? `，其中 ${failedLogins} 次失败` : '，全部成功';
  return `今天已有 ${todayLogins} 次登录${fail}，累计 ${todayOps} 次操作。`;
});

/** 常用入口 */
const shortcuts = [
  { label: '用户管理', to: '/system/user' },
  { label: '角色管理', to: '/system/role' },
  { label: '部门管理', to: '/system/dept' },
  { label: '操作日志', to: '/monitor/oper-log' }
];

/** 趋势：总量归一 + 成功/失败拆分 */
const trendBars = computed(() => {
  const series = data.value?.trend || [];
  const max = Math.max(1, ...series.map(item => item.total));
  return series.map(item => {
    const failed = Math.max(0, Math.min(item.failed, item.total));
    return {
      ...item,
      failed,
      // 高度按总量归一，空数据给 4px 占位，保证"有这一天"仍看得见
      totalHeight: item.total === 0 ? '4px' : `${Math.max(4, Math.round((item.total / max) * 100))}%`,
      failedShare: item.total === 0 ? 0 : (failed / item.total) * 100,
      label: item.bucket.slice(5)
    };
  });
});

/** 趋势峰值（标在图表右上角，省一条 y 轴） */
const trendMax = computed(() => Math.max(1, ...(data.value?.trend || []).map(item => item.total)));

/**
 * 相对时间：日志里"3 分钟前"比一串日期更容易判断新鲜度
 *
 * @param iso 时间串
 * @returns 形如 `刚刚` / `12 分钟前` / `3 天前`
 */
function ago(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '—';
  const diff = Date.now() - time;
  if (diff < 60000) return '刚刚';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/**
 * 首字母（无头像时的兜底）
 *
 * @param name 账号
 * @returns 单个字符
 */
function initial(name: string | null): string {
  return (name || '?').trim().charAt(0).toUpperCase();
}

onMounted(load);
</script>

<template>
  <div class="dash">
    <!-- ① 欢迎区 -->
    <section class="hero">
      <div class="hero__glow" aria-hidden="true"></div>
      <div class="hero__main">
        <p class="hero__eyebrow">{{ today }}</p>
        <h2 class="hero__title">{{ greeting }}，{{ auth.me?.username || '管理员' }}</h2>
        <p class="hero__status">
          <ShieldCheck :size="14" class="hero__status-icon" />
          {{ statusLine || '正在读取系统状态…' }}
        </p>
      </div>
      <div class="hero__side">
        <button class="btn btn--ghost btn--sm" type="button" :disabled="loading" @click="load">
          <RefreshCw :size="14" :class="{ spin: loading }" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <div class="hero__links">
          <router-link v-for="item in shortcuts" :key="item.to" :to="item.to" class="hero__link">
            {{ item.label }}
          </router-link>
        </div>
      </div>
    </section>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <div v-if="loading && !data" class="panel">
      <div v-for="n in 5" :key="n" class="skeleton-row"></div>
    </div>

    <template v-else-if="data">
      <!-- ② 读数卡 -->
      <div class="kpis">
        <article class="kpi">
          <div class="kpi__top">
            <span class="kpi__label">用户总数</span>
            <span class="kpi__icon"><Users :size="15" /></span>
          </div>
          <div class="kpi__value">{{ data.users }}</div>
          <div class="kpi__hint">角色 {{ data.roles }} · 部门 {{ data.depts }}</div>
        </article>

        <article class="kpi">
          <div class="kpi__top">
            <span class="kpi__label">今日登录</span>
            <span class="kpi__icon"><LogIn :size="15" /></span>
          </div>
          <div class="kpi__value">{{ data.todayLogins }}</div>
          <div class="kpi__hint" :class="{ 'is-warn': data.failedLogins > 0 }">
            {{ data.failedLogins > 0 ? `失败 ${data.failedLogins} 次` : '没有失败记录' }}
          </div>
        </article>

        <article class="kpi">
          <div class="kpi__top">
            <span class="kpi__label">今日操作</span>
            <span class="kpi__icon"><Activity :size="15" /></span>
          </div>
          <div class="kpi__value">{{ data.todayOps }}</div>
          <div class="kpi__hint">成功率 {{ data.successRate }}%</div>
          <!-- 迷你柱：把 7 日趋势压进一张卡，比再放一个大图更省视线 -->
          <div class="kpi__spark" aria-hidden="true">
            <i v-for="bar in trendBars" :key="bar.bucket" :style="{ height: bar.totalHeight }" :title="`${bar.bucket}：${bar.total}`"></i>
          </div>
        </article>

        <article class="kpi">
          <div class="kpi__top">
            <span class="kpi__label">活跃账号（24h）</span>
            <span class="kpi__icon"><Radio :size="15" /></span>
          </div>
          <div class="kpi__value">{{ data.activeUsers }}</div>
          <div class="kpi__hint">菜单项 {{ data.menus }}</div>
        </article>
      </div>

      <!-- ③ 趋势 + ④ 最近登录 -->
      <div class="dash-grid">
        <section class="panel">
          <header class="panel__head">
            <span class="panel__title">近 7 日操作趋势</span>
            <span class="panel__legend">
              <span><span class="dot dot--ok"></span>成功</span>
              <span><span class="dot dot--bad"></span>失败</span>
            </span>
            <span class="toolbar__spacer"></span>
            <span class="mono panel__peak">峰值 {{ trendMax }}</span>
          </header>
          <div class="panel__body">
            <div v-if="trendBars.length" class="trend">
              <div v-for="bar in trendBars" :key="bar.bucket" class="trend__col">
                <div class="trend__track">
                  <!-- 堆叠：失败段贴底。失败永远贴底，视觉上"红了"比百分比更快 -->
                  <div
                    class="trend__bar"
                    :style="{ height: bar.totalHeight }"
                    :title="`${bar.bucket}：${bar.total} 次（失败 ${bar.failed}）`"
                  >
                    <span v-if="bar.failed > 0" class="trend__failed" :style="{ height: `${bar.failedShare}%` }"></span>
                  </div>
                </div>
                <span class="trend__value mono">{{ bar.total }}</span>
                <span class="trend__label mono">{{ bar.label }}</span>
              </div>
            </div>
            <div v-else class="empty">近 7 日没有操作记录</div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__head">
            <span class="panel__title">最近登录</span>
            <span class="toolbar__spacer"></span>
            <router-link to="/monitor/login-log" class="panel__more">全部</router-link>
          </header>
          <div class="panel__body">
            <ul v-if="data.recentLogins.length" class="recent">
              <li v-for="item in data.recentLogins" :key="item.id" class="recent__item">
                <span class="recent__avatar" aria-hidden="true">{{ initial(item.username) }}</span>
                <span class="recent__body">
                  <span class="recent__user">{{ item.username || '未知账号' }}</span>
                  <span class="recent__meta mono">{{ item.ip }}{{ item.location ? ` · ${item.location}` : '' }}</span>
                </span>
                <span class="recent__time mono" :title="new Date(item.created_at).toLocaleString('zh-CN')">
                  {{ ago(item.created_at) }}
                </span>
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
.dash {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── ① 欢迎区 ─────────────────────────────────────────────── */
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 20px 22px;
  border-radius: var(--mauth-radius-lg);
  border: 1px solid var(--mauth-border);
  background: var(--mauth-surface);
  overflow: hidden;
  isolation: isolate;
}

/* 右上角一团柔光：给"欢迎"一点温度，又不抢文字 */
.hero__glow {
  position: absolute;
  z-index: -1;
  top: -60%;
  right: -6%;
  width: 46%;
  height: 220%;
  pointer-events: none;
  background: radial-gradient(closest-side, var(--mauth-primary-soft), transparent 72%);
  opacity: 0.9;
}

.hero__eyebrow {
  margin: 0 0 6px;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  color: var(--mauth-text-faint);
}

.hero__title {
  margin: 0 0 6px;
  font-size: clamp(20px, 2vw, 26px);
  font-weight: 680;
  letter-spacing: -0.02em;
}

.hero__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

.hero__status-icon {
  flex: none;
  color: var(--mauth-success);
}

.hero__side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hero__links {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.hero__link {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--mauth-border-strong);
  color: var(--mauth-text-mid);
  font-size: 12px;
  text-decoration: none;
  transition: color 0.16s ease, border-color 0.16s ease;
}

.hero__link:hover {
  color: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

/* ── ② 读数卡 ─────────────────────────────────────────────── */
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.kpi {
  position: relative;
  padding: 14px 16px 12px;
  border-radius: var(--mauth-radius-md);
  border: 1px solid var(--mauth-border);
  background: var(--mauth-surface);
  box-shadow: var(--e1);
}

.kpi__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kpi__label {
  font-size: 12px;
  letter-spacing: var(--mauth-track-eyebrow);
  color: var(--mauth-text-faint);
}

.kpi__icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.kpi__value {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--mauth-fs-display-m);
  font-weight: 620;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.kpi__hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--mauth-text-soft);
}

.kpi__hint.is-warn {
  color: var(--mauth-danger);
}

/* 迷你柱：贴卡片底部，柱高与主图同一归一规则 */
.kpi__spark {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 22px;
  margin-top: 10px;
}

.kpi__spark i {
  flex: 1;
  border-radius: 2px 2px 0 0;
  background: color-mix(in srgb, var(--mauth-primary) 55%, transparent);
}

/* ── ③ 趋势 / ④ 最近登录 ─────────────────────────────────── */
.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 12px;
}

@media (max-width: 960px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}

.panel__legend {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: 10px;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 3px;
  border-radius: 999px;
  vertical-align: middle;
}

.dot--ok {
  background: var(--mauth-primary);
}

.dot--bad {
  background: var(--mauth-danger);
}

.panel__peak {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.panel__more {
  font-size: 11.5px;
  color: var(--mauth-text-soft);
  text-decoration: none;
}

.panel__more:hover {
  color: var(--mauth-primary);
}

.trend {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 200px;
  padding-top: 6px;
}

.trend__col {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
  min-width: 0;
}

/* 轨道是"画布"：柱子从底部向上长，值在柱顶上方固定位置 */
.trend__track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  flex: 1;
  min-height: 0;
}

.trend__bar {
  position: relative;
  width: 100%;
  max-width: 40px;
  border-radius: 6px 6px 3px 3px;
  background: linear-gradient(180deg, var(--mauth-primary), color-mix(in srgb, var(--mauth-primary) 62%, transparent));
  overflow: hidden;
  transition: height 0.3s ease;
}

/* 失败段贴底：红色在底部，比"红色在上"更像"堆积在下方的异常" */
.trend__failed {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--mauth-danger);
}

.trend__value {
  font-size: 11px;
  color: var(--mauth-text-mid);
}

.trend__label {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.recent__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: var(--mauth-radius-xs);
}

.recent__item:hover {
  background: var(--mauth-hover);
}

/* 首字母头像：没有头像字段时也能有"人"的形状，比纯文字列表好扫 */
.recent__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 12px;
  font-weight: 620;
}

.recent__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.recent__user {
  font-size: 12.5px;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent__meta {
  font-size: 11px;
  color: var(--mauth-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent__time {
  flex: none;
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .hero {
    padding: 16px;
  }

  .hero__side {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
