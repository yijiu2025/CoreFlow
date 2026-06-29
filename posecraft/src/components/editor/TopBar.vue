<template>
  <header class="top-bar">
    <div class="top-left">
      <button class="hbtn back" @click="emit('exit')" title="返回">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <div class="logo-mark">
        <span class="logo-icon">📸</span>
        <span class="logo-text">PoseCraft</span>
      </div>
      <div class="hbar-div"></div>
      <div class="history-btns">
        <button class="hbtn history" :disabled="historyStore.undoStack.length <= 1" @click="emit('undo')" title="撤销 (Ctrl+Z)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 7v6h6M3 13A9 9 0 1 0 5.6 5.6"/>
          </svg>
          <span class="btn-text">撤销</span>
        </button>
        <button class="hbtn history" :disabled="!historyStore.redoStack.length" @click="emit('redo')" title="重做 (Ctrl+Y)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 7v6h-6M21 13A9 9 0 1 1 18.4 5.6"/>
          </svg>
          <span class="btn-text">重做</span>
        </button>
        <span class="step-counter" v-if="historyStore.undoStack.length > 1">{{ historyStore.undoStack.length - 1 }} 步</span>
      </div>
    </div>

    <div class="top-center">
      <div class="title-editable">
        <input v-model="canvasStore.templateName" placeholder="未命名作品" class="title-input" maxlength="50" />
      </div>
    </div>

    <div class="top-right">
      <button class="hbtn" @click="emit('help')" title="帮助 (?)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>
      <div class="hbar-div"></div>
      <button class="btn-save" :disabled="!canvasStore.bgImageUploaded" @click="emit('save')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>发布</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useCanvasStore, useHistoryStore } from '@/stores/editor'

const canvasStore = useCanvasStore()
const historyStore = useHistoryStore()

const emit = defineEmits(['exit', 'undo', 'redo', 'help', 'save'])
</script>
