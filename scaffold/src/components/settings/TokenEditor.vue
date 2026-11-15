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
      <p class="tok__group-name">
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
            <label class="tok__swatch" :style="{ backgroundColor: valueOf(meta.key) }" :title="valueOf(meta.key)">
              <input
                type="color"
                :value="pickerHex(meta.key)"
                :aria-label="meta.label"
                @input="onColor(meta.key, $event)"
              />
            </label>
            <code class="tok__val">{{ shortValue(meta.key) }}</code>
          </template>

          <template v-else>
            <input
              class="tok__num"
              type="number"
              min="0"
              step="1"
              :value="lengthOf(meta.key)"
              :aria-label="meta.label"
              @change="onLength(meta.key, $event)"
            />
            <span class="tok__unit">{{ unitOf(meta.key) }}</span>
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

    <div class="tok__foot">
      <span class="tok__count">已改 {{ overrides.count }} 项 · 只影响当前账号</span>
      <button type="button" class="tok__reset-all" :disabled="!overrides.active" @click="overrides.resetAll()">
        全部还原
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { MATERIALS, tokensOfMaterial } from '@/theme/materials';
import { TOKEN_GROUPS, type TokenMeta } from '@/theme/token-manifest';
import { normalizeHex, toPickerHex, withOriginalAlpha } from '@/theme/color';
import { useOverridesStore } from '@/stores/overrides';
import { useThemeStore } from '@/stores/theme';

const overrides = useOverridesStore();
const theme = useThemeStore();

/** 当前材质 tab */
const tab = ref(MATERIALS[0].id);

/** 各材质的令牌数（tab 角标） */
const counts = computed<Record<string, number>>(() =>
  Object.fromEntries(MATERIALS.map(item => [item.id, tokensOfMaterial(item.id).length]))
);

/** 当前材质 */
const currentMaterial = computed(() => MATERIALS.find(item => item.id === tab.value));

/** 当前材质下的令牌，按既有分组顺序展开（空组不出现） */
const groups = computed<Array<{ group: string; items: TokenMeta[] }>>(() => {
  const items = tokensOfMaterial(tab.value);
  return TOKEN_GROUPS.map(group => ({ group, items: items.filter(meta => meta.group === group) })).filter(
    section => section.items.length > 0
  );
});

/** 当前配色记录（覆盖没设时用它显示"现在长什么样"） */
const baseTokens = computed<Record<string, string>>(() => theme.themeRecordFor().tokens ?? {});

/**
 * 某项当前生效的值
 *
 * @param key 令牌名
 * @returns CSS 值
 */
function valueOf(key: string): string {
  return overrides.current[key] ?? baseTokens.value[key] ?? '';
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
  width: 26px;
  height: 26px;
  border-radius: 7px;
  /*
   * 棋盘格底衬：`#f6f8f7` 这种浅色在白卡上几乎看不见边界，半透明的值更是"一块空气"。
   * 垫一层棋盘格后，浅色与透明都能看出实际覆盖范围。
   */
  background-image: linear-gradient(45deg, var(--mauth-border) 25%, transparent 25% 75%, var(--mauth-border) 75%),
    linear-gradient(45deg, var(--mauth-border) 25%, transparent 25% 75%, var(--mauth-border) 75%);
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
  box-shadow: inset 0 0 0 1px var(--mauth-border-strong);
  cursor: pointer;
  overflow: hidden;
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

.tok__num {
  width: 64px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--mauth-radius-sm);
  background: var(--mauth-input-bg, var(--mauth-surface));
  box-shadow: inset 0 0 0 1px var(--mauth-border);
  color: var(--mauth-text);
  font-size: 12px;
}

.tok__unit {
  color: var(--mauth-text-faint);
  font-size: 11px;
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
