<template>
  <PanelSection title="橡皮擦工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L11 20"/>
        <path d="M6 12l6-6"/>
      </svg>
    </template>

    <!-- 橡皮擦设置 -->
    <div class="section-label">橡皮擦设置</div>
    <div class="slider-group">
      <label class="slider-label">橡皮擦大小</label>
      <div class="slider-row">
        <input type="range" :value="eraserSize"
          @input="$emit('update:eraserSize', Number(($event.target as HTMLInputElement).value))"
          @mouseup="$emit('saveState')"
          @touchend="$emit('saveState')"
          min="5" max="100" />
        <span class="slider-val">{{ eraserSize }}px</span>
      </div>
    </div>

    <!-- 橡皮擦透明度 -->
    <div class="slider-group">
      <label class="slider-label">透明度</label>
      <div class="slider-row">
        <input type="range" :value="eraserOpacity"
          @input="$emit('update:eraserOpacity', Number(($event.target as HTMLInputElement).value))"
          @mouseup="$emit('saveState')"
          @touchend="$emit('saveState')"
          min="10" max="100" />
        <span class="slider-val">{{ eraserOpacity }}%</span>
      </div>
    </div>

    <!-- 硬度 -->
    <div class="slider-group">
      <label class="slider-label">硬度</label>
      <div class="slider-row">
        <input type="range" :value="eraserHardness"
          @input="$emit('update:eraserHardness', Number(($event.target as HTMLInputElement).value))"
          @mouseup="$emit('saveState')"
          @touchend="$emit('saveState')"
          min="0" max="100" />
        <span class="slider-val">{{ eraserHardness === 0 ? '软' : eraserHardness === 100 ? '硬' : eraserHardness + '%' }}</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 橡皮擦形状 -->
    <div class="section-label">橡皮擦形状</div>
    <div class="shape-grid">
      <button class="shape-btn" :class="{ active: eraserShape === 'circle' }" @click="$emit('update:eraserShape', 'circle')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <span>圆形</span>
      </button>
      <button class="shape-btn" :class="{ active: eraserShape === 'square' }" @click="$emit('update:eraserShape', 'square')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
        <span>方形</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 擦除模式 -->
    <div class="section-label">擦除模式</div>
    <div class="mode-grid">
      <button class="mode-btn" :class="{ active: eraserMode === 'all' }" @click="$emit('update:eraserMode', 'all')">
        <span>全部擦除</span>
      </button>
      <button class="mode-btn" :class="{ active: eraserMode === 'brush' }" @click="$emit('update:eraserMode', 'brush')">
        <span>仅画笔</span>
      </button>
      <button class="mode-btn" :class="{ active: eraserMode === 'shape' }" @click="$emit('update:eraserMode', 'shape')">
        <span>仅形状</span>
      </button>
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  eraserSize: number
  eraserOpacity: number
  eraserHardness: number
  eraserShape: string
  eraserMode: string
}>()

defineEmits(['update:eraserSize', 'update:eraserOpacity', 'update:eraserHardness', 'update:eraserShape', 'update:eraserMode', 'saveState'])

const shortcuts = [
  { keys: ['Ctrl', 'Z'], label: '撤销' },
  { keys: ['Delete'], label: '删除选中' }
]
</script>

<style scoped>
.section-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

.panel-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0; }

.shape-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.shape-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.shape-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.shape-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}
.shape-btn span { font-size: 11px; font-weight: 500; }

.mode-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mode-btn {
  padding: 8px 6px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
  text-align: center;
}
.mode-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.mode-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}
.mode-btn span { font-size: 11px; font-weight: 500; }
</style>
