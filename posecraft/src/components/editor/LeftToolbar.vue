<template>
  <aside class="left-toolbar">
    <div class="tool-group">
      <!-- 选择 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'select' }" @click="emit('setTool', 'select')" title="选择 (V)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          <path d="M12 12l4 10 2-6 6-2z"/>
        </svg>
      </button>
      <!-- AI 分析 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'ai' }" @click="emit('selectTab', 'ai')" title="AI 智能">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>
      <!-- 形状 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'shapes' }" @click="emit('selectTab', 'shapes')" title="形状">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="15" cy="15" r="6"/>
        </svg>
      </button>
      <!-- 画笔 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'draw' }" @click="emit('setTool', 'draw')" title="画笔 (B)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
      </button>
      <!-- 橡皮擦 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'eraser' }" @click="emit('setTool', 'eraser')" title="橡皮擦 (E)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L11 20"/>
          <path d="M6 12l6-6"/>
        </svg>
      </button>
      <!-- 文字 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'text' }" @click="emit('selectTab', 'text')" title="文字工具 (T)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 7V4h16v3"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
          <line x1="8" y1="20" x2="16" y2="20"/>
        </svg>
      </button>
      <!-- 图片编辑 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'image' }" @click="emit('selectTab', 'image')" title="图片编辑 (I)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>

      <div class="tool-divider"></div>

      <!-- 抓手 -->
      <button class="tool-btn" :class="{ active: toolStore.activeTool === 'hand' }" @click="emit('selectHandTool')" title="抓手 (H)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 11V6a2 2 0 0 0-4 0v1"/>
          <path d="M14 10V4a2 2 0 0 0-4 0v2"/>
          <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
        </svg>
      </button>
    </div>

    <div class="tool-divider"></div>

    <!-- 浮动面板开关 -->
    <button class="sub-btn" :class="{ active: showColorPanel }" @click="emit('toggleColorPanel')" title="颜色面板">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="13.5" cy="6.5" r="2.5"/>
        <circle cx="17.5" cy="10.5" r="2.5"/>
        <circle cx="8.5" cy="7.5" r="2.5"/>
        <circle cx="6.5" cy="12.5" r="2.5"/>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
      </svg>
    </button>
    <button class="sub-btn" :class="{ active: showStylePanel }" @click="emit('toggleStylePanel')" title="样式面板">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    </button>
    <!-- 清空画布 -->
    <button class="sub-btn danger" @click="emit('clearCanvas')" title="清空画布">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>

    <div class="tool-spacer"></div>

    <!-- 主颜色预览（左下角） -->
    <div class="main-color-area" @click="emit('toggleColorPanel')" title="点击打开颜色面板">
      <div class="main-color-swatch" :style="{ background: toolStore.currentColor }"></div>
      <span class="color-hint">颜色</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useToolStore } from '@/stores/editor'

const toolStore = useToolStore()

defineProps({
  showColorPanel: Boolean,
  showStylePanel: Boolean
})

const emit = defineEmits([
  'setTool',
  'selectTab',
  'selectHandTool',
  'toggleColorPanel',
  'toggleStylePanel',
  'clearCanvas'
])
</script>
