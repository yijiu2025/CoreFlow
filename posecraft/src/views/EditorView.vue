<template>
  <div class="editor-root">
    <!-- 顶部导航栏 -->
    <header class="top-bar">
      <div class="top-left">
        <button class="hbtn back" @click="triggerExit" title="返回">
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
          <button class="hbtn history" :disabled="undoStack.length <= 1" @click="undo" title="撤销 (Ctrl+Z)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 7v6h6M3 13A9 9 0 1 0 5.6 5.6"/>
            </svg>
            <span class="btn-text">撤销</span>
          </button>
          <button class="hbtn history" :disabled="!redoStack.length" @click="redo" title="重做 (Ctrl+Y)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 7v6h-6M21 13A9 9 0 1 1 18.4 5.6"/>
            </svg>
            <span class="btn-text">重做</span>
          </button>
          <span class="step-counter" v-if="undoStack.length > 1">{{ undoStack.length - 1 }} 步</span>
        </div>
      </div>

      <div class="top-center">
        <div class="title-editable">
          <input v-model="templateName" placeholder="未命名作品" class="title-input" maxlength="50" />
        </div>
      </div>

      <div class="top-right">
        <button class="hbtn" @click="showHelp = true" title="帮助 (?)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
        <div class="hbar-div"></div>
        <button class="btn-save" :disabled="!bgImageUploaded" @click="saveTemplate">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>发布</span>
        </button>
      </div>
    </header>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧工具栏 -->
      <aside class="left-toolbar">
        <div class="tool-group">
          <!-- 选择 -->
          <button class="tool-btn" :class="{ active: activeTool === 'select' }" @click="setTool('select')" title="选择 (V)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
              <path d="M12 12l4 10 2-6 6-2z"/>
            </svg>
          </button>
          <!-- AI 分析 -->
          <button class="tool-btn" :class="{ active: activeTool === 'ai' }" @click="selectTab('ai')" title="AI 智能">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <!-- 形状 -->
          <button class="tool-btn" :class="{ active: activeTool === 'shapes' }" @click="selectTab('shapes')" title="形状">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="15" cy="15" r="6"/>
            </svg>
          </button>
          <!-- 画笔 -->
          <button class="tool-btn" :class="{ active: activeTool === 'draw' }" @click="setTool('draw')" title="画笔 (B)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
          <!-- 橡皮擦 -->
          <button class="tool-btn" :class="{ active: activeTool === 'eraser' }" @click="setTool('eraser')" title="橡皮擦 (E)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0l5 5c.8.8.8 2 0 2.8L11 20"/>
              <path d="M6 12l6-6"/>
            </svg>
          </button>
          <!-- 文字 -->
          <button class="tool-btn" :class="{ active: activeTool === 'text' }" @click="selectTab('text')" title="文字工具 (T)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 7V4h16v3"/>
              <line x1="12" y1="4" x2="12" y2="20"/>
              <line x1="8" y1="20" x2="16" y2="20"/>
            </svg>
          </button>
          <!-- 图片编辑 -->
          <button class="tool-btn" :class="{ active: activeTool === 'image' }" @click="selectTab('image')" title="图片编辑 (I)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>

          <div class="tool-divider"></div>

          <!-- 抓手 -->
          <button class="tool-btn" :class="{ active: activeTool === 'hand' }" @click="selectHandTool()" title="抓手 (H)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 11V6a2 2 0 0 0-4 0v1"/>
              <path d="M14 10V4a2 2 0 0 0-4 0v2"/>
              <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </button>
        </div>

        <div class="tool-divider"></div>

        <!-- 常驻操作 -->
        <button class="sub-btn danger" @click="clearCanvas" title="清空画布">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>

        <div class="tool-spacer"></div>

        <!-- 颜色选择器（始终显示） -->
        <div class="color-picker-area">
          <div class="color-swatch">
            <input type="color" v-model="fillColor" id="color-picker" />
            <label for="color-picker" class="swatch-preview" :style="{ background: fillColor }"></label>
          </div>
        </div>
      </aside>

      <!-- 画布区域 -->
      <main class="canvas-area" ref="canvasContainer">
        <input type="file" ref="fileInput" @change="handleImageUpload" accept="image/*" hidden />

        <!-- 未上传时的引导 -->
        <transition name="fade">
          <div v-if="!bgImageUploaded && !isCropping" class="upload-cover" @click="triggerFileInput">
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
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
          <div v-if="loadingStep" class="status-pill">
            <div class="status-spinner"></div>
            <span>{{ loadingStep }}</span>
          </div>
        </transition>

        <!-- AI 分析完成提示 -->
        <transition name="slide-down">
          <div v-if="analysisComplete" class="status-pill success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>分析完成</span>
          </div>
        </transition>
      </main>

      <!-- 右侧属性面板 -->
      <aside class="right-panel" v-show="bgImageUploaded">
        <AiPanel v-show="activeTool === 'ai' || canvasTool === 'crop'"
          :isAnalyzing="isAnalyzing"
          v-model="detectionType"
          :activeTool="canvasTool"
          :canvasTool="canvasTool"
          v-model:bgOpacity="bgOpacity"
          v-model:currentColor="currentColor"
          :detectionTypes="detectionTypes"
          :presetColors="presetColors"
          @autoAnalyze="autoAnalyze"
          @setTool="setTool"
          @setDrawTool="setDrawTool"
          @clearAnalysis="clearAnalysis"
          @addText="addText"
        />

        <SelectPanel v-show="activeTool === 'select'"
          :selectedObject="selectedObject"
          :currentColor="currentColor"
          :presetColors="presetColors"
          :pathBlur="pathBlur"
          @deleteSelected="deleteSelected"
          @bringToFront="bringToFront"
          @sendToBack="sendToBack"
          @moveUp="moveUp"
          @moveDown="moveDown"
          @copySelected="copySelected"
          @pasteClipboard="pasteClipboard"
          @update:currentColor="updateColorFromPanel"
          @update:pathStrokeWidth="updatePathStrokeWidth"
          @update:pathBlur="updatePathBlur"
          @update:pathScale="updatePathScale"
        />

        <DrawPanel v-show="activeTool === 'draw'"
          v-model:brushSize="brushSize"
          v-model:brushFeather="brushFeather"
          v-model:currentColor="currentColor"
          :presetColors="presetColors"
        />

        <EraserPanel v-show="activeTool === 'eraser'"
          v-model:eraserSize="eraserSize"
        />

        <ShapesPanel v-show="activeTool === 'shapes'"
          :activeTool="activeTool"
          :canvasTool="canvasTool"
          :strokeWidth="strokeWidth"
          :fillColor="fillColor"
          :noFill="noFill"
          :lineStyle="lineStyle"
          :shapeOpacity="shapeOpacity"
          :presetColors="presetColors"
          :activeGuides="activeGuides"
          @addShape="addShape"
          @drawReference="drawReference"
          @toggleGuide="toggleGuide"
          @deleteGuides="deleteGuides"
          @clearCanvas="clearCanvas"
          @setDrawTool="setDrawTool"
          @update:strokeWidth="strokeWidth = $event"
          @update:fillColor="fillColor = $event"
          @update:noFill="noFill = $event"
          @update:lineStyle="lineStyle = $event"
          @update:shapeOpacity="shapeOpacity = $event"
        />

        <TextPanel v-show="activeTool === 'text'"
          v-model:fontSize="textFontSize"
          v-model:currentColor="currentColor"
          :presetColors="presetColors"
          @addText="addText"
        />

        <HandPanel v-show="activeTool === 'hand'"
          :zoomPercent="zoomPercent"
          v-model:zoomSlider="zoomSlider"
          @zoomIn="zoomIn"
          @zoomOut="zoomOut"
          @resetZoom="resetZoom"
          @fitToScreen="fitToScreen"
        />

        <ImagePanel v-show="activeTool === 'image' && bgImageUploaded && !isCropping"
          :bgOpacity="bgOpacity"
          :currentColor="currentColor"
          :cropAspectRatio="cropAspectRatio"
          :presetColors="presetColors"
          @replaceImage="triggerFileInput"
          @cropImage="startCropMode"
          @update:bgOpacity="updateBgOpacity"
          @update:cropAspectRatio="cropAspectRatio = $event"
          @update:currentColor="currentColor = $event"
        />

        <CropPanel v-show="isCropping"
          :cropAspectRatio="cropAspectRatio"
          @update:cropAspectRatio="updateCropAspectRatio"
          @confirmCrop="confirmCrop"
          @cancelCrop="cancelCrop"
        />
      </aside>
    </div>

    <!-- 帮助弹窗 -->
    <HelpModal :isOpen="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AiPanel from '@/components/panels/AiPanel.vue'
import SelectPanel from '@/components/panels/SelectPanel.vue'
import DrawPanel from '@/components/panels/DrawPanel.vue'
import EraserPanel from '@/components/panels/EraserPanel.vue'
import ShapesPanel from '@/components/panels/ShapesPanel.vue'
import HandPanel from '@/components/panels/HandPanel.vue'
import CropPanel from '@/components/panels/CropPanel.vue'
import ImagePanel from '@/components/panels/ImagePanel.vue'
import TextPanel from '@/components/panels/TextPanel.vue'
import HelpModal from '@/components/modals/HelpModal.vue'
import { v4 as uuidv4 } from 'uuid'
import * as fabricLib from 'fabric'
// Composables
import { useHistory } from '@/composables/canvas/useHistory'
import { useTools } from '@/composables/canvas/useTools'
import { useShapes } from '@/composables/canvas/useShapes'
import { useReferenceLines } from '@/composables/canvas/useReferenceLines'
import { useSkeletonNodes } from '@/composables/canvas/useSkeletonNodes'
import { useImageUpload } from '@/composables/canvas/useImageUpload'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import * as poseDetection from '@tensorflow-models/pose-detection'
import * as bodySegmentation from '@tensorflow-models/body-segmentation'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection'

const origin = () => window.location.origin
const MOVENET_MODEL_URL = () => `${origin()}/models/movenet/model.json`
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib

const router = useRouter()
const authStore = useAuthStore()

// 预设颜色
const presetColors = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

// 响应式状态
const canvasContainer = ref<any>(null)
const fileInput = ref<any>(null)
const fCanvas = ref<any>(null)

const bgImageUploaded = ref(false)
const bgOpacity = ref(50)

// undoStack, redoStack 已迁移到 useHistory composable

// 统一工具状态（所有工具互斥，控制右侧面板显示）
const activeTool = ref('select')  // select | ai | shapes | draw | eraser | text | hand
// 画布实际使用的工具（可能与 activeTool 不同，如 crop 模式下 activeTool='ai'）
const canvasTool = ref('select')  // select | draw | eraser | hand | crop | text | line

const templateName = ref('')
const isDetectorReady = ref(false)
const isAnalyzing = ref(false)
const loadingStep = ref('')
const analysisComplete = ref(false)
const showHelp = ref(false)


// AI 识别类型
const detectionType = ref<'all' | 'pose' | 'face' | 'hand' | 'segmentation'>('all')
const detectionTypes = [
  { value: 'all', label: '全部', icon: '✨', desc: '姿势+面部+手部+轮廓' },
  { value: 'pose', label: '姿势', icon: '🏃', desc: '人体骨骼关键点' },
  { value: 'face', label: '面部', icon: '😊', desc: '面部网格 468 点' },
  { value: 'hand', label: '手部', icon: '✋', desc: '手部关键点 21 点' },
  { value: 'segmentation', label: '轮廓', icon: '👤', desc: '人体分割描边' },
]

// Mutable state
let isStateSavingLocked = false
const isErasing = ref(false)
const isDrawingLine = ref(false)
const isDrawingCrop = ref(false)
const isDrawingRect = ref(false)
let isPanning = false
let lastPanPoint: any = null
let currentLine: any = null
let currentRect: any = null // 正在绘制的矩形
let startNode: any = null // 直线工具拖拽连接的起始节点
let lastMouseEvent: any = null // 记录最后一次鼠标事件，用于 mouseup 时查找目标
let cropRect: any = null
let eraserCursor: any = null
const eraserSize = ref(20)
const brushSize = ref(8)
const brushFeather = ref(0)
const textFontSize = ref(24)
const pathBlur = ref(0) // 选中路径的羽化值

// 形状样式状态
const strokeWidth = ref(3)
const fillColor = ref('#6366f1')
const currentColor = ref('#6366f1') // 描边颜色，与 fillColor 同步
const noFill = ref(true) // 默认无填充
const lineStyle = ref('solid') // solid | dashed | dotted
const shapeOpacity = ref(100)

// 初始化 composables
const { undoStack, redoStack, saveState, undo, redo, setOnStateRestored } = useHistory(fCanvas, { value: isStateSavingLocked }, null, null)
const { selectTab, selectHandTool, setDrawTool, setTool } = useTools(fCanvas, activeTool, canvasTool)
const { applyColor } = useShapes(fCanvas, currentColor, fillColor)
const { activeGuides, drawReference, deleteGuides, toggleGuide } = useReferenceLines(fCanvas, fillColor, strokeWidth, saveState)
const { drawPoseSkeleton, addSkeletonNode, addMidpointNode, connectNodes } = useSkeletonNodes(fCanvas, currentColor, saveState)

// 同步 fillColor 和 currentColor
watch(fillColor, (v) => { currentColor.value = v })
watch(currentColor, (v) => { fillColor.value = v })

// 构图参考线状态（支持多选）

// isCropping, cropAspectRatio 来自 useImageUpload composable
// cropBox, uploadedImage, cropOverlay 是 composable 内部状态
let startPoint: any = null
let resizeObserver: any = null
let spacePressed = false

// Ink layer
let inkCanvas: any = null
let inkCtx: any = null
let inkLayer: any = null

// AI detectors
let detector: any = null
let segmenter: any = null
let faceDetector: any = null
let handDetector: any = null

// 工具切换时的画布状态已在 setTool/selectTab 中处理

// 画笔粗细实时更新
watch(brushSize, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    fCanvas.value.freeDrawingBrush.width = newVal
  }
})

// 画笔颜色实时更新
watch(currentColor, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    fCanvas.value.freeDrawingBrush.color = newVal
    // 同步更新羽化阴影颜色
    if (brushFeather.value > 0 && fCanvas.value.freeDrawingBrush.shadow) {
      fCanvas.value.freeDrawingBrush.shadow.color = newVal
    }
  }
})

// 画笔羽化实时更新
watch(brushFeather, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    if (newVal > 0) {
      fCanvas.value.freeDrawingBrush.shadow = new fabric.Shadow({
        color: currentColor.value,
        blur: newVal,
        offsetX: 0,
        offsetY: 0
      })
    } else {
      fCanvas.value.freeDrawingBrush.shadow = null
    }
  }
})

// 橡皮擦大小实时更新
watch(eraserSize, (newVal) => {
  if (!fCanvas.value) return
  const cursor = fCanvas.value.getObjects().find((o: any) => o.isEraserCursor)
  if (cursor) {
    cursor.set({ radius: newVal / 2 })
    fCanvas.value.renderAll()
  }
})

// 背景透明度实时更新
watch(bgOpacity, (newVal) => {
  if (!fCanvas.value) return
  const bg = fCanvas.value.backgroundImage
  if (bg) {
    bg.set({ opacity: newVal / 100 })
    fCanvas.value.renderAll()
  }
})

// ─── Lifecycle ─────────────────────────────────────────────
const handleKeydown = (e: KeyboardEvent) => {
  // 空格键 → 临时进入抓手模式
  if (e.code === 'Space' && !spacePressed && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault()
    spacePressed = true
    if (fCanvas.value) fCanvas.value.defaultCursor = 'grab'
    return
  }
  // H → 切换抓手工具
  if (e.key === 'h' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault()
    if (activeTool.value === 'hand') {
      activeTool.value = 'select'
      if (fCanvas.value) {
        fCanvas.value.isDrawingMode = false
        fCanvas.value.selection = true
        fCanvas.value.defaultCursor = 'default'
      }
    } else {
      activeTool.value = ''
      activeTool.value = 'hand'
      if (fCanvas.value) {
        fCanvas.value.isDrawingMode = false
        fCanvas.value.selection = false
        fCanvas.value.defaultCursor = 'grab'
      }
    }
    return
  }
  // Ctrl+Z / Cmd+Z → 撤销
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); undo()
  }
  // Ctrl+Y / Cmd+Shift+Z → 重做
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); redo()
  }
  // Delete / Backspace → 删除选中
  if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault(); deleteSelected()
  }
  // Ctrl+= / Cmd+= → 放大
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault(); zoomIn()
  }
  // Ctrl+- / Cmd+- → 缩小
  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    e.preventDefault(); zoomOut()
  }
  // Ctrl+0 / Cmd+0 → 重置缩放
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault(); resetZoom()
  }
}

const handleKeyup = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    spacePressed = false
    if (fCanvas.value && activeTool.value !== 'hand') {
      fCanvas.value.defaultCursor = 'default'
    }
  }
}

onMounted(async () => {
  if (!authStore.isLoggedIn) { router.push('/login'); return }
  initCanvas()
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
})
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (fCanvas.value) fCanvas.value.dispose()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
})

// ─── Canvas Utilities ──────────────────────────────────────
const resizeCanvas = () => {
  if (!fCanvas.value || !canvasContainer.value) return
  const width = canvasContainer.value.clientWidth
  const height = canvasContainer.value.clientHeight || 600
  const bg = fCanvas.value.backgroundImage
  if (bg && bg.width) {
    const scale = Math.min(width / bg.width, height / bg.height) * 0.95
    const newW = bg.width * scale, newH = bg.height * scale
    fCanvas.value.setWidth(newW); fCanvas.value.setHeight(newH)
    bg.set({ scaleX: scale, scaleY: scale, left: newW / 2, top: newH / 2, originX: 'center', originY: 'center' })
    if (inkCanvas) { inkCanvas.width = newW; inkCanvas.height = newH }
  } else {
    fCanvas.value.setWidth(width); fCanvas.value.setHeight(height)
  }
  fCanvas.value.renderAll()
}

// 画布变换状态
let canvasScale = 1
let canvasTranslateX = 0
let canvasTranslateY = 0

/**
 * 应用 CSS transform 到画布（缩放 + 平移）
 */
const applyCanvasTransform = () => {
  if (!fCanvas.value) return
  const wrapper = fCanvas.value.wrapperEl
  if (wrapper) {
    wrapper.style.transformOrigin = 'center center'
    wrapper.style.transform = `translate(${canvasTranslateX}px, ${canvasTranslateY}px) scale(${canvasScale})`
  }
}

/**
 * 同步画布尺寸（缩放）
 */
const syncCanvasDimensions = (zoom: number) => {
  canvasScale = zoom
  applyCanvasTransform()
}

const resetZoom = () => {
  canvasScale = 1
  canvasTranslateX = 0
  canvasTranslateY = 0
  applyCanvasTransform()
  zoomSlider.value = 100
}

// 适应屏幕
const fitToScreen = () => {
  if (!fCanvas.value || !canvasContainer.value) return

  const canvas = fCanvas.value
  const container = canvasContainer.value

  const containerWidth = container.clientWidth - 80
  const containerHeight = container.clientHeight - 80

  const canvasWidth = canvas.getWidth()
  const canvasHeight = canvas.getHeight()

  if (canvasWidth === 0 || canvasHeight === 0) return

  const zoom = Math.min(containerWidth / canvasWidth, containerHeight / canvasHeight)
  canvasScale = zoom
  canvasTranslateX = 0
  canvasTranslateY = 0
  applyCanvasTransform()
  zoomSlider.value = Math.round(zoom * 100)
}

// 缩放百分比
const zoomPercent = computed(() => {
  return Math.round(currentZoom.value * 100)
})

// 缩放滑块
const zoomSlider = ref(100)

// 缩放滑块实时更新
watch(zoomSlider, (newVal) => {
  const zoom = newVal / 100
  currentZoom.value = zoom
  syncCanvasDimensions(zoom)
})

// 当前缩放级别
const currentZoom = ref(1)

// 图片上传/裁剪 composable
const { isCropping, cropAspectRatio, triggerFileInput, handleImageUpload, startCropMode, updateBgOpacity, updateCropAspectRatio, confirmCrop, cancelCrop, setFileInput, setDeps } = useImageUpload(fCanvas, activeTool, bgImageUploaded, bgOpacity, zoomSlider, currentZoom, saveState, applyCanvasTransform)
// 传入依赖引用
watch(fileInput, (v) => { if (v) setFileInput(v) }, { immediate: true })
watch(canvasContainer, (v) => { if (v) setDeps({ canvasContainer: v }) }, { immediate: true })

// 撤销/重做时重置裁剪模式
setOnStateRestored(() => {
  if (isCropping.value) {
    isCropping.value = false
  }
})

// 放大
const zoomIn = () => {
  const zoom = Math.min(currentZoom.value * 1.2, 5)
  currentZoom.value = zoom
  zoomSlider.value = Math.round(zoom * 100)
  syncCanvasDimensions(zoom)
}

// 缩小
const zoomOut = () => {
  const zoom = Math.max(currentZoom.value / 1.2, 0.1)
  currentZoom.value = zoom
  zoomSlider.value = Math.round(zoom * 100)
  syncCanvasDimensions(zoom)
}

// ─── Canvas Init ───────────────────────────────────────────
const initCanvas = () => {
  const c = new fabric.Canvas('editor-canvas', {
    width: canvasContainer.value?.clientWidth || 800, height: canvasContainer.value?.clientHeight || 600,
    selection: true, preserveObjectStacking: true, isDrawingMode: false,
    backgroundColor: 'rgba(0,0,0,0)', perPixelTargetFind: true, targetFindTolerance: 15
  })
  fCanvas.value = markRaw(c)
  const w = fCanvas.value.width, h = fCanvas.value.height
  inkCanvas = document.createElement('canvas'); inkCanvas.width = w; inkCanvas.height = h
  inkCtx = inkCanvas.getContext('2d', { willReadFrequently: true })
  inkLayer = new fabric.Image(inkCanvas, { left: 0, top: 0, originX: 'left', originY: 'top', selectable: false, evented: false, erasable: false })
  inkLayer.isInkLayer = true; fCanvas.value.add(inkLayer)
  eraserCursor = new fabric.Circle({ radius: eraserSize.value / 2, fill: 'rgba(255,255,255,0.2)', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 1, originX: 'center', originY: 'center', selectable: false, evented: false, visible: false, isEraserCursor: true })
  fCanvas.value.add(eraserCursor)
  fCanvas.value.on('mouse:down', handleMouseDown)
  fCanvas.value.on('mouse:move', handleMouseMove)
  fCanvas.value.on('mouse:up', handleMouseUp)
  fCanvas.value.on('path:created', handlePathCreated)

  // 监听选择事件，更新 selectedObject
  fCanvas.value.on('selection:created', updateSelection)
  fCanvas.value.on('selection:updated', updateSelection)
  fCanvas.value.on('selection:cleared', updateSelection)

  // 拖拽骨架节点时，锁定关联的线条 ID 和端点
  let activeDragLines: Array<{ id: string, endpoint: 'start' | 'end' }> = []

  // mouse:down: 拖拽开始时，按位置锁定关联线条
  fCanvas.value.on('mouse:down', (e: any) => {
    const obj = e.target
    if (!obj || !obj.isSkeleton) { activeDragLines = []; return }
    activeDragLines = (obj.connectedLines || []).map((c: any) => ({ id: c.id || c.line, endpoint: c.endpoint }))
  })

  // object:moving: 拖拽过程中更新线条
  fCanvas.value.on('object:moving', (e: any) => {
    const obj = e.target
    if (!obj || !obj.isSkeleton) return

    const canvas = fCanvas.value
    if (!canvas) return

    const objs = canvas.getObjects()
    const idMap: any = {}
    objs.forEach((o: any) => { if (o.id) idMap[o.id] = o })

    // 优先使用锁定的线条，否则实时查找
    if (activeDragLines.length > 0) {
      activeDragLines.forEach(({ id, endpoint }) => {
        const line = idMap[id]
        if (!line) return
        
        const targetEndpoint = endpoint === 'start' ? 'end' : 'start';
        const otherNode = objs.find((o: any) => o.isSkeleton && o.connectedLines?.some((c: any) => (c.id || c.line) === id && c.endpoint === targetEndpoint));
        
        if (!otherNode) return; // 找不到另一个节点则跳过

        const x1 = endpoint === 'start' ? obj.left : otherNode.left;
        const y1 = endpoint === 'start' ? obj.top : otherNode.top;
        const x2 = endpoint === 'end' ? obj.left : otherNode.left;
        const y2 = endpoint === 'end' ? obj.top : otherNode.top;
        
        line.set({ x1, y1, x2, y2, scaleX: 1, scaleY: 1 });
        if (line._setWidthHeight) {
          line._setWidthHeight();
        } else {
          line.set({
            width: Math.abs(x1 - x2),
            height: Math.abs(y1 - y2),
            left: Math.min(x1, x2),
            top: Math.min(y1, y2)
          });
        }
        line.setCoords()
      })
    } else {
      // fallback: 实时位置匹配
      const lines = objs.filter((o: any) => o.isAutoGenerated && o.type === 'line')
      lines.forEach((line: any) => {
        if (Math.hypot(line.x1 - obj.left, line.y1 - obj.top) < 20) {
          const x2 = line.x2, y2 = line.y2;
          line.set({ x1: obj.left, y1: obj.top, left: Math.min(obj.left, x2), top: Math.min(obj.top, y2), width: Math.abs(obj.left - x2), height: Math.abs(obj.top - y2) });
          line.setCoords()
        } else if (Math.hypot(line.x2 - obj.left, line.y2 - obj.top) < 20) {
          const x1 = line.x1, y1 = line.y1;
          line.set({ x2: obj.left, y2: obj.top, left: Math.min(x1, obj.left), top: Math.min(y1, obj.top), width: Math.abs(x1 - obj.left), height: Math.abs(y1 - obj.top) });
          line.setCoords()
        }
      })
    }

    canvas.renderAll()
  })

  // mouse:up: 拖拽结束，清空锁定
  fCanvas.value.on('mouse:up', () => {
    activeDragLines = []
  })

  // 对象修改完成时记录步骤（拖拽、缩放等）
  fCanvas.value.on('object:modified', (e: any) => {
    // 裁剪框的移动/缩放不计入步数
    if (e.target?.isCropBox) return
    saveState()
  })

  // 鼠标滚轮缩放到容器上（更可靠）
  if (canvasContainer.value) {
    canvasContainer.value.addEventListener('wheel', handleWheel, { passive: false })
  }

  saveState()
}

// ─── Mouse Wheel Zoom（以鼠标为中心） ────────────────────
const handleWheel = (e: WheelEvent) => {
  e.preventDefault()
  if (!fCanvas.value || !canvasContainer.value) return

  const delta = e.deltaY
  let zoom = currentZoom.value
  const factor = 1.1

  if (delta < 0) {
    zoom = Math.min(zoom * factor, 5)
  } else {
    zoom = Math.max(zoom / factor, 0.1)
  }

  // 更新缩放
  currentZoom.value = zoom
  zoomSlider.value = Math.round(zoom * 100)
  syncCanvasDimensions(zoom)
}

// ─── 几何工具函数 ──────────────────────────────────────────
/** 计算点到线段的距离 */
const distToSegment = (p: any, v: any, w: any) => {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y)
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)))
}

// ─── Mouse Handlers ────────────────────────────────────────
const handleMouseDown = (opt: any) => {
  const pointer = fCanvas.value.getPointer(opt.e), tool = canvasTool.value

  // 抓手工具 或 按住空格键：开始拖拽
  if (tool === 'hand' || spacePressed) {
    isPanning = true
    lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY }
    fCanvas.value.defaultCursor = 'grabbing'
    return
  }

  if (['draw', 'eraser'].includes(tool)) {
    isErasing.value = true; startPoint = pointer; saveState()
    if (tool === 'eraser') { eraserCursor.set({ left: pointer.x, top: pointer.y }); fCanvas.value.bringToFront(eraserCursor) }
  } else if (tool === 'line') {
    // 直线工具：检查是否点击在节点上
    const target = fCanvas.value.findTarget(opt.e, false)
    if (target && target.isSkeleton) {
      // 点击在节点上 → 开始拖拽连接
      isDrawingLine.value = true; startPoint = { x: target.left, y: target.top }
      startNode = target
      currentLine = new fabric.Line([target.left, target.top, target.left, target.top], {
        stroke: currentColor.value, strokeWidth: strokeWidth.value,
        selectable: false, evented: false, strokeLineCap: 'round', erasable: true,
        strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
      })
      fCanvas.value.add(currentLine)
    } else if (!target) {
      // 点击空白处 → 普通直线绘制
      isDrawingLine.value = true; startPoint = pointer
      startNode = null
      currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: currentColor.value, strokeWidth: strokeWidth.value,
        selectable: false, evented: false, strokeLineCap: 'round', erasable: true,
        strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
      })
      fCanvas.value.add(currentLine)
    }
  } else if (['rect', 'circle', 'triangle', 'star', 'polygon', 'arrow'].includes(tool)) {
    // 形状工具：点击空白处开始拖拽绘制
    const target = fCanvas.value.findTarget(opt.e, false)
    if (!target) {
      isDrawingRect.value = true; startPoint = pointer
      const baseStyle = {
        left: pointer.x, top: pointer.y,
        stroke: currentColor.value,
        strokeWidth: strokeWidth.value,
        fill: noFill.value ? 'transparent' : fillColor.value,
        selectable: false, evented: false, erasable: true,
        opacity: shapeOpacity.value / 100,
        strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
      }
      if (tool === 'rect') {
        currentRect = new fabric.Rect({ ...baseStyle, width: 0, height: 0 })
      } else if (tool === 'circle') {
        currentRect = new fabric.Ellipse({ ...baseStyle, rx: 0, ry: 0 })
      } else if (tool === 'triangle') {
        currentRect = new fabric.Triangle({ ...baseStyle, width: 0, height: 0 })
      } else if (tool === 'star') {
        // 星形：先创建，后续在 mousemove 中更新大小
        currentRect = createStar(pointer.x, pointer.y, 5, 0, 0, baseStyle)
        currentRect._isStar = true
        currentRect._starPoints = 5
      } else if (tool === 'polygon') {
        // 六边形
        currentRect = createPolygon(pointer.x, pointer.y, 6, 0, baseStyle)
        currentRect._sides = 6
      } else if (tool === 'arrow') {
        isDrawingRect.value = false // 箭头使用线条模式
        isDrawingLine.value = true
        currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: currentColor.value, strokeWidth: strokeWidth.value,
          selectable: false, evented: false, strokeLineCap: 'round', erasable: true,
          strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
        })
        fCanvas.value.add(currentLine)
      }
      if (currentRect) fCanvas.value.add(currentRect)
    }
  } else if (tool === 'addNode') {
    // 添加节点工具：点击空白处添加新节点
    const target = fCanvas.value.findTarget(opt.e, false)
    if (!target) {
      addSkeletonNode(pointer.x, pointer.y)
    } else if (target.isSkeleton && target.connectedLines?.length > 0) {
      // 点击现有节点 → 在其连接的线段中点添加新节点
      addMidpointNode(target)
    }
  } else if (tool === 'crop') {
    isDrawingCrop.value = true; startPoint = pointer
    cropRect = new fabric.Rect({ left: pointer.x, top: pointer.y, width: 0, height: 0, fill: 'rgba(99,102,241,0.1)', stroke: '#6366f1', strokeWidth: 1, strokeDashArray: [5, 5], selectable: false, evented: false, isCropRect: true })
    fCanvas.value.add(cropRect)
  } else if (tool === 'text') {
    // 检查点击位置是否已有对象
    const target = fCanvas.value.findTarget(opt.e, false)
    if (target && target.type === 'i-text') {
      // 点击已有文字 → 选中并进入编辑模式
      fCanvas.value.setActiveObject(target)
      target.enterEditing()
      target.selectAll()
      fCanvas.value.renderAll()
    } else if (!target) {
      // 点击空白处 → 添加新文字
      const text = new fabric.IText('双击编辑', {
        left: pointer.x, top: pointer.y,
        fontSize: textFontSize.value,
        fill: currentColor.value,
        originX: 'center', originY: 'center',
        erasable: true
      })
      fCanvas.value.add(text)
      fCanvas.value.setActiveObject(text)
      fCanvas.value.renderAll()
      saveState()
    }
  }
}

const handleMouseMove = (opt: any) => {
  const pointer = fCanvas.value.getPointer(opt.e), tool = canvasTool.value
  lastMouseEvent = opt.e // 记录鼠标事件，用于 mouseup 时查找目标

  // 抓手工具：拖拽画布（使用 CSS transform）
  if (isPanning && lastPanPoint) {
    const dx = opt.e.clientX - lastPanPoint.x
    const dy = opt.e.clientY - lastPanPoint.y
    canvasTranslateX += dx
    canvasTranslateY += dy
    applyCanvasTransform()
    lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY }
    return
  }

  if (eraserCursor && tool === 'eraser') {
    eraserCursor.set({ left: pointer.x, top: pointer.y, radius: eraserSize.value / 2 })
    fCanvas.value.bringToFront(eraserCursor)
    fCanvas.value.renderAll()
  }
  if (isErasing.value && tool === 'eraser') {
    // 擦除墨迹层（像素）
    if (inkCtx) {
      inkCtx.save()
      inkCtx.globalCompositeOperation = 'destination-out'
      inkCtx.beginPath()
      inkCtx.arc(pointer.x, pointer.y, eraserSize.value / 2, 0, Math.PI * 2)
      inkCtx.fill()
      inkCtx.restore()
      refreshInkLayer()
    }
    // 擦除 Fabric.js 对象（线条、形状等）
    const radius = eraserSize.value / 2
    const objects = fCanvas.value.getObjects().filter((o: any) =>
      o.erasable && !o.isInkLayer && !o.isEraserCursor
    )
    objects.forEach((obj: any) => {
      if (obj.isUserStroke && obj.getElement && obj.getElement().tagName === 'CANVAS') {
        // 画笔笔触 - 像素级擦除
        const el = obj.getElement()
        const ctx = el.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        const localPoint = obj.toLocalPoint(pointer, 'left', 'top')
        const dpr = window.devicePixelRatio || 1
        const px = localPoint.x * dpr
        const py = localPoint.y * dpr
        const scaleApprox = Math.sqrt(obj.scaleX * obj.scaleX + obj.scaleY * obj.scaleY) / Math.SQRT2
        const eraserRadius = (radius * dpr) / (scaleApprox || 1)

        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'
        ctx.beginPath()
        ctx.arc(px, py, eraserRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        obj.dirty = true
      } else if (obj.type === 'line') {
        // 检查线条是否与橡皮擦区域相交
        const dist = distToSegment(pointer, { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 })
        if (dist < radius) {
          fCanvas.value.remove(obj)
        }
      } else if (obj.type === 'circle' || obj.type === 'rect' || obj.type === 'triangle') {
        // 检查形状中心是否在橡皮擦区域内
        const dist = Math.hypot(obj.left - pointer.x, obj.top - pointer.y)
        if (dist < radius + 10) {
          fCanvas.value.remove(obj)
        }
      } else if (obj.type === 'i-text') {
        // 检查文字是否在橡皮擦区域内
        const dist = Math.hypot(obj.left - pointer.x, obj.top - pointer.y)
        if (dist < radius + 10) {
          fCanvas.value.remove(obj)
        }
      }
    })
    fCanvas.value.renderAll()
  }
  if (isDrawingLine.value && currentLine) { currentLine.set({ x2: pointer.x, y2: pointer.y }); fCanvas.value.renderAll() }
  if (isDrawingCrop.value && cropRect) { const l = Math.min(startPoint.x, pointer.x), t = Math.min(startPoint.y, pointer.y); cropRect.set({ left: l, top: t, width: Math.abs(startPoint.x - pointer.x), height: Math.abs(startPoint.y - pointer.y) }); fCanvas.value.renderAll() }
  // 形状拖拽绘制
  if (isDrawingRect.value && currentRect && startPoint) {
    let w = Math.abs(startPoint.x - pointer.x)
    let h = Math.abs(startPoint.y - pointer.y)
    // 按住 Ctrl 键：强制正方形/正圆
    if (opt.e.ctrlKey || opt.e.metaKey) {
      const size = Math.max(w, h)
      w = size; h = size
    }
    const l = Math.min(startPoint.x, pointer.x)
    const t = Math.min(startPoint.y, pointer.y)

    if (currentRect.type === 'ellipse') {
      currentRect.set({ left: l, top: t, rx: w / 2, ry: h / 2 })
    } else if (currentRect.type === 'triangle') {
      currentRect.set({ left: l, top: t, width: w, height: h })
    } else if (currentRect.type === 'polygon' && !currentRect._isStar) {
      // 多边形：以鼠标按下点为起点，鼠标当前点为对角线终点
      const sides = currentRect._sides || 6
      const rx = w / 2
      const ry = h / 2

      const pts: any[] = []
      for (let i = 0; i < sides; i++) {
        const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
        pts.push({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) })
      }

      // 计算真实包围盒，防止裁切
      let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
      pts.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
      })

      currentRect.set({
        points: pts,
        width: maxX - minX,
        height: maxY - minY,
        pathOffset: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 },
        left: l,
        top: t,
        originX: 'left',
        originY: 'top',
        dirty: true
      })
    } else if (currentRect._isStar) {
      // 星形：以鼠标按下点为起点，鼠标当前点为对角线终点
      const points = currentRect._starPoints || 5
      const rx = w / 2
      const ry = h / 2
      const innerRx = rx * 0.4
      const innerRy = ry * 0.4

      const pts: any[] = []
      for (let i = 0; i < points * 2; i++) {
        const rX = i % 2 === 0 ? rx : innerRx
        const rY = i % 2 === 0 ? ry : innerRy
        const angle = (Math.PI / points) * i - Math.PI / 2
        pts.push({ x: rX * Math.cos(angle), y: rY * Math.sin(angle) })
      }

      // 计算真实包围盒，防止裁切
      let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
      pts.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
      })

      currentRect.set({
        points: pts,
        width: maxX - minX,
        height: maxY - minY,
        pathOffset: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 },
        left: l,
        top: t,
        originX: 'left',
        originY: 'top',
        dirty: true
      })
    } else {
      currentRect.set({ left: l, top: t, width: w, height: h })
    }
    fCanvas.value.renderAll()
  }
}

const handleMouseUp = () => {
  // 抓手工具：结束拖拽
  if (isPanning) {
    isPanning = false
    lastPanPoint = null
    if (fCanvas.value) fCanvas.value.defaultCursor = canvasTool.value === 'hand' ? 'grab' : 'default'
    return
  }

  if (isErasing.value) { isErasing.value = false; saveState() }
  if (isDrawingLine.value) {
    isDrawingLine.value = false
    if (currentLine) {
      // 直线工具：检查是否从节点拖拽到另一个节点
      if (startNode && canvasTool.value === 'line' && lastMouseEvent) {
        const endTarget = fCanvas.value.findTarget(lastMouseEvent, false)
        // 移除临时线
        fCanvas.value.remove(currentLine)
        currentLine = null
        // 如果释放位置在另一个节点上，创建连接
        if (endTarget && endTarget.isSkeleton && endTarget !== startNode) {
          connectNodes(startNode, endTarget)
        }
        startNode = null
      } else if (canvasTool.value === 'arrow') {
        // 箭头工具：添加箭头头部
        addArrowHead(currentLine)
        currentLine.set({ id: uuidv4() }); currentLine.setCoords(); saveState()
      } else {
        currentLine.set({ id: uuidv4() }); currentLine.setCoords(); saveState()
        startNode = null
      }
    }
  }
  if (isDrawingCrop.value) { isDrawingCrop.value = false; if (cropRect && cropRect.width > 5) analyzeArea(cropRect); fCanvas.value.remove(cropRect); cropRect = null }
  // 形状绘制完成
  if (isDrawingRect.value) {
    isDrawingRect.value = false
    if (currentRect) {
      const minSize = 5
      let hasSize = false
      // 椭圆：检查半径
      if (currentRect.type === 'ellipse') {
        hasSize = currentRect.rx > minSize && currentRect.ry > minSize
      }
      // 多边形/星形：检查是否有有效的顶点
      else if (currentRect.type === 'polygon') {
        hasSize = currentRect.points && currentRect.points.length > 2
      }
      // 三角形/矩形：检查宽高
      else {
        hasSize = currentRect.width > minSize && currentRect.height > minSize
      }
      if (hasSize) {
        currentRect.set({ id: uuidv4(), selectable: true, evented: true })
        currentRect.setCoords()
        fCanvas.value.setActiveObject(currentRect)
        saveState()
      } else {
        fCanvas.value.remove(currentRect)
      }
      currentRect = null
    }
  }
  // 橡皮擦光标保持可见（由 setTool 控制隐藏）
  if (eraserCursor && canvasTool.value !== 'eraser') eraserCursor.set('visible', false)
  fCanvas.value.renderAll()
}
const handlePathCreated = (opt: any) => {
  const path = opt.path; if (!path) return; path.setCoords()
  const center = path.getCenterPoint(), dpr = window.devicePixelRatio || 1
  const el = path.toCanvasElement({ multiplier: dpr })
  const img = new fabric.Image(el, { left: center.x, top: center.y, originX: 'center', originY: 'center', scaleX: (path.scaleX || 1) / dpr, scaleY: (path.scaleY || 1) / dpr, angle: path.angle || 0, erasable: true, isUserStroke: true })
  // 非选择工具下，新创建的对象不可选
  if (activeTool.value !== 'select') {
    img.selectable = false
    img.evented = false
  }
  fCanvas.value.add(img); fCanvas.value.remove(path); saveState(); fCanvas.value.renderAll()
}
const refreshInkLayer = () => { if (!inkLayer || !fCanvas.value) return; inkLayer.setElement(inkCanvas); fCanvas.value.requestRenderAll() }

const restoreState = (snapshot: any) => {
  if (!snapshot || !snapshot.fabric) return; isStateSavingLocked = true
  const p = new Promise((resolve) => { if (!snapshot.ink) return resolve(null); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = snapshot.ink })
  fCanvas.value.loadFromJSON(snapshot.fabric, async () => {
    const img = await p; if (img && inkCtx) { inkCtx.save(); inkCtx.globalCompositeOperation = 'copy'; inkCtx.drawImage(img, 0, 0); inkCtx.restore() };
    inkLayer = fCanvas.value.getObjects().find((o: any) => o.isInkLayer);
    if (inkLayer) inkLayer.setElement(inkCanvas);
    // 恢复背景透明度变量
    const bg = fCanvas.value.backgroundImage
    if (bg) {
      bgOpacity.value = Math.round((bg.opacity || 1) * 100)
    }
    fCanvas.value.renderAll(); isStateSavingLocked = false
  })
}

// undo, redo 已迁移到 useHistory composable

// ─── 工具切换（互斥） ─────────────────────────────────────


/**
 * 设置绘图子工具（只切换 canvasTool，不切换 activeTool）
 * 用于在 ShapesPanel 等面板内选择绘图工具
 */

// ─── Tools ─────────────────────────────────────────────────
// 以下函数使用 useShapes composable
// applyColor 已在 composable 初始化中解构
const { isBrushObject, updatePathStrokeWidth, updatePathScale, updatePathBlur, createStar, createPolygon, addArrowHead } = useShapes(fCanvas, currentColor, fillColor)
const updateColor = (e: Event) => {
  const newColor = (e.target as HTMLInputElement).value
  applyColor(newColor)
}
const updateColorFromPanel = (newColor: string) => {
  applyColor(newColor)
}

// createStar, createPolygon, addArrowHead 已迁移到 useShapes composable
// getDrawArea, toggleGuide, drawReference, deleteGuides 已迁移到 useReferenceLines composable

const addShape = (type: string) => {
  if (!fCanvas.value) return
  const c = fCanvas.value.getCenter()
  const shape = type === 'rect'
    ? new fabric.Rect({ left: c.left, top: c.top, width: 120, height: 80, fill: 'transparent', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', erasable: true })
    : new fabric.Circle({ left: c.left, top: c.top, radius: 60, fill: 'transparent', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', erasable: true })
  fCanvas.value.add(shape)
  fCanvas.value.setActiveObject(shape)
  fCanvas.value.renderAll()
  saveState()
  // 切换到选择工具，让用户可以修改形状属性
  setDrawTool('select')
}

// 添加文字
const addText = () => {
  if (!fCanvas.value) return
  const c = fCanvas.value.getCenter()
  const text = new fabric.IText('双击编辑', {
    left: c.left, top: c.top,
    fontSize: textFontSize.value,
    fill: currentColor.value,
    originX: 'center', originY: 'center',
    erasable: true
  })
  fCanvas.value.add(text)
  fCanvas.value.setActiveObject(text)
  fCanvas.value.renderAll()
  saveState()
}

const deleteSelected = () => { fCanvas.value.getActiveObjects().forEach((o: any) => fCanvas.value.remove(o)); fCanvas.value.discardActiveObject(); fCanvas.value.renderAll(); saveState() }
const clearCanvas = () => { if (!confirm('确定清空画布？')) return; fCanvas.value.getObjects().slice().forEach((o: any) => fCanvas.value.remove(o)); fCanvas.value.renderAll(); saveState() }

// 选中对象（使用 ref 而非 computed，通过 Fabric.js 事件更新）
const selectedObject = ref<any>(null)

/** 更新选中对象引用 */
const updateSelection = () => {
  const obj = fCanvas.value?.getActiveObject() || null
  selectedObject.value = obj
  // 同步画笔对象的羽化值
  if (isBrushObject(obj) && obj.shadow) {
    pathBlur.value = Math.round(obj.shadow.blur / 2)
  } else {
    pathBlur.value = 0
  }
}

// 图层操作
const bringToFront = () => {
  const obj = fCanvas.value?.getActiveObject()
  if (obj) { obj.bringToFront(); fCanvas.value.renderAll() }
}
const sendToBack = () => {
  const obj = fCanvas.value?.getActiveObject()
  if (obj) { obj.sendToBack(); fCanvas.value.renderAll() }
}
const moveUp = () => {
  const obj = fCanvas.value?.getActiveObject()
  if (obj) { obj.bringForward(); fCanvas.value.renderAll() }
}
const moveDown = () => {
  const obj = fCanvas.value?.getActiveObject()
  if (obj) { obj.sendBackwards(); fCanvas.value.renderAll() }
}

// 复制粘贴
let clipboard: any = null
const copySelected = () => {
  const obj = fCanvas.value?.getActiveObject()
  if (obj) {
    obj.clone((cloned: any) => { clipboard = cloned })
  }
}
const pasteClipboard = () => {
  if (!clipboard || !fCanvas.value) return
  clipboard.clone((cloned: any) => {
    fCanvas.value.discardActiveObject()
    cloned.set({ left: cloned.left + 20, top: cloned.top + 20, evented: true, selectable: true })
    fCanvas.value.add(cloned)
    fCanvas.value.setActiveObject(cloned)
    fCanvas.value.renderAll()
    saveState()
  })
}

/**
 * 获取画布/背景图的绘制区域
// getDrawArea, toggleGuide, drawReference, deleteGuides 已迁移到 useReferenceLines composable
const printInfo = (msg: string) => console.log(`ℹ️ ${msg}`)
// eslint-disable-next-line no-console
const printSuccess = (msg: string) => console.log(`✅ ${msg}`)

// ─── Image Upload ──────────────────────────────────────────

/**
 * 开始裁剪模式（从图片编辑面板调用）
 */

/**
 * 更新背景透明度
 */

/**
 * 更新裁剪遮罩（裁剪框外区域半透明）
 */

/**
 * 裁剪框移动时更新遮罩
 */

/**
 * 裁剪框缩放时更新比例约束
 */

/**
 * 更新裁剪比例
 * @param ratio 新的比例值（null=自由）
 */

/**
 * 确认裁剪
 */

/**
 * 取消裁剪（使用原图）
 */

// ─── AI Model Loading ──────────────────────────────────────
// 抑制已知的无害警告
const originalWarn = console.warn
const originalError = console.error
console.warn = (...args: any[]) => {
  const msg = String(args[0] || '')
  // 忽略 powerPreference 和 willReadFrequently 警告
  if (msg.includes('powerPreference') || msg.includes('willReadFrequently')) return
  originalWarn(...args)
}
console.error = (...args: any[]) => {
  const msg = String(args[0] || '')
  // 忽略浏览器扩展连接错误
  if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) return
  originalError(...args)
}

const ensureModelsLoaded = async () => {
  if (isDetectorReady.value) return
  try {
    loadingStep.value = '正在初始化 AI 引擎...'; await tf.ready(); const base = origin()
    loadingStep.value = '正在读取骨架模型...'
    detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, modelUrl: MOVENET_MODEL_URL() })
    loadingStep.value = '正在读取遮罩模型...'
    segmenter = await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation, { runtime: 'tfjs', modelUrl: `${base}/models/selfie_segmentation/model.json` })
    loadingStep.value = '正在读取面部模型...'
    faceDetector = await faceLandmarksDetection.createDetector(faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh, { runtime: 'tfjs', refineLandmarks: true, detectorModelUrl: `${base}/models/face_detector/model.json`, landmarkModelUrl: `${base}/models/face_landmark/model.json` })
    loadingStep.value = '正在读取手部模型...'
    handDetector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, { runtime: 'tfjs', modelType: 'full', detectorModelUrl: `${base}/models/hand_detector/model.json`, landmarkModelUrl: `${base}/models/hand_landmark/model.json` })
    isDetectorReady.value = true; loadingStep.value = ''
  } catch (err) { console.error('AI models load fail:', err); loadingStep.value = '模型加载失败'; setTimeout(() => { loadingStep.value = ''; isAnalyzing.value = false }, 3000) }
}

// ─── AI Functions ──────────────────────────────────────────


/**
 * 在指定位置添加新的骨架节点
 */

/**
 * 在节点连接的线段中点添加新节点
 */

/**
 * 连接两个骨架节点
 * @param nodeA 起始节点
 * @param nodeB 结束节点
 */

const drawImageOutline = async (segs: any[], hex: string, offset: any = null) => {
  if (!segs?.length) return; const h = hex.replace('#', '')
  const fg = { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 255 }
  const mask = await bodySegmentation.toBinaryMask(segs, fg, { r: 0, g: 0, b: 0, a: 0 })
  const c1 = document.createElement('canvas'); c1.width = mask.width; c1.height = mask.height; c1.getContext('2d', { willReadFrequently: true })!.putImageData(mask, 0, 0)
  const c2 = document.createElement('canvas'); c2.width = mask.width; c2.height = mask.height; const ctx = c2.getContext('2d', { willReadFrequently: true })!
  ;[[4,0],[-4,0],[0,4],[0,-4]].forEach(([dx,dy]) => ctx.drawImage(c1, dx, dy)); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(c1, 0, 0)
  const bg = fCanvas.value.backgroundImage; const tx = offset ? offset.x : bg.left, ty = offset ? offset.y : bg.top, sx = offset ? offset.sw : bg.scaleX, sy = offset ? offset.sh : bg.scaleY
  inkCtx.save(); inkCtx.translate(tx, ty); inkCtx.scale(sx, sy); offset ? inkCtx.drawImage(c2, 0, 0) : inkCtx.drawImage(c2, -c2.width/2, -c2.height/2); inkCtx.restore(); refreshInkLayer()
}

// 映射关键点坐标
const mapPoint = (k: any, offset: any) => {
  if (offset) return { x: offset.x + k.x * offset.sw, y: offset.y + k.y * offset.sh }
  const bg = fCanvas.value.backgroundImage
  if (!bg) return { x: k.x, y: k.y }
  return { x: bg.left - bg.getScaledWidth() / 2 + k.x * bg.scaleX, y: bg.top - bg.getScaledHeight() / 2 + k.y * bg.scaleY }
}

const drawFaceMesh = (face: any, offset: any = null) => {
  if (!face?.keypoints?.length) return; const kps = face.keypoints
  const mp = (i: number) => { const k = kps[i]; return k ? mapPoint({ x: k.x, y: k.y, score: 1 }, offset) : null }
  const addLine = (c: string, w: number, ...ps: [number,number][]) => { ps.forEach(([a,b]) => { const pA = mp(a), pB = mp(b); if (pA && pB) fCanvas.value.add(new fabric.Line([pA.x,pA.y,pB.x,pB.y], { stroke: c, strokeWidth: w, selectable: false, evented: false, isAutoGenerated: true, erasable: true, opacity: 0.85 })) }) }
  const addDot = (c: string, r: number, i: number) => { const p = mp(i); if (p) fCanvas.value.add(new fabric.Circle({ left: p.x, top: p.y, radius: r, fill: c, originX: 'center', originY: 'center', selectable: false, evented: false, isAutoGenerated: true, erasable: true, opacity: 0.9 })) }
  const le = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,33]; for (let i = 0; i < le.length-1; i++) addLine('#34d399', 1.5, [le[i], le[i+1]])
  const re = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382,362]; for (let i = 0; i < re.length-1; i++) addLine('#34d399', 1.5, [re[i], re[i+1]])
  addLine('#fb923c', 1.5, [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19]); addDot('#fb923c', 3, 1)
  const mo = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,61]; for (let i = 0; i < mo.length-1; i++) addLine('#f472b6', 1.5, [mo[i], mo[i+1]])
}

const drawHandSkeleton = (hand: any, offset: any = null) => {
  if (!hand?.keypoints?.length) return
  const c = currentColor.value
  const conn = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20]]
  const pts = hand.keypoints.map((k: any) => mapPoint({ x: k.x, y: k.y, score: 1 }, offset))
  conn.forEach(([a,b]) => {
    if (pts[a] && pts[b]) fCanvas.value.add(new fabric.Line([pts[a].x,pts[a].y,pts[b].x,pts[b].y], {
      stroke: c, strokeWidth: 1.5,
      selectable: false, evented: false,
      opacity: 0.8, erasable: true,
      isAutoGenerated: true
    }))
  })
}

const runFullAnalysis = async (src: any, offset: any = null) => {
  if (!bgImageUploaded.value || !detector) return; let found = false; isStateSavingLocked = true
  const type = detectionType.value
  try {
    // 人体分割
    if ((type === 'all' || type === 'segmentation') && segmenter) {
      const s = await segmenter.segmentPeople(src)
      if (s?.length) { found = true; await drawImageOutline(s, currentColor.value, offset) }
    }
    // 姿势检测
    if ((type === 'all' || type === 'pose') && detector) {
      const p = await detector.estimatePoses(src)
      if (p?.length) { drawPoseSkeleton(p[0], offset); found = true }
    }
    // 面部识别
    if ((type === 'all' || type === 'face') && faceDetector) {
      const f = await faceDetector.estimateFaces(src)
      if (f?.length) { drawFaceMesh(f[0], offset); found = true }
    }
    // 手部识别
    if ((type === 'all' || type === 'hand') && handDetector) {
      const h = await handDetector.estimateHands(src)
      if (h?.length) { h.forEach((x: any) => drawHandSkeleton(x, offset)); found = true }
    }
    fCanvas.value.getObjects().forEach((o: any) => { if (o.type === 'circle' || o.type === 'line') o.bringToFront() })
  } catch (e) { console.error('Analysis error:', e) } finally {
    isStateSavingLocked = false
    if (!offset) {
      isAnalyzing.value = false
      if (!found) {
        const typeLabel = detectionTypes.find(d => d.value === type)?.label || '特征'
        loadingStep.value = `未检测到${typeLabel}`
        setTimeout(() => { loadingStep.value = '' }, 2000)
      }
      fCanvas.value.renderAll()
      if (found) { analysisComplete.value = true; setTimeout(() => { analysisComplete.value = false }, 2000) }
    }
  }
}

const autoAnalyze = async () => {
  if (isAnalyzing.value || !bgImageUploaded.value) return; await ensureModelsLoaded(); if (!detector) return
  isAnalyzing.value = true; loadingStep.value = '正在分析构图...'
  const el = fCanvas.value.backgroundImage.getElement()
  fCanvas.value.getObjects().slice().forEach((o: any) => { if (o.type === 'circle' || (o.type === 'line' && o.id)) fCanvas.value.remove(o) })
  if (inkCtx) { inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height); refreshInkLayer() }
  await runFullAnalysis(el); loadingStep.value = ''; saveState()
}

// 清除所有 AI 分析结果
const clearAnalysis = () => {
  if (!fCanvas.value) return
  // 清除骨架节点和连线
  fCanvas.value.getObjects().slice().forEach((o: any) => {
    if (o.isSkeleton || o.isAutoGenerated || o.type === 'circle' || (o.type === 'line' && o.id)) {
      fCanvas.value.remove(o)
    }
  })
  // 清除墨迹图层（人体分割轮廓）
  if (inkCtx) {
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height)
    refreshInkLayer()
  }
  fCanvas.value.renderAll()
  saveState()
}

const analyzeArea = async (rect: any) => {
  if (isAnalyzing.value) return; await ensureModelsLoaded(); isAnalyzing.value = true
  try {
    const bg = fCanvas.value.backgroundImage, el = bg.getElement()
    const cx = (rect.left - (bg.left - bg.getScaledWidth()/2)) / bg.scaleX, cy = (rect.top - (bg.top - bg.getScaledHeight()/2)) / bg.scaleY
    const cw = rect.width / bg.scaleX, ch = rect.height / bg.scaleY
    const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch; tmp.getContext('2d', { willReadFrequently: true })!.drawImage(el, cx, cy, cw, ch, 0, 0, cw, ch)
    await runFullAnalysis(tmp, { x: rect.left, y: rect.top, sw: rect.width / cw, sh: rect.height / ch })
    saveState() // 记录步数
  } catch (e) { console.error('Area analysis error:', e) } finally { isAnalyzing.value = false }
}

// ─── Save / Exit ───────────────────────────────────────────
const saveTemplate = () => { alert('保存功能开发中') }
const triggerExit = () => { if (confirm('确定退出？未保存的修改将丢失。')) router.push('/') }
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; }

.editor-root {
  display: flex; flex-direction: column; height: 100vh; height: 100dvh;
  background: #0a0a0f; color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  overflow: hidden;
}

/* ── 顶部栏 ── */
.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; height: 48px;
  background: rgba(15, 15, 25, 0.95); border-bottom: 1px solid rgba(255,255,255,0.06);
  backdrop-filter: blur(20px); flex-shrink: 0; z-index: 10;
}
.top-left, .top-right { display: flex; align-items: center; gap: 8px; }
.top-center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 12px; }

.logo-mark { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 20px; }
.logo-text { font-size: 14px; font-weight: 700; background: linear-gradient(135deg, #6366f1, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

.history-btns { display: flex; gap: 4px; align-items: center; }

.hbtn.history {
  width: auto; min-width: 64px; height: 34px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; color: #94a3b8;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 0 12px; cursor: pointer; transition: all 0.2s;
  font-size: 12px; font-weight: 500;
}
.hbtn.history:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #e2e8f0; border-color: rgba(255,255,255,0.15); }
.hbtn.history:disabled { opacity: 0.25; cursor: not-allowed; }
.btn-text { font-size: 12px; }

.step-counter {
  font-size: 11px; color: #6366f1; font-weight: 600;
  margin-left: 8px; padding: 3px 8px;
  background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2);
  border-radius: 6px;
}

.title-editable { }
.title-input {
  background: transparent; border: 1px solid transparent; border-radius: 6px;
  color: #94a3b8; font-size: 13px; font-weight: 500; padding: 4px 8px; width: 180px;
  text-align: center; transition: all 0.2s;
}
.title-input:hover { border-color: rgba(255,255,255,0.08); }
.title-input:focus { outline: none; border-color: rgba(99,102,241,0.4); color: #e2e8f0; background: rgba(255,255,255,0.03); }

.hbtn {
  width: 32px; height: 32px; min-width: 32px;
  background: transparent; border: 1px solid transparent; border-radius: 8px;
  color: #64748b; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s ease;
}
.hbtn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.hbtn:disabled { opacity: 0.2; cursor: not-allowed; }
.hbtn.sm { width: 28px; height: 28px; min-width: 28px; }
.hbtn.back:hover { background: rgba(239,68,68,0.1); color: #f87171; }
.hbtn.icon-only { width: auto; padding: 0 8px; font-size: 12px; color: #4a4a5a; }

.hbar-div { width: 1px; height: 16px; background: rgba(255,255,255,0.06); }

.btn-save {
  display: flex; align-items: center; gap: 6px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
  border: none; padding: 6px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 2px 8px rgba(99,102,241,0.3); transition: all 0.2s;
}
.btn-save:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.4); transform: translateY(-1px); }
.btn-save:disabled { background: #1e1e2e; color: #4a4a5a; box-shadow: none; transform: none; cursor: not-allowed; }

/* ── 主内容区 ── */
.main-content { flex: 1; display: flex; overflow: hidden; }

/* ── 左侧工具栏 ── */
.left-toolbar {
  width: 56px; background: rgba(15, 15, 25, 0.95);
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column; align-items: center;
  padding: 12px 0; gap: 4px; flex-shrink: 0;
  overflow-y: auto;
}

.tool-group { display: flex; flex-direction: column; gap: 4px; align-items: center; }
.tool-divider { width: 32px; height: 1px; background: rgba(255,255,255,0.08); margin: 6px 0; }

.tool-btn {
  width: 40px; height: 40px; border: none; background: transparent;
  border-radius: 10px; color: #64748b; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s ease;
}
.tool-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.tool-btn.active { background: rgba(99,102,241,0.15); color: #818cf8; box-shadow: inset 0 0 0 1px rgba(99,102,241,0.3); }

.sub-tools { display: flex; flex-direction: column; gap: 2px; }
.sub-divider { width: 20px; height: 1px; background: rgba(255,255,255,0.04); margin: 4px auto; }

.sub-btn {
  width: 36px; height: 36px; border: none; background: transparent;
  border-radius: 8px; color: #4a4a5a; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease; margin: 0 auto;
}
.sub-btn:hover { background: rgba(255,255,255,0.06); color: #94a3b8; }
.sub-btn.active { background: rgba(99,102,241,0.12); color: #818cf8; }
.sub-btn.danger:hover { background: rgba(239,68,68,0.1); color: #f87171; }

.tool-spacer { flex: 1; }

.zoom-tools {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.06);
}
.zoom-label {
  font-size: 10px; color: #64748b; font-weight: 600;
  padding: 2px 4px; background: rgba(255,255,255,0.04);
  border-radius: 4px; text-align: center; min-width: 36px;
}

.zoom-display {
  text-align: center; margin-bottom: 16px;
}
.zoom-value {
  font-size: 32px; font-weight: 700; color: #e2e8f0;
  font-variant-numeric: tabular-nums;
}
.zoom-btns {
  display: flex; justify-content: center; gap: 12px; margin-bottom: 16px;
}
.zoom-action-btn {
  width: 48px; height: 48px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; color: #94a3b8; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
}
.zoom-action-btn:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; border-color: rgba(255,255,255,0.15); }

/* ── 抓手工具提示 ── */
.hand-tips { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.hand-tip-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  transition: all 0.15s;
}
.hand-tip-item:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); }
.hand-tip-icon { font-size: 20px; width: 32px; text-align: center; flex-shrink: 0; }
.hand-tip-text { display: flex; flex-direction: column; gap: 2px; }
.hand-tip-title { font-size: 13px; font-weight: 600; color: #e2e8f0; }
.hand-tip-desc { font-size: 11px; color: #64748b; }

.zoom-shortcuts { display: flex; flex-direction: column; gap: 8px; }
.shortcut-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
.shortcut-item kbd {
  display: inline-block; padding: 2px 6px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px; font-size: 11px; font-family: monospace; color: #94a3b8;
}
.shortcut-item span { margin-left: auto; }

/* ── 帮助弹窗 ── */
.help-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.help-modal {
  width: 100%; max-width: 520px; max-height: 80vh;
  background: linear-gradient(145deg, #1a1a2e, #16162a);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
  overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.help-header h2 { font-size: 16px; font-weight: 600; color: #e2e8f0; margin: 0; }
.help-close {
  width: 28px; height: 28px; background: none; border: none;
  color: #64748b; cursor: pointer; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.help-close:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.help-body { padding: 20px; overflow-y: auto; }
.help-section { margin-bottom: 20px; }
.help-section:last-child { margin-bottom: 0; }
.help-section h3 { font-size: 13px; font-weight: 600; color: #94a3b8; margin: 0 0 12px 0; }
.shortcut-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.help-list { margin: 0; padding: 0 0 0 16px; }
.help-list li { font-size: 13px; color: #94a3b8; line-height: 1.8; }
.help-list li b { color: #e2e8f0; }

.color-picker-area { padding: 8px; }
.color-swatch { position: relative; }
.color-swatch input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-preview {
  width: 32px; height: 32px; border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.1); cursor: pointer;
  display: block; transition: all 0.2s;
}
.swatch-preview:hover { border-color: rgba(99,102,241,0.5); }

/* ── 画布区域 ── */
.canvas-area {
  flex: 1; position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 50%, #13131a, #0a0a0f);
}
canvas { touch-action: none; display: block; }

.upload-cover {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  z-index: 20; cursor: pointer;
}
.upload-card {
  background: linear-gradient(145deg, rgba(20,20,35,0.8), rgba(15,15,25,0.9));
  border: 1px solid rgba(99,102,241,0.15); border-radius: 24px;
  padding: 52px 52px 44px; text-align: center; max-width: 400px;
  backdrop-filter: blur(20px); transition: all 0.3s ease;
}
.upload-cover:hover .upload-card { border-color: rgba(99,102,241,0.4); box-shadow: 0 0 80px rgba(99,102,241,0.08); transform: translateY(-4px); }
.upload-icon { width: 88px; height: 88px; margin: 0 auto 24px; background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12)); border: 1px solid rgba(99,102,241,0.2); border-radius: 24px; display: flex; align-items: center; justify-content: center; color: #818cf8; }
.upload-card h3 { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #e2e8f0; }
.upload-card p { font-size: 14px; color: #64748b; margin: 0 0 28px; line-height: 1.6; }
.upload-btn { display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; padding: 12px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 20px rgba(99,102,241,0.3); transition: all 0.2s; }
.upload-cover:hover .upload-btn { box-shadow: 0 8px 30px rgba(99,102,241,0.4); }
.upload-hint { font-size: 12px; color: #4a4a5a; margin-top: 20px !important; }

.status-pill {
  position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
  background: rgba(15,15,25,0.92); backdrop-filter: blur(12px);
  border: 1px solid rgba(99,102,241,0.2); color: #818cf8;
  padding: 10px 20px; border-radius: 12px; font-size: 13px; font-weight: 500;
  z-index: 30; display: flex; align-items: center; gap: 10px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
}
.status-pill.success { border-color: rgba(34,197,94,0.3); color: #4ade80; }
.status-spinner { width: 16px; height: 16px; border: 2px solid rgba(129,140,248,0.2); border-top-color: #818cf8; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── 右侧属性面板 ── */
.right-panel {
  width: 260px; background: rgba(15, 15, 25, 0.95);
  border-left: 1px solid rgba(255,255,255,0.06);
  overflow-y: auto; flex-shrink: 0;
}

.panel-section { padding: 0px; }

.panel-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #94a3b8;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* ── AI 面板 Hero 按钮 ── */
.ai-hero-btn {
  width: 100%; position: relative; overflow: hidden;
  background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15));
  border: 1px solid rgba(99,102,241,0.25); border-radius: 14px;
  padding: 16px; cursor: pointer; transition: all 0.3s;
  margin-bottom: 16px;
}
.ai-hero-btn:hover { border-color: rgba(99,102,241,0.5); transform: translateY(-1px); }
.ai-hero-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.ai-hero-glow {
  position: absolute; inset: -50%; width: 200%; height: 200%;
  background: radial-gradient(circle at 30% 30%, rgba(99,102,241,0.2), transparent 50%),
              radial-gradient(circle at 70% 70%, rgba(139,92,246,0.2), transparent 50%);
  animation: ai-glow-rotate 8s linear infinite;
  pointer-events: none;
}
@keyframes ai-glow-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.ai-hero-content { position: relative; display: flex; align-items: center; gap: 14px; }
.ai-hero-icon {
  width: 48px; height: 48px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 14px; display: flex; align-items: center; justify-content: center;
  color: #fff; box-shadow: 0 4px 16px rgba(99,102,241,0.35);
}
.ai-hero-text { display: flex; flex-direction: column; gap: 4px; }
.ai-hero-title { font-size: 15px; font-weight: 700; color: #e2e8f0; }
.ai-hero-desc { font-size: 11px; color: #94a3b8; }
.ai-hero-spinner {
  position: absolute; top: 8px; right: 8px;
  width: 18px; height: 18px;
  border: 2px solid rgba(129,140,248,0.2); border-top-color: #818cf8;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}

/* ── 识别类型卡片 ── */
.type-grid { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.type-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  color: #94a3b8; cursor: pointer; transition: all 0.15s;
}
.type-card:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.type-card.active { background: rgba(99,102,241,0.12); color: #818cf8; border-color: rgba(99,102,241,0.3); }
.type-card-icon { font-size: 20px; width: 32px; text-align: center; flex-shrink: 0; }
.type-card-label { font-size: 13px; font-weight: 600; color: inherit; min-width: 40px; }
.type-card-desc { font-size: 11px; color: #64748b; margin-left: auto; }

.tool-row { display: flex; gap: 6px; margin-bottom: 12px; }
.tool-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-width: 48px; background: none; border: none; color: #64748b;
  cursor: pointer; padding: 4px; border-radius: 8px; transition: all 0.15s;
}
.tool-item:hover { color: #e2e8f0; }
.tool-item.active { color: #818cf8; }
.tool-item span { font-size: 10px; font-weight: 500; }
.ti-icon { width: 36px; height: 36px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.tool-item:hover .ti-icon { background: rgba(255,255,255,0.08); }
.tool-item.active .ti-icon { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); }

.tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
.grid-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; color: #64748b; cursor: pointer; transition: all 0.15s;
}
.grid-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.1); }
.grid-btn.active { background: rgba(99,102,241,0.12); color: #818cf8; border-color: rgba(99,102,241,0.3); }
.grid-btn span { font-size: 11px; font-weight: 500; }

.panel-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0; }

.slider-group { margin-bottom: 16px; }
.slider-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-val { font-size: 12px; color: #94a3b8; min-width: 36px; text-align: right; font-weight: 500; }

input[type=range] { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 4px; -webkit-appearance: none; cursor: pointer; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(99,102,241,0.4); }

.color-section { margin-bottom: 16px; }
.color-row { display: flex; align-items: center; gap: 12px; }
.color-swatch-lg { position: relative; }
.color-swatch-lg input[type=color] { position: absolute; opacity: 0; width: 0; height: 0; }
.swatch-lg { width: 40px; height: 40px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.1); cursor: pointer; display: block; transition: all 0.2s; }
.swatch-lg:hover { border-color: rgba(99,102,241,0.5); }

.preset-colors { display: flex; flex-wrap: wrap; gap: 6px; }
.preset-color { width: 24px; height: 24px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.15s; }
.preset-color:hover { transform: scale(1.15); border-color: rgba(255,255,255,0.3); }

.danger-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 10px; color: #f87171; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.danger-btn:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }

/* ── 识别类型选择 ── */
.section-label {
  font-size: 11px; font-weight: 600; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
}
.crop-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px; background: rgba(99,102,241,0.08); border: 1px dashed rgba(99,102,241,0.3);
  border-radius: 10px; color: #818cf8; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.2s; margin-bottom: 16px;
}
.crop-btn:hover { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.5); }
.crop-btn.active { background: rgba(99,102,241,0.2); border-style: solid; border-color: #6366f1; animation: pulse-border 2s infinite; }
.crop-btn:disabled { opacity: 0.4; cursor: not-allowed; }

@keyframes pulse-border {
  0%, 100% { border-color: rgba(99,102,241,0.3); }
  50% { border-color: rgba(99,102,241,0.8); }
}

/* ── 动画 ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
</style>
