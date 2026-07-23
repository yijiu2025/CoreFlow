<template>
  <main class="canvas-area" ref="canvasContainer">
    <input type="file" ref="fileInput" @change="emit('imageFileChange', $event)" accept="image/*" hidden />

    <!-- 未上传时的引导 -->
    <transition name="fade">
      <div v-if="!canvasStore.bgImageUploaded && !isCropping" class="upload-cover" @click="emit('triggerFileInput')">
        <div class="upload-card">
          <div class="upload-icon">
            <svg
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <h3>上传参考图片</h3>
          <p>拖拽或点击选择照片，开始 AI 姿势分析</p>
          <div class="upload-btn">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
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
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>分析完成</span>
      </div>
    </transition>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useCanvasStore } from '@/stores/editor';

const canvasStore = useCanvasStore();

defineProps({
  isCropping: Boolean
});

const emit = defineEmits(['imageFileChange', 'triggerFileInput']);

const canvasContainer = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

defineExpose({
  canvasContainer,
  fileInput
});
</script>

<style scoped>
/* ── 画布工作区容器 ── */
.canvas-area {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 50% 50%, #13131a, #0a0a0f);
}

canvas {
  touch-action: none;
  display: block;
}

/* ── 参考背景图上传引导页 ── */
.upload-cover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  cursor: pointer;
}

.upload-card {
  background: linear-gradient(145deg, rgba(20, 20, 35, 0.8), rgba(15, 15, 25, 0.9));
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 24px;
  padding: 52px 52px 44px;
  text-align: center;
  max-width: 400px;
  backdrop-filter: blur(20px);
  transition: all 0.3s ease;
}

.upload-cover:hover .upload-card {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 0 80px rgba(99, 102, 241, 0.08);
  transform: translateY(-4px);
}

.upload-icon {
  width: 88px;
  height: 88px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.12));
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
}

.upload-card h3 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: #e2e8f0;
}

.upload-card p {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 28px;
  line-height: 1.6;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  padding: 12px 32px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
  transition: all 0.2s;
}

.upload-cover:hover .upload-btn {
  box-shadow: 0 8px 30px rgba(99, 102, 241, 0.4);
}

.upload-hint {
  font-size: 12px;
  color: #4a4a5a;
  margin-top: 20px !important;
}

/* ── 状态浮动气泡 ── */
.status-pill {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 15, 25, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #818cf8;
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.status-pill.success {
  border-color: rgba(34, 197, 94, 0.3);
  color: #4ade80;
}

.status-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(129, 140, 248, 0.2);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 动画 ── */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
