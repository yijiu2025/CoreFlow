<!--
  自定义模式面板（逐令牌覆盖）

  为什么单独成组件：设置页已经有"背景 / 颜色 / 主题"三档，再塞 64 个色值控件进去
  会让那个文件失控；而且这块的交互（材质 tab / 分组 / 单项还原）自成一套。

  🔴 只暴露**令牌清单里登记过**的项（`TOKEN_MANIFEST`）：清单与配色表由
     `check:tokens` 双向守着，所以这里既不会漏项，也不会写出不存在的变量。

  @author yijiu2025
  @since 2026-11-15
-->
<template>
  <div class="tok">
    <div class="tok__tabs" role="tablist" aria-label="材质">
      <button
        v-for="item in MATERIALS"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        :class="['tok__tab', { 'is-on': tab === item.id }]"
        @click="tab = item.id"
      >
        {{ item.name }}
        <small>{{ counts[item.id] }}</small>
      </button>
    </div>

    <p class="tok__desc">{{ currentMaterial?.description }}</p>

    <div v-for="section in groups" :key="section.group" class="tok__group">
      <!--
        可收拢的组（工作台）：先是一个"跟随主题 / 自定义"的选择，选了自定义才逐项露出。
        为什么这样做：这一组八项其实是同一个决定（"工作台这一页要不要跟主题色走"），
        八行平铺会让用户以为要一项项配；先问模式，再问细节，才是他们脑子里的顺序。
      -->
      <template v-if="isCollapsible(section.group)">
        <div class="tok__group-name">
          <button
            type="button"
            class="tok__fold"
            :aria-expanded="isOpen(section.group)"
            @click="toggleGroup(section.group)"
          >
            <ChevronRight :size="12" :class="{ 'is-open': isOpen(section.group) }" />
            {{ section.group }}
            <span class="tok__dots" aria-hidden="true">
              <i v-for="dot in dotsOf(section.group)" :key="dot" class="tok__dot" :style="{ background: dot }"></i>
            </span>
          </button>

          <span class="tok__mode" role="group" :aria-label="`${section.group}：跟随主题还是自定义`">
            <button
              v-for="opt in MODES"
              :key="opt.id"
              type="button"
              :class="['tok__mode-btn', { 'is-on': modeOf(section.group) === opt.id }]"
              :aria-pressed="modeOf(section.group) === opt.id"
              @click="pickMode(section.group, opt.id)"
            >
              {{ opt.name }}
            </button>
          </span>
        </div>
        <p class="tok__group-desc">{{ GROUP_NOTES[section.group] ?? '' }}</p>
      </template>

      <p v-else class="tok__group-name">
        {{ section.group }}
        <button
          v-if="section.items.some(meta => isSet(meta.key))"
          type="button"
          class="tok__group-reset"
          @click="overrides.reset(section.items.map(meta => meta.key))"
        >
          还原本组
        </button>
      </p>

      <div v-if="!isCollapsible(section.group) || isOpen(section.group)">
        <div v-for="meta in section.items" :key="meta.key" class="tok__row">
          <div class="tok__meta">
            <span class="tok__label">
              {{ meta.label }}
              <em v-if="isSet(meta.key)" class="tok__badge">已改</em>
              <em v-else-if="meta.scope === 'component'" class="tok__badge tok__badge--soft">局部</em>
            </span>
            <span v-if="meta.hint" class="tok__hint">{{ meta.hint }}</span>
          </div>

          <div class="tok__ctl">
            <template v-if="meta.kind === 'color'">
              <label class="tok__swatch" :title="valueOf(meta.key)">
                <!-- 颜色层单独一层：半透明的值能透出下面的棋盘格（否则 rgba 全显示成灰块） -->
                <span class="tok__swatch-fill" :style="{ backgroundColor: valueOf(meta.key) }"></span>
                <input
                  type="color"
                  :value="pickerHex(meta.key)"
                  :aria-label="meta.label"
                  @input="onColor(meta.key, $event)"
                />
              </label>
              <!-- 没有值 = 这一项还没被单独设过，配色表里跟着主题色走（脉搏卡三项默认由 color-mix 现算） -->
              <code :class="['tok__val', { 'tok__val--inherit': !valueOf(meta.key) }]">
                {{ shortValue(meta.key) || '跟随主题' }}
              </code>
            </template>

            <template v-else>
              <!--
                长度一律用滑块：圆角/字号这类值是"连续调到手感对"的，数字输入要反复试
                才知道 12 和 14 差多少。滑块给的是即时预览，拖到合适就停。
              -->
              <input
                class="tok__range"
                type="range"
                :min="rangeOf(meta.key).min"
                :max="rangeOf(meta.key).max"
                :step="rangeOf(meta.key).step"
                :value="lengthOf(meta.key)"
                :style="{ '--fill': fillOf(meta.key) }"
                :aria-label="meta.label"
                @input="onLength(meta.key, $event)"
              />
              <span class="tok__unit">{{ lengthOf(meta.key) }}{{ unitOf(meta.key) }}</span>
            </template>

            <button
              type="button"
              class="tok__undo"
              :disabled="!isSet(meta.key)"
              :title="isSet(meta.key) ? '还原成配色自带的值' : '未修改'"
              @click="overrides.reset([meta.key])"
            >
              还原
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="tok__foot">
      <span class="tok__count">已改 {{ overrides.count }} 项 · 只影响当前账号</span>
      <span style="flex: 1"></span>
      <button
        v-if="tierCounts.all > tierCounts.common"
        type="button"
        class="tok__more"
        @click="showAll = !showAll"
      >
        {{ showAll ? `只看常用 ${tierCounts.common} 项` : `显示全部 ${tierCounts.all} 项` }}
      </button>
      <button type="button" class="tok__reset-all" :disabled="!overrides.active" @click="overrides.resetAll()">
        全部还原
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { MATERIALS, tokensOfMaterial } from '@/theme/materials';
import { TOKEN_GROUPS, TOKEN_MANIFEST, type TokenMeta } from '@/theme/token-manifest';
import { normalizeHex, toPickerHex, withOriginalAlpha } from '@/theme/color';
import { accentVarOf } from '@/theme/accent-tokens';
import { useOverridesStore } from '@/stores/overrides';
import { useThemeStore } from '@/stores/theme';

const overrides = useOverridesStore();
const theme = useThemeStore();

/** 当前材质 tab */
const tab = ref(MATERIALS[0].id);

/**
 * 是否显示全部令牌
 *
 * 默认只给 `tier: 1` 的常用项 —— 六十多个一次摊开，用户第一眼不知道该动哪个。
 * 想改分类色、徽标、开关这些细节的，自己展开。
 */
const showAll = ref(false);

/* ── 可收拢的组：先选"跟随主题 / 自定义"，再逐项 ─────────────
 * 这一组八项背后其实是**同一个决定**（"工作台这一页跟不跟主题色走"）。八行平铺会让
 * 用户以为要一项项配，也看不出"现在到底是跟随还是自定义"；先问模式、再问细节才对。
 *
 * 模式怎么判定：**有没有任何一项被改过**（`isSet`）。这样"跟随主题"不是另一个要存
 * 的开关，而是"这一组没有覆盖项"这个事实本身 —— 用户点某一项的「还原」还原到最后一项时，
 * 模式会自己退回"跟随主题"，不会出现"界面说自定义、实际全跟随"的假状态。
 * 显式点过「自定义」但还没改任何项的，用一个不落盘的 ref 记住（否则一展开又收回去）。
 */

/** 需要"先选模式"的组（按需加，不加就是普通的平铺组） */
const COLLAPSIBLE_GROUPS = ['工作台'];

/** 两个模式（顺序 = 分段控件的顺序） */
const MODES = [
  { id: 'theme', name: '跟随主题' },
  { id: 'custom', name: '自定义' }
] as const;

type GroupMode = (typeof MODES)[number]['id'];

/** 各组的一句说明（只有可收拢的组需要） */
const GROUP_NOTES: Record<string, string> = {
  工作台: '只作用于工作台这一页：卡面光泽、成功率、头像与入口图标、「今天」那根柱子。默认跟着主题色走；选「自定义」才会逐项露出，改哪项只影响哪项。'
};

/** 明确点过「自定义」的组（还没改任何项时靠它保持展开） */
const customGroups = ref<string[]>([]);

/** 展开状态的手工覆盖（缺省 = 自定义模式就展开） */
const openGroups = ref<Record<string, boolean>>({});

/**
 * 某组下的全部令牌名
 *
 * @param group 分组名
 * @returns 令牌名数组
 */
function keysOfGroup(group: string): string[] {
  return TOKEN_MANIFEST.filter(meta => meta.group === group).map(meta => meta.key);
}

/**
 * 这一组是否"先选模式"
 *
 * @param group 分组名
 * @returns 需要返回 true
 */
function isCollapsible(group: string): boolean {
  return COLLAPSIBLE_GROUPS.includes(group);
}

/**
 * 这一组当前是哪种模式
 *
 * @param group 分组名
 * @returns `theme`（跟随主题）或 `custom`（自定义）
 */
function modeOf(group: string): GroupMode {
  const touched = keysOfGroup(group).some(key => isSet(key));
  return touched || customGroups.value.includes(group) ? 'custom' : 'theme';
}

/**
 * 这一组是否展开
 *
 * @param group 分组名
 * @returns 展开返回 true
 */
function isOpen(group: string): boolean {
  return openGroups.value[group] ?? modeOf(group) === 'custom';
}

/**
 * 手工折叠 / 展开（不影响模式）
 *
 * @param group 分组名
 */
function toggleGroup(group: string): void {
  openGroups.value = { ...openGroups.value, [group]: !isOpen(group) };
}

/**
 * 切模式
 *
 * 「跟随主题」= 还原这一组的全部覆盖项（回到配色表里那份 `var(--mauth-primary)`），
 * 不做"先留着但不生效"——那种状态用户看不懂，也没法通过界面对齐。
 *
 * @param group 分组名
 * @param mode 目标模式
 */
function pickMode(group: string, mode: GroupMode): void {
  if (mode === 'theme') {
    overrides.reset(keysOfGroup(group));
    customGroups.value = customGroups.value.filter(name => name !== group);
    openGroups.value = { ...openGroups.value, [group]: false };
    return;
  }
  customGroups.value = [...new Set([...customGroups.value, group])];
  openGroups.value = { ...openGroups.value, [group]: true };
}

/**
 * 收拢状态下的小色点：让"这页现在什么调子"一眼可见
 *
 * 只取"改动最有感"的几项（成功率读数 / 刻度环 / 小方块底 / 今天柱）；没值的
 * （仅覆盖型的脉搏卡三项，默认由 `color-mix` 现算）自然不出现。
 *
 * @param group 分组名
 * @returns 颜色值数组（最多 4 个）
 */
function dotsOf(group: string): string[] {
  const keys = keysOfGroup(group);
  const picked = ['--mauth-dash-rate', '--mauth-dash-ring', '--mauth-dash-chip-bg', '--mauth-dash-today'];
  return picked
    .filter(key => keys.includes(key))
    .map(key => valueOf(key))
    .filter(Boolean);
}

/** 各材质的令牌数（tab 角标；跟随"显示全部"切换） */
const counts = computed<Record<string, number>>(() =>
  Object.fromEntries(
    MATERIALS.map(item => {
      const all = tokensOfMaterial(item.id);
      return [item.id, showAll.value ? all.length : all.filter(meta => meta.tier === 1).length];
    })
  )
);

/** 当前材质 */
const currentMaterial = computed(() => MATERIALS.find(item => item.id === tab.value));

/** 当前材质下的令牌，按既有分组顺序展开（空组不出现） */
const groups = computed<Array<{ group: string; items: TokenMeta[] }>>(() => {
  const all = tokensOfMaterial(tab.value);
  const items = showAll.value ? all : all.filter(meta => meta.tier === 1);
  return TOKEN_GROUPS.map(group => ({ group, items: items.filter(meta => meta.group === group) })).filter(
    section => section.items.length > 0
  );
});

/** 当前材质下常用项 / 全部项的数量（决定底部按钮要不要出现、写什么） */
const tierCounts = computed(() => {
  const all = tokensOfMaterial(tab.value);
  return { common: all.filter(meta => meta.tier === 1).length, all: all.length };
});

/** 当前配色记录（覆盖没设时用它显示"现在长什么样"） */
const baseTokens = computed<Record<string, string>>(() => theme.themeRecordFor().tokens ?? {});

/**
 * 某项当前生效的值
 *
 * 🔴 配色表允许写 `var(--mauth-primary)` —— 工作台那一组就是这么写的（"默认跟着主色走，
 *    但可以单独改"）。这种值不能直接喂给取色器与色块：`<input type="color">` 只认 hex，
 *    一串 `var(...)` 会被当成无效色（灰块 + 看不懂的文本）。
 *    这里按真实的优先级链把它换成真值：**自定义覆盖 > 主色组（accent 层后写）> 配色表**，
 *    三者与 `overrides.applyOverrides()` 的顺序一致，所以显示的色就是屏幕上的色。
 *    读不到（仅覆盖型 `--mauth-pulse-*` 压根没写进配色表）就原样返回，界面显示"跟随主题"。
 *
 * @param key 令牌名
 * @param depth 递归层数（防止配色表里写出环）
 * @returns CSS 值
 */
function valueOf(key: string, depth = 0): string {
  const raw = overrides.current[key] ?? accentVarOf(key) ?? baseTokens.value[key] ?? '';
  if (depth >= 3) return raw;
  const ref = /^var\((--mauth-[a-z0-9-]+)\)$/.exec(raw.trim());
  if (!ref) return raw;
  return valueOf(ref[1], depth + 1);
}

/**
 * 某项是否被改过
 *
 * @param key 令牌名
 * @returns 改过返回 true
 */
function isSet(key: string): boolean {
  return key in overrides.current;
}

/**
 * 取色器的当前色
 *
 * @param key 令牌名
 * @returns `#rrggbb`
 */
function pickerHex(key: string): string {
  return toPickerHex(valueOf(key));
}

/**
 * 行尾显示的短值（太长会撑破一行）
 *
 * @param key 令牌名
 * @returns 显示文本
 */
function shortValue(key: string): string {
  const raw = valueOf(key);
  return raw.length > 20 ? `${raw.slice(0, 19)}…` : raw;
}

/**
 * 取长度值里的数字部分
 *
 * @param key 令牌名
 * @returns 数字；解析不出返回 0
 */
function lengthOf(key: string): number {
  const m = /^(\d+(?:\.\d+)?)/.exec(valueOf(key));
  return m ? Number(m[1]) : 0;
}

/**
 * 取长度值的单位
 *
 * @param key 令牌名
 * @returns 单位（默认 px）
 */
function unitOf(key: string): string {
  const m = /^\d+(?:\.\d+)?(px|rem|em|%)/.exec(valueOf(key));
  return m ? m[1] : 'px';
}

/**
 * 改颜色
 *
 * 🔴 保留原来的透明度：侧栏 / 顶栏 / 面板是半透明的，改个色相就变成不透明的话，
 *    玻璃质感与壁纸透出全没了（"改个颜色把设计改坏"）。
 *
 * @param key 令牌名
 * @param ev input 事件
 */
function onColor(key: string, ev: Event): void {
  const hex = normalizeHex((ev.target as HTMLInputElement).value);
  if (!hex) return;
  overrides.set(key, withOriginalAlpha(valueOf(key), hex));
}

/**
 * 改长度
 *
 * @param key 令牌名
 * @param ev change 事件
 */
function onLength(key: string, ev: Event): void {
  const n = Number((ev.target as HTMLInputElement).value);
  if (!Number.isFinite(n) || n < 0) return;
  overrides.set(key, `${n}${unitOf(key)}`);
}

/**
 * 滑块"已走过"的比例（0~100%），用来把轨道左侧染成主色
 *
 * 只给 CSS 一个百分比即可 —— 用 `linear-gradient` 画，不必额外套一层元素。
 *
 * @param key 令牌名
 * @returns 百分比字符串
 */
function fillOf(key: string): string {
  const { min, max } = rangeOf(key);
  if (max <= min) return '0%';
  const pct = ((lengthOf(key) - min) / (max - min)) * 100;
  return `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
}

/**
 * 某个长度令牌的滑块区间
 *
 * 按单位推：px 走 0~48（覆盖圆角与字号），em 走 0~0.4（字距），rem 走 0~3。
 * 不按令牌名逐个配 —— 新加一个长度令牌时不该还要记得来这里补一行。
 *
 * @param key 令牌名
 * @returns 滑块参数
 */
function rangeOf(key: string): { min: number; max: number; step: number } {
  const unit = unitOf(key);
  if (unit === 'em') return { min: 0, max: 0.4, step: 0.01 };
  if (unit === 'rem') return { min: 0, max: 3, step: 0.05 };
  if (unit === '%') return { min: 0, max: 100, step: 1 };
  return { min: 0, max: 48, step: 1 };
}

/*
 * 🔴 不要解构 store：`const { count, active } = overrides` 拿到的是**当时的快照**，
 *    之后新增覆盖不会触发重渲染（实测：改了颜色，底部仍显示"已改 0 项"）。
 *    模板里一律写 `overrides.xxx`。
 */
</script>

<style scoped>
.tok {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tok__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tok__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
  font-size: 13px;
  cursor: pointer;
}

.tok__tab small {
  color: var(--mauth-text-faint);
  font-size: 11px;
}

.tok__tab.is-on {
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-weight: 600;
}

.tok__desc {
  margin: 0;
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.tok__group {
  border-radius: var(--mauth-radius-md);
  background: var(--mauth-surface);
  box-shadow: inset 0 0 0 1px var(--mauth-border);
  padding: 4px 14px 8px;
}

.tok__group-name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 0 6px;
  color: var(--mauth-text-soft);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.tok__group-reset {
  border: 0;
  background: none;
  color: var(--mauth-primary);
  font-size: 11px;
  cursor: pointer;
}

/* ── 可收拢的组：折叠标题 + 模式分段控件 ─────────────────── */
.tok__fold {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}

.tok__fold svg {
  transition: transform 0.18s var(--ease);
}

.tok__fold svg.is-open {
  transform: rotate(90deg);
}

/* 收拢时的四颗小色点：不用展开就知道这页现在什么调子 */
.tok__dots {
  display: inline-flex;
  gap: 3px;
  margin-left: 2px;
}

.tok__dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
}

.tok__mode {
  display: inline-flex;
  flex: none;
  padding: 2px;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  box-shadow: inset 0 0 0 1px var(--mauth-border);
}

.tok__mode-btn {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--mauth-text-soft);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  cursor: pointer;
}

.tok__mode-btn.is-on {
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font-weight: 650;
  box-shadow: var(--e1);
}

.tok__group-desc {
  margin: 0 0 8px;
  color: var(--mauth-text-faint);
  font-size: 11px;
  line-height: 1.5;
}

.tok__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-top: 1px solid var(--mauth-border);
}

.tok__row:first-of-type {
  border-top: 0;
}

.tok__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tok__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--mauth-text);
  font-size: 13px;
}

.tok__badge {
  padding: 0 5px;
  border-radius: 5px;
  background: var(--mauth-primary-soft);
  color: var(--mauth-primary);
  font-size: 10px;
  font-style: normal;
  line-height: 15px;
}

.tok__badge--soft {
  background: var(--mauth-surface-2);
  color: var(--mauth-text-faint);
}

.tok__hint {
  color: var(--mauth-text-faint);
  font-size: 11px;
  line-height: 1.4;
}

.tok__ctl {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.tok__swatch {
  position: relative;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  /*
   * 棋盘格画在**容器**上、颜色画在**内层**：顺序反了（棋盘格在上）浅色与半透明就全被盖住，
   * 看起来是一块灰格子。现在半透明的 rgba 会自然透出格子，浅色也能看出边界。
   */
  background-color: #fff;
  background-image: linear-gradient(45deg, rgba(0, 0, 0, 0.07) 25%, transparent 25% 75%, rgba(0, 0, 0, 0.07) 75%),
    linear-gradient(45deg, rgba(0, 0, 0, 0.07) 25%, transparent 25% 75%, rgba(0, 0, 0, 0.07) 75%);
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
  cursor: pointer;
  overflow: hidden;
}

.tok__swatch-fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.tok__swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.tok__val {
  min-width: 86px;
  color: var(--mauth-text-faint);
  font-family: var(--font-mono);
  font-size: 11px;
}

/* 没有静态值 = 默认由表达式现算（如登录脉搏卡跟着主色走） */
.tok__val--inherit {
  font-family: var(--font-sans);
  font-style: italic;
  opacity: 0.8;
}

.tok__range {
  width: 116px;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  /* 左侧主色 = 已走过的部分，右侧灰 = 剩余，一眼看出当前值落在哪 */
  background: linear-gradient(
    to right,
    var(--mauth-primary) 0 var(--fill, 0%),
    var(--mauth-surface-2) var(--fill, 0%) 100%
  );
  cursor: pointer;
}

.tok__range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--mauth-primary);
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
}

.tok__range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 50%;
  background: var(--mauth-primary);
}

.tok__more {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
  font-size: 12px;
  cursor: pointer;
}

.tok__unit {
  min-width: 34px;
  color: var(--mauth-text-faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.tok__undo {
  border: 0;
  background: none;
  color: var(--mauth-text-soft);
  font-size: 11px;
  cursor: pointer;
}

.tok__undo:disabled {
  color: var(--mauth-text-faint);
  opacity: 0.4;
  cursor: default;
}

.tok__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}

.tok__count {
  color: var(--mauth-text-soft);
  font-size: 12px;
}

.tok__reset-all {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--mauth-danger-soft);
  color: var(--mauth-danger);
  font-size: 12px;
  cursor: pointer;
}

.tok__reset-all:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
