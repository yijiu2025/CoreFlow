<script setup lang="ts">
/**
 * 珍珠玻璃 · 工作台版式
 *
 * 版式只负责"长什么样"：问候语、趋势柱高度、成功率刻度环端点都由容器算好
 * （`views/dashboard/Dashboard.vue`），契约见 `theme/views/dashboard.ts`。
 * 换一套工作台 = 加一个目录，统计口径不跟着重写一遍。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { Activity, ArrowRight, RefreshCw, ShieldCheck, Users } from 'lucide-vue-next';
import AppIcon from '@/components/ui/AppIcon.vue';
import LoginPulseCard from '@/components/business/LoginPulseCard.vue';
import Odometer from '@/components/ui/Odometer.vue';
import type { DashboardViewContext } from '@/theme/views/dashboard';

const props = defineProps<{ ctx: DashboardViewContext }>();

/*
 * 把 ctx 平铺回模板原来的名字 —— 搬迁前模板用的是这些名字，逐字保留就不用逐行改。
 * 解构出来的是**同一个 Ref**（不是快照），响应性与 `.value` 写法都不变。
 */
const {
  data,
  loading,
  errorMessage,
  userName,
  greeting,
  today,
  statusLine,
  trendBars,
  trendPeakIndex,
  onlineCount,
  trendMax,
  trendHover,
  ringTicks,
  ringCap,
  resources,
  shortcuts,
  load,
  ago,
  initial
} = props.ctx;
</script>

<template>
  <div class="dash">
    <!-- ① 页头：透明层，主卡才是主角 -->
    <header class="dash__head">
      <div class="dash__head-main">
        <p class="dash__date">{{ today }}</p>
        <h2 class="dash__greet">{{ greeting }}，{{ userName }}</h2>
        <p class="dash__status">
          <ShieldCheck :size="14" class="dash__status-icon" />
          {{ statusLine || '正在读取系统状态…' }}
        </p>
      </div>
      <!-- 刷新统一为实边框：全站九处刷新按钮同一形态，只有"刷新中…"时文案变、外形不变 -->
      <button class="btn btn--sm" type="button" :disabled="loading" @click="load">
        <RefreshCw :size="14" :class="{ spin: loading }" />
        {{ loading ? '刷新中…' : '刷新' }}
      </button>
    </header>

    <p v-if="errorMessage" class="tag tag--off">{{ errorMessage }}</p>

    <div v-if="loading && !data" class="panel">
      <div v-for="n in 5" :key="n" class="skeleton-row"></div>
    </div>

    <div v-else-if="data" class="bento-grid">
      <!-- ② 主卡：登录脉搏（卡片自带 24h/7d/30d 时间档与网格占位 span 8 × 2 行） -->
      <LoginPulseCard />

      <!-- ③ 侧卡：在线用户
           口径是「Redis 里仍有有效会话的账号数」（后端 onlineUsers）——
           不是 WebSocket 长连接数，也不是"近 24 小时登录过"：一直挂着不重登的账号
           前者算 0、后者算 1。Redis 不可用时回落到 activeUsers（近 24h 成功登录数）。 -->
      <section class="bento bento--side">
        <div class="side__top">
          <span class="side__label">在线用户</span>
          <span class="side__ico"><Users :size="16" /></span>
        </div>
        <p class="side__value mono"><Odometer :value="onlineCount" /><small> 人</small></p>
        <div class="side__foot">
          <span class="side__hint">{{ data.onlineUsers === null ? '近 24 小时登录' : '当前有会话' }}</span>
          <span class="side__hint mono">共 {{ data.users }} 位</span>
        </div>
      </section>

      <!-- ③ 侧卡：今日操作 -->
      <section class="bento bento--side">
        <div class="side__top">
          <span class="side__label">今日操作</span>
          <span class="side__ico"><Activity :size="16" /></span>
        </div>
        <p class="side__value mono"><Odometer :value="data.todayOps" /><small> 次</small></p>
        <div class="side__foot">
          <span class="side__hint">成功率</span>
          <span class="side__hint is-ok mono">{{ data.successRate }}%</span>
        </div>
      </section>

      <!-- ④ 近 7 天操作量 -->
      <section class="bento bento--third">
        <header class="bento__head">
          <span class="bento__title">近 7 天操作量</span>
          <span class="bento__meta mono">峰值 {{ trendMax }}</span>
        </header>
        <div v-if="trendBars.length" class="bars" @pointerleave="trendHover = null">
          <div class="bars__plot" role="img" :aria-label="`近 7 天操作柱状图，最高 ${trendMax} 次`">
            <div
              v-for="(bar, i) in trendBars"
              :key="bar.bucket"
              :class="['bars__slot', { 'is-hover': trendHover === i }]"
              @pointerenter="trendHover = i"
            >
              <span
                v-if="trendHover === i || (trendHover === null && i === trendPeakIndex && bar.total > 0)"
                class="bars__readout mono"
              >
                {{ bar.total }}
              </span>
              <div :class="['bars__col', { 'is-today': bar.isToday }]" :style="{ height: bar.height, '--i': i }">
                <!-- 失败段贴顶：红在柱顶，异常一眼可见（参考项目 BarChart 语义） -->
                <span v-if="bar.failed > 0" class="bars__failed" :style="{ height: `${bar.failedShare}%` }"></span>
              </div>
            </div>
          </div>
          <div class="bars__labels">
            <span
              v-for="(bar, i) in trendBars"
              :key="`l${bar.bucket}`"
              :class="{ 'is-today': bar.isToday || i === trendBars.length - 1 }"
            >
              {{ bar.isToday || i === trendBars.length - 1 ? '今天' : bar.label.replace('-', '/') }}
            </span>
          </div>
        </div>
        <div v-else class="empty">近 7 天没有操作记录</div>
      </section>

      <!-- ④ 操作成功率：刻度环 -->
      <section class="bento bento--third">
        <header class="bento__head">
          <span class="bento__title">操作成功率</span>
          <span class="bento__meta">今日</span>
        </header>
        <div class="ring-wrap">
          <div class="ring">
            <svg viewBox="0 0 1 1" role="img" :aria-label="`操作成功率 ${data.successRate}%`">
              <line
                v-for="tick in ringTicks"
                :key="tick.key"
                :class="['ring__tick', { 'is-major': tick.major, 'is-on': tick.on }]"
                :x1="tick.x1"
                :y1="tick.y1"
                :x2="tick.x2"
                :y2="tick.y2"
              />
              <circle v-if="ringCap" class="ring__cap" :cx="ringCap?.x" :cy="ringCap?.y" r="0.022" />
            </svg>
            <div class="ring__center">
              <strong>{{ data.successRate }}<small>%</small></strong>
              <span>成功率</span>
            </div>
          </div>
          <dl class="ring__readouts">
            <div>
              <dt>今日操作</dt>
              <dd class="mono">{{ data.todayOps }} 次</dd>
            </div>
            <div>
              <dt>失败</dt>
              <dd class="mono" :class="{ 'is-warn': data.failedLogins > 0 }">{{ data.failedLogins }} 次</dd>
            </div>
          </dl>
        </div>
      </section>

      <!-- ④ 系统资源：四格读数 -->
      <section class="bento bento--third">
        <header class="bento__head">
          <span class="bento__title">系统资源</span>
          <span class="bento__meta">当前台账</span>
        </header>
        <dl class="res">
          <div v-for="item in resources" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd class="mono">{{ item.value }}</dd>
          </div>
        </dl>
      </section>

      <!-- ⑤ 最近登录 -->
      <section class="bento bento--narrow">
        <header class="bento__head">
          <span class="bento__title">最近登录</span>
          <router-link to="/monitor/login-log" class="bento__link"> 全部<ArrowRight :size="12" /> </router-link>
        </header>
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
        <!-- 「没权限」与「确实没有」必须分开说，否则用户会反复刷新等记录出现 -->
        <div v-else class="empty">
          {{ data?.recentLoginsLocked ? '需要「日志查看」权限才能看到登录明细' : '暂无登录记录' }}
        </div>
      </section>

      <!-- ⑤ 常用入口 -->
      <section class="bento bento--wide">
        <header class="bento__head">
          <span class="bento__title">常用入口</span>
          <span class="bento__meta">按权限可见的页面</span>
        </header>
        <div v-if="shortcuts.length > 0" class="quick">
          <router-link v-for="item in shortcuts" :key="item.path" :to="item.path" class="quick__link">
            <span class="quick__ico"><AppIcon :name="item.icon" :size="17" /></span>
            <span class="quick__text">
              <span class="quick__title">{{ item.label }}</span>
              <span class="quick__sub">{{ item.sub }}</span>
            </span>
            <ArrowRight :size="15" class="quick__go" />
          </router-link>
        </div>
        <!-- 一个入口都没有时别留空框：让人以为页面加载失败 -->
        <div v-else class="empty">当前账号没有可进入的管理页面，请联系管理员授权</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── ① 页头（透明层） ─────────────────────────────────────── */
.dash__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.dash__date {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--mauth-text-faint);
}

.dash__greet {
  margin: 0 0 6px;
  font-size: clamp(20px, 2vw, 26px);
  font-weight: 680;
  letter-spacing: -0.022em;
}

.dash__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  color: var(--mauth-text-soft);
}

.dash__status-icon {
  flex: none;
  color: var(--mauth-success);
}

/* ── ② Bento 网格 ────────────────────────────────────────── */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 14px;
}

/* 阅读面：24px 圆角 + 珍珠白渐变（纯白会显得"纸片"，一层极浅的斜向渐变才像玻璃面）
   + 顶部 1px 内高光（光从上方来，边缘才立得住） */
.bento {
  min-width: 0;
  padding: 20px 22px;
  border-radius: var(--mauth-radius-xl);
  border: 1px solid var(--mauth-border-strong);
  background: linear-gradient(145deg, var(--mauth-surface), var(--mauth-surface-2));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--mauth-surface) 96%, transparent),
    var(--e1);
}

/* 主卡的网格占位（span 8 × 2 行）写在 LoginPulseCard 自己身上：
   主卡的尺寸与它自己的内容强相关，放在页面侧会形成"两处都要改"的耦合 */
.bento--side {
  grid-column: span 4;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  min-height: 172px;
}

.bento--third,
.bento--narrow {
  grid-column: span 4;
}

.bento--wide {
  grid-column: span 8;
}

.bento__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.bento__title {
  font-size: 14.5px;
  font-weight: 680;
  letter-spacing: -0.012em;
}

.bento__meta {
  font-size: 11px;
  color: var(--mauth-text-faint);
  white-space: nowrap;
}

.bento__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11.5px;
  color: var(--mauth-text-soft);
  text-decoration: none;
}

.bento__link:hover {
  color: var(--mauth-primary);
}

/* ── ③ 侧卡 ──────────────────────────────────────────────── */
.side__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.side__label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--mauth-text-mid);
}

.side__ico {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-hover);
  color: var(--mauth-text-soft);
}

/* 侧块读数：40px 显示级（参考项目的 metric-l），单位缩到 .32em 上标 */
.side__value {
  margin: 0;
  font-size: 40px;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.045em;
  line-height: 1;
}

.side__value small {
  position: relative;
  top: 0.12em;
  margin-left: 3px;
  font-size: 0.32em;
  font-weight: 640;
  letter-spacing: 0;
  color: var(--mauth-text-soft);
}

.side__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}

.side__hint {
  color: var(--mauth-text-soft);
}

/* 成功率读数走工作台自己的令牌：默认就是主色，但能在「外观 → 卡片 → 工作台」里
   单独换成别的颜色，不用动全站主色（绿在这页是唯一的语义色，再留一个绿会失焦） */
.side__hint.is-ok {
  font-weight: 650;
  color: var(--mauth-dash-rate);
}

.side__hint.is-warn {
  font-weight: 650;
  color: var(--mauth-danger);
}

/* ── ④ 近 7 天操作量：参考项目 BarChart 风格 ──────────────
   默认柱是灰黑渐变（白底上的"墨柱"），hover 加深；
   今天用青柠渐变 + 斜线 + 光晕；失败段红色贴柱顶；
   读数只在 hover 或峰值柱显示，其余柱不标数（更干净）。 */
.bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 176px;
}

.bars__plot {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: end;
  padding-top: 22px;
  /* 四道水平刻度线：柱子有"基线"才像仪表，否则像色块 */
  background: linear-gradient(var(--mauth-border) 1px, transparent 1px) 0 100% / 100% 25% repeat-y;
}

.bars__slot {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bars__col {
  position: relative;
  width: min(100%, 38px);
  border-radius: 10px 10px 4px 4px;
  overflow: hidden;
  transform-origin: 50% 100%;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--mauth-text) 20%, transparent),
    color-mix(in srgb, var(--mauth-text) 12%, transparent)
  );
  transition: background 0.25s var(--ease);
  animation: bar-grow 0.7s var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 0.05s);
}

.bars__slot.is-hover .bars__col {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--mauth-text) 34%, transparent),
    color-mix(in srgb, var(--mauth-text) 22%, transparent)
  );
}

/*
 * 悬停时「今天」那一根必须保持主色。
 *
 * 🔴 上面那条 hover 规则是 3 个类（`.bars__slot.is-hover .bars__col`），比
 *    `.bars__col.is-today`（2 个类）权重高 —— 不加这条，鼠标一放上去今天的柱子
 *    就退回中性灰，看着像"颜色丢了"。这里只把主色提亮一档，用同样的斜纹结构。
 */
.bars__slot.is-hover .bars__col.is-today {
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--mauth-dash-today) 22%, transparent) 0 1.5px,
      transparent 1.5px 6px
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--mauth-dash-today) 88%, #ffffff),
      color-mix(in srgb, var(--mauth-dash-today) 62%, #ffffff)
    );
  box-shadow: 0 8px 22px color-mix(in srgb, var(--mauth-dash-today) 28%, transparent);
}

/* 今天：主色渐变 + 斜线填充 + 光晕（其余柱子是中性灰，"今天"用品牌色标出来）
   颜色走工作台令牌：整页想换个色调时不用去动全站主色 */
.bars__col.is-today {
  background:
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--mauth-dash-today) 18%, transparent) 0 1.5px,
      transparent 1.5px 6px
    ),
    linear-gradient(
      180deg,
      var(--mauth-dash-today),
      color-mix(in srgb, var(--mauth-dash-today) 72%, #ffffff)
    );
  box-shadow: 0 6px 18px color-mix(in srgb, var(--mauth-dash-today) 12%, transparent);
}

.bars__failed {
  position: absolute;
  inset: 0 0 auto 0;
  background: var(--mauth-danger);
  opacity: 0.78;
}

.bars__readout {
  position: absolute;
  top: 0;
  left: 50%;
  translate: -50% 0;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--mauth-text);
}

.bars__labels {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 10px;
}

.bars__labels span {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mauth-text-faint);
}

/* 「今天」标签与柱子同一项令牌：它是标记，不是"成功"状态 */
.bars__labels span.is-today {
  color: var(--mauth-dash-today);
  font-weight: 700;
}

@keyframes bar-grow {
  from {
    transform: scaleY(0);
  }
}

/* ── ④ 操作成功率刻度环 ─────────────────────────────────── */
.ring-wrap {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 18px;
  flex-wrap: wrap;
  padding: 4px 0 8px;
}

.ring {
  position: relative;
  width: 132px;
  height: 132px;
  flex: none;
}

.ring svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* 刻度：归一化 viewBox 里 .012 ≈ 132px 下的 1.6px，整五加长加粗 */
.ring__tick {
  stroke: color-mix(in srgb, var(--mauth-text) 20%, transparent);
  stroke-width: 0.012;
  stroke-linecap: round;
  transition: stroke 0.3s var(--ease);
}

.ring__tick.is-major {
  stroke-width: 0.017;
}

.ring__tick.is-on {
  stroke: var(--mauth-dash-ring);
}

.ring__cap {
  fill: var(--mauth-dash-ring);
}

.ring__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.ring__center strong {
  display: inline-flex;
  align-items: flex-start;
  font-size: 30px;
  font-weight: 740;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
  line-height: 1;
}

.ring__center small {
  margin: 2px 0 0 2px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  color: var(--mauth-text-soft);
}

.ring__center > span {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.ring__readouts {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
}

.ring__readouts dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

.ring__readouts dd {
  margin: 3px 0 0;
  font-size: 15px;
  font-weight: 680;
  font-variant-numeric: tabular-nums;
}

.ring__readouts dd.is-warn {
  color: var(--mauth-danger);
}

/* ── ④ 系统资源 ──────────────────────────────────────────── */
.res {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 12px;
  margin: 4px 0 8px;
}

.res dt {
  font-size: 11px;
  letter-spacing: var(--mauth-track-eyebrow);
  color: var(--mauth-text-faint);
}

.res dd {
  margin: 5px 0 0;
  font-size: 22px;
  font-weight: 660;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

/* ── ⑤ 最近登录 ──────────────────────────────────────────── */
.recent {
  list-style: none;
  margin: -6px -8px 0;
  padding: 0;
  display: grid;
  gap: 0;
}

.recent__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 8px;
}

.recent__item + .recent__item {
  border-top: 1px solid var(--mauth-border);
}

/* 首字母头像：没有头像字段时也能有"人"的形状，比纯文字列表好扫
   底与字走工作台的「小方块」两项（和常用入口图标同一对，改一处两处一起变） */
.recent__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: var(--mauth-dash-chip-bg);
  color: var(--mauth-dash-chip-ink);
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
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

/* ── ⑤ 常用入口 ──────────────────────────────────────────── */
.quick {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: 10px;
}

.quick__link {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border-radius: var(--mauth-radius-sm);
  border: 1px solid var(--mauth-border);
  color: inherit;
  text-decoration: none;
  transition:
    box-shadow 0.22s var(--ease),
    border-color 0.22s var(--ease);
}

.quick__link:hover {
  border-color: var(--mauth-border-strong);
  box-shadow: var(--e1-lift);
}

.quick__ico {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-dash-chip-bg);
  color: var(--mauth-dash-chip-ink);
  flex: none;
}

.quick__text {
  flex: 1;
  min-width: 0;
}

.quick__title {
  display: block;
  font-size: 13px;
  font-weight: 640;
}

.quick__sub {
  display: block;
  font-size: 11.5px;
  color: var(--mauth-text-soft);
}

.quick__go {
  flex: none;
  color: var(--mauth-text-faint);
  transition:
    color 0.2s var(--ease),
    transform 0.2s var(--ease);
}

.quick__link:hover .quick__go {
  color: var(--mauth-primary);
  transform: translateX(2px);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }

  .bars__col {
    animation: none;
  }
}

/* ── 响应式：先并后折 ────────────────────────────────────── */
@media (max-width: 1280px) {
  .bento--side,
  .bento--third {
    grid-column: span 6;
  }

  .bento--narrow,
  .bento--wide {
    grid-column: 1 / -1;
  }
}

/*
 * 窄屏单列。
 *
 * 断点取 820px，与其它页（外壳侧栏、表格卡片化、设备判定）同一个值 ——
 * 曾经这里是 760px，结果 760~820 这段宽度上"已经按手机给了移动端 token，
 * 网格却还是两列"，卡片被压成一条窄缝。
 */
@media (max-width: 820px) {
  .bento-grid {
    gap: 12px;
  }

  .bento {
    padding: 16px;
    border-radius: var(--mauth-radius-md);
  }

  .bento--side,
  .bento--third {
    grid-column: 1 / -1;
  }
}
</style>
