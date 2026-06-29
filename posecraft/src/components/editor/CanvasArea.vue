<template>
  <main class="canvas-area" ref="canvasContainer">
    <input type="file" ref="fileInput" @change="emit('imageFileChange', $event)" accept="image/*" hidden />

    <!-- 未上传时的引导 -->
    <transition name="fade">
      <div v-if="!canvasStore.bgImageUploaded && !isCropping" class="upload-cover" @click="emit('triggerFileInput')">
        <div class="upload-card">
          <div class="upload-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <h3>上传参考图片</h3>
          <p>拖拽或点击选择照片，开始 AI 姿势分析</p>
          <div class="upload-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            选择图片
          </div>
          <p class="upload-hint">支持 JPG、PNG、WebP 格式</p>
        </div>
      </div>
    </transition>

    <canvas id="editor-canvas"></canvas>

    <!-- 加载状态 -->
    <transition name="slide-down">
      <div v-if="canvasStore.loadingStep" class="status-pill">
        <div class="status-spinner"></div>
        <span>{{ canvasStore.loadingStep }}</span>
      </div>
    </transition>

    <!-- AI 分析完成提示 -->
    <transition name="slide-down">
      <div v-if="canvasStore.analysisComplete" class="status-pill success">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>分析完成</span>
      </div>
    </transition>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useCanvasStore } from '@/stores/editor'

const canvasStore = useCanvasStore()

defineProps({
  isCropping: Boolean
})

const emit = defineEmits(['imageFileChange', 'triggerFileInput'])

const canvasContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

defineExpose({
  canvasContainer,
  fileInput
})
</script>
