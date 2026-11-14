<script setup lang="ts">
/**
 * 用户选择器（输入即搜，选中回填用户名）
 *
 * 用在「部门负责人」这类**存的是人名**的字段上：`sys_dept.leader` 是 `varchar(50)`，
 * 历史数据里既有真名也有用户名，所以这里坚持两件事：
 *   1. 仍然可以**自由输入**（兼容历史值与"临时负责人还没建账号"的情况）；
 *   2. 从系统里选人时，回填的是 `username`（登录名）—— 与用户列表一致，便于后台
 *      直接按名字搜到这个人；同时把姓名/部门放在下拉里做辨认依据。
 *
 * 为什么不用原生 `<datalist>`：它不做服务端搜索，几百个用户时只匹配已渲染的几条，
 * 且无法显示"部门 / 账号"这类辅助信息；而自己拉全量列表又会随用户数线性变慢。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { listUsers } from '@/api/system';
import type { UserRow } from '@/api/types';

const props = withDefaults(
  defineProps<{
    /** 占位文案 */
    placeholder?: string;
    /** 最大长度（与后端列宽一致） */
    maxlength?: number;
    /** 禁用 */
    disabled?: boolean;
  }>(),
  { placeholder: '搜索账号 / 输入姓名', maxlength: 50, disabled: false }
);

const model = defineModel<string>({ default: '' });

/** 输入框里的文字（= model，但允许"输入中"与 model 短暂不同步） */
const keyword = ref(model.value);
const open = ref(false);
const loading = ref(false);
const options = ref<UserRow[]>([]);
const activeIndex = ref(-1);
const root = ref<HTMLElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
/** 下拉的固定定位矩形（弹窗主体是 overflow:auto，绝对定位会被裁掉，只能 teleport 到 body） */
const anchor = ref<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

let timer: ReturnType<typeof setTimeout> | undefined;
/** 请求序号：慢响应回来时不要覆盖新结果 */
let seq = 0;

watch(model, value => {
  if (value !== keyword.value) keyword.value = value ?? '';
});

/**
 * 按关键词拉候选用户
 *
 * @param kw 关键词（账号 / 邮箱）
 * @returns 无
 */
async function search(kw: string): Promise<void> {
  const mine = ++seq;
  loading.value = true;
  try {
    const page = await listUsers({ keyword: kw.trim() || undefined, pageNum: 1, pageSize: 8 });
    if (mine !== seq) return;
    options.value = page.rows ?? [];
    activeIndex.value = options.value.length > 0 ? 0 : -1;
  } catch {
    if (mine === seq) options.value = [];
  } finally {
    if (mine === seq) loading.value = false;
  }
}

/**
 * 输入：先同步到 model（允许自由输入），再防抖搜人
 *
 * @param event 输入事件
 */
function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  keyword.value = value;
  model.value = value;
  open.value = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void search(value), 220);
}

/** 选中某人：回填 username（与用户列表同一口径） */
function pick(user: UserRow): void {
  model.value = user.username;
  keyword.value = user.username;
  open.value = false;
  activeIndex.value = -1;
}

/** 清空 */
function clear(): void {
  model.value = '';
  keyword.value = '';
  options.value = [];
  open.value = false;
}

/**
 * 键盘：↑↓ 选择、Enter 确认、Esc 关闭
 *
 * @param event 键盘事件
 */
function onKeydown(event: KeyboardEvent): void {
  if (!open.value && (event.key === 'ArrowDown' || event.key === 'Enter')) {
    open.value = true;
    void search(keyword.value);
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, options.value.length - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (event.key === 'Enter') {
    const picked = options.value[activeIndex.value];
    if (picked) {
      event.preventDefault();
      pick(picked);
    }
  } else if (event.key === 'Escape') {
    open.value = false;
  }
}

/**
 * 失焦关闭
 *
 * 用 `mousedown` 在文档上判断是否点在组件外：直接给 input 挂 blur 会在"点下拉项"
 * 之前就把列表关掉，点了没反应。
 *
 * @param event 鼠标事件
 */
function onDocMousedown(event: MouseEvent): void {
  const target = event.target as Node;
  if (root.value?.contains(target)) return;
  // 列表被 teleport 到 body，不在 root 里：点在列表上不算"点外面"
  if (listEl.value?.contains(target)) return;
  open.value = false;
}

/**
 * 把下拉贴到输入框下方
 *
 * 🔴 不能靠 `position:absolute`：`.modal__body` 是 `overflow-y:auto`，绝对定位的子元素
 *    会被裁在滚动容器里（字段靠下时整个下拉都看不见）。所以 teleport 到 body + fixed，
 *    并在滚动/尺寸变化时重算。
 */
function reposition(): void {
  const box = root.value?.querySelector('input');
  if (!box) return;
  const rect = box.getBoundingClientRect();
  anchor.value = { top: rect.bottom + 4, left: rect.left, width: rect.width };
}

watch(open, isOpen => {
  if (isOpen) {
    reposition();
    document.addEventListener('mousedown', onDocMousedown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  } else {
    document.removeEventListener('mousedown', onDocMousedown);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMousedown);
  window.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div ref="root" class="upick">
    <div class="upick__box">
      <input
        class="input upick__input"
        :value="keyword"
        :placeholder="props.placeholder"
        :maxlength="props.maxlength"
        :disabled="props.disabled"
        :aria-expanded="open"
        role="combobox"
        aria-autocomplete="list"
        autocomplete="off"
        @input="onInput"
        @focus="
          open = true;
          void search(keyword);
        "
        @keydown="onKeydown"
      />
      <button
        v-if="keyword"
        class="upick__clear"
        type="button"
        title="清空"
        aria-label="清空负责人"
        :disabled="props.disabled"
        @click="clear"
      >
        ×
      </button>
    </div>

    <Teleport to="body">
      <ul
        v-if="open && (options.length > 0 || loading)"
        ref="listEl"
        class="upick__list upick__list--fixed"
        role="listbox"
        :style="{ top: `${anchor.top}px`, left: `${anchor.left}px`, width: `${anchor.width}px` }"
      >
        <li v-if="loading" class="upick__empty">搜索中…</li>
        <li
          v-for="(user, index) in options"
          :key="user.id"
          role="option"
          :aria-selected="index === activeIndex"
          :class="['upick__item', { 'is-active': index === activeIndex }]"
          @mouseenter="activeIndex = index"
          @mousedown.prevent="pick(user)"
        >
          <span class="upick__name">{{ user.username }}</span>
          <span class="upick__meta">{{ user.dept_name || '未分配部门' }}</span>
          <span v-if="user.status === 0" class="tag tag--off">已停用</span>
        </li>
        <li v-if="!loading && options.length === 0" class="upick__empty">没搜到匹配的账号</li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.upick {
  position: relative;
  width: 100%;
}

.upick__box {
  position: relative;
  display: flex;
  align-items: center;
}

.upick__input {
  width: 100%;
  padding-right: 26px;
}

.upick__clear {
  position: absolute;
  right: 4px;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-soft);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.upick__clear:hover {
  color: var(--mauth-text);
}

/* 下拉浮在弹窗内容之上：列表最多 8 条，超出滚动而不是把弹窗撑高 */
/* 传送到 body 后必须自己定位：top / left / width 由内联样式按输入框矩形给 */
.upick__list--fixed {
  position: fixed;
}

.upick__list {
  z-index: 1200;
  max-height: 248px;
  overflow: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--mauth-border-strong);
  border-radius: 8px;
  background: var(--mauth-surface);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--mauth-text) 14%, transparent);
}

.upick__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
}

.upick__item.is-active {
  background: var(--mauth-surface-2);
}

.upick__name {
  color: var(--mauth-text);
  font-weight: 550;
}

.upick__meta {
  margin-left: auto;
  color: var(--mauth-text-soft);
  font-size: 11.5px;
}

.upick__empty {
  padding: 8px;
  color: var(--mauth-text-soft);
  font-size: 12px;
}
</style>
