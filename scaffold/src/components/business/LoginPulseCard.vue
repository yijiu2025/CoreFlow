<script setup lang="ts">
/**
 * 登录脉搏（工作台主卡）
 *
 * 结构照参考项目 `views/Dashboard.vue` 的 `.bento-hero`：
 *   卡头（区块标题 + 时间档分段器）／卡身（左侧显示级读数 + 三档读注，右侧趋势图）
 *   ／卡底（深色胶囊动作）。卡身底对齐、读数区留 28px 下内边距 —— 让大数字的
 *   基线落在曲线基线之上，两块内容才像"一个仪表"而不是"两个块叠在一起"。
 *
 * 数据全部来自 `/login-logs/stats`，前端**不做任何加工**：
 *   • 序列已由后端补零成稠密阶梯（24 / 7 / 30 个点），前端**不再排序、不再补零**。
 *     曾经的 `sort(localeCompare)` 会把跨零点的 24 小时序列打乱 —— 桶名只有
 *     `HH:00` 时，`00:00` 会排到最前面，折线于是"时间倒流"；
 *   • 均值分母取序列长度（= 整档桶数）。用"有数据的那几个桶"当分母，得到的是
 *     "有数据时的平均值"，与卡头写的「近 24 小时」自相矛盾；
 *   • 环比用后端给的 `prevTotal`：上一周期为 0 时只说"新增"，不编百分比。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowRight, RefreshCw } from 'lucide-vue-next';
import { loginLogStats } from '@/api/monitor';
import Odometer from '@/components/ui/Odometer.vue';
import DeltaPill from '@/components/ui/DeltaPill.vue';
import TrendChart from '@/components/charts/TrendChart.vue';
import type { LogStats } from '@/api/types';

type PulseRange = '24h' | '7d' | '30d';

/** 时间档：`label` 给分段器，`text` 给读数区（"近 24 小时"读起来比"24 小时"完整） */
const RANGES: Array<{ value: PulseRange; label: string; text: string }> = [
  { value: '24h', label: '24 小时', text: '近 24 小时' },
  { value: '7d', label: '7 天', text: '近 7 天' },
  { value: '30d', label: '30 天', text: '近 30 天' }
];

const range = ref<PulseRange>('24h');
/** `stats` 属于哪个档位：换档时新数据还没回来，抬头与读注要跟着**数据**走，不能跟着点击走 */
const statsRange = ref<PulseRange>('24h');
const stats = ref<LogStats | null>(null);
const loading = ref(true);
const errorMessage = ref('');
/** 请求序号：快速切档时旧响应不得覆盖新响应 */
let requestId = 0;

const rangeText = computed(() => RANGES.find(item => item.value === statsRange.value)?.text || '');

/**
 * 拉取当前时间档的统计
 *
 * @returns 无
 */
async function loadPulse(): Promise<void> {
  const ticket = ++requestId;
  const wanted = range.value;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await loginLogStats(wanted);
    if (ticket !== requestId) return;
    stats.value = result;
    statsRange.value = wanted;
  } catch (err) {
    if (ticket !== requestId) return;
    errorMessage.value = err instanceof Error ? err.message : '登录脉搏加载失败';
  } finally {
    if (ticket === requestId) loading.value = false;
  }
}

/**
 * 切换时间档
 *
 * @param value 目标档位
 * @returns 无
 */
async function switchRange(value: PulseRange): Promise<void> {
  if (value === range.value) return;
  range.value = value;
  await loadPulse();
}

/* ── 序列 ─────────────────────────────────────────────────────────────── */

const series = computed(() => stats.value?.series ?? []);
const values = computed(() => series.value.map(item => Number(item.total || 0)));

/**
 * 横轴标签
 *
 * 24h 的桶是 `MM-DD HH:00`（带日期才有唯一顺序），轴上只显示 `HH:00`；
 * 7d / 30d 的桶是 `MM-DD`，换成 `MM/DD` 更符合中文阅读习惯。
 *
 * @param bucket 后端桶名
 * @returns 轴标签
 */
function labelOf(bucket: string): string {
  return bucket.includes(':') ? bucket.slice(6) : bucket.replace('-', '/');
}

const labels = computed(() => series.value.map(item => labelOf(item.bucket)));

const total = computed(() => Number(stats.value?.total ?? 0));
const peak = computed(() => (values.value.length ? Math.max(...values.value) : 0));
/** 均值分母是整档桶数（序列已补零），不是"有数据的桶数" */
const mean = computed(() => {
  const list = values.value;
  if (!list.length) return 0;
  const raw = list.reduce((acc, v) => acc + v, 0) / list.length;
  // 小于 1 时保留两位：24 小时里只登了 1 次，均值 0.04 会被一位小数抹成 0，
  // 和旁边的「峰值 1」并排出现就像这一项没算出来
  return raw < 1 ? Math.round(raw * 100) / 100 : Math.round(raw * 10) / 10;
});

const prevTotal = computed(() => Number(stats.value?.prevTotal ?? 0));
/**
 * 是否"新增"
 *
 * 🔴 判据是「上期为 0 **且本期有量**」。只判上期为 0 会把"两期都是 0"也说成
 *    新增 —— 空数据时胶囊会显示蓝色的「新增」，而那正是最没有增量的时候。
 */
const fresh = computed(() => prevTotal.value === 0 && total.value > 0);
const delta = computed(() => {
  if (fresh.value) return null;
  return Math.round(((total.value - prevTotal.value) / prevTotal.value) * 1000) / 10;
});

const isEmpty = computed(() => !loading.value && !!stats.value && total.value === 0);

/* ── 分段器滑块：按活动项实测宽度对位（选项文字长度不同，等分会对不齐） ── */

const rangeRoot = ref<HTMLElement | null>(null);
const thumbStyle = ref<Record<string, string>>({ width: '0px', transform: 'translateX(0)' });

/**
 * 把滑块挪到当前选项上
 *
 * `offsetLeft` 相对分段器内边距盒计量（首项即等于 3px 的 padding），
 * 滑块的 `left` 已经是 3px，所以位移要减掉这 3px。
 *
 * @returns 无
 */
function syncThumb(): void {
  const buttons = rangeRoot.value?.querySelectorAll<HTMLElement>('button');
  const index = Math.max(
    0,
    RANGES.findIndex(item => item.value === range.value)
  );
  const active = buttons?.[index];
  if (!active) return;
  thumbStyle.value = {
    width: `${active.offsetWidth}px`,
    transform: `translateX(${active.offsetLeft - 3}px)`
  };
}

let observer: ResizeObserver | null = null;

onMounted(() => {
  nextTick(syncThumb);
  // 字体加载完会改变选项宽度（容器宽度不变），所以要盯住容器与每个选项
  observer = new ResizeObserver(() => syncThumb());
  if (rangeRoot.value) {
    observer.observe(rangeRoot.value);
    rangeRoot.value.querySelectorAll('button').forEach(button => observer?.observe(button));
  }
});

onBeforeUnmount(() => observer?.disconnect());

watch(range, () => nextTick(syncThumb));

/* ── 指针光：材质，不是可点承诺 ─────────────────────────────────────── */

/**
 * 把指针坐标写到卡片自身（CSS 变量的作用域即叶子容器）
 *
 * @param event 指针事件
 * @returns 无
 */
function trackGlow(event: PointerEvent): void {
  const box = event.currentTarget as HTMLElement;
  const rect = box.getBoundingClientRect();
  box.style.setProperty('--px', `${event.clientX - rect.left}px`);
  box.style.setProperty('--py', `${event.clientY - rect.top}px`);
}

loadPulse();
</script>

<template>
  <section class="pulse" aria-labelledby="login-pulse-title" @pointermove="trackGlow">
    <span class="pulse__glow" aria-hidden="true" />

    <header class="pulse__head">
      <h2 id="login-pulse-title" class="pulse__title">登录脉搏</h2>
      <div ref="rangeRoot" class="pulse__ranges" role="radiogroup" aria-label="统计时间范围">
        <span class="pulse__thumb" aria-hidden="true" :style="thumbStyle" />
        <button
          v-for="item in RANGES"
          :key="item.value"
          type="button"
          role="radio"
          :aria-checked="range === item.value"
          :class="{ 'is-active': range === item.value }"
          @click="switchRange(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </header>

    <div class="pulse__body">
      <div class="pulse__figure">
        <p class="pulse__total">
          <strong><Odometer :value="stats ? total : null" /></strong><sup>次</sup>
        </p>
        <p class="pulse__delta">
          <DeltaPill :value="delta" :fresh="fresh" label="较上一等长周期" />
          <span class="pulse__faint">较上一周期</span>
        </p>
        <dl class="pulse__readouts">
          <div>
            <dt>峰值</dt>
            <dd>{{ peak }}</dd>
          </div>
          <div>
            <dt>均值</dt>
            <dd>{{ mean }}</dd>
          </div>
          <div>
            <dt>范围</dt>
            <dd class="pulse__scope">{{ rangeText }}</dd>
          </div>
        </dl>
      </div>

      <div class="pulse__chart">
        <TrendChart :values="values" :labels="labels" primary-label="登录" :height="212" unit=" 次" tone="ink" />
        <p v-if="isEmpty" class="pulse__empty">该时间范围内没有登录记录</p>
        <p v-if="errorMessage" class="pulse__error" role="alert">{{ errorMessage }}</p>
      </div>
    </div>

    <div class="pulse__actions">
      <router-link to="/monitor/login-log" class="pulse__link"> 查看登录日志<ArrowRight :size="14" /> </router-link>
      <button class="pulse__refresh" type="button" :disabled="loading" @click="loadPulse">
        <RefreshCw :size="14" :class="{ 'is-spin': loading }" />{{ loading ? '刷新中…' : '刷新' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
/* ── 卡面：青柠三层面（左上漫射 / 右下珍珠 / 150° 渐变）+ 内描边高光 ──
   与工作台其它卡的区别只有配色一层 —— 语义色守住"青柠 = 状态与能力"，
   结构（圆角、内描边、阴影层级）与普通卡完全一致。 */
.pulse {
  --px: 50%;
  --py: 50%;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 14px;
  grid-column: span 8;
  grid-row: span 2;
  min-width: 0;
  height: 100%;
  padding: 20px 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--mauth-primary) 22%, var(--mauth-border-strong));
  border-radius: var(--mauth-radius-xl);
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--mauth-primary) 26%, transparent), transparent 58%),
    radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--mauth-surface) 92%, transparent), transparent 60%),
    linear-gradient(
      150deg,
      color-mix(in srgb, var(--mauth-primary) 9%, var(--mauth-surface)),
      color-mix(in srgb, var(--mauth-primary) 3%, var(--mauth-surface)) 55%,
      var(--mauth-surface)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--mauth-surface) 96%, transparent),
    var(--e2);
}

.dark .pulse {
  border-color: color-mix(in srgb, var(--mauth-primary) 16%, var(--mauth-border-strong));
  background:
    radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--mauth-primary) 15%, transparent), transparent 58%),
    linear-gradient(150deg, color-mix(in srgb, var(--mauth-primary) 6%, var(--mauth-surface)), var(--mauth-surface) 62%);
}

/* 指针光：一道柔光照亮材质（`screen` 混合；深色下 `screen` 会发灰，换普通混合） */
.pulse__glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    circle 120px at var(--px) var(--py),
    color-mix(in srgb, #ffffff 90%, transparent),
    color-mix(in srgb, var(--mauth-primary) 8%, transparent) 42%,
    transparent 72%
  );
  mix-blend-mode: screen;
  transition: opacity 0.28s var(--ease);
}

.dark .pulse__glow {
  background: radial-gradient(
    circle 120px at var(--px) var(--py),
    color-mix(in srgb, #ffffff 7%, transparent),
    color-mix(in srgb, var(--mauth-primary) 5%, transparent) 42%,
    transparent 72%
  );
  mix-blend-mode: normal;
}

@media (hover: hover) {
  .pulse:hover .pulse__glow {
    opacity: 0.72;
  }
}

/* 内容整体压在指针光之上 */
.pulse > :not(.pulse__glow) {
  position: relative;
  z-index: 1;
}

/* ── 卡头 ─────────────────────────────────────────────────────────── */
.pulse__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pulse__title {
  margin: 0;
  font-size: 15px;
  font-weight: 680;
  letter-spacing: -0.012em;
  color: var(--mauth-text);
}

/* 分段器：槽是凹的（内阴影 + 极低透明底），滑块是凸的（白面 + 双边阴影） */
.pulse__ranges {
  position: relative;
  display: inline-flex;
  flex: none;
  padding: 3px;
  border-radius: var(--mauth-radius-sm);
  background: color-mix(in srgb, var(--mauth-text) 6%, transparent);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--mauth-text) 6%, transparent);
}

.pulse__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  border-radius: var(--mauth-radius-xs);
  border: 1px solid color-mix(in srgb, var(--mauth-surface) 92%, transparent);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--mauth-surface) 97%, transparent),
    color-mix(in srgb, var(--mauth-surface-2) 72%, transparent)
  );
  box-shadow:
    var(--e2),
    inset 0 1px 0 color-mix(in srgb, var(--mauth-surface) 98%, transparent);
  transition: transform 0.3s var(--ease-out);
}

.pulse__ranges button {
  position: relative;
  z-index: 1;
  height: 28px;
  padding: 0 13px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.2s var(--ease);
}

.pulse__ranges button:hover,
.pulse__ranges button.is-active {
  color: var(--mauth-text);
}

.pulse__ranges button:focus-visible {
  outline: 2px solid var(--mauth-focus);
  outline-offset: 2px;
}

/* ── 卡身：读数 + 曲线（底对齐） ────────────────────────────────────── */
.pulse__body {
  display: grid;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  gap: 20px;
  align-items: end;
  flex: 1;
  min-height: 0;
}

/* 28px 下内边距：让读数区整体上浮，大数字的基线落在曲线基线之上 */
.pulse__figure {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding-bottom: 28px;
}

/* 显示级读数：56px，单位缩到 .32em 并上标，数字带负字距才有"仪表"感。
   🔴 字号必须写在**容器**上：`sup` 与 `strong` 是兄弟节点，若只给 `strong`
   写字号，`sup` 的 `0.32em` 会相对卡片的 14px 正文计算 → 变成 4.5px 的一个点。 */
.pulse__total {
  display: inline-flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  line-height: 1;
  font-size: clamp(44px, 4.2vw, 56px);
  color: var(--mauth-text);
}

.pulse__total strong {
  font-size: inherit;
  font-weight: 720;
  letter-spacing: -0.045em;
  font-variant-numeric: tabular-nums;
}

/* 单位上标：`align-items: flex-start` 会把它顶到行盒最上沿，而数字还有约 0.16em
   的上伸空白，两者相差近 9px —— 看起来像"次"飘在数字外面。用 `top` 补掉这段
   差值，让单位的顶边落在数字的cap顶附近（em 相对的是它自己的 18px，所以
   字号变化时偏移量同比缩放，不需要再写断点）。 */
.pulse__total sup {
  align-self: flex-start;
  position: relative;
  top: 0.55em;
  margin-left: 2px;
  color: var(--mauth-text-soft);
  font-size: 0.32em;
  font-weight: 640;
  letter-spacing: 0;
  vertical-align: top;
}

.pulse__delta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12px;
}

.pulse__faint {
  color: var(--mauth-text-faint);
}

.pulse__readouts {
  display: grid;
  grid-template-columns: repeat(3, auto);
  justify-content: start;
  gap: 4px 22px;
  margin: 8px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--mauth-border-strong);
}

.pulse__readouts dt {
  font-size: 11px;
  color: var(--mauth-text-faint);
  white-space: nowrap;
}

.pulse__readouts dd {
  margin: 3px 0 0;
  font-size: 15px;
  font-weight: 680;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

/* 范围是一句中文，不该用读数的大字重去和数字抢：缩回 12.5px 并降一档颜色 */
.pulse__readouts dd.pulse__scope {
  font-size: 12.5px;
  font-weight: 620;
  letter-spacing: 0;
  color: var(--mauth-text-mid);
  white-space: nowrap;
}

.pulse__chart {
  position: relative;
  min-width: 0;
}

.pulse__empty {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: 0;
  padding: 5px 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mauth-surface) 84%, transparent);
  color: var(--mauth-text-faint);
  font-size: 11.5px;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.pulse__error {
  position: absolute;
  right: 0;
  bottom: -4px;
  margin: 0;
  color: var(--mauth-danger);
  font-size: 11px;
}

/* ── 卡底：深色胶囊是这一屏唯一的"实心"按钮 ────────────────────────── */
.pulse__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pulse__link,
.pulse__refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 640;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease),
    box-shadow 0.2s var(--ease);
}

.pulse__link {
  border: 1px solid transparent;
  background: var(--mauth-plate-bg);
  color: var(--mauth-plate-ink);
  text-decoration: none;
  box-shadow:
    0 6px 16px rgba(14, 18, 20, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

/* 暗色下深色铭牌与卡面几乎同色，「唯一实心按钮」这个层级就没了 —— 翻成主色底白字
   （深色底上主色是唯一还亮着的强调色，与主卡本身的语义一致） */
.dark .pulse__link {
  background: var(--mauth-primary);
  color: #ffffff;
  box-shadow:
    0 6px 18px color-mix(in srgb, var(--mauth-primary) 22%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.pulse__link:hover {
  color: var(--mauth-plate-ink);
  box-shadow:
    0 8px 20px rgba(14, 18, 20, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.dark .pulse__link:hover {
  color: #ffffff;
  box-shadow:
    0 8px 22px color-mix(in srgb, var(--mauth-primary) 32%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.pulse__refresh {
  border: 1px solid var(--mauth-border-strong);
  background: color-mix(in srgb, var(--mauth-surface) 72%, transparent);
  color: var(--mauth-text-mid);
}

.pulse__refresh:hover:not(:disabled) {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  box-shadow: var(--e1-lift);
}

.pulse__refresh:disabled {
  cursor: wait;
  opacity: 0.65;
}

.is-spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 响应式：先并后折 ──────────────────────────────────────────────── */
@media (max-width: 1280px) {
  .pulse {
    grid-column: 1 / -1;
    grid-row: auto;
  }
}

@media (max-width: 760px) {
  .pulse {
    padding: 16px;
    border-radius: var(--mauth-radius-lg);
  }

  .pulse__body {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .pulse__figure {
    padding-bottom: 0;
    gap: 10px;
  }

  .pulse__total strong {
    font-size: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spin {
    animation: none;
  }

  .pulse__thumb {
    transition: none;
  }
}
</style>
