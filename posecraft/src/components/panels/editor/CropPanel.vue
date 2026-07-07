<template>
  <PanelSection title="裁剪图片" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
        <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
      </svg>
    </template>

    <!-- 裁剪比例 -->
    <div class="section-label">裁剪比例</div>
    <div class="ratio-grid">
      <button class="ratio-btn" :class="{ active: cropAspectRatio === null }" @click="$emit('update:cropAspectRatio', null)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
        <span>自由</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 1 }" @click="$emit('update:cropAspectRatio', 1)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
        <span>1:1</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 4/3 }" @click="$emit('update:cropAspectRatio', 4/3)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="5" width="20" height="15" rx="2"/>
        </svg>
        <span>4:3</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 16/9 }" @click="$emit('update:cropAspectRatio', 16/9)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="6" width="22" height="12" rx="2"/>
        </svg>
        <span>16:9</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 3/2 }" @click="$emit('update:cropAspectRatio', 3/2)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
        </svg>
        <span>3:2</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 9/16 }" @click="$emit('update:cropAspectRatio', 9/16)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="1" width="12" height="22" rx="2"/>
        </svg>
        <span>9:16</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 操作按钮 -->
    <div class="section-label">操作</div>
    <div class="action-btns">
      <button class="confirm-btn" @click="$emit('confirmCrop')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        确认裁剪
      </button>
      <button class="cancel-btn" @click="$emit('cancelCrop')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        取消
      </button>
    </div>

    <div class="panel-divider"></div>

    <div class="hint-text">
      拖拽裁剪框调整位置和大小
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  cropAspectRatio: number | null
}>()

defineEmits(['update:cropAspectRatio', 'confirmCrop', 'cancelCrop'])

const shortcuts = [
  { keys: ['Enter'], label: '确认裁剪' },
  { keys: ['Esc'], label: '取消裁剪' }
]
</script>

<style scoped>
.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 10px;
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}

.ratio-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}

.ratio-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.ratio-btn:hover {
  background: rgba(255,255,255,0.06); color: #e2e8f0;
  border-color: rgba(255,255,255,0.1);
}
.ratio-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
  box-shadow: 0 0 12px rgba(99,102,241,0.15);
}
.ratio-btn span { font-size: 11px; font-weight: 500; }

.action-btns { display: flex; flex-direction: column; gap: 8px; }

.confirm-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none; border-radius: 10px; color: #fff; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(99,102,241,0.3);
}
.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99,102,241,0.4);
}

.cancel-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
  color: #94a3b8; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.cancel-btn:hover {
  background: rgba(255,255,255,0.06); color: #e2e8f0;
}

.hint-text {
  font-size: 11px; color: #4a5568; text-align: center;
  padding: 8px; background: rgba(255,255,255,0.02);
  border-radius: 6px;
}
</style>
