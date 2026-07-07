<template>
  <transition name="modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="save-modal glass-panel alert">
        <div class="modal-body alert-body">
          <div class="alert-icon">⚠️</div>
          <h3>确认退出？</h3>
          <p>当前修改尚未保存，退出后将丢失所有未发布的改动。</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn secondary" @click="emit('close')">继续编辑</button>
          <button class="modal-btn primary danger" @click="emit('confirm')">放弃并退出</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits(['close', 'confirm'])
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(5, 5, 10, 0.75);
  backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center;
  z-index: 9999; padding: 20px;
}
.save-modal {
  width: 100%; max-width: 460px; background: rgba(20, 20, 35, 0.85);
  border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7); backdrop-filter: blur(25px);
  display: flex; flex-direction: column; overflow: hidden;
  animation: modalScaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes modalScaleUp {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.modal-body {
  padding: 20px; display: flex; flex-direction: column; gap: 16px;
}
.modal-footer {
  padding: 16px 20px; display: flex; justify-content: flex-end; gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06); background: rgba(10, 10, 15, 0.2);
  align-items: center;
}
.modal-btn {
  padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
}
.modal-btn.primary.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626); color: #ffffff;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
}
.modal-btn.primary.danger:hover {
  transform: translateY(-1px); box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5);
}
.modal-btn.secondary {
  background: rgba(255, 255, 255, 0.04); border-color: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}
.modal-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.08); color: #e2e8f0;
}
.alert-body {
  align-items: center; text-align: center; padding: 30px 20px;
}
.alert-icon {
  font-size: 40px; margin-bottom: 12px;
}
.alert-body h3 {
  margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #f87171;
}
.alert-body p {
  margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;
}
.modal-enter-active, .modal-leave-active { transition: opacity 0.25s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
