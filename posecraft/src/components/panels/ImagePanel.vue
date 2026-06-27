<template>
  <PanelSection title="图片编辑" :shortcuts="shortcuts">
    <template #icon>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </template>

    <!-- 图片操作 -->
    <div class="section-label">图片操作</div>
    <div class="action-grid">
      <button class="action-btn" @click="$emit('replaceImage')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>替换图片</span>
      </button>
      <button class="action-btn" @click="$emit('cropImage')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
          <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
        </svg>
        <span>裁剪图片</span>
      </button>
    </div>

    <div class="panel-divider"></div>

    <!-- 背景透明度 -->
    <div class="slider-group">
      <label class="slider-label">背景透明度</label>
      <div class="slider-row">
        <input type="range" :value="bgOpacity" @input="$emit('update:bgOpacity', Number(($event.target as HTMLInputElement).value))" min="10" max="100" />
        <span class="slider-val">{{ bgOpacity }}%</span>
      </div>
    </div>

    <div class="panel-divider"></div>

    <!-- 裁剪比例 -->
    <div class="section-label">裁剪比例</div>
    <div class="ratio-grid">
      <button class="ratio-btn" :class="{ active: cropAspectRatio === null }" @click="$emit('update:cropAspectRatio', null)">
        <span>自由</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 1 }" @click="$emit('update:cropAspectRatio', 1)">
        <span>1:1</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 4/3 }" @click="$emit('update:cropAspectRatio', 4/3)">
        <span>4:3</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 16/9 }" @click="$emit('update:cropAspectRatio', 16/9)">
        <span>16:9</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 3/2 }" @click="$emit('update:cropAspectRatio', 3/2)">
        <span>3:2</span>
      </button>
      <button class="ratio-btn" :class="{ active: cropAspectRatio === 9/16 }" @click="$emit('update:cropAspectRatio', 9/16)">
        <span>9:16</span>
      </button>
    </div>

  </PanelSection>
</template>

<script setup lang="ts">
import PanelSection from './PanelSection.vue'

defineProps<{
  bgOpacity: number
  cropAspectRatio: number | null
}>()

defineEmits(['replaceImage', 'cropImage', 'update:bgOpacity', 'update:cropAspectRatio', 'update:currentColor'])

const shortcuts = [
  { keys: ['Ctrl', 'Z'], label: '撤销' }
]
</script>

<style scoped>
.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 10px;
}

.panel-divider {
  height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0;
}

.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.action-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.action-btn:hover {
  background: rgba(255,255,255,0.06); color: #e2e8f0;
  border-color: rgba(255,255,255,0.1);
}
.action-btn span { font-size: 11px; font-weight: 500; }

.slider-group { margin-bottom: 12px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }
input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; -webkit-appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

.ratio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ratio-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 8px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  color: #64748b; cursor: pointer; transition: all 0.15s;
}
.ratio-btn:hover {
  background: rgba(255,255,255,0.06); color: #e2e8f0;
  border-color: rgba(255,255,255,0.1);
}
.ratio-btn.active {
  background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2));
  color: #a5b4fc; border-color: rgba(99,102,241,0.4);
}
.ratio-btn span { font-size: 11px; font-weight: 500; }

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
</style>
