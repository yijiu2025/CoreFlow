<script setup lang="ts">
/**
 * 岗位选择器（与角色选择器同构，去掉应用维度）
 *
 * 岗位表目前**没有分类字段**（`sys_post` 只有 code / name / sort），所以分组只能从
 * 编码里推：编码带分隔符（`tech-engineer` / `sales.manager`）时按首段分组，否则
 * 全部归入一组。这是"数据有多少就分多少"，不臆造一个前端假分类。
 *
 * === 为什么和角色选择器长得一样 ===
 * 两个选择器在同一个表单里上下叠着，交互必须一致：搜索框位置、行高节奏、
 * 「全选 / 清空」的位置、已选摘要的位置全都对齐 —— 否则填表时眼睛要在两套规则间切换。
 * 类名统一走 `rp-`，样式口径（行高、圆角、字号、渐隐）与 `RolePicker` 同一份语言。
 *
 * === 组头只在"分组真的有意义"时出现 ===
 * ≥2 组且每组 ≥2 个才渲染分组：只有三个岗位时顶着一条「全部岗位 3」的组头，
 * 是拿版面换一个没有信息量的标题。
 *
 * 真要按组织维度分类（如"技术族 / 职能族"），正确做法是给 `sys_post` 加
 * `category` 字段并在岗位管理里维护 —— 那时候本组件的 `groups` 换一个取值来源即可。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Search, X } from 'lucide-vue-next';
import type { PostOption } from '@/api/types';

const props = withDefaults(
  defineProps<{
    /** 当前选中的岗位 ID */
    modelValue: number[];
    /** 可选岗位 */
    posts: PostOption[];
    /**
     * 选项加载状态
     *
     * `loading` / `error` 都**不得**显示「暂无可分配岗位」：选项还没到 / 拉失败时
     * 下这个结论是错的。
     */
    status?: 'loading' | 'ready' | 'error';
  }>(),
  { status: 'ready' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
  /** 点「重试」：由宿主重新拉选项（组件自己不发请求） */
  (e: 'retry'): void;
}>();

/** 选项加载中 */
const loading = computed(() => props.status === 'loading');
/** 选项加载失败 */
const failed = computed(() => props.status === 'error');
/** 候选数 ≥ 9 才给搜索框（与角色选择器同一阈值） */
const SEARCH_THRESHOLD = 9;

/* ── 搜索状态 ─────────────────────────────────────────────── */

/** 输入框原文 */
const query = ref('');
/** 参与过滤的关键词 */
const appliedQuery = ref('');
/** 是否正在输入法组字 */
const composing = ref(false);
/** 去抖计时器 */
let debounceTimer = 0;
/** 搜索框 */
const searchEl = ref<HTMLInputElement | null>(null);
/** 已选摘要是否展开 */
const pickedOpen = ref(false);
/** roving tabindex 的当前行 */
const activeIndex = ref(0);
/** 列表滚动容器 */
const listEl = ref<HTMLElement | null>(null);

/**
 * 安排一次去抖过滤
 */
function scheduleFilter(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    appliedQuery.value = query.value.trim();
  }, 200);
}

/**
 * 立即过滤
 */
function flushFilter(): void {
  window.clearTimeout(debounceTimer);
  appliedQuery.value = query.value.trim();
}

/**
 * 输入（组字期间不过滤，粘贴立即过滤）
 *
 * 🔴 输入框不绑 `:value`：组字期间回写 value 会打断部分浏览器的输入法。
 *
 * @param event 输入事件
 */
function onSearchInput(event: Event): void {
  const el = event.target as HTMLInputElement;
  const input = event as InputEvent;
  const raw = el.value;
  if (input.inputType === 'insertFromPaste' || /[\r\n\t]/.test(raw)) {
    const clean = raw.replace(/[\r\n\t]+/g, ' ').trim();
    if (el.value !== clean) el.value = clean;
    query.value = clean;
    flushFilter();
    return;
  }
  query.value = raw;
  if (composing.value) return;
  scheduleFilter();
}

/**
 * 组字结束：立刻过滤
 *
 * @param event 组字事件
 */
function onCompositionEnd(event: Event): void {
  composing.value = false;
  const el = event.target as HTMLInputElement;
  query.value = el.value;
  flushFilter();
}

/**
 * 清空搜索
 *
 * @param focus 是否把焦点送回搜索框
 */
function clearQuery(focus = true): void {
  window.clearTimeout(debounceTimer);
  query.value = '';
  appliedQuery.value = '';
  if (searchEl.value) searchEl.value.value = '';
  if (focus) void nextTick(() => searchEl.value?.focus({ preventScroll: true }));
}

/**
 * 搜索框键盘：有内容时 Esc 清空并保持焦点，空着时放行给宿主关弹窗
 *
 * @param event 键盘事件
 */
function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !query.value) return;
  event.preventDefault();
  event.stopPropagation();
  clearQuery(true);
}

/* ── 分组 ─────────────────────────────────────────────────── */

/** 一组岗位 */
interface PostGroup {
  key: string;
  label: string;
  posts: PostOption[];
  /** 当前组是否已全选 */
  allPicked: boolean;
}

/**
 * 取编码前缀作为分组键
 *
 * @param code 岗位编码
 * @returns 分组键（无分隔符时为空串）
 */
function prefixOf(code: string): string {
  const matched = /^([A-Za-z\u4e00-\u9fa5]+)[-._]/.exec(code || '');
  return matched ? matched[1] : '';
}

/** 已选 ID 集合 */
const pickedSet = computed(() => new Set(props.modelValue));

/**
 * 全量分组（不受搜索影响）
 *
 * 摘要与「清空」都按全量算：搜索只该影响列表看到什么，不该改变"我一共存了哪些岗位"。
 * 组内按编码排序（编码相同按 id）。
 */
const allGroups = computed<Array<{ key: string; label: string; posts: PostOption[] }>>(() => {
  const buckets = new Map<string, PostOption[]>();
  for (const post of props.posts) {
    const key = prefixOf(String(post.post_code));
    const list = buckets.get(key);
    if (list) list.push(post);
    else buckets.set(key, [post]);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0], 'zh-CN')))
    .map(([key, items]) => ({
      key: key || '__all',
      label: key || '全部岗位',
      posts: [...items].sort((a, b) => String(a.post_code).localeCompare(String(b.post_code)) || a.id - b.id)
    }));
});

/**
 * 过滤 + 分组
 *
 * 命中排序与角色一致：名称开头 > 名称中段 > 仅编码；同档保持组内编码序（sort 稳定）。
 */
const groups = computed<PostGroup[]>(() => {
  const keyword = appliedQuery.value.toLowerCase();
  const out: PostGroup[] = [];
  for (const group of allGroups.value) {
    let posts = group.posts;
    if (keyword) {
      const scored: Array<{ post: PostOption; tier: number }> = [];
      for (const post of group.posts) {
        const name = post.post_name.toLowerCase();
        const code = String(post.post_code).toLowerCase();
        const tier = name.startsWith(keyword) ? 0 : name.includes(keyword) ? 1 : code.includes(keyword) ? 2 : -1;
        if (tier >= 0) scored.push({ post, tier });
      }
      scored.sort((a, b) => a.tier - b.tier);
      posts = scored.map(item => item.post);
    }
    // 0 命中的组不渲染
    if (!posts.length) continue;
    out.push({
      key: group.key,
      label: group.label,
      posts,
      allPicked: posts.every(post => pickedSet.value.has(post.id))
    });
  }
  return out;
});

/**
 * 是否渲染组头
 *
 * ≥2 组且每组 ≥2 个 —— 否则分组只是给三个岗位增加一层缩进。
 */
const showHeads = computed(() => groups.value.length >= 2 && groups.value.every(group => group.posts.length >= 2));

/**
 * 扁平化的可见行（键盘 ↑/↓ 跨组连续）
 *
 * 不分组时只有一个虚拟组，此时不渲染组头，但行仍然在同一个 listbox 里。
 */
const rows = computed<Array<{ post: PostOption; groupLabel: string }>>(() =>
  groups.value.flatMap(group => group.posts.map(post => ({ post, groupLabel: group.label })))
);

/** 岗位 ID → 扁平行号 */
const rowIndexById = computed(() => {
  const map = new Map<number, number>();
  rows.value.forEach((row, index) => map.set(row.post.id, index));
  return map;
});

/** 可见岗位数 */
const visibleCount = computed(() => rows.value.length);

/** 候选数达到阈值才给搜索框 */
const showSearch = computed(() => props.posts.length >= SEARCH_THRESHOLD);

/* ── 已选摘要 ─────────────────────────────────────────────── */

/** 摘要 chip */
interface PickedChip {
  id: number;
  /** 左半段：未知 id 时是 `#123`；已知时为空（岗位没有应用维度） */
  prefix: string;
  name: string;
  known: boolean;
}

/**
 * 已选摘要（按分组顺序，不按点击顺序）
 */
const pickedChips = computed<PickedChip[]>(() => {
  const known = new Set<number>();
  const out: PickedChip[] = [];
  for (const group of allGroups.value) {
    for (const post of group.posts) {
      known.add(post.id);
      if (pickedSet.value.has(post.id)) out.push({ id: post.id, prefix: '', name: post.post_name, known: true });
    }
  }
  // 不在选项里的 id：选项没加载全或岗位被删了 —— 原样保留并说清楚
  for (const id of props.modelValue) {
    if (known.has(id)) continue;
    out.push({ id, prefix: `#${id}`, name: '选项未加载', known: false });
  }
  return out;
});

/** 折叠时只显示前 3 枚 */
const visiblePicked = computed(() => (pickedOpen.value ? pickedChips.value : pickedChips.value.slice(0, 3)));
/** 未知已选数 */
const unknownCount = computed(() => pickedChips.value.filter(chip => !chip.known).length);
/** 可移除数量 */
const removableCount = computed(() => pickedChips.value.filter(chip => chip.known).length);

/* ── 变更 ─────────────────────────────────────────────────── */

/**
 * 勾选 / 取消
 *
 * @param id 岗位 ID
 */
function toggle(id: number): void {
  const next = new Set(props.modelValue);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  emit('update:modelValue', [...next]);
}

/**
 * 行点击（拖选文本时不误选）
 *
 * @param id 岗位 ID
 */
function onRowClick(id: number): void {
  if (window.getSelection()?.toString()) return;
  toggle(id);
}

/**
 * 移除一枚已选 chip
 *
 * @param chip 摘要 chip
 */
function removeChip(chip: PickedChip): void {
  if (!chip.known) return;
  emit(
    'update:modelValue',
    props.modelValue.filter(id => id !== chip.id)
  );
}

/**
 * 组头：全选 / 清空（作用域 = 当前筛选结果 ∩ 该组）
 *
 * @param group 分组
 */
function toggleGroup(group: PostGroup): void {
  if (!group.posts.length) return;
  const next = new Set(props.modelValue);
  for (const post of group.posts) {
    if (group.allPicked) next.delete(post.id);
    else next.add(post.id);
  }
  emit('update:modelValue', [...next]);
}

/**
 * 清空已选（只清已知项，未知 id 原样保留）
 */
function clearAll(): void {
  if (!removableCount.value) return;
  const keep = new Set(pickedChips.value.filter(chip => !chip.known).map(chip => chip.id));
  emit(
    'update:modelValue',
    props.modelValue.filter(id => keep.has(id))
  );
}

/* ── 键盘 ─────────────────────────────────────────────────── */

/**
 * 把焦点送到某一行
 *
 * @param index 行号
 */
function focusRow(index: number): void {
  const last = rows.value.length - 1;
  if (last < 0) return;
  const next = Math.min(last, Math.max(0, index));
  activeIndex.value = next;
  void nextTick(() => {
    listEl.value?.querySelector<HTMLElement>(`[data-rp-idx="${next}"]`)?.focus();
  });
}

/**
 * 行内键盘
 *
 * @param event 键盘事件
 * @param index 行号
 * @param id 岗位 ID
 */
function onRowKeydown(event: KeyboardEvent, index: number, id: number): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusRow(index + 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      focusRow(index - 1);
      break;
    case 'Home':
      event.preventDefault();
      focusRow(0);
      break;
    case 'End':
      event.preventDefault();
      focusRow(rows.value.length - 1);
      break;
    case 'PageDown':
      event.preventDefault();
      focusRow(index + 6);
      break;
    case 'PageUp':
      event.preventDefault();
      focusRow(index - 6);
      break;
    case ' ':
    case 'Enter':
      event.preventDefault();
      toggle(id);
      break;
    default:
      break;
  }
}

/* ── 搜索高亮 ─────────────────────────────────────────────── */

/** 高亮片段 */
interface Segment {
  text: string;
  hit: boolean;
}

/**
 * 切分高亮片段（用 `<strong>`，不用带黄底的 `<mark>`）
 *
 * @param text 名称
 * @returns 片段
 */
function highlight(text: string): Segment[] {
  const keyword = appliedQuery.value.toLowerCase();
  if (!keyword) return [{ text, hit: false }];
  const index = text.toLowerCase().indexOf(keyword);
  if (index < 0) return [{ text, hit: false }];
  const segments: Segment[] = [];
  if (index > 0) segments.push({ text: text.slice(0, index), hit: false });
  segments.push({ text: text.slice(index, index + keyword.length), hit: true });
  if (index + keyword.length < text.length) {
    segments.push({ text: text.slice(index + keyword.length), hit: false });
  }
  return segments;
}

/* ── 播报 ─────────────────────────────────────────────────── */

/** 播报：搜索态报命中数，否则报已选 */
const liveText = computed(() =>
  appliedQuery.value ? `找到 ${visibleCount.value} 个岗位` : `已选 ${props.modelValue.length} 个岗位`
);

/** 行数变少后把游标夹回范围 */
watch(rows, list => {
  if (activeIndex.value > list.length - 1) activeIndex.value = Math.max(0, list.length - 1);
});

onBeforeUnmount(() => {
  window.clearTimeout(debounceTimer);
});
</script>

<template>
  <div class="rp" :aria-busy="loading || undefined">
    <div v-if="loading || showSearch" class="rp-tools">
      <div class="rp-search">
        <Search class="rp-search__icon" :size="14" aria-hidden="true" />
        <input
          ref="searchEl"
          class="rp-search__input"
          type="text"
          :disabled="loading"
          placeholder="搜索岗位名 / 编码"
          aria-label="搜索岗位"
          autocomplete="off"
          spellcheck="false"
          @input="onSearchInput"
          @compositionstart="composing = true"
          @compositionend="onCompositionEnd"
          @keydown="onSearchKeydown"
        />
        <button v-if="query" class="rp-search__clear" type="button" aria-label="清空搜索" @click="clearQuery(true)">
          <X :size="13" aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="pickedChips.length"
        class="rp-tools__clear"
        type="button"
        :disabled="removableCount === 0"
        title="清空已选岗位"
        @click="clearAll"
      >
        清空已选
      </button>
    </div>

    <!-- 已选摘要：岗位没有应用维度，chip 只写岗位名。
         选项还没到（loading / error）时整条不渲染，理由同角色选择器 -->
    <div v-if="pickedChips.length && !loading && !failed" :class="['rp-picked', { 'is-open': pickedOpen }]">
      <ul class="rp-picked__list">
        <li
          v-for="chip in visiblePicked"
          :key="chip.id"
          :class="['rp-chip', { 'rp-chip--unknown': !chip.known }]"
          :title="chip.known ? chip.name : '不在当前选项里，会原样保留'"
        >
          <span class="rp-chip__text">
            <template v-if="chip.prefix">{{ chip.prefix }} · </template>{{ chip.name }}
          </span>
          <button
            v-if="chip.known"
            class="rp-chip__x"
            type="button"
            :aria-label="`移除 ${chip.name}`"
            @click="removeChip(chip)"
          >
            <X :size="11" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <button
        v-if="pickedChips.length > 3"
        class="rp-picked__more"
        type="button"
        :aria-expanded="pickedOpen"
        @click="pickedOpen = !pickedOpen"
      >
        {{ pickedOpen ? '收起' : `+${pickedChips.length - 3}` }}
      </button>
      <button class="rp-picked__clear" type="button" :disabled="removableCount === 0" @click="clearAll">清空</button>
    </div>

    <div v-if="failed" class="rp-error">
      <span class="rp-error__text">岗位选项没有加载出来</span>
      <button class="rp-error__retry" type="button" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="loading" class="rp-skeletons" aria-hidden="true">
      <span class="rp-skeleton"></span>
      <span class="rp-skeleton"></span>
      <span class="rp-skeleton"></span>
    </div>

    <p v-else-if="!posts.length" class="rp-empty">暂无可分配岗位（先在岗位管理里创建）</p>

    <div v-else-if="!rows.length" class="rp-empty">
      <span>没有匹配「{{ appliedQuery }}」的岗位</span>
      <button class="rp-empty__clear" type="button" @click="clearQuery(true)">清空搜索</button>
    </div>

    <div
      v-else
      ref="listEl"
      class="rp-list"
      :class="{ 'rp-list--scroll': !!appliedQuery }"
      role="listbox"
      aria-multiselectable="true"
      aria-label="岗位（可多选）"
    >
      <section
        v-for="group in groups"
        :key="group.key"
        class="rp-group"
        :role="showHeads ? 'group' : undefined"
        :aria-label="showHeads ? group.label : undefined"
      >
        <header v-if="showHeads" class="rp-group__head">
          <span class="rp-group__label">{{ group.label }}</span>
          <span class="rp-group__count mono">{{ group.posts.length }}</span>
          <button class="rp-group__all" type="button" @click="toggleGroup(group)">
            {{ group.allPicked ? `清空 ${group.posts.length} 个` : `全选 ${group.posts.length} 个` }}
          </button>
        </header>

        <div class="rp-group__rows">
          <div
            v-for="post in group.posts"
            :key="post.id"
            :class="['rp-row', 'rp-row--post', { 'is-picked': pickedSet.has(post.id) }]"
            role="option"
            :aria-selected="pickedSet.has(post.id)"
            :tabindex="rowIndexById.get(post.id) === activeIndex ? 0 : -1"
            :data-rp-idx="rowIndexById.get(post.id) ?? 0"
            :title="`${post.post_code} · ${post.post_name}`"
            @click="onRowClick(post.id)"
            @keydown="onRowKeydown($event, rowIndexById.get(post.id) ?? 0, post.id)"
          >
            <input
              class="rp-row__box"
              type="checkbox"
              :checked="pickedSet.has(post.id)"
              aria-hidden="true"
              tabindex="-1"
            />
            <span class="rp-row__name">
              <template v-for="(part, i) in highlight(post.post_name)" :key="i">
                <strong v-if="part.hit">{{ part.text }}</strong>
                <span v-else>{{ part.text }}</span>
              </template>
            </span>
            <span class="mono rp-row__code rp-row__code--tail">{{ post.post_code }}</span>
          </div>
        </div>
      </section>
    </div>

    <p v-if="unknownCount" class="rp-foot">有 {{ unknownCount }} 个岗位不在当前选项里，会原样保留</p>

    <p class="rp-sr" role="status" aria-live="polite">{{ liveText }}</p>
  </div>
</template>

<style scoped>
/*
 * 与 `RolePicker` 同一套 `rp-` 语言（类名、行高、圆角、字号、焦点环一致）。
 * 两份样式各自 scoped：组件互不依赖，改一个不会连带改另一个的意外部位。
 */
.rp {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── 工具行 ───────────────────────────────────────────────── */
.rp-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rp-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: var(--control-h);
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-input-bg, var(--mauth-surface));
  transition:
    border-color 0.16s var(--ease),
    box-shadow 0.16s var(--ease);
}

.rp-search:focus-within {
  border-color: var(--mauth-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mauth-primary) 16%, transparent);
}

.rp-search__icon {
  flex: none;
  margin: 0 6px 0 10px;
  color: var(--mauth-text-faint);
}

.rp-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 30px 0 0;
  border: 0;
  background: transparent;
  color: var(--mauth-text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.rp-search__input::placeholder {
  color: var(--mauth-text-faint);
}

.rp-search__input:disabled {
  cursor: not-allowed;
  color: var(--mauth-text-soft);
}

.rp-search__clear {
  position: absolute;
  top: 50%;
  right: 6px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--mauth-hover);
  color: var(--mauth-text-mid);
  cursor: pointer;
  transform: translateY(-50%);
}

.rp-search__clear:hover {
  background: var(--mauth-press);
  color: var(--mauth-text);
}

.rp-tools__clear {
  flex: none;
  height: var(--control-h);
  padding: 0 10px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.rp-tools__clear:hover:not(:disabled) {
  background: var(--mauth-hover);
  color: var(--mauth-text);
}

.rp-tools__clear:disabled {
  color: var(--mauth-text-faint);
  cursor: not-allowed;
}

/* ── 已选摘要 ─────────────────────────────────────────────── */
.rp-picked {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
}

.rp-picked__list {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
}

.rp-picked.is-open {
  align-items: flex-start;
}

.rp-picked.is-open .rp-picked__list {
  flex-direction: column;
  max-height: calc(4 * 22px + 3 * 4px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.rp-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 22px;
  max-width: 260px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-tag-bg, var(--mauth-hover));
  color: var(--mauth-tag-ink, var(--mauth-text-mid));
  font-size: 11.5px;
}

.rp-picked.is-open .rp-chip {
  max-width: none;
}

.rp-chip__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-chip--unknown {
  border-style: dashed;
  border-color: var(--mauth-border-strong);
  background: transparent;
  color: var(--mauth-text-soft);
  padding-right: 8px;
}

.rp-chip__x {
  display: grid;
  place-items: center;
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  opacity: 0.66;
}

.rp-chip__x:hover {
  background: color-mix(in srgb, currentColor 16%, transparent);
  opacity: 1;
}

.rp-picked__more {
  flex: none;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--mauth-border);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.rp-picked__more:hover {
  border-color: var(--mauth-border-strong);
  color: var(--mauth-text);
}

.rp-picked__clear {
  flex: none;
  height: 22px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--mauth-radius-xs);
  background: transparent;
  color: var(--mauth-danger);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.rp-picked__clear:hover:not(:disabled) {
  background: var(--mauth-danger-soft);
}

.rp-picked__clear:disabled {
  color: var(--mauth-text-faint);
  cursor: not-allowed;
}

/* ── 列表 ─────────────────────────────────────────────────── */
.rp-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  overflow: hidden;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

/* 只有搜索时才限高滚动：岗位通常十来个，没搜索时不该出现一条滚动条 */
.rp-list--scroll {
  max-height: min(var(--rp-list-max, 208px), 45dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.rp-group {
  grid-column: 1 / -1;
  min-width: 0;
}

.rp-group + .rp-group {
  border-top: 1px solid var(--mauth-border);
}

.rp-group__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid var(--mauth-border);
}

.rp-group__label {
  font-size: 11.5px;
  font-weight: 620;
  color: var(--mauth-text-mid);
}

.rp-group__count {
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.rp-group__all {
  margin-left: auto;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--mauth-text-soft);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.16s var(--ease),
    color 0.16s var(--ease);
}

.rp-group__all:hover {
  background: var(--mauth-hover);
  color: var(--mauth-primary);
}

.rp-group__rows {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  padding: 2px;
}

/* ── 行（单行：勾选框 + 名称 + 行尾编码） ─────────────────── */
.rp-row {
  display: flex;
  min-width: 0;
  border-radius: var(--mauth-radius-xs);
  cursor: pointer;
  transition: background 0.14s var(--ease);
}

/* 岗位是单行 36 高：比角色的 44（两行）矮一档，因为这里没有编码/职级第二行 */
.rp-row--post {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 8px;
}

.rp-row:hover {
  background: var(--mauth-hover);
}

.rp-row.is-picked {
  background: color-mix(in srgb, var(--mauth-primary) 6%, transparent);
}

.rp-row.is-picked .rp-row__name {
  font-weight: 620;
}

.rp-row__box {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--mauth-primary);
  pointer-events: none;
}

.rp-row__name {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 550;
  color: var(--mauth-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-row__name strong {
  font-weight: 650;
  color: var(--mauth-primary);
}

.rp-row__code {
  min-width: 0;
  overflow: hidden;
  font-size: 10.5px;
  color: var(--mauth-text-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rp-row__code--tail {
  margin-left: auto;
  padding-left: 8px;
}

/* ── 状态 ─────────────────────────────────────────────────── */
.rp-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 12px;
  border: 1px dashed var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  color: var(--mauth-text-soft);
  font-size: 12.5px;
}

.rp-empty__clear {
  padding: 2px 8px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 999px;
  background: var(--mauth-surface);
  color: var(--mauth-text-mid);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.rp-empty__clear:hover {
  color: var(--mauth-primary);
  border-color: var(--mauth-primary);
}

.rp-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
  background: color-mix(in srgb, var(--mauth-danger) 5%, transparent);
}

.rp-error__text {
  font-size: 12.5px;
  color: var(--mauth-danger);
}

.rp-error__retry {
  margin-left: auto;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--mauth-border-strong);
  border-radius: var(--mauth-radius-xs);
  background: var(--mauth-surface);
  color: var(--mauth-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.rp-error__retry:hover {
  border-color: var(--mauth-primary);
  color: var(--mauth-primary);
}

.rp-skeletons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-xs);
}

.rp-skeleton {
  height: 28px;
  border-radius: var(--mauth-radius-xs);
  background: linear-gradient(90deg, var(--mauth-hover), var(--mauth-press), var(--mauth-hover));
  background-size: 200% 100%;
  animation: rp-skeleton 1.2s ease infinite;
}

@keyframes rp-skeleton {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.rp-foot {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-warning);
}

/* ── 键盘焦点 ─────────────────────────────────────────────── */
.rp-row:focus-visible,
.rp-group__all:focus-visible,
.rp-chip__x:focus-visible,
.rp-picked__clear:focus-visible,
.rp-picked__more:focus-visible,
.rp-tools__clear:focus-visible,
.rp-search__clear:focus-visible,
.rp-error__retry:focus-visible,
.rp-empty__clear:focus-visible {
  outline: 2px solid var(--mauth-primary);
  outline-offset: -2px;
}

@container (max-width: 480px) {
  .rp-group__rows {
    grid-template-columns: minmax(0, 1fr);
  }
}

.rp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* 强制配色下浅主色底会消失，用系统高亮色补一条描边（CanvasText/Highlight 是系统色关键字） */
@media (forced-colors: active) {
  .rp-row.is-picked {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }

  .rp-row__name {
    color: CanvasText;
  }
}
</style>
