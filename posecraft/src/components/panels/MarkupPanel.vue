<template>
  <PanelSection title="标注工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      </svg>
    </template>

    <!-- 绘图工具 -->
    <div class="section-label">绘图工具</div>
    <div class="tool-grid">
      <button v-for="tool in tools" :key="tool.id" class="grid-btn" :class="{ active: currentTool === tool.id }" @click="$emit('setTool', tool.id)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path v-if="tool.icon === 'select'" d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          <path v-else-if="tool.icon === 'draw'" d="M12 19l7-7 3 3-7 7-3-3z"/>
          <line v-else-if="tool.icon === 'line'" x1="5" y1="19" x2="19" y2="5"/>
          <path v-else-if="tool.icon === 'eraser'" d="M20 20H7L3 16l9-9 8 8-4 4z"/>
        </svg>
        <span>{{ tool.label }}</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 参数调节 -->
    <div class="section-label">画笔设置</div>
    <div class="slider-group">
      <label class="slider-label">画笔粗细</label>
      <div class="slider-row">
        <input type="range" :value="brushSize" @input="$emit('update:brushSize', Number(($event.target as HTMLInputElement).value))" min="1" max="50" />
        <span class="slider-val">{{ brushSize }}px</span>
      </div>
    </div>
    <div class="slider-group">
      <label class="slider-label">橡皮擦大小</label>
      <div class="slider-row">
        <input type="range" :value="eraserSize" @input="$emit('update:eraserSize', Number(($event.target as HTMLInputElement).value))" min="5" max="100" />
        <span class="slider-val">{{ eraserSize }}px</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 颜色 -->
    <div class="section-label">画笔颜色</div>
    <div class="color-section">
      <div class="color-row">
        <div class="color-swatch-lg">
          <input type="color" :value="currentColor" @input="$emit('update:currentColor', ($event.target as HTMLInputElement).value)" id="color-picker-lg" />
          <label for="color-picker-lg" class="swatch-lg" :style="{ background: currentColor }"></label>
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
  currentTool: string
  brushSize: number
  eraserSize: number
  currentColor: string
  presetColors: string[]
}>()

defineEmits(['setTool', 'update:brushSize', 'update:eraserSize', 'update:currentColor'])

const tools = [
  { id: 'select', icon: 'select', label: '选择' },
  { id: 'draw', icon: 'draw', label: '画笔' },
  { id: 'line', icon: 'line', label: '直线' },
  { id: 'eraser', icon: 'eraser', label: '橡皮擦' }
]

const shortcuts = [
  { keys: ['Ctrl', 'Z'], label: '撤销' },
  { keys: ['Ctrl', 'Y'], label: '重做' },
  { keys: ['Delete'], label: '删除选中' },
  { keys: ['H'], label: '抓手工具' }
]
</script>

<style scoped>
.tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.grid-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.grid-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.grid-btn.active { background: rgba(99,102,241,0.12); color: #818cf8; border-color: rgba(99,102,241,0.3); }
.grid-btn span { font-size: 11px; font-weight: 500; }

.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; -webkit-appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 10px;
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}

.color-section { margin-bottom: 16px; }
.color-row { display: flex; align-items: center; gap: 12px; }
.color-swatch-lg { position: relative; }
.color-swatch-lg input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-lg {
  width: 40px; height: 40px; border-radius: 10px;
  border: 2px solid rgba(255,255,255,0.1); cursor: pointer;
  display: block; transition: all 0.2s;
}
.swatch-lg:hover { border-color: rgba(99,102,241,0.5); }
.preset-colors { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-color {
  width: 24px; height: 24px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1); cursor: pointer;
  transition: all 0.15s;
}
.preset-color:hover { transform: scale(1.15); border-color: rgba(255,255,255,0.3); }
</style>
