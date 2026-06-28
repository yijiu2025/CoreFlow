<template>
  <PanelSection title="文字工具" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="4 7 4 4 20 4 20 7"/>
        <line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    </template>

    <!-- 字体选择 -->
    <div class="section-label">字体</div>
    <select class="font-select" :value="fontFamily" @change="$emit('update:fontFamily', ($event.target as HTMLSelectElement).value)">
      <option v-for="font in fonts" :key="font.value" :value="font.value" :style="{ fontFamily: font.value }">
        {{ font.label }}
      </option>
    </select>

    <div class="panel-divider"></div>

    <!-- 文字设置 -->
    <div class="section-label">文字设置</div>
    <!-- 字体大小 -->
    <div class="slider-group">
      <label class="slider-label">字体大小</label>
      <div class="slider-row">
        <input type="range" :value="fontSize"
          @input="$emit('update:fontSize', Number(($event.target as HTMLInputElement).value))"
          @mouseup="$emit('saveState')"
          @touchend="$emit('saveState')"
          min="12" max="120" />
        <span class="slider-val">{{ fontSize }}px</span>
      </div>
    </div>

    <!-- 行高 -->
    <div class="slider-group">
      <label class="slider-label">行高</label>
      <div class="slider-row">
        <input type="range" :value="lineHeight"
          @input="$emit('update:lineHeight', Number(($event.target as HTMLInputElement).value))"
          @mouseup="$emit('saveState')"
          @touchend="$emit('saveState')"
          min="80" max="300" />
        <span class="slider-val">{{ lineHeight }}%</span>
      </div>
    </div>

    <!-- 字间距 -->
    <div class="slider-group">
      <label class="slider-label">字间距</label>
      <div class="slider-row">
        <input type="range" :value="letterSpacing"
          @input="$emit('update:letterSpacing', Number(($event.target as HTMLInputElement).value))"
          @mouseup="$emit('saveState')"
          @touchend="$emit('saveState')"
          min="-10" max="50" />
        <span class="slider-val">{{ letterSpacing }}px</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 文字样式 -->
    <div class="section-label">文字样式</div>
    <div class="style-row">
      <button class="style-btn" :class="{ active: bold }" @click="$emit('update:bold', !bold)" title="粗体">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
        </svg>
      </button>
      <button class="style-btn" :class="{ active: italic }" @click="$emit('update:italic', !italic)" title="斜体">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="19" y1="4" x2="10" y2="4"/>
          <line x1="14" y1="20" x2="5" y2="20"/>
          <line x1="15" y1="4" x2="9" y2="20"/>
        </svg>
      </button>
      <button class="style-btn" :class="{ active: underline }" @click="$emit('update:underline', !underline)" title="下划线">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/>
          <line x1="4" y1="21" x2="20" y2="21"/>
        </svg>
      </button>
      <button class="style-btn" :class="{ active: strikethrough }" @click="$emit('update:strikethrough', !strikethrough)" title="删除线">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M16 4H9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h6"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <path d="M8 20h7a3 3 0 0 0 3-3v0a3 3 0 0 0-3-3h-1"/>
        </svg>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 文字对齐 -->
    <div class="section-label">文字对齐</div>
    <div class="align-row">
      <button class="align-btn" :class="{ active: textAlign === 'left' }" @click="$emit('update:textAlign', 'left')" title="左对齐">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="17" y1="10" x2="3" y2="10"/>
          <line x1="21" y1="6" x2="3" y2="6"/>
          <line x1="21" y1="14" x2="3" y2="14"/>
          <line x1="17" y1="18" x2="3" y2="18"/>
        </svg>
      </button>
      <button class="align-btn" :class="{ active: textAlign === 'center' }" @click="$emit('update:textAlign', 'center')" title="居中对齐">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="10" x2="6" y2="10"/>
          <line x1="21" y1="6" x2="3" y2="6"/>
          <line x1="21" y1="14" x2="3" y2="14"/>
          <line x1="18" y1="18" x2="6" y2="18"/>
        </svg>
      </button>
      <button class="align-btn" :class="{ active: textAlign === 'right' }" @click="$emit('update:textAlign', 'right')" title="右对齐">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="21" y1="10" x2="7" y2="10"/>
          <line x1="21" y1="6" x2="3" y2="6"/>
          <line x1="21" y1="14" x2="3" y2="14"/>
          <line x1="21" y1="18" x2="7" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 文字变形 -->
    <div class="section-label">文字变形</div>
    <div class="warp-grid">
      <button v-for="warp in warps" :key="warp.value" class="warp-btn" :class="{ active: warpStyle === warp.value }" @click="$emit('update:warpStyle', warp.value)">
        <span>{{ warp.label }}</span>
      </button>
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
  fontFamily: string
  lineHeight: number
  letterSpacing: number
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  textAlign: string
  warpStyle: string
}>()

defineEmits([
  'addText', 'saveState',
  'update:fontSize', 'update:fontFamily', 'update:lineHeight', 'update:letterSpacing',
  'update:bold', 'update:italic', 'update:underline', 'update:strikethrough',
  'update:textAlign', 'update:warpStyle'
])

const fonts = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'SimSun', label: '宋体' },
  { value: 'SimHei', label: '黑体' },
  { value: 'KaiTi', label: '楷体' }
]

const warps = [
  { value: 'none', label: '无' },
  { value: 'arc', label: '弧形' },
  { value: 'arch', label: '拱形' },
  { value: 'bulge', label: '凸出' },
  { value: 'fish', label: '鱼形' },
  { value: 'flag', label: '旗帜' },
  { value: 'wave', label: '波浪' }
]

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
.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}

.panel-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0; }

/* 字体选择 */
.font-select {
  width: 100%; padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #e2e8f0;
  font-size: 13px; cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}
.font-select:focus { outline: none; border-color: rgba(99,102,241,0.5); }
.font-select option { background: #1e1e2e; color: #e2e8f0; }

/* 滑块 */
.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

/* 样式按钮 */
.style-row { display: flex; gap: 8px; }
.style-btn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 10px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.style-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.style-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}

/* 对齐按钮 */
.align-row { display: flex; gap: 8px; }
.align-btn {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 10px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.align-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.align-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}

/* 变形网格 */
.warp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.warp-btn {
  padding: 8px 4px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s;
  font-size: 11px; text-align: center;
}
.warp-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.warp-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}

/* 快速文字 */
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
