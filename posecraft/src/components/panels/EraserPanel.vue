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
        <input type="range" :value="eraserSize" @input="$emit('update:eraserSize', Number(($event.target as HTMLInputElement).value))" min="5" max="100" />
        <span class="slider-val">{{ eraserSize }}px</span>
      </div>
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  eraserSize: number
}>()

defineEmits(['update:eraserSize'])

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
</style>
