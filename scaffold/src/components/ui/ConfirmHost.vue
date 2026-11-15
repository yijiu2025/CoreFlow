<!--
  全局确认框宿主（挂在 App 根，全局唯一）

  复用 `.modal-mask` / `.modal` 这套既有样式，保证与业务弹窗长得一样 —— 用户不该
  因为"这是系统确认框"就看到另一种视觉。

  @author yijiu2025
  @since 2026-11-15
-->
<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="confirm.pending" class="modal-mask" @click.self="confirm.settle(false)">
        <div
          ref="panel"
          class="modal modal--confirm"
          role="alertdialog"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-message"
          @keydown.esc.stop.prevent="confirm.settle(false)"
        >
          <header class="modal__head">
            <h3 id="confirm-title" class="modal__title">{{ confirm.pending.title }}</h3>
          </header>

          <div class="modal__body">
            <p id="confirm-message" class="confirm__text">{{ confirm.pending.message }}</p>
          </div>

          <footer class="modal__foot">
            <button type="button" class="btn" @click="confirm.settle(false)">取消</button>
            <button
              ref="okButton"
              type="button"
              :class="['btn', confirm.pending.danger ? 'btn--danger' : 'btn--primary']"
              @click="confirm.settle(true)"
            >
              {{ confirm.pending.confirmText ?? '确定' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useConfirmStore } from '@/stores/confirm';
import { createFocusTrap } from '@/composables/useFocusTrap';

const confirm = useConfirmStore();

/** 弹窗根元素（焦点陷阱的容器） */
const panel = ref<HTMLElement | null>(null);

/** 确认按钮（默认聚焦它：Enter 直接确认，比"先 Tab 一下"顺手） */
const okButton = ref<HTMLButtonElement | null>(null);

/** 每个宿主实例一条陷阱（模块级栈负责多层嵌套） */
const trap = createFocusTrap();

watch(
  () => confirm.pending,
  async pending => {
    if (!pending) {
      trap.deactivate();
      return;
    }
    await nextTick();
    trap.activate(panel.value);
    /*
     * 默认焦点：
     *   · 普通操作 → 聚焦"确认"（用户本来就是要做这件事，Enter 一步到位）；
     *   · **危险操作 → 留在"取消"**（陷阱激活时默认聚焦第一个可聚焦元素，正好是它）。
     *     删除类操作不该让手快的用户连按两下 Enter 就删掉数据。
     */
    if (!pending.danger) okButton.value?.focus({ preventScroll: true });
  }
);
</script>

<style scoped>
.modal--confirm {
  /* 确认框不该太宽：一行字读起来才像"一句话问你" */
  width: min(420px, 100%);
}

.confirm__text {
  margin: 0;
  color: var(--mauth-text-mid);
  font-size: 13px;
  line-height: 1.65;
}

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.18s ease;
}

.confirm-enter-active .modal,
.confirm-leave-active .modal {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}

.confirm-enter-from .modal,
.confirm-leave-to .modal {
  transform: translateY(6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .confirm-enter-active,
  .confirm-leave-active,
  .confirm-enter-active .modal,
  .confirm-leave-active .modal {
    transition: none;
  }
}
</style>
