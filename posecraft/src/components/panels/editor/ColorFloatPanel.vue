<template>
  <transition name="float-panel">
    <div v-if="visible" class="float-panel color-float-panel" :style="panelStyle">
      <div class="panel-header" @mousedown="startDrag">
        <div class="panel-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="13.5" cy="6.5" r="2.5"/>
            <circle cx="17.5" cy="10.5" r="2.5"/>
            <circle cx="8.5" cy="7.5" r="2.5"/>
            <circle cx="6.5" cy="12.5" r="2.5"/>
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
          </svg>
          <span>颜色</span>
        </div>
        <button class="close-btn" @click="$emit('close')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="panel-body">
        <!-- 主颜色 -->
        <div class="color-section">
          <label class="color-label">主颜色</label>
          <div class="color-row">
            <div class="color-swatch-lg">
              <input type="color" :value="currentColor" @input="$emit('update:currentColor', ($event.target as HTMLInputElement).value)" @change="$emit('saveState')" id="main-color" />
              <label for="main-color" class="swatch-lg" :style="{ background: currentColor }"></label>
            </div>
            <div class="preset-colors">
              <button v-for="c in presetColors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:currentColor', c); $emit('saveState')"></button>
            </div>
          </div>
        </div>

        <div class="panel-divider"></div>

        <!-- 填充颜色 -->
        <div class="color-section">
          <label class="color-label">填充颜色</label>
          <div class="color-row">
            <button class="color-toggle" :class="{ active: !noFill }" @click="$emit('update:noFill', false); $emit('saveState')">
              <div class="color-preview" :style="{ background: fillColor }"></div>
              <span>填充</span>
            </button>
            <button class="color-toggle" :class="{ active: noFill }" @click="$emit('update:noFill', true); $emit('saveState')">
              <div class="color-preview empty"></div>
              <span>无填充</span>
            </button>
          </div>
          <div v-if="!noFill" class="fill-color-picker">
            <div class="color-swatch-lg">
              <input type="color" :value="fillColor" @input="$emit('update:fillColor', ($event.target as HTMLInputElement).value)" @change="$emit('saveState')" id="fill-color" />
              <label for="fill-color" class="swatch-lg" :style="{ background: fillColor }"></label>
            </div>
            <div class="preset-colors">
              <button v-for="c in presetColors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:fillColor', c); $emit('saveState')"></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  currentColor: string
  fillColor: string
  noFill: boolean
  presetColors: string[]
}>()

defineEmits(['close', 'update:currentColor', 'update:fillColor', 'update:noFill', 'saveState'])

// 拖拽状态
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const panelPosition = ref({ x: 100, y: 100 })

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
  min-width: 240px;
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
.color-section { margin-bottom: 12px; }
.color-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.color-row { display: flex; align-items: center; gap: 12px; }
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
  width: 22px; height: 22px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.1); cursor: pointer;
  transition: all 0.15s;
}
.preset-color:hover { transform: scale(1.15); border-color: rgba(255,255,255,0.3); }
.color-toggle {
  flex: 1; display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; background: rgba(255,255,255,0.03);
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
  width: 18px; height: 18px; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.2);
}
.color-preview.empty {
  background: linear-gradient(45deg, #fff 40%, transparent 40%, transparent 60%, #fff 60%);
  opacity: 0.3;
}
.fill-color-picker { display: flex; align-items: center; gap: 10px; margin-top: 10px; }

/* 动画 */
.float-panel-enter-active, .float-panel-leave-active {
  transition: all 0.2s ease;
}
.float-panel-enter-from, .float-panel-leave-to {
  opacity: 0; transform: scale(0.95);
}
</style>
