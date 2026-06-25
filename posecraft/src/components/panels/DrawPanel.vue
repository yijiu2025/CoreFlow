<template>
  <PanelSection title="画笔工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
      </svg>
    </template>

    <!-- 画笔设置 -->
    <div class="section-label">画笔设置</div>
    <div class="slider-group">
      <label class="slider-label">画笔粗细</label>
      <div class="slider-row">
        <input type="range" :value="brushSize" @input="$emit('update:brushSize', Number(($event.target as HTMLInputElement).value))" min="1" max="50" />
        <span class="slider-val">{{ brushSize }}px</span>
      </div>
    </div>

    <div class="slider-group">
      <label class="slider-label">羽化</label>
      <div class="slider-row">
        <input type="range" :value="brushFeather" @input="$emit('update:brushFeather', Number(($event.target as HTMLInputElement).value))" min="0" max="30" />
        <span class="slider-val">{{ brushFeather === 0 ? '无' : brushFeather + 'px' }}</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 画笔颜色 -->
    <div class="section-label">画笔颜色</div>
    <div class="color-section">
      <div class="color-row">
        <div class="color-swatch-lg">
          <input type="color" :value="currentColor" @input="$emit('update:currentColor', ($event.target as HTMLInputElement).value)" id="draw-color-picker" />
          <label for="draw-color-picker" class="swatch-lg" :style="{ background: currentColor }"></label>
        </div>
        <div class="preset-colors">
          <button v-for="c in presetColors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:currentColor', c)"></button>
        </div>
      </div>
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  brushSize: number
  brushFeather: number
  currentColor: string
  presetColors: string[]
}>()

defineEmits(['update:brushSize', 'update:brushFeather', 'update:currentColor'])

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

.color-section { margin-bottom: 12px; }
.color-row { display: flex; align-items: center; gap: 12px; }
.color-swatch-lg { position: relative; }
.color-swatch-lg input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-lg { width: 40px; height: 40px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.1); cursor: pointer; display: block; transition: all 0.2s; }
.swatch-lg:hover { border-color: rgba(99,102,241,0.5); }
.preset-colors { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-color { width: 24px; height: 24px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.15s; }
.preset-color:hover { transform: scale(1.15); border-color: rgba(255,255,255,0.3); }
</style>
