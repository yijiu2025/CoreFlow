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

<style scoped>
/* ── 顶部栏布局 ── */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  background: rgba(15, 15, 25, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  flex-shrink: 0;
  z-index: 10;
}

.top-left, .top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

/* ── Logo 标志 ── */
.logo-mark {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  font-size: 20px;
}

.logo-text {
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(135deg, #6366f1, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ── 历史记录操作 ── */
.history-btns {
  display: flex;
  gap: 4px;
  align-items: center;
}

.hbtn.history {
  width: auto;
  min-width: 64px;
  height: 34px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  font-weight: 500;
}

.hbtn.history:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.15);
}

.hbtn.history:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.btn-text {
  font-size: 12px;
}

.step-counter {
  font-size: 11px;
  color: #6366f1;
  font-weight: 600;
  margin-left: 8px;
  padding: 3px 8px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 6px;
}

/* ── 标题编辑输入框 ── */
.title-input {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
  padding: 4px 8px;
  width: 180px;
  text-align: center;
  transition: all 0.2s;
}

.title-input:hover {
  border-color: rgba(255, 255, 255, 0.08);
}

.title-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.4);
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.03);
}

/* ── 功能按钮通用样式 ── */
.hbtn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.hbtn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.hbtn:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.hbtn.sm {
  width: 28px;
  height: 28px;
  min-width: 28px;
}

.hbtn.back:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
}

.hbar-div {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.06);
}

/* ── 发布/保存按钮 ── */
.btn-save {
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  transition: all 0.2s;
}

.btn-save:hover {
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  transform: translateY(-1px);
}

.btn-save:disabled {
  background: #1e1e2e;
  color: #4a4a5a;
  box-shadow: none;
  transform: none;
  cursor: not-allowed;
}
</style>
