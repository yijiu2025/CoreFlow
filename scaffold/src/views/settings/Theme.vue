<script setup lang="ts">
/**
 * 外观与主题 —— 三档配置：**背景 / 颜色 / 主题**
 *
 * === 为什么这一页不走 `<ThemeView>` ===
 * 它本身就是"改主题"的地方，任何一套外观下都该长得一样（用全局组件类 + token 即可），
 * 不需要每个包 × 设备各写一份版式。若把它升格成页面域，就得给 3 个包 × 2 个设备 ×
 * 若干配色再补 30 份配色记录，只为让一个设置页"可被主题化"—— 收益为零。
 * 代价是它自己要写一点 scoped 样式（本文件底部），这是刻意的例外。
 *
 * === 三档的分工（互相正交，可任意组合）===
 *   背景  图片 / 纯色        —— `theme/backgrounds.ts` + `data-mauth-bg`
 *   颜色  明暗 / 主题色 / 配色 —— `mauth:mode` / `mauth:accent` / `mauth:theme`
 *   主题  版式（= 主题包）     —— `mauth:view`（包自带显示名与配套主色）
 *
 * 全部落本地：换路由、刷新、重开浏览器都还在（URL 参数只是"这次"的临时指定，
 * 首次带参进来会被采纳成本地偏好，见 `adoptUrlThemeIntents`）。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { computed, ref } from 'vue';
import PersonalPage from '@/components/business/PersonalPage.vue';
import {
  Check,
  ChevronRight,
  Image,
  Moon,
  MonitorSmartphone,
  Palette,
  Pencil,
  SlidersHorizontal,
  Sun
} from 'lucide-vue-next';
import { getThemeRecord, listColorsOf } from 'skinsuite';
import { themePackageOptions, useThemePackage } from '@/composables/useThemePackage';
import { useAccentStore } from '@/stores/accent';
import { normalizeHex, deriveAccent, toPickerHex } from '@/theme/color';
import { useBackgroundStore } from '@/stores/background';
import { useDensityStore } from '@/stores/density';
import { useOverridesStore } from '@/stores/overrides';
import TokenEditor from '@/components/settings/TokenEditor.vue';
import { useThemeStore } from '@/stores/theme';
import { useRenderDevice } from '@/views/device/useRenderDevice';

const device = useRenderDevice();
const bg = useBackgroundStore();
const density = useDensityStore();
const overrides = useOverridesStore();
const accent = useAccentStore();
const theme = useThemeStore();

/**
 * 当前明暗
 *
 * 用 `theme.isDark` 而不是读 DOM 类：它是响应式的，切明暗后提示里的对比度
 * 会立刻重算（读 DOM 要等下一帧，而且 computed 不会自己跟踪 class 变化）。
 */
const tone = computed<'light' | 'dark'>(() => (theme.isDark ? 'dark' : 'light'));

/**
 * 自定义色的派生信息（只有当前选的是 hex 时才有）
 *
 * 拿它同时喂三处：色块显示的**原色**、提示里的**实际主色**与对比度。
 * 用 `resolveAccent` 而不是自己算 —— 保证与真正写进 CSS 的值同源。
 */
const customInfo = computed(() => {
  const hex = normalizeHex(accent.currentId);
  /* 用 `deriveAccent` 而不是 `resolveAccent`：前者保证 `contrast` 一定有值（提示要用），
     两者底层是同一条派生逻辑，读到的 primary 与真正写进 CSS 的完全一致。 */
  return hex ? deriveAccent(hex, tone.value) : null;
});

/**
 * 色块的填充
 *
 * **对角双色**：左半是用户选的原色，右半是实际生效的 primary。
 * 只显示原色会骗人（浅黄被压成 `#917300` 后，界面上其实没有浅黄），
 * 只显示 primary 又看不出"我选的是哪个"。两个都放上去，一眼就能对上。
 */
const chipStyle = computed(() => {
  const info = customInfo.value;
  /* 没选过自定义色时给一圈彩虹 —— 这是"任意色"的通用约定，也区别于某个具体预设 */
  if (!info) {
    return {
      background: 'conic-gradient(from 210deg, #ff5a50, #d98324, #82dd2d, #0d9b8a, #236de9, #6d5ce7, #ff5a50)'
    };
  }
  return { background: `linear-gradient(135deg, ${info.tint} 0 48%, ${info.primary} 48% 100%)` };
});

/** 取色器的 value 必须是 hex：没有自定义色时给默认色 */
const customHex = computed(() => customInfo.value?.tint ?? accent.presets[0].primary);

/**
 * 原生取色器选色
 *
 * @param ev input 事件
 */
function onCustomPick(ev: Event): void {
  const value = (ev.target as HTMLInputElement).value;
  if (normalizeHex(value)) accent.pick(value);
}

/** 展开的档位（同时只开一个，避免三块长列表堆在一起） */
/** 四个档位的 key（加一档只改这里） */
type LookSection = 'bg' | 'color' | 'theme' | 'custom';

const open = ref<LookSection | ''>('color');

/**
 * 收起 / 展开某一档
 *
 * @param key 档位
 */
function toggle(key: LookSection): void {
  open.value = open.value === key ? '' : key;
}

/** 明暗三档（顺序 = 面板顺序） */
const MODES = [
  { id: 'system', name: '跟随系统', icon: MonitorSmartphone },
  { id: 'light', name: '浅色', icon: Sun },
  { id: 'dark', name: '深色', icon: Moon }
] as const;

/**
 * 配色候选
 *
 * 取「当前包 × 当前设备 × 壳页（console）」这一作用域 —— 配色记录是按
 * 「包 × 设备 × 页面」声明的，而设置页自己不住在任何一套配色下（它跟随外壳）。
 */
const colorThemes = computed(() => listColorsOf(device.value, 'console', theme.packageId));

/** 当前生效的配色 id（含设备级覆盖，与注入同口径） */
const currentColor = computed(() => theme.themeRecordFor(undefined, device.value, 'console').meta.id);

/* ── 背景色：纯色那一格可以自己挑 ────────────────────────────
 * 走的是 `--mauth-bg` 的**覆盖项**，不另建存储。这样它天生与「自定义」那一档同源：
 * 同一份 `mauth:overrides`、同一条优先级（覆盖 > 主色 > 配色表）、同一个「全部还原」、
 * 同一份账号同步 —— 换配色或切明暗时它也不会被抹掉（覆盖层永远最后写）。
 */

/** 用户自选的底色（没自选就是空串） */
const bgOverride = computed(() => overrides.current['--mauth-bg'] ?? '');

/** 是否自选过底色 */
const isCustomBg = computed(() => Boolean(bgOverride.value));

/** 取色器要的 hex：没自选时读当前配色自带的那份 */
const bgHex = computed(() =>
  toPickerHex(bgOverride.value || theme.themeRecordFor(undefined, device.value, 'console').tokens?.['--mauth-bg'] || '')
);

/**
 * 背景图块的缩略图
 *
 * 纯色那格直接铺**当前底色**（自选后就是自选色）：缩略图说真话，用户不用点进去才知道长什么样。
 *
 * @param id 背景 id
 * @returns 内联样式；壁纸那格返回 undefined（图在 CSS 里）
 */
function thumbStyleOf(id: string): Record<string, string> | undefined {
  return id === 'none' ? { background: bgHex.value } : undefined;
}

/**
 * 图块描述
 *
 * 纯色自选之后「跟随配色自带的底色」就不成立了，改成把色值报出来。
 *
 * @param item 背景预设
 * @returns 描述文本
 */
function descOf(item: { id: string; description: string }): string {
  return item.id === 'none' && isCustomBg.value ? `自定义 ${bgHex.value}` : item.description;
}

/**
 * 选底色
 *
 * @param ev input 事件
 */
function onBgPick(ev: Event): void {
  const hex = normalizeHex((ev.target as HTMLInputElement).value);
  if (!hex) return;
  overrides.set('--mauth-bg', hex);
  /* 正在用壁纸时顺手切回纯色：否则选了色却看不见，会以为"没生效" */
  if (bg.currentId !== 'none') bg.pick('none');
}

/** 底色回到配色自带的那份 */
function resetBgColor(): void {
  overrides.reset(['--mauth-bg']);
}

/**
 * 配色缩略图（两色拼块：左底色、右主色）
 *
 * 不去要求每份配色都手写 `preview` —— 那会让"新建一个配色"多一处容易忘的字段。
 * 直接从注册表读这套配色的 tokens 里那两行，视觉上"一眼看出这配色长什么样"就够了。
 *
 * @param id 配色 id
 * @returns 内联样式
 */
function swatchOf(id: string): Record<string, string> {
  const record = getThemeRecord({ id, device: device.value, pkg: theme.packageId, page: 'console' });
  const tokens = record.tokens ?? {};
  const bg = tokens['--mauth-bg'] ?? 'transparent';
  const primary = tokens['--mauth-primary'] ?? 'transparent';
  return { background: `linear-gradient(135deg, ${bg} 0 56%, ${primary} 56% 100%)` };
}

/** 可选版式（包自带显示名 / 描述 / 配套主色，不再有宿主清单） */
const { packages, pick: pickPackage } = useThemePackage();

/**
 * 只列出**当前设备上真能换掉后台壳**的包
 *
 * 两条判据（都来自包自己的 `coverage` 声明）：
 *   · 设备被覆盖 —— 口袋版只有手机端，桌面上不显示；
 *   · 声明了 `console` 页 —— 聚光只有登录页版式，选它也不改变后台布局。
 * 缺一条就是"点了没反应"，那正是最容易被当成 bug 的形态。
 */
const availPackages = computed(() =>
  packages.filter(item => item.devices.includes(device.value) && item.pages.includes('console'))
);
</script>

<template>
  <!-- narrow：表单型设置页铺满整屏很难读，收在 820px 内；其余三页是表格，必须通栏 -->
  <PersonalPage
    title="外观与主题"
    sub="背景、颜色、主题、自定义分四档配，互不干扰；选完即记住，刷新与换页都不会丢"
    narrow
  >
    <div class="look">
      <!-- ① 背景 -->
      <section class="panel">
        <button class="lrow" type="button" :aria-expanded="open === 'bg'" @click="toggle('bg')">
          <span class="lrow__ico"><Image :size="17" /></span>
          <span class="lrow__text">
            <b>背景</b>
            <small>背景图像、颜色</small>
          </span>
          <ChevronRight :size="16" class="lrow__chev" :class="{ 'is-open': open === 'bg' }" />
        </button>

        <div v-if="open === 'bg'" class="lrow__body">
          <div class="tiles" role="radiogroup" aria-label="背景">
            <button
              v-for="item in bg.presets"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="bg.currentId === item.id"
              :class="['tile', { 'is-on': bg.currentId === item.id }]"
              @click="bg.pick(item.id)"
            >
              <span :class="['tile__thumb', `tile__thumb--${item.id}`]" :style="thumbStyleOf(item.id)">
                <Check v-if="bg.currentId === item.id" :size="14" class="tile__check" />
              </span>
              <span class="tile__name">{{ item.name }}</span>
              <span class="tile__desc">{{ descOf(item) }}</span>
            </button>
          </div>

          <!--
          纯色可以自己挑底色：写的是 `--mauth-bg` 的**覆盖层**（和「自定义」那一档同源），
          所以换配色/切明暗都不会被抹掉，也随「全部还原」一起清掉；色块铺在整格上，
          点哪都能唤出原生取色器（同主题色那张自定义色卡）。
        -->
          <div v-if="bg.currentId === 'none'" class="bgrow">
            <span class="bgrow__text">
              <b>背景色</b>
              <small>点色块自选底色，选完即时生效</small>
            </span>
            <span class="bgrow__val mono">{{ isCustomBg ? bgHex.toUpperCase() : '跟随配色' }}</span>
            <label
              :class="['bgrow__chip', { 'bgrow__chip--auto': !isCustomBg }]"
              :title="isCustomBg ? `当前 ${bgHex}` : '点这里挑一个底色'"
            >
              <input type="color" class="bgrow__color" :value="bgHex" aria-label="背景色" @input="onBgPick" />
              <span class="bgrow__fill" :style="{ background: bgHex }"></span>
            </label>
            <button
              v-if="isCustomBg"
              type="button"
              class="bgrow__reset"
              title="回到当前配色自带的底色"
              @click="resetBgColor"
            >
              还原
            </button>
          </div>

          <p class="hint">「纯色」的底色可以自己挑；壁纸建议搭配深色配色，浅底上会比较抢。</p>
        </div>
      </section>

      <!-- ② 颜色 -->
      <section class="panel">
        <button class="lrow" type="button" :aria-expanded="open === 'color'" @click="toggle('color')">
          <span class="lrow__ico"><Palette :size="17" /></span>
          <span class="lrow__text">
            <b>颜色</b>
            <small>主题色、透明效果、颜色主题</small>
          </span>
          <ChevronRight :size="16" class="lrow__chev" :class="{ 'is-open': open === 'color' }" />
        </button>

        <div v-if="open === 'color'" class="lrow__body">
          <p class="field-label">明暗</p>
          <div class="segs" role="radiogroup" aria-label="明暗">
            <button
              v-for="item in MODES"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="theme.mode === item.id"
              :class="['seg', { 'is-on': theme.mode === item.id }]"
              @click="theme.setMode(item.id)"
            >
              <component :is="item.icon" :size="14" />
              {{ item.name }}
            </button>
          </div>

          <p class="field-label">主题色</p>
          <div class="swatches" role="radiogroup" aria-label="主题色">
            <button
              v-for="item in accent.presets"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="accent.currentId === item.id"
              :class="['swatch', { 'is-on': accent.currentId === item.id }]"
              :title="item.name"
              @click="accent.pick(item.id)"
            >
              <span
                :class="['swatch__dot', { 'swatch__dot--auto': item.inherit }]"
                :style="item.inherit ? undefined : { background: item.primary }"
              >
                <Check v-if="accent.currentId === item.id" :size="12" />
              </span>
              <span class="swatch__name">{{ item.name }}</span>
            </button>

            <!--
            自定义色卡：与其它预设同一排、同一尺寸，点开的是原生取色器
            （取色器里自带 hex 输入，所以不再单独摆一个输入框 —— 少一行是一个）。
          -->
            <label
              :class="['swatch', 'swatch--custom', { 'is-on': accent.isCustom }]"
              :title="accent.isCustom ? `自定义 ${customHex}` : '选任意颜色'"
            >
              <input
                type="color"
                class="swatch__color"
                :value="customHex"
                aria-label="自定义主题色"
                @input="onCustomPick"
              />
              <span class="swatch__dot" :style="chipStyle">
                <Check v-if="accent.isCustom" :size="12" />
              </span>
              <span class="swatch__name">自定义</span>
            </label>
          </div>
          <p class="hint">
            <template v-if="customInfo && customInfo.adjusted">
              所选色直接当文字色对比度不够，已自动调整到 <b>{{ customInfo.primary }}</b> （对当前底色
              {{ customInfo.contrast.toFixed(1) }}:1，正文需 ≥ 4.5）； 原色仍用于卡面等大面积浅底。
            </template>
            <template v-else-if="customInfo">
              主色 <b>{{ customInfo.primary }}</b> · 对当前底色 {{ customInfo.contrast.toFixed(1) }}:1（正文需 ≥ 4.5）。
            </template>
            <template v-else>
              点「自定义」可用任意色：主色会自动满足对比度要求，hover / 浅底 / 焦点环一并派生。
            </template>
          </p>

          <p class="status" aria-live="polite">
            <template v-if="accent.saveState === 'saving'">保存中…</template>
            <template v-else-if="accent.saveState === 'saved'">已保存</template>
            <template v-else-if="accent.saveState === 'error'">
              <span class="status--error">保存失败：{{ accent.errorMessage }}</span>
            </template>
          </p>

          <p class="field-label">颜色主题</p>
          <div class="tiles tiles--color" role="radiogroup" aria-label="颜色主题">
            <button
              v-for="item in colorThemes"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="currentColor === item.id"
              :class="['tile', { 'is-on': currentColor === item.id }]"
              @click="theme.setTheme(item.id)"
            >
              <span class="tile__thumb tile__thumb--color" :style="swatchOf(item.id)">
                <Check v-if="currentColor === item.id" :size="14" class="tile__check" />
              </span>
              <span class="tile__name">{{ item.name }}</span>
              <span class="tile__desc">{{ item.description }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ③ 主题 -->
      <section class="panel">
        <button class="lrow" type="button" :aria-expanded="open === 'theme'" @click="toggle('theme')">
          <span class="lrow__ico"><Pencil :size="17" /></span>
          <span class="lrow__text">
            <b>主题</b>
            <small>版式（安装、创建、管理）</small>
          </span>
          <ChevronRight :size="16" class="lrow__chev" :class="{ 'is-open': open === 'theme' }" />
        </button>

        <div v-if="open === 'theme'" class="lrow__body">
          <p class="field-label">密度</p>
          <div class="segs" role="radiogroup" aria-label="密度">
            <button
              v-for="item in density.presets"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="density.currentId === item.id"
              :class="['seg', { 'is-on': density.currentId === item.id }]"
              :title="item.description"
              @click="density.pick(item.id)"
            >
              {{ item.name }}
            </button>
          </div>
          <p class="hint">密度只改行高与内距（一屏放多少内容），不动字号与配色，可与任意外观组合。</p>

          <p class="field-label">版式</p>
          <div class="tiles" role="radiogroup" aria-label="版式">
            <button
              v-for="item in availPackages"
              :key="item.id"
              type="button"
              role="radio"
              :aria-checked="theme.packageId === item.id"
              :class="['tile', { 'is-on': theme.packageId === item.id }]"
              @click="pickPackage(item.id)"
            >
              <span class="tile__thumb tile__thumb--pkg">
                <Check v-if="theme.packageId === item.id" :size="14" class="tile__check" />
              </span>
              <span class="tile__name">{{ item.name }}</span>
              <span class="tile__desc">{{ item.description }}</span>
            </button>
          </div>
          <p class="hint">
            版式列表只含<b>当前设备有后台壳版式</b>的包（桌面上不显示只有手机端的口袋版）。 版式 =
            布局：只换颜色请用上面的「颜色主题」；安装 / 创建包需要在代码里加目录。
          </p>
        </div>
      </section>

      <!-- ④ 自定义：逐令牌覆盖 -->
      <section class="panel">
        <button class="lrow" type="button" :aria-expanded="open === 'custom'" @click="toggle('custom')">
          <span class="lrow__ico"><SlidersHorizontal :size="17" /></span>
          <span class="lrow__text">
            <b>自定义</b>
            <small> 逐个改颜色与尺寸{{ overrides.count ? `（已改 ${overrides.count} 项）` : '' }} </small>
          </span>
          <ChevronRight :size="16" class="lrow__chev" :class="{ 'is-open': open === 'custom' }" />
        </button>

        <div v-if="open === 'custom'" class="lrow__body">
          <p class="hint">
            按「材质」分组，只列常用项（点底部「显示全部」看全部）。改动只影响你的账号，
            优先级高于配色与主题色；改色时<b>半透明会被保留</b>。
          </p>
          <TokenEditor />
        </div>
      </section>
    </div>
  </PersonalPage>
</template>

<style scoped>
.look {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── 三段行 ─────────────────────────────────────────────── */
.lrow {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.lrow:hover {
  background: var(--mauth-hover);
}

.lrow__ico {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 10px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
}

.lrow__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lrow__text b {
  font-size: 14px;
  font-weight: 600;
}

.lrow__text small {
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.lrow__chev {
  margin-left: auto;
  color: var(--mauth-text-faint);
  transition: transform 0.16s var(--ease, ease);
}

.lrow__chev.is-open {
  transform: rotate(90deg);
}

.lrow__body {
  padding: 2px 16px 16px;
  border-top: 1px solid var(--mauth-border);
}

/* ── 分段（明暗三档）────────────────────────────────────── */
.field-label {
  margin: 14px 0 8px;
  color: var(--mauth-text-soft);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.segs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 8px;
  background: var(--mauth-tabbar-bg, var(--mauth-surface-2));
}

.seg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.seg.is-on {
  background: var(--mauth-tab-active-bg, var(--mauth-surface));
  color: var(--mauth-primary);
  font-weight: 600;
}

/* ── 色卡 ───────────────────────────────────────────────── */
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.swatch {
  /* 自定义色卡里的原生取色器要绝对定位铺满这一格 */
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.swatch__dot {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #fff;
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
}

/* 「跟随配色」没有自己的色值：画一条"取自配色"的斜纹，而不是一个空圆 */
.swatch__dot--auto {
  background:
    repeating-linear-gradient(135deg, var(--mauth-text-faint) 0 2px, transparent 2px 6px), var(--mauth-surface-2);
}

/* 自定义色卡：把原生取色器铺满整个圆点，点哪都能唤出取色器 */
.swatch__color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.swatch--custom .swatch__dot {
  position: relative;
}

.swatch.is-on .swatch__dot {
  box-shadow:
    inset 0 0 0 1px var(--mauth-border-strong),
    0 0 0 2px var(--mauth-surface),
    0 0 0 3px var(--mauth-primary);
}

.swatch__name {
  color: var(--mauth-text-soft);
  font-size: 11.5px;
}

/* ── 图块（背景 / 颜色主题 / 版式）────────────────────────── */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 8px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-panel-bg, var(--mauth-surface));
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.tile:hover {
  border-color: var(--mauth-border-strong);
}

.tile.is-on {
  border-color: var(--mauth-primary);
  box-shadow: 0 0 0 1px var(--mauth-primary);
}

.tile__thumb {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 52px;
  margin-bottom: 4px;
  border-radius: 6px;
  background: var(--mauth-surface-2);
  box-shadow: inset 0 0 0 1px var(--mauth-border);
}

.tile__thumb--star {
  background-image: url('@/assets/theme/starfield.jpeg');
  background-size: cover;
  background-position: center 30%;
}

/*
 * 纯色那格的底色由内联样式铺（= 当前底色，自选后就是自选色），但底色常常
 * 和面板色几乎一样 —— 整格看上去就是一块空白，两张卡选谁全靠读文字。
 * 叠一个迷你外壳剪影（顶栏细线 + 面板块），"底色 + 浮起的面板"一眼就能看懂。
 */
.tile__thumb--none::before {
  content: '';
  position: absolute;
  inset: 7px 9px;
  border-radius: 5px;
  background:
    linear-gradient(var(--mauth-border-strong), var(--mauth-border-strong)) 0 8px / 100% 1px no-repeat,
    var(--mauth-surface);
  box-shadow: 0 1px 4px rgba(16, 20, 24, 0.12);
}

.tile__thumb--color {
  height: 34px;
}

.tile__thumb--pkg {
  height: 34px;
  background: linear-gradient(135deg, var(--mauth-primary-soft), var(--mauth-surface-2));
}

/*
 * 选中标记：右上角实底圆点 + 白勾。
 *
 * 原来是缩略图正中一个纯白对勾 —— 在浅色底色上几乎看不见（纯色那格就是这种），
 * 而且正好压在预览画面中央。改成实底徽标后任何底色都清晰，也不挡预览。
 */
.tile__check {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 17px;
  height: 17px;
  padding: 3px;
  border-radius: 999px;
  background: var(--mauth-primary);
  color: #fff;
  box-shadow: 0 0 0 1.5px var(--mauth-surface);
}

/* 配色 / 版式的缩略图只有 34px 高：徽标跟着小一号，否则占了小半张图 */
.tile__thumb--color .tile__check,
.tile__thumb--pkg .tile__check {
  top: 4px;
  right: 4px;
  width: 15px;
  height: 15px;
  padding: 2px;
}

.tile__name {
  font-size: 13px;
  font-weight: 600;
}

.tile__desc {
  color: var(--mauth-text-soft);
  font-size: 11.5px;
  line-height: 1.45;
}

/* ── 背景色（纯色那格）────────────────────────────────────── */
/*
 * 一行设置项：左「名称 + 说明」，右「当前值 + 色块 + 还原」。
 *
 * 之前是"34px 色块 + 两行小字"横排，标签「背景色」另起一行压在它上面，三档字号
 * （12 / 12.5 / 11.5）挤在 34px 里互相打架，右边还空一大片。改成整行容器后，
 * 名称与说明各有位置，控件靠右对齐，和「设置项」该有的样子一致。
 */
.bgrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-surface-2);
}

.bgrow__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bgrow__text b {
  font-size: 13px;
  font-weight: 600;
}

.bgrow__text small {
  color: var(--mauth-text-soft);
  font-size: 11.5px;
  line-height: 1.5;
}

/* 当前值：自选后是色值，跟随配色时是四个字 —— 都用等宽显示，切换时不跳宽 */
.bgrow__val {
  flex: none;
  color: var(--mauth-text-mid);
  font-size: 12px;
}

/* 色块本身就是取色器入口：原生 input 铺满整格（同主题色那张自定义色卡）
   两道描边是刻意的：底色常常接近面板色，只有内描边时色块会"消失"成一团白 */
.bgrow__chip {
  position: relative;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  /* 三重描边各司其职：内圈压住色块边缘、外圈把色块"从行底色上拎起来"、
     底阴影给一点厚度 —— 底色常常就贴着行底色，少一层就糊成一片 */
  box-shadow:
    inset 0 0 0 1px var(--mauth-border-strong),
    0 0 0 1px var(--mauth-border-strong),
    0 1px 2px rgba(16, 20, 24, 0.08);
  cursor: pointer;
  transition: box-shadow 0.16s var(--ease);
}

.bgrow__chip:hover {
  box-shadow:
    inset 0 0 0 1px var(--mauth-border-strong),
    0 0 0 1px var(--mauth-text-faint),
    0 1px 3px rgba(16, 20, 24, 0.12);
}

/* 键盘走到色块时给个框：色块本身是 label，焦点在里面的透明 input 上 */
.bgrow__chip:focus-within {
  box-shadow:
    inset 0 0 0 1px var(--mauth-border-strong),
    0 0 0 1px var(--mauth-border-strong),
    0 0 0 4px var(--mauth-focus);
}

/*
 * 「跟随配色」时色值本身就该显示（缩略图说真话），但底色常常和行底色只差一点点，
 * 光靠描边分不出这是色块还是空隙。叠一层斜纹 —— 和主题色那排「跟随配色」色卡
 * 同一套视觉语言 —— 一眼就知道"这不是我选的色，是配色自带的"。
 */
.bgrow__chip--auto::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(135deg, var(--mauth-text-faint) 0 2px, transparent 2px 7px);
  opacity: 0.38;
  pointer-events: none;
}

.bgrow__color {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.bgrow__fill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}

/* 还原：轻量胶囊按钮，比裸文字更容易看出"可点" */
.bgrow__reset {
  flex: none;
  padding: 5px 10px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.2;
  cursor: pointer;
  transition:
    color 0.16s var(--ease),
    border-color 0.16s var(--ease);
}

.bgrow__reset:hover {
  color: var(--mauth-text);
  border-color: var(--mauth-text-faint);
}

/* ── 说明文字 ─────────────────────────────────────────────── */
/*
 * 这个类在四个档位里各出现一次，但之前**全局没有定义** —— 它按 `<p>` 的默认样式
 * 渲染（14px 正文色 + 默认外边距），比上面的选项还显眼，也就是"说明比正文更像正文"。
 */
.hint {
  margin: 12px 0 0;
  color: var(--mauth-text-soft);
  font-size: 12px;
  line-height: 1.65;
}

/* 说明里的强调（色值 / 对比度）比正文再深一档：只有字重差时，浅灰底上读不出来 */
.hint b {
  color: var(--mauth-text-mid);
  font-weight: 600;
}

/* ── 窄屏 ─────────────────────────────────────────────────── */
/*
 * 图块最小 150px：手机上一行只放得下 1 个，卡片被拉成整行宽、缩略图还是 52px 高，
 * 比例就散了。窄屏固定两列（每格 ~145px），和桌面上看到的是同一个比例。
 */
@media (max-width: 560px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /*
   * 设置行：名称与说明独占一行，右侧那组（值 / 色块 / 还原）落到第二行靠右。
   * 不这样做的话，说明文字会被挤成窄窄一条、"选完 / 即时生效"断在词中间。
   */
  .bgrow {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .bgrow__text {
    flex: 1 1 100%;
  }

  .bgrow__val {
    margin-left: auto;
  }
}

.status {
  min-height: 16px;
  margin: 8px 0 0;
  color: var(--mauth-text-faint);
  font-size: 12px;
}

.status--error {
  color: var(--mauth-danger);
}
</style>
