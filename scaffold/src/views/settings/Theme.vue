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
import { Check, ChevronRight, Image, Moon, MonitorSmartphone, Palette, Pencil, Sun } from 'lucide-vue-next';
import { getThemeRecord, listColorsOf } from 'skinsuite';
import { themePackageOptions, useThemePackage } from '@/composables/useThemePackage';
import { useAccentStore } from '@/stores/accent';
import { useBackgroundStore } from '@/stores/background';
import { useDensityStore } from '@/stores/density';
import { useThemeStore } from '@/stores/theme';
import { useRenderDevice } from '@/views/device/useRenderDevice';

const device = useRenderDevice();
const bg = useBackgroundStore();
const density = useDensityStore();
const accent = useAccentStore();
const theme = useThemeStore();

/** 展开的档位（同时只开一个，避免三块长列表堆在一起） */
const open = ref<'bg' | 'color' | 'theme' | ''>('color');

/**
 * 收起 / 展开某一档
 *
 * @param key 档位
 */
function toggle(key: 'bg' | 'color' | 'theme'): void {
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
  <div class="look">
    <header class="look__head">
      <h2 class="look__title">外观与主题</h2>
      <p class="look__sub">背景、颜色、版式分三档配，互不干扰；选完即记住，刷新与换页都不会丢。</p>
    </header>

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
            <span :class="['tile__thumb', `tile__thumb--${item.id}`]">
              <Check v-if="bg.currentId === item.id" :size="14" class="tile__check" />
            </span>
            <span class="tile__name">{{ item.name }}</span>
            <span class="tile__desc">{{ item.description }}</span>
          </button>
        </div>
        <p class="hint">壁纸与配色正交：同一套配色可以配纯色或壁纸。壁纸建议搭配深色配色，浅底上会比较抢。</p>
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
        </div>
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
          版式列表只含**当前设备有后台壳版式**的包（桌面上不显示只有手机端的口袋版）。
          版式 = 布局：只换颜色请用上面的「颜色主题」；安装 / 创建包需要在代码里加目录。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.look {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 820px;
}

.look__head {
  padding: 4px 2px 2px;
}

.look__title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 660;
  letter-spacing: -0.02em;
}

.look__sub {
  margin: 0;
  color: var(--mauth-text-soft);
  font-size: 13px;
  line-height: 1.6;
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
    repeating-linear-gradient(135deg, var(--mauth-text-faint) 0 2px, transparent 2px 6px),
    var(--mauth-surface-2);
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

.tile__thumb--color {
  height: 34px;
}

.tile__thumb--pkg {
  height: 34px;
  background: linear-gradient(135deg, var(--mauth-primary-soft), var(--mauth-surface-2));
}

.tile__check {
  color: #fff;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45));
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
