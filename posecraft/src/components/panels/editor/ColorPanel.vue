<template>
  <div class="color-panel">
    <div class="section-label">{{ title }}</div>
    <div class="color-row">
      <div class="color-swatch-lg">
        <input type="color" :value="modelValue" @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" :id="inputId" />
        <label :for="inputId" class="swatch-lg" :style="{ background: modelValue }"></label>
      </div>
      <div class="preset-colors">
        <button v-for="c in colors" :key="c" class="preset-color" :style="{ background: c }" @click="$emit('update:modelValue', c)"></button>
      </div>
    </div>
    <!-- 快捷操作 -->
    <div class="quick-colors" v-if="showQuickActions">
      <button class="quick-btn" @click="$emit('update:modelValue', '#000000')" title="黑色">
        <div class="quick-swatch" style="background: #000000"></div>
      </button>
      <button class="quick-btn" @click="$emit('update:modelValue', '#ffffff')" title="白色">
        <div class="quick-swatch" style="background: #ffffff"></div>
      </button>
      <button class="quick-btn" @click="$emit('update:modelValue', randomColor())" title="随机颜色">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  title?: string
  presetColors?: string[]
  showQuickActions?: boolean
}>(), {
  title: '颜色',
  showQuickActions: true
})

defineEmits(['update:modelValue'])

const inputId = computed(() => `color-${Math.random().toString(36).slice(2, 8)}`)

const defaultColors = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
]

const colors = computed(() => props.presetColors || defaultColors)

function randomColor(): string {
  const hue = Math.floor(Math.random() * 360)
  return `hsl(${hue}, 70%, 60%)`
}
</script>

<style scoped>
.color-panel { margin-bottom: 12px; }
.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
}
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
.quick-colors { display: flex; gap: 6px; margin-top: 8px; }
.quick-btn {
  width: 28px; height: 28px; padding: 3px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
  cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
  color: #94a3b8;
}
.quick-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.quick-swatch {
  width: 100%; height: 100%; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.2);
}
</style>
