<script setup lang="ts">
/**
 * 岗位选择器（分组 + 网格对齐）
 *
 * 岗位表目前**没有分类字段**（`sys_post` 只有 code / name / sort），所以分组只能从
 * 编码里推：编码带分隔符（`tech-engineer` / `sales.manager`）时按首段分组，否则
 * 全部归入「全部岗位」一组。这是"数据有多少就分多少"，不臆造一个前端假分类。
 *
 * 真要按组织维度分类（如"技术族 / 职能族"），正确做法是给 `sys_post` 加
 * `category` 字段并在岗位管理里维护 —— 那时候本组件的 `groups` 换一个取值来源即可，
 * 模板与样式不用动。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { computed, ref } from 'vue';
import type { PostOption } from '@/api/types';

const props = defineProps<{
  /** 当前选中的岗位 ID */
  modelValue: number[];
  /** 可选岗位 */
  posts: PostOption[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: number[]): void }>();

/** 关键词（岗位多时靠它找，而不是在一屏 chips 里翻） */
const keyword = ref('');

/** 岗位数超过这个值才给搜索框：少数几个岗位时多一个输入框只是噪音 */
const SEARCH_THRESHOLD = 8;

/** 分组标题与成员 */
interface PostGroup {
  key: string;
  label: string;
  posts: PostOption[];
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

/** 过滤 + 分组（组内按编码排序，编码相同按 id） */
const groups = computed<PostGroup[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  const list = props.posts.filter(p => {
    if (!kw) return true;
    return p.post_name.toLowerCase().includes(kw) || String(p.post_code).toLowerCase().includes(kw);
  });

  const buckets = new Map<string, PostOption[]>();
  for (const post of list) {
    const key = prefixOf(String(post.post_code));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(post);
  }

  return [...buckets.entries()]
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
    .map(([key, items]) => ({
      key,
      label: key || '全部岗位',
      posts: [...items].sort((a, b) => String(a.post_code).localeCompare(String(b.post_code)) || a.id - b.id)
    }));
});

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
</script>

<template>
  <div class="post-picker">
    <input
      v-if="posts.length > SEARCH_THRESHOLD"
      v-model="keyword"
      class="input post-picker__search"
      placeholder="筛选岗位（名称 / 编码）"
    />

    <p v-if="posts.length === 0" class="post-picker__empty">暂无岗位（先在岗位管理里创建）</p>

    <section v-for="group in groups" :key="group.key" class="post-group">
      <header class="post-group__head">
        <span class="post-group__label">{{ group.label }}</span>
        <span class="post-group__count mono">{{ group.posts.length }}</span>
      </header>
      <div class="post-grid">
        <label
          v-for="post in group.posts"
          :key="post.id"
          :class="['post-item', { 'is-picked': modelValue.includes(post.id) }]"
          :title="`${post.post_code} · ${post.post_name}`"
        >
          <input type="checkbox" :checked="modelValue.includes(post.id)" @change="toggle(post.id)" />
          <span class="post-item__name">{{ post.post_name }}</span>
          <span class="post-item__code mono">{{ post.post_code }}</span>
        </label>
      </div>
    </section>

    <p class="post-picker__foot">
      已选 <b>{{ modelValue.length }}</b> 个
      <span v-if="groups.length === 0" class="post-picker__empty-inline">· 没有匹配的岗位</span>
    </p>
  </div>
</template>

<style scoped>
.post-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.post-picker__search {
  height: 32px;
  font-size: 12.5px;
}

.post-picker__empty {
  margin: 0;
  font-size: 12px;
  color: var(--mauth-text-faint);
}

.post-group {
  border: 1px solid var(--mauth-border);
  border-radius: var(--mauth-radius-sm);
  overflow: hidden;
}

.post-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--mauth-surface-2);
  border-bottom: 1px solid var(--mauth-border);
}

.post-group__label {
  font-size: 12px;
  font-weight: 600;
}

.post-group__count {
  font-size: 11px;
  color: var(--mauth-text-faint);
}

/* 与角色网格同一套列宽口径，两个选择器上下叠着看是齐的 */
.post-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 2px 8px;
  padding: 8px 10px;
}

.post-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
}

.post-item:hover {
  background: var(--mauth-hover);
}

.post-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-item__code {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--mauth-text-faint);
}

.post-picker__foot {
  margin: 0;
  font-size: 11.5px;
  color: var(--mauth-text-faint);
}

.post-picker__empty-inline {
  color: var(--mauth-danger);
}
</style>
