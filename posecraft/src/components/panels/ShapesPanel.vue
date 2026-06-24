<template>
  <PanelSection title="形状工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      </svg>
    </template>

    <!-- 基础形状 -->
    <div class="section-label">基础形状</div>
    <div class="tool-grid">
      <button class="grid-btn" :class="{ active: canvasTool === 'line' }" @click="$emit('setDrawTool', 'line')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="5" y1="19" x2="19" y2="5"/>
        </svg>
        <span>直线</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'arrow' }" @click="$emit('setDrawTool', 'arrow')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="5" y1="19" x2="19" y2="5"/>
          <polyline points="13 5 19 5 19 11"/>
        </svg>
        <span>箭头</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'rect' }" @click="$emit('setDrawTool', 'rect')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        </svg>
        <span>矩形</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'circle' }" @click="$emit('setDrawTool', 'circle')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        <span>圆形</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'triangle' }" @click="$emit('setDrawTool', 'triangle')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polygon points="12 2 22 22 2 22"/>
        </svg>
        <span>三角形</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'star' }" @click="$emit('setDrawTool', 'star')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span>星形</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'polygon' }" @click="$emit('setDrawTool', 'polygon')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
        </svg>
        <span>六边形</span>
      </button>
    </div>
    <div class="hint-text">按住 Ctrl 绘制正方形/正圆</div>

    <div class="panel-divider"></div>

    <!-- 形状样式 -->
    <div class="section-label">形状样式</div>
    <!-- 描边粗细 -->
    <div class="slider-group">
      <label class="slider-label">描边粗细</label>
      <div class="slider-row">
        <input type="range" :value="strokeWidth" @input="$emit('update:strokeWidth', Number(($event.target as HTMLInputElement).value))" min="1" max="20" />
        <span class="slider-val">{{ strokeWidth }}px</span>
      </div>
    </div>
    <!-- 填充颜色 -->
    <div class="color-option">
      <label class="color-label">填充颜色</label>
      <div class="color-row">
        <button class="color-toggle" :class="{ active: !noFill }" @click="$emit('update:noFill', false)">
          <div class="color-preview" :style="{ background: fillColor }"></div>
          <span>填充</span>
        </button>
        <button class="color-toggle" :class="{ active: noFill }" @click="$emit('update:noFill', true)">
          <div class="color-preview empty"></div>
          <span>无填充</span>
        </button>
      </div>
      <div v-if="!noFill" class="fill-color-picker">
        <div class="color-swatch-lg">
          <input type="color" :value="fillColor" @input="$emit('update:fillColor', ($event.target as HTMLInputElement).value)" id="fill-color-picker" />
          <label for="fill-color-picker" class="swatch-lg" :style="{ background: fillColor }"></label>
        </div>
        <div class="preset-colors">
          <button v-for="c in presetColors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:fillColor', c)"></button>
        </div>
      </div>
    </div>
    <!-- 虚线样式 -->
    <div class="color-option">
      <label class="color-label">线条样式</label>
      <div class="line-styles">
        <button class="style-btn" :class="{ active: lineStyle === 'solid' }" @click="$emit('update:lineStyle', 'solid')">
          <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="style-btn" :class="{ active: lineStyle === 'dashed' }" @click="$emit('update:lineStyle', 'dashed')">
          <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="2" stroke-dasharray="6,4"/></svg>
        </button>
        <button class="style-btn" :class="{ active: lineStyle === 'dotted' }" @click="$emit('update:lineStyle', 'dotted')">
          <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="2" stroke-dasharray="2,4"/></svg>
        </button>
      </div>
    </div>
    <!-- 透明度 -->
    <div class="slider-group">
      <label class="slider-label">透明度</label>
      <div class="slider-row">
        <input type="range" :value="shapeOpacity" @input="$emit('update:shapeOpacity', Number(($event.target as HTMLInputElement).value))" min="10" max="100" />
        <span class="slider-val">{{ shapeOpacity }}%</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 构图参考线 -->
    <div class="section-label">构图参考线</div>
    <div class="tool-grid guide-grid">
      <button v-for="guide in guides" :key="guide.type" class="grid-btn" :class="{ active: activeGuide === guide.type }" @click="$emit('toggleGuide', guide.type)">
        <span class="guide-icon">{{ guide.icon }}</span>
        <span>{{ guide.label }}</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 操作 -->
    <div class="section-label">操作</div>
    <button class="danger-btn" @click="$emit('deleteGuides')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      清除参考线
    </button>
    <button class="danger-btn" @click="$emit('clearCanvas')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      清空画布
    </button>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  activeTool?: string
  canvasTool?: string
  strokeWidth?: number
  fillColor?: string
  noFill?: boolean
  lineStyle?: string
  shapeOpacity?: number
  presetColors?: string[]
  activeGuide?: string | null
}>()

defineEmits(['addShape', 'drawReference', 'deleteGuides', 'clearCanvas', 'setDrawTool', 'toggleGuide', 'update:strokeWidth', 'update:fillColor', 'update:noFill', 'update:lineStyle', 'update:shapeOpacity'])

const guides = [
  { type: 'thirds', icon: '▦', label: '三分法' },
  { type: 'golden', icon: '⬡', label: '黄金比例' },
  { type: 'diagonal', icon: '╳', label: '对角线' },
  { type: 'center', icon: '⊕', label: '中心点' },
  { type: 'phi', icon: '◇', label: 'φ 网格' },
  { type: 'spiral', icon: '🌀', label: '黄金螺旋' },
  { type: 'all', icon: '⊞', label: '全部' }
]

const shortcuts = [
  { keys: ['Ctrl', 'Z'], label: '撤销' },
  { keys: ['Delete'], label: '删除选中' },
  { keys: ['H'], label: '抓手工具' },
  { keys: ['滚轮'], label: '缩放' }
]
</script>

<style scoped>
.tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.guide-grid { grid-template-columns: repeat(3, 1fr); }
.grid-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.grid-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.grid-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
  box-shadow: 0 0 12px rgba(99,102,241,0.15);
}
.grid-btn span { font-size: 11px; font-weight: 500; }

.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 10px;
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}

.guide-icon { font-size: 16px; }

.hint-text {
  font-size: 11px; color: #4a5568; text-align: center;
  margin-top: 8px; padding: 4px 8px;
  background: rgba(255,255,255,0.02);
  border-radius: 6px;
}

/* 滑块样式 */
.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; -webkit-appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

/* 颜色选项 */
.color-option { margin-bottom: 12px; }
.color-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.color-row { display: flex; gap: 8px; margin-bottom: 10px; }
.color-toggle {
  flex: 1; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s; font-size: 12px;
}
.color-toggle:hover { background: rgba(255,255,255,0.06); }
.color-toggle.active {
  background: rgba(99,102,241,0.15);
  border-color: rgba(99,102,241,0.4);
  color: #a5b4fc;
}
.color-preview {
  width: 20px; height: 20px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.2);
}
.color-preview.empty {
  background: linear-gradient(45deg, #fff 40%, transparent 40%, transparent 60%, #fff 60%);
  opacity: 0.3;
}
.fill-color-picker { display: flex; align-items: center; gap: 12px; }
.color-swatch-lg { position: relative; }
.color-swatch-lg input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-lg {
  width: 36px; height: 36px; border-radius: 8px;
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

/* 线条样式 */
.line-styles { display: flex; gap: 8px; }
.style-btn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 10px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s;
}
.style-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.style-btn.active {
  background: rgba(99,102,241,0.15);
  border-color: rgba(99,102,241,0.4);
  color: #a5b4fc;
}

.danger-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px; color: #f87171; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s; margin-bottom: 8px;
}
.danger-btn:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }
</style>
