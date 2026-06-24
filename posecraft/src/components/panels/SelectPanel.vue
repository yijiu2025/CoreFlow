<template>
  <PanelSection title="选择工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        <path d="M12 12l4 10 2-6 6-2z"/>
      </svg>
    </template>

    <!-- 选中对象信息 -->
    <div v-if="selectedObject" class="section-label">选中对象</div>
    <div v-if="selectedObject" class="info-grid">
      <div class="info-item">
        <span class="info-label">类型</span>
        <span class="info-value">{{ objectTypeLabel }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">位置</span>
        <span class="info-value">{{ Math.round(selectedObject.left || 0) }}, {{ Math.round(selectedObject.top || 0) }}</span>
      </div>
    </div>
    <div v-else class="empty-hint">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:8px;opacity:0.4">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
        <path d="M12 12l4 10 2-6 6-2z"/>
      </svg>
      <p>点击画布上的对象进行选择</p>
    </div>

    <!-- 选中对象的颜色修改 -->
    <template v-if="selectedObject">
      <div class="panel-divider"></div>
      <div class="section-label">修改颜色</div>
      <div class="color-section">
        <div class="color-row">
          <div class="color-swatch-lg">
            <input type="color" :value="currentColor" @input="$emit('update:currentColor', ($event.target as HTMLInputElement).value)" id="select-color-picker" />
            <label for="select-color-picker" class="swatch-lg" :style="{ background: currentColor }"></label>
          </div>
          <div class="preset-colors">
            <button v-for="c in presetColors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:currentColor', c)"></button>
          </div>
        </div>
      </div>

      <!-- 画笔路径的属性调整 -->
      <template v-if="isBrushPath">
        <div class="panel-divider"></div>
        <div class="section-label">画笔属性</div>
        <!-- 线条粗细：仅对原始 path 对象有效 -->
        <div v-if="selectedObject?.type === 'path'" class="slider-group">
          <label class="slider-label">线条粗细</label>
          <div class="slider-row">
            <input type="range" :value="selectedObject?.strokeWidth || 3" @input="$emit('update:pathStrokeWidth', Number(($event.target as HTMLInputElement).value))" min="1" max="50" />
            <span class="slider-val">{{ selectedObject?.strokeWidth || 3 }}px</span>
          </div>
        </div>
        <!-- 大小：对画笔转图片的对象有效 -->
        <div v-if="selectedObject?.type === 'image'" class="slider-group">
          <label class="slider-label">大小</label>
          <div class="slider-row">
            <input type="range" :value="Math.round((selectedObject?.scaleX || 1) * 100)" @input="$emit('update:pathScale', Number(($event.target as HTMLInputElement).value) / 100)" min="10" max="300" />
            <span class="slider-val">{{ Math.round((selectedObject?.scaleX || 1) * 100) }}%</span>
          </div>
        </div>
        <div class="slider-group">
          <label class="slider-label">羽化</label>
          <div class="slider-row">
            <input type="range" :value="pathBlur" @input="$emit('update:pathBlur', Number(($event.target as HTMLInputElement).value))" min="0" max="30" />
            <span class="slider-val">{{ pathBlur === 0 ? '无' : pathBlur + 'px' }}</span>
          </div>
        </div>
      </template>
    </template>

    <div class="panel-divider"></div>

    <!-- 图层操作 -->
    <div class="section-label">图层操作</div>
    <div class="action-grid">
      <button class="action-btn" @click="$emit('bringToFront')" title="置顶">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="17 11 12 6 7 11"/>
          <polyline points="17 18 12 13 7 18"/>
        </svg>
        <span>置顶</span>
      </button>
      <button class="action-btn" @click="$emit('moveUp')" title="上移一层">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
        <span>上移</span>
      </button>
      <button class="action-btn" @click="$emit('moveDown')" title="下移一层">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <span>下移</span>
      </button>
      <button class="action-btn" @click="$emit('sendToBack')" title="置底">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="7 13 12 18 17 13"/>
          <polyline points="7 6 12 11 17 6"/>
        </svg>
        <span>置底</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 操作 -->
    <div class="section-label">操作</div>
    <div class="action-grid">
      <button class="action-btn" @click="$emit('copySelected')" title="复制">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>复制</span>
      </button>
      <button class="action-btn" @click="$emit('pasteClipboard')" title="粘贴">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
        <span>粘贴</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <button class="danger-btn" @click="$emit('deleteSelected')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      删除选中
    </button>
  </PanelSection>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PanelSection from './PanelSection.vue'

const props = defineProps<{
  selectedObject?: any
  currentColor: string
  presetColors: string[]
  pathBlur?: number
}>()

defineEmits(['deleteSelected', 'bringToFront', 'sendToBack', 'moveUp', 'moveDown', 'copySelected', 'pasteClipboard', 'update:currentColor', 'update:pathStrokeWidth', 'update:pathBlur', 'update:pathScale'])

/** 判断选中的是否为画笔路径（path 或带 isUserStroke 标记的图片） */
const isBrushPath = computed(() => {
  const obj = props.selectedObject
  if (!obj) return false
  // 原始路径对象
  if (obj.type === 'path' && obj.erasable === true) return true
  // 画笔转图片的对象（带 isUserStroke 标记）
  if (obj.type === 'image' && obj.isUserStroke === true) return true
  return false
})

const objectTypeLabel = computed(() => {
  if (!props.selectedObject) return ''
  const type = props.selectedObject.type
  const labels: Record<string, string> = {
    'i-text': '文字',
    'rect': '矩形',
    'circle': '圆形',
    'triangle': '三角形',
    'line': '线条',
    'path': '路径',
    'group': '组合',
    'image': '图片'
  }
  return labels[type] || type || '未知'
})

const shortcuts = [
  { keys: ['Delete'], label: '删除选中' },
  { keys: ['Ctrl', 'C'], label: '复制' },
  { keys: ['Ctrl', 'V'], label: '粘贴' },
  { keys: ['Ctrl', 'Z'], label: '撤销' }
]
</script>

<style scoped>
.section-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }

.info-grid { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.info-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 6px; }
.info-label { font-size: 12px; color: #64748b; }
.info-value { font-size: 12px; color: #e2e8f0; font-family: monospace; }

.empty-hint {
  font-size: 12px; color: #4a4a5a; text-align: center; padding: 24px 0;
  display: flex; flex-direction: column; align-items: center;
}

.color-section { margin-bottom: 12px; }
.color-row { display: flex; align-items: center; gap: 12px; }
.color-swatch-lg { position: relative; }
.color-swatch-lg input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-lg { width: 40px; height: 40px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.1); cursor: pointer; display: block; transition: all 0.2s; }
.swatch-lg:hover { border-color: rgba(99,102,241,0.5); }
.preset-colors { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-color { width: 24px; height: 24px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.15s; }
.preset-color:hover { transform: scale(1.15); border-color: rgba(255,255,255,0.3); }

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.action-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s;
}
.action-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.action-btn span { font-size: 11px; font-weight: 500; }

.panel-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0; }

.danger-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; color: #f87171; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.danger-btn:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }
</style>
