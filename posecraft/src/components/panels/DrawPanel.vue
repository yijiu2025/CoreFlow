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
      <label class="slider-label">透明度</label>
      <div class="slider-row">
        <input type="range" :value="brushOpacity" @input="$emit('update:brushOpacity', Number(($event.target as HTMLInputElement).value))" min="10" max="100" />
        <span class="slider-val">{{ brushOpacity }}%</span>
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

    <!-- 画笔样式 -->
    <div class="section-label">画笔样式</div>
    <div class="style-grid">
      <button class="style-btn" :class="{ active: brushStyle === 'solid' }" @click="$emit('update:brushStyle', 'solid')">
        <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="3"/></svg>
        <span>实线</span>
      </button>
      <button class="style-btn" :class="{ active: brushStyle === 'dashed' }" @click="$emit('update:brushStyle', 'dashed')">
        <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="3" stroke-dasharray="6,4"/></svg>
        <span>虚线</span>
      </button>
      <button class="style-btn" :class="{ active: brushStyle === 'dotted' }" @click="$emit('update:brushStyle', 'dotted')">
        <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="3" stroke-dasharray="2,4"/></svg>
        <span>点线</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 混合模式 -->
    <div class="section-label">混合模式</div>
    <div class="blend-modes">
      <button v-for="mode in blendModes" :key="mode.value" class="blend-btn" :class="{ active: brushBlend === mode.value }" @click="$emit('update:brushBlend', mode.value)">
        {{ mode.label }}
      </button>
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
  brushOpacity: number
  brushFeather: number
  brushStyle: string
  brushBlend: string
  currentColor: string
  presetColors: string[]
}>()

defineEmits(['update:brushSize', 'update:brushOpacity', 'update:brushFeather', 'update:brushStyle', 'update:brushBlend', 'update:currentColor'])

const blendModes = [
  { value: 'source-over', label: '正常' },
  { value: 'multiply', label: '叠加' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '柔光' },
  { value: 'darken', label: '变暗' },
  { value: 'lighten', label: '变亮' }
]

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

/* 画笔样式 */
.style-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.style-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.style-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.style-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}
.style-btn span { font-size: 11px; font-weight: 500; }

/* 混合模式 */
.blend-modes { display: flex; flex-wrap: wrap; gap: 6px; }
.blend-btn {
  padding: 6px 12px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s; font-size: 11px;
}
.blend-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.blend-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}
</style>
