<template>
  <transition name="float-panel">
    <div v-if="visible" class="float-panel style-float-panel" :style="panelStyle">
      <div class="panel-header" @mousedown="startDrag">
        <div class="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <span>样式</span>
        </div>
        <button class="close-btn" @click="$emit('close')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="panel-body">
        <!-- 描边粗细 -->
        <div class="slider-group">
          <label class="slider-label">描边粗细</label>
          <div class="slider-row">
            <input type="range" :value="strokeWidth"
              @input="$emit('update:strokeWidth', Number(($event.target as HTMLInputElement).value))"
              @mouseup="$emit('saveState')"
              @touchend="$emit('saveState')"
              min="1" max="20" />
            <span class="slider-val">{{ strokeWidth }}px</span>
          </div>
        </div>

        <!-- 描边透明度 -->
        <div class="slider-group">
          <label class="slider-label">描边透明度</label>
          <div class="slider-row">
            <input type="range" :value="strokeOpacity"
              @input="$emit('update:strokeOpacity', Number(($event.target as HTMLInputElement).value))"
              @mouseup="$emit('saveState')"
              @touchend="$emit('saveState')"
              min="10" max="100" />
            <span class="slider-val">{{ strokeOpacity }}%</span>
          </div>
        </div>

        <!-- 填充透明度 -->
        <div class="slider-group">
          <label class="slider-label">填充透明度</label>
          <div class="slider-row">
            <input type="range" :value="fillOpacity"
              @input="$emit('update:fillOpacity', Number(($event.target as HTMLInputElement).value))"
              @mouseup="$emit('saveState')"
              @touchend="$emit('saveState')"
              min="10" max="100" />
            <span class="slider-val">{{ fillOpacity }}%</span>
          </div>
        </div>

        <!-- 圆角 -->
        <div class="slider-group">
          <label class="slider-label">圆角</label>
          <div class="slider-row">
            <input type="range" :value="cornerRadius"
              @input="$emit('update:cornerRadius', Number(($event.target as HTMLInputElement).value))"
              @mouseup="$emit('saveState')"
              @touchend="$emit('saveState')"
              min="0" max="50" />
            <span class="slider-val">{{ cornerRadius }}px</span>
          </div>
        </div>

        <div class="panel-divider"></div>

        <!-- 线条样式 -->
        <div class="style-section">
          <label class="style-label">线条样式</label>
          <div class="style-grid">
            <button class="style-btn" :class="{ active: lineStyle === 'solid' }" @click="$emit('update:lineStyle', 'solid')">
              <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="2"/></svg>
              <span>实线</span>
            </button>
            <button class="style-btn" :class="{ active: lineStyle === 'dashed' }" @click="$emit('update:lineStyle', 'dashed')">
              <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="2" stroke-dasharray="6,4"/></svg>
              <span>虚线</span>
            </button>
            <button class="style-btn" :class="{ active: lineStyle === 'dotted' }" @click="$emit('update:lineStyle', 'dotted')">
              <svg width="40" height="4"><line x1="0" y1="2" x2="40" y2="2" stroke="currentColor" stroke-width="2" stroke-dasharray="2,4"/></svg>
              <span>点线</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

defineProps<{
  visible: boolean
  strokeWidth: number
  strokeOpacity: number
  fillOpacity: number
  cornerRadius: number
  lineStyle: string
}>()

defineEmits(['close', 'update:strokeWidth', 'update:strokeOpacity', 'update:fillOpacity', 'update:cornerRadius', 'update:lineStyle', 'saveState'])

// 拖拽状态
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const panelPosition = ref({ x: 160, y: 100 })

const panelStyle = computed(() => ({
  left: `${panelPosition.value.x}px`,
  top: `${panelPosition.value.y}px`
}))

function startDrag(e: MouseEvent) {
  isDragging.value = true
  dragOffset.value = {
    x: e.clientX - panelPosition.value.x,
    y: e.clientY - panelPosition.value.y
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return
  panelPosition.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  }
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<style scoped>
.float-panel {
  position: fixed; z-index: 100;
  background: rgba(15, 15, 25, 0.95);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  backdrop-filter: blur(20px);
  min-width: 220px;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  cursor: move; user-select: none;
}
.panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #e2e8f0;
}
.close-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: 6px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.close-btn:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.panel-body { padding: 14px; }
.panel-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 12px 0; }
.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }
.style-section { margin-bottom: 8px; }
.style-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.style-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.style-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 8px 6px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.style-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.style-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}
.style-btn span { font-size: 11px; font-weight: 500; }

/* 动画 */
.float-panel-enter-active, .float-panel-leave-active {
  transition: all 0.2s ease;
}
.float-panel-enter-from, .float-panel-leave-to {
  opacity: 0; transform: scale(0.95);
}
</style>
