<template>
  <PanelSection title="文字工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="4 7 4 4 20 4 20 7"/>
        <line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    </template>

    <!-- 使用说明 -->
    <div class="tip-box">
      <div class="tip-icon">💡</div>
      <div class="tip-text">点击画布任意位置添加文字，双击已添加的文字可编辑内容</div>
    </div>

    <div class="panel-divider"></div>

    <!-- 文字设置 -->
    <div class="section-label">文字设置</div>
    <div class="slider-group">
      <label class="slider-label">字体大小</label>
      <div class="slider-row">
        <input type="range" :value="fontSize" @input="$emit('update:fontSize', Number(($event.target as HTMLInputElement).value))" min="12" max="120" />
        <span class="slider-val">{{ fontSize }}px</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 快速添加 -->
    <div class="section-label">快速添加</div>
    <div class="quick-text-grid">
      <button v-for="item in quickTexts" :key="item.text" class="quick-text-btn" @click="$emit('addText', item.text)">
        <span class="quick-text-icon">{{ item.icon }}</span>
        <span class="quick-text-label">{{ item.label }}</span>
      </button>
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  fontSize: number
}>()

defineEmits(['addText', 'update:fontSize'])

const quickTexts = [
  { icon: '📌', label: '标题', text: '标题文字' },
  { icon: '📝', label: '正文', text: '正文内容' },
  { icon: '💡', label: '提示', text: '提示信息' },
  { icon: '⚠️', label: '警告', text: '警告：注意安全' },
  { icon: '✅', label: '完成', text: '已完成' },
  { icon: '❌', label: '错误', text: '错误' }
]

const shortcuts = [
  { keys: ['T'], label: '添加文字' },
  { keys: ['双击'], label: '编辑文字' },
  { keys: ['Delete'], label: '删除选中' }
]
</script>

<style scoped>
.tip-box {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; background: rgba(99,102,241,0.08);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 10px; margin-bottom: 16px;
}
.tip-icon { font-size: 20px; flex-shrink: 0; }
.tip-text { font-size: 12px; color: #94a3b8; line-height: 1.5; }

.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}

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

.quick-text-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.quick-text-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s; font-size: 12px;
}
.quick-text-btn:hover {
  background: rgba(255,255,255,0.06); color: #e2e8f0;
  border-color: rgba(255,255,255,0.1);
}
.quick-text-icon { font-size: 14px; }
.quick-text-label { font-weight: 500; }
</style>
