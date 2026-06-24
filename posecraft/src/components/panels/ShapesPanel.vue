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
    </div>

    <div class="panel-divider"></div>

    <!-- 构图参考线 -->
    <div class="section-label">构图参考线</div>
    <div class="tool-grid">
      <button v-for="guide in guides" :key="guide.type" class="grid-btn" @click="$emit('drawReference', guide.type)">
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
}>()

defineEmits(['addShape', 'drawReference', 'deleteGuides', 'clearCanvas', 'setDrawTool'])

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
.grid-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.grid-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.grid-btn span { font-size: 11px; font-weight: 500; }

.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 10px;
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}

.guide-icon { font-size: 16px; }

.danger-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px; color: #f87171; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s; margin-bottom: 8px;
}
.danger-btn:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }
</style>
