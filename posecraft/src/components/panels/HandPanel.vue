<template>
  <PanelSection title="视图控制" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M18 11V6a2 2 0 0 0-4 0v1"/>
        <path d="M14 10V4a2 2 0 0 0-4 0v2"/>
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
      </svg>
    </template>

    <!-- 缩放显示 -->
    <div class="zoom-display">
      <span class="zoom-value">{{ zoomPercent }}%</span>
    </div>

    <!-- 缩放按钮 -->
    <div class="zoom-btns">
      <button class="zoom-action-btn" @click="$emit('zoomOut')" title="缩小">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <button class="zoom-action-btn" @click="$emit('resetZoom')" title="重置 100%">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          <path d="M10 7v6m3-3H7"/>
        </svg>
      </button>
      <button class="zoom-action-btn" @click="$emit('zoomIn')" title="放大">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>

    <!-- 缩放滑块 -->
    <div class="slider-group">
      <input type="range" :value="zoomSlider" @input="$emit('update:zoomSlider', Number(($event.target as HTMLInputElement).value))" min="10" max="500" />
    </div>

    <div class="panel-divider"></div>

    <!-- 快速缩放 -->
    <div class="section-label">快速缩放</div>
    <div class="preset-grid">
      <button v-for="p in presets" :key="p.value" class="preset-btn" :class="{ active: zoomPercent === p.value }" @click="$emit('update:zoomSlider', p.value)">
        {{ p.label }}
      </button>
    </div>

    <!-- 适应屏幕 -->
    <div class="fit-actions">
      <button class="fit-btn" @click="$emit('fitToScreen')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
        适应屏幕
      </button>
      <button class="fit-btn" @click="$emit('resetZoom')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          <path d="M10 7v6m3-3H7"/>
        </svg>
        实际大小
      </button>
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  zoomPercent: number
  zoomSlider: number
}>()

defineEmits(['zoomIn', 'zoomOut', 'resetZoom', 'update:zoomSlider', 'fitToScreen'])

const presets = [
  { value: 50, label: '50%' },
  { value: 75, label: '75%' },
  { value: 100, label: '100%' },
  { value: 150, label: '150%' },
  { value: 200, label: '200%' }
]

const shortcuts = [
  { keys: ['滚轮'], label: '缩放' },
  { keys: ['拖拽'], label: '平移画布' },
  { keys: ['Ctrl', '='], label: '放大' },
  { keys: ['Ctrl', '-'], label: '缩小' },
  { keys: ['Ctrl', '0'], label: '重置' },
  { keys: ['H'], label: '切换抓手' }
]
</script>

<style scoped>
.zoom-display {
  text-align: center; margin-bottom: 16px;
}
.zoom-value {
  font-size: 40px; font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.zoom-btns {
  display: flex; justify-content: center; gap: 10px; margin-bottom: 12px;
}
.zoom-action-btn {
  width: 44px; height: 44px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; color: #94a3b8; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.zoom-action-btn:hover {
  background: rgba(255,255,255,0.08); color: #e2e8f0;
  border-color: rgba(255,255,255,0.15);
}

.slider-group {
  margin-bottom: 16px;
}
input[type=range] {
  width: 100%; height: 4px;
  background: rgba(255,255,255,0.08); border-radius: 4px;
  appearance: none; -webkit-appearance: none; cursor: pointer;
}
input[type=range]::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 16px; height: 16px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 50%; cursor: pointer;
  box-shadow: 0 2px 8px rgba(99,102,241,0.4);
}

.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}

.preset-grid {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px;
}
.preset-btn {
  padding: 8px 4px; font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #94a3b8; cursor: pointer;
  transition: all 0.15s; text-align: center;
}
.preset-btn:hover {
  background: rgba(255,255,255,0.08); color: #e2e8f0;
  border-color: rgba(255,255,255,0.15);
}
.preset-btn.active {
  background: rgba(99,102,241,0.15); color: #818cf8;
  border-color: rgba(99,102,241,0.3);
}

.fit-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.fit-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; font-size: 12px; font-weight: 500;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #94a3b8; cursor: pointer;
  transition: all 0.15s;
}
.fit-btn:hover {
  background: rgba(255,255,255,0.08); color: #e2e8f0;
  border-color: rgba(255,255,255,0.15);
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}
</style>
