<!--
  命令面板（⌘ / Ctrl + K）

  === 多主题怎么支持 ===
  三件事分开看：

  1. **颜色 / 圆角 / 描边 / 阴影**：全部走 `--mauth-*`（配色层给的），所以换配色、换明暗、
     甚至用户在「自定义」里改任何一项，面板都自动跟随 —— 不需要任何按包分支的代码。
  2. **密度**：行高与内距读 `--row-h` / `--cell-px` 的**同族变量**（这里用固定 34/38，
     因为面板是浮层、不跟表格节奏；密度档位只影响列表页）。
  3. **结构**：桌面是居中卡片，窄屏（≤820px）切成**全屏**——同一个 DOM，靠 CSS 断点变形。
     这正是"一个组件适配所有主题"的做法：**换皮不换骨**。

  如果将来某个包要做成完全不同的交互（例如掌上版改成语音输入），那才需要把它下沉成
  `themes/<包>/<设备>/palette/index.vue` 的版式 —— 那时再动，现在没必要为它付代价。

  @author yijiu2025
  @since 2026-11-15
-->
<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="open" class="palette-mask" @click.self="closePalette">
        <div
          ref="panel"
          class="palette"
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
          @keydown="onKeydown"
        >
          <div class="palette__search">
            <AppIcon name="search" :size="15" />
            <input
              ref="input"
              v-model="query"
              class="palette__input"
              type="text"
              placeholder="搜索页面、用户或动作…"
              autocomplete="off"
              spellcheck="false"
              aria-label="搜索"
            />
            <span v-if="searching" class="palette__loading">搜索中</span>
            <kbd class="palette__kbd">Esc</kbd>
          </div>

          <div ref="list" class="palette__list">
            <template v-for="group in grouped" :key="group.name">
              <p class="palette__group">{{ group.name }}</p>
              <button
                v-for="entry in group.items"
                :key="entry.key"
                :ref="el => trackItem(entry.key, el)"
                type="button"
                :class="['palette__item', { 'is-on': indexOf(entry) === activeIndex }]"
                @click="entry.run()"
                @mouseenter="activeIndex = indexOf(entry)"
              >
                <span class="palette__icon">
                  <!--
                    优先头像首字（用户），其次图标，最后**名称首字**。
                    兜底成名称首字而不是空心圆：菜单的 icon 是库里的自由文本，
                    没登记过的名字很常见，一排空心圆看着像坏了。
                  -->
                  <span v-if="entry.initial" class="palette__initial">{{ entry.initial }}</span>
                  <AppIcon v-else-if="hasIcon(entry.icon)" :name="entry.icon" :size="15" />
                  <span v-else class="palette__initial">{{ entry.label.slice(0, 1) }}</span>
                </span>
                <span class="palette__label">{{ entry.label }}</span>
                <span v-if="entry.sub" class="palette__sub">{{ entry.sub }}</span>
              </button>
            </template>

            <p v-if="entries.length === 0" class="palette__empty">
              {{ query.trim() ? '没有匹配的结果' : '开始输入以搜索' }}
            </p>
          </div>

          <div class="palette__foot">
            <span>↑ ↓ 选择</span>
            <span>Enter 打开</span>
            <span>Esc 关闭</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { hasIcon } from '@/components/ui/icon-registry';
import { createFocusTrap } from '@/composables/useFocusTrap';
import { useCommandPalette, type PaletteEntry } from '@/composables/useCommandPalette';

/*
 * 🔴 这里的解构是安全的：composable 返回的是 ref / computed（本身就是响应式的容器），
 *    与 pinia store 那种"解构即快照"的情况不同。
 */
const { open, query, activeIndex, entries, grouped, searching, closePalette, move, commit } = useCommandPalette();

const panel = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
const trap = createFocusTrap();

/** 高亮项的元素（滚动到可视区用） */
const itemEls = new Map<string, HTMLElement>();

/**
 * 收集列表项元素（`ref` 回调）
 *
 * @param key 结果 key
 * @param el 元素（卸载时为 null）
 */
function trackItem(key: string, el: unknown): void {
  if (el instanceof HTMLElement) itemEls.set(key, el);
  else itemEls.delete(key);
}

/**
 * 结果在**全局扁平列表**里的位置
 *
 * 键盘上下键走的是扁平顺序，而渲染按分组 —— 两边必须用同一套编号，
 * 否则高亮会"跳组"。
 *
 * @param entry 结果项
 * @returns 索引
 */
function indexOf(entry: PaletteEntry): number {
  return entries.value.indexOf(entry);
}

/**
 * 键盘处理
 *
 * @param event 键盘事件
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    commit();
  }
}

/** 面板打开：装焦点陷阱 + 聚焦输入框；关闭：卸掉 */
watch(open, async value => {
  if (!value) {
    trap.deactivate();
    itemEls.clear();
    return;
  }
  await nextTick();
  trap.activate(panel.value);
  input.value?.focus({ preventScroll: true });
});

/** 高亮变化：把当前项滚进可视区（列表可能比面板高） */
watch(activeIndex, async () => {
  await nextTick();
  const current = entries.value[activeIndex.value];
  if (!current) return;
  itemEls.get(current.key)?.scrollIntoView({ block: 'nearest' });
});
</script>

<style scoped>
.palette-mask {
  position: fixed;
  inset: 0;
  z-index: var(--layer-overlay, 200);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 16px;
  background: var(--mauth-overlay, rgba(16, 20, 24, 0.28));
}

.palette {
  width: min(560px, 100%);
  max-height: min(520px, 76vh);
  display: flex;
  flex-direction: column;
  border-radius: var(--mauth-radius-lg);
  background: var(--mauth-panel-bg, var(--mauth-surface));
  box-shadow:
    inset 0 0 0 1px var(--mauth-border),
    0 18px 46px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.palette__search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--mauth-border);
  color: var(--mauth-text-faint);
}

.palette__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--mauth-text);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.palette__input::placeholder {
  color: var(--mauth-text-faint);
}

.palette__loading {
  color: var(--mauth-text-faint);
  font-size: 11px;
}

.palette__kbd {
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-soft);
  font-family: var(--font-mono);
  font-size: 11px;
}

.palette__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0 8px;
}

.palette__group {
  margin: 8px 0 2px;
  padding: 0 16px;
  color: var(--mauth-text-faint);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.palette__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 12px);
  margin: 1px 6px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--mauth-radius-sm);
  background: none;
  color: var(--mauth-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

/*
 * 高亮 = 浅主色底 + 左侧一道主色条（"玻璃滑块"的简化版）。
 * 只在一条上出现，视觉上就跟着键盘"滑"。
 */
.palette__item.is-on {
  background: var(--mauth-primary-soft);
  box-shadow: inset 2px 0 0 var(--mauth-primary);
}

.palette__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--mauth-surface-2);
  color: var(--mauth-text-mid);
}

.palette__initial {
  font-size: 11px;
  color: var(--mauth-text-mid);
}

.palette__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.palette__sub {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mauth-text-faint);
  font-size: 11px;
}

.palette__empty {
  margin: 0;
  padding: 26px 16px;
  color: var(--mauth-text-faint);
  font-size: 13px;
  text-align: center;
}

.palette__foot {
  display: flex;
  gap: 14px;
  padding: 9px 16px;
  border-top: 1px solid var(--mauth-border);
  background: var(--mauth-surface-2);
  color: var(--mauth-text-soft);
  font-size: 11px;
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.16s ease;
}

.palette-enter-active .palette,
.palette-leave-active .palette {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}

.palette-enter-from .palette,
.palette-leave-to .palette {
  transform: translateY(-6px) scale(0.99);
}

/*
 * 窄屏：同一个 DOM 变全屏。
 * 手机上"居中卡片 + 12vh 上边距"会让结果区只剩两三行，翻起来像在挤牙膏。
 */
@media (max-width: 820px) {
  .palette-mask {
    padding: 0;
  }

  .palette {
    width: 100%;
    max-height: 100%;
    height: 100%;
    border-radius: 0;
  }

  .palette__foot {
    padding-bottom: max(9px, env(safe-area-inset-bottom));
  }
}

@media (prefers-reduced-motion: reduce) {
  .palette-enter-active,
  .palette-leave-active,
  .palette-enter-active .palette,
  .palette-leave-active .palette {
    transition: none;
  }
}
</style>
