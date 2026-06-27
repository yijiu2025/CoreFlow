<template>
  <PanelSection title="AI 智能分析" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </template>

    <!-- 智能分析按钮 -->
    <button class="ai-hero-btn" :disabled="isAnalyzing" @click="$emit('autoAnalyze')">
      <div class="ai-hero-bg"></div>
      <div class="ai-hero-content">
        <div class="ai-hero-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div class="ai-hero-text">
          <span class="ai-hero-title">{{ isAnalyzing ? '正在分析...' : '智能分析' }}</span>
          <span class="ai-hero-desc">{{ isAnalyzing ? '请稍候...' : '一键检测所有特征' }}</span>
        </div>
        <div v-if="isAnalyzing" class="ai-hero-spinner"></div>
      </div>
    </button>

    <div class="panel-divider"></div>

    <!-- 识别类型 -->
    <div class="section-label">识别类型</div>
    <div class="type-tabs">
      <button v-for="dt in detectionTypes" :key="dt.value" class="type-tab" :class="{ active: modelValue === dt.value }" @click="$emit('update:modelValue', dt.value)">
        <span class="type-tab-icon">{{ dt.icon }}</span>
        <span class="type-tab-label">{{ dt.label }}</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 框选识别 -->
    <div class="section-label">局部识别</div>
    <button class="crop-btn" :class="{ active: activeTool === 'crop' }" :disabled="isAnalyzing" @click="$emit('setTool', 'crop')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
        <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
      </svg>
      <span>{{ activeTool === 'crop' ? '拖拽框选区域...' : '框选识别' }}</span>
    </button>

    <div class="panel-divider"></div>

    <!-- 节点工具 -->
    <div class="section-label">节点工具</div>
    <div class="tool-grid">
      <button class="grid-btn" :class="{ active: canvasTool === 'addNode' }" @click="$emit('setDrawTool', 'addNode')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <span>添加节点</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'line' }" @click="$emit('setDrawTool', 'line')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="5" cy="19" r="2"/>
          <circle cx="19" cy="5" r="2"/>
          <line x1="7" y1="17" x2="17" y2="7"/>
        </svg>
        <span>连接节点</span>
      </button>
      <button class="grid-btn" :class="{ active: canvasTool === 'moveNode' }" @click="$emit('setDrawTool', 'moveNode')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="5 9 2 12 5 15"/>
          <polyline points="9 5 12 2 15 5"/>
          <polyline points="15 19 12 22 9 19"/>
          <polyline points="19 9 22 12 19 15"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <line x1="12" y1="2" x2="12" y2="22"/>
        </svg>
        <span>移动节点</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 透明度 -->
    <div class="slider-group">
      <label class="slider-label">背景透明度</label>
      <div class="slider-row">
        <input type="range" :value="bgOpacity" @input="$emit('update:bgOpacity', Number(($event.target as HTMLInputElement).value))" min="10" max="100" />
        <span class="slider-val">{{ bgOpacity }}%</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 清除分析 -->
    <div class="section-label">操作</div>
    <button class="danger-btn" @click="$emit('clearAnalysis')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
      清除分析结果
    </button>

    <div class="panel-divider"></div>

    <!-- 分析颜色 -->
    <div class="section-label">分析颜色</div>
    <div class="color-section">
      <div class="color-row">
        <div class="color-swatch-lg">
          <input type="color" :value="currentColor" @input="$emit('update:currentColor', ($event.target as HTMLInputElement).value)" id="ai-color-picker" />
          <label for="ai-color-picker" class="swatch-lg" :style="{ background: currentColor }"></label>
        </div>
        <div class="preset-colors">
          <button v-for="c in presetColors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:currentColor', c)"></button>
        </div>
      </div>
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  isAnalyzing: boolean
  modelValue: string
  activeTool: string
  canvasTool: string
  bgOpacity: number
  currentColor: string
  detectionTypes: Array<{ value: string; icon: string; label: string; desc: string }>
  presetColors: string[]
}>()

defineEmits(['autoAnalyze', 'update:modelValue', 'setTool', 'setDrawTool', 'update:bgOpacity', 'update:currentColor', 'clearAnalysis'])

const shortcuts = [
  { keys: ['滚轮'], label: '缩放' },
  { keys: ['H'], label: '抓手工具' }
]
</script>

<style scoped>
.ai-hero-btn {
  width: 100%; position: relative; overflow: hidden;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none; border-radius: 14px;
  padding: 18px 20px; cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(99,102,241,0.3);
}
.ai-hero-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(99,102,241,0.4);
}
.ai-hero-btn:active { transform: translateY(0); }
.ai-hero-btn:disabled { opacity: 0.7; cursor: not-allowed; transform: none; box-shadow: none; }

.ai-hero-bg {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent 50%);
  pointer-events: none;
}

.ai-hero-content {
  position: relative; display: flex; align-items: center; gap: 14px;
}

.ai-hero-icon {
  width: 44px; height: 44px; flex-shrink: 0;
  background: rgba(255,255,255,0.2);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; backdrop-filter: blur(8px);
}

.ai-hero-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ai-hero-title { font-size: 15px; font-weight: 700; color: #fff; }
.ai-hero-desc { font-size: 12px; color: rgba(255,255,255,0.7); }

.ai-hero-spinner {
  width: 20px; height: 20px; flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 识别类型标签 */
.type-tabs {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
  overflow: hidden;
}
.type-tab {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 4px; font-size: 12px; font-weight: 500;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #94a3b8; cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0; overflow: hidden;
}
.type-tab:hover {
  background: rgba(255,255,255,0.08); color: #e2e8f0;
  border-color: rgba(255,255,255,0.15);
}
.type-tab.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
  box-shadow: 0 0 12px rgba(99,102,241,0.15);
}
.type-tab-icon { font-size: 14px; flex-shrink: 0; }
.type-tab-label { font-weight: 600; white-space: nowrap; }

.crop-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; background: rgba(99,102,241,0.08); border: 1px dashed rgba(99,102,241,0.3);
  border-radius: 10px; color: #818cf8; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
}
.crop-btn:hover { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.5); }
.crop-btn.active { background: rgba(99,102,241,0.2); border-style: solid; border-color: #6366f1; }
.crop-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; -webkit-appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

/* 添加文字 */
.text-add-group { display: flex; gap: 8px; margin-bottom: 12px; }
.text-input {
  flex: 1; padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #e2e8f0; font-size: 13px;
  outline: none; transition: border-color 0.2s;
}
.text-input:focus { border-color: rgba(99,102,241,0.5); }
.text-input::placeholder { color: #64748b; }
.text-add-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 14px; font-size: 12px; font-weight: 500;
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.3);
  border-radius: 8px; color: #818cf8; cursor: pointer;
  transition: all 0.15s;
}
.text-add-btn:hover { background: rgba(99,102,241,0.25); }
.text-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.danger-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px; color: #f87171; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.danger-btn:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }

.color-section { margin-bottom: 12px; }
.color-row { display: flex; align-items: center; gap: 12px; }
.color-swatch-lg { position: relative; }
.color-swatch-lg input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-lg {
  width: 40px; height: 40px; border-radius: 10px;
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

.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 10px;
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}

/* 工具网格 */
.tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
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
}
.grid-btn span { font-size: 11px; font-weight: 500; }
</style>
