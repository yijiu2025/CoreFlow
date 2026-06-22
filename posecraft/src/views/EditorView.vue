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
          <button class="tool-btn" :class="{ active: currentTool === 'hand' }" @click="selectHandTool()" title="抓手工具 (H)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 11V6a2 2 0 0 0-4 0v1"/>
              <path d="M14 10V4a2 2 0 0 0-4 0v2"/>
              <path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </button>
          <button class="tool-btn" :class="{ active: activeTab === 'ai' }" @click="selectTab('ai')" title="AI 智能">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="tool-btn" :class="{ active: activeTab === 'markup' }" @click="selectTab('markup')" title="标注工具">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
              <path d="M2 2l7.586 7.586"/>
              <circle cx="11" cy="11" r="2"/>
            </svg>
          </button>
          <button class="tool-btn" :class="{ active: activeTab === 'shapes' }" @click="selectTab('shapes')" title="形状">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            </svg>
          </button>
          <button class="tool-btn" :class="{ active: activeTab === 'text' }" @click="selectTab('text')" title="文字工具">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="4 7 4 4 20 4 20 7"/>
              <line x1="9" y1="20" x2="15" y2="20"/>
              <line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
          </button>
        </div>

        <div class="tool-divider"></div>

        <!-- 常驻操作 -->
        <button class="sub-btn danger" @click="deleteSelected" title="删除选中 (Delete)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>

        <div class="tool-spacer"></div>

        <!-- 颜色选择器（标注和 AI 面板） -->
        <div class="color-picker-area" v-show="activeTab === 'markup' || activeTab === 'ai'">
          <div class="color-swatch">
            <input type="color" v-model="currentColor" @input="updateColor" id="color-picker" />
            <label for="color-picker" class="swatch-preview" :style="{ background: currentColor }"></label>
          </div>
        </div>
      </aside>

      <!-- 画布区域 -->
      <main class="canvas-area" ref="canvasContainer">
        <input type="file" ref="fileInput" @change="handleImageUpload" accept="image/*" hidden />

        <!-- 未上传时的引导 -->
        <transition name="fade">
          <div v-if="!bgImageUploaded" class="upload-cover" @click="triggerFileInput">
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
        <AiPanel v-show="activeTab === 'ai'"
          :isAnalyzing="isAnalyzing"
          v-model="detectionType"
          :currentTool="currentTool"
          v-model:bgOpacity="bgOpacity"
          v-model:currentColor="currentColor"
          :detectionTypes="detectionTypes"
          :presetColors="presetColors"
          @autoAnalyze="autoAnalyze"
          @setTool="setTool"
          @clearAnalysis="clearAnalysis"
          @addText="addText"
        />

        <MarkupPanel v-show="activeTab === 'markup'"
          :currentTool="currentTool"
          v-model:brushSize="brushSize"
          v-model:eraserSize="eraserSize"
          v-model:currentColor="currentColor"
          :presetColors="presetColors"
          @setTool="setTool"
        />

        <ShapesPanel v-show="activeTab === 'shapes'"
          @addShape="addShape"
          @drawReference="drawReference"
          @deleteGuides="deleteGuides"
          @clearCanvas="clearCanvas"
        />

        <TextPanel v-show="activeTab === 'text'"
          v-model:fontSize="textFontSize"
          v-model:currentColor="currentColor"
          :presetColors="presetColors"
          @addText="addText"
        />

        <HandPanel v-show="currentTool === 'hand'"
          :zoomPercent="zoomPercent"
          v-model:zoomSlider="zoomSlider"
          @zoomIn="zoomIn"
          @zoomOut="zoomOut"
          @resetZoom="resetZoom"
          @fitToScreen="fitToScreen"
        />
      </aside>
    </div>

    <!-- 帮助弹窗 -->
    <Transition name="fade">
      <div v-if="showHelp" class="help-overlay" @click.self="showHelp = false">
        <div class="help-modal">
          <div class="help-header">
            <h2>快捷键与使用说明</h2>
            <button class="help-close" @click="showHelp = false">✕</button>
          </div>
          <div class="help-body">
            <div class="help-section">
              <h3>🛠️ 工具切换</h3>
              <div class="shortcut-grid">
                <div class="shortcut-item"><kbd>H</kbd><span>抓手工具</span></div>
                <div class="shortcut-item"><kbd>空格</kbd><span>临时抓手（按住）</span></div>
                <div class="shortcut-item"><kbd>Delete</kbd><span>删除选中</span></div>
              </div>
            </div>

            <div class="help-section">
              <h3>📝 编辑操作</h3>
              <div class="shortcut-grid">
                <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>撤销</span></div>
                <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Y</kbd><span>重做</span></div>
                <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd><span>重做</span></div>
              </div>
            </div>

            <div class="help-section">
              <h3>🔍 缩放操作</h3>
              <div class="shortcut-grid">
                <div class="shortcut-item"><kbd>滚轮</kbd><span>缩放（鼠标中心）</span></div>
                <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>=</kbd><span>放大</span></div>
                <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>-</kbd><span>缩小</span></div>
                <div class="shortcut-item"><kbd>Ctrl</kbd>+<kbd>0</kbd><span>重置缩放</span></div>
              </div>
            </div>

            <div class="help-section">
              <h3>📖 使用说明</h3>
              <ul class="help-list">
                <li>上传图片后，点击 <b>智能分析</b> 自动检测姿势、面部、手部</li>
                <li>选择识别类型后，使用 <b>框选识别</b> 进行局部分析</li>
                <li><b>抓手工具</b> 可拖拽画布，按住空格键可临时切换</li>
                <li>参考线（三分法、黄金比例等）在 <b>形状</b> 面板中</li>
                <li>所有操作支持撤销（Ctrl+Z）</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AiPanel from '@/components/panels/AiPanel.vue'
import MarkupPanel from '@/components/panels/MarkupPanel.vue'
import ShapesPanel from '@/components/panels/ShapesPanel.vue'
import HandPanel from '@/components/panels/HandPanel.vue'
import TextPanel from '@/components/panels/TextPanel.vue'
import { v4 as uuidv4 } from 'uuid'
import * as fabricLib from 'fabric'
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
const currentTool = ref('select')
const currentColor = ref('#6366f1')

const templateName = ref('')
const isDetectorReady = ref(false)
const isAnalyzing = ref(false)
const loadingStep = ref('')
const analysisComplete = ref(false)
const showHelp = ref(false)

const undoStack = ref<any[]>([])
const redoStack = ref<any[]>([])
const activeTab = ref('ai')

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
let isPanning = false
let lastPanPoint: any = null
let currentLine: any = null
let cropRect: any = null
let eraserCursor: any = null
const eraserSize = ref(20)
const brushSize = ref(8)
const textFontSize = ref(24)
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

watch(activeTab, (val) => {
  if (['markup', 'ai', 'shapes'].includes(val)) setTool('select')
})

// 画笔粗细实时更新
watch(brushSize, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    fCanvas.value.freeDrawingBrush.width = newVal
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
    if (currentTool.value === 'hand') {
      currentTool.value = 'select'
      if (fCanvas.value) {
        fCanvas.value.isDrawingMode = false
        fCanvas.value.selection = true
        fCanvas.value.defaultCursor = 'default'
      }
    } else {
      activeTab.value = ''
      currentTool.value = 'hand'
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
    if (fCanvas.value && currentTool.value !== 'hand') {
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
  inkCtx = inkCanvas.getContext('2d')
  inkLayer = new fabric.Image(inkCanvas, { left: 0, top: 0, originX: 'left', originY: 'top', selectable: false, evented: false, erasable: false })
  inkLayer.isInkLayer = true; fCanvas.value.add(inkLayer)
  eraserCursor = new fabric.Circle({ radius: eraserSize.value / 2, fill: 'rgba(255,255,255,0.2)', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 1, originX: 'center', originY: 'center', selectable: false, evented: false, visible: false, isEraserCursor: true })
  fCanvas.value.add(eraserCursor)
  fCanvas.value.on('mouse:down', handleMouseDown)
  fCanvas.value.on('mouse:move', handleMouseMove)
  fCanvas.value.on('mouse:up', handleMouseUp)
  fCanvas.value.on('path:created', handlePathCreated)

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
  fCanvas.value.on('object:modified', () => {
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

// ─── Mouse Handlers ────────────────────────────────────────
const handleMouseDown = (opt: any) => {
  const pointer = fCanvas.value.getPointer(opt.e), tool = currentTool.value

  // 抓手工具 或 按住空格键：开始拖拽
  if (tool === 'hand' || spacePressed) {
    isPanning = true
    lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY }
    fCanvas.value.defaultCursor = 'grabbing'
    return
  }

  if (['draw', 'eraser'].includes(tool)) {
    isErasing.value = true; startPoint = pointer; saveState()
    if (tool === 'eraser') { eraserCursor.set({ left: pointer.x, top: pointer.y, visible: true }); fCanvas.value.bringToFront(eraserCursor) }
  } else if (tool === 'line') {
    isDrawingLine.value = true; startPoint = pointer
    currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], { stroke: currentColor.value, strokeWidth: 3, selectable: false, evented: false, strokeLineCap: 'round', erasable: true })
    fCanvas.value.add(currentLine)
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
  const pointer = fCanvas.value.getPointer(opt.e), tool = currentTool.value

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

  if (eraserCursor && tool === 'eraser') { eraserCursor.set({ left: pointer.x, top: pointer.y, radius: eraserSize.value / 2 }); fCanvas.value.bringToFront(eraserCursor); fCanvas.value.renderAll() }
  if (isErasing.value && tool === 'eraser' && inkCtx) { inkCtx.save(); inkCtx.globalCompositeOperation = 'destination-out'; inkCtx.beginPath(); inkCtx.arc(pointer.x, pointer.y, eraserSize.value / 2, 0, Math.PI * 2); inkCtx.fill(); inkCtx.restore(); refreshInkLayer() }
  if (isDrawingLine.value && currentLine) { currentLine.set({ x2: pointer.x, y2: pointer.y }); fCanvas.value.renderAll() }
  if (isDrawingCrop.value && cropRect) { const l = Math.min(startPoint.x, pointer.x), t = Math.min(startPoint.y, pointer.y); cropRect.set({ left: l, top: t, width: Math.abs(startPoint.x - pointer.x), height: Math.abs(startPoint.y - pointer.y) }); fCanvas.value.renderAll() }
}

const handleMouseUp = () => {
  // 抓手工具：结束拖拽
  if (isPanning) {
    isPanning = false
    lastPanPoint = null
    if (fCanvas.value) fCanvas.value.defaultCursor = currentTool.value === 'hand' ? 'grab' : 'default'
    return
  }

  if (isErasing.value) { isErasing.value = false; saveState() }
  if (isDrawingLine.value) { isDrawingLine.value = false; if (currentLine) { currentLine.set({ id: uuidv4() }); currentLine.setCoords(); saveState() } }
  if (isDrawingCrop.value) { isDrawingCrop.value = false; if (cropRect && cropRect.width > 5) analyzeArea(cropRect); fCanvas.value.remove(cropRect); cropRect = null }
  if (eraserCursor) eraserCursor.set('visible', false); fCanvas.value.renderAll()
}
const handlePathCreated = (opt: any) => {
  const path = opt.path; if (!path) return; path.setCoords()
  const center = path.getCenterPoint(), dpr = window.devicePixelRatio || 1
  const el = path.toCanvasElement({ multiplier: dpr })
  const img = new fabric.Image(el, { left: center.x, top: center.y, originX: 'center', originY: 'center', scaleX: (path.scaleX || 1) / dpr, scaleY: (path.scaleY || 1) / dpr, angle: path.angle || 0, erasable: true, isUserStroke: true })
  fCanvas.value.add(img); fCanvas.value.remove(path); saveState(); fCanvas.value.renderAll()
}
const refreshInkLayer = () => { if (!inkLayer || !fCanvas.value) return; inkLayer.setElement(inkCanvas); fCanvas.value.requestRenderAll() }

// ─── Undo / Redo ───────────────────────────────────────────
const saveState = () => {
  if (isStateSavingLocked || !fCanvas.value) return
  const json = fCanvas.value.toJSON(['id', 'selectable', 'evented', 'hasControls', 'hasBorders', 'strokeWidth', 'stroke', 'fill', 'radius', 'scaleX', 'scaleY', 'originX', 'originY', 'name', 'opacity', 'isInkLayer', 'isAutoGenerated', 'isSkeleton', 'connectedLines'])
  const snapshot = { fabric: json, ink: inkCanvas.toDataURL() }
  const last = undoStack.value[undoStack.value.length - 1]
  if (last && JSON.stringify(snapshot) === JSON.stringify(last)) return
  undoStack.value.push(snapshot); if (undoStack.value.length > 50) undoStack.value.shift(); redoStack.value = []
}
const restoreState = (snapshot: any) => {
  if (!snapshot || !snapshot.fabric) return; isStateSavingLocked = true
  const p = new Promise((resolve) => { if (!snapshot.ink) return resolve(null); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = snapshot.ink })
  fCanvas.value.loadFromJSON(snapshot.fabric, async () => { 
    const img = await p; if (img && inkCtx) { inkCtx.save(); inkCtx.globalCompositeOperation = 'copy'; inkCtx.drawImage(img, 0, 0); inkCtx.restore() }; 
    inkLayer = fCanvas.value.getObjects().find((o: any) => o.isInkLayer); 
    if (inkLayer) inkLayer.setElement(inkCanvas); 
    fCanvas.value.renderAll(); isStateSavingLocked = false 
  })
}
const undo = () => { if (undoStack.value.length <= 1) return; const c = undoStack.value.pop(); redoStack.value.push(c); restoreState(undoStack.value[undoStack.value.length - 1]) }
const redo = () => { if (!redoStack.value.length) return; const n = redoStack.value.pop(); undoStack.value.push(n); restoreState(n) }

// ─── 工具切换（互斥） ─────────────────────────────────────
const selectTab = (tab: string) => {
  activeTab.value = tab
  // 切换 tab 时退出抓手模式
  if (currentTool.value === 'hand') {
    setTool('select')
  }
  // 文字 tab 激活文字工具
  if (tab === 'text') {
    setTool('text')
  }
}

const selectHandTool = () => {
  // 切换抓手时清除 tab
  activeTab.value = ''
  setTool('hand')
}

// ─── Tools ─────────────────────────────────────────────────
const setTool = (tool: string) => {
  currentTool.value = tool

  if (fCanvas.value) {
    // 画笔模式
    fCanvas.value.isDrawingMode = (tool === 'draw')
    if (tool === 'draw') {
      fCanvas.value.freeDrawingBrush = new fabric.PencilBrush(fCanvas.value)
      fCanvas.value.freeDrawingBrush.width = brushSize.value
      fCanvas.value.freeDrawingBrush.color = currentColor.value
    }

    // 文字模式
    if (tool === 'text') {
      fCanvas.value.defaultCursor = 'text'
      fCanvas.value.hoverCursor = 'text'
    }

    // 抓手模式
    if (tool === 'hand') {
      fCanvas.value.selection = false
      fCanvas.value.defaultCursor = 'grab'
      fCanvas.value.hoverCursor = 'grab'
      fCanvas.value.forEachObject((obj: any) => { obj.selectable = false; obj.evented = false })
    } else {
      fCanvas.value.selection = true
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'move'
      fCanvas.value.forEachObject((obj: any) => { obj.selectable = true; obj.evented = true })
    }
  }
}
const updateColor = (e: Event) => { currentColor.value = (e.target as HTMLInputElement).value; if (fCanvas.value.isDrawingMode) fCanvas.value.freeDrawingBrush.color = currentColor.value }
const addShape = (type: string) => {
  setTool('select'); const c = fCanvas.value.getCenter()
  const shape = type === 'rect' ? new fabric.Rect({ left: c.left, top: c.top, width: 120, height: 80, fill: 'transparent', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', erasable: true }) : new fabric.Circle({ left: c.left, top: c.top, radius: 60, fill: 'transparent', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', erasable: true })
  fCanvas.value.add(shape); fCanvas.value.setActiveObject(shape); fCanvas.value.renderAll(); saveState()
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

/**
 * 获取画布/背景图的绘制区域
 */
const getDrawArea = () => {
  const bg = fCanvas.value.backgroundImage
  if (bg) {
    const r = bg.getBoundingRect(true)
    return { w: r.width, h: r.height, l: r.left, t: r.top }
  }
  return { w: fCanvas.value.width, h: fCanvas.value.height, l: 0, t: 0 }
}

/**
 * 绘制参考线
 * @param type - 参考线类型: thirds, golden, diagonal, center, phi, all
 */
const drawReference = (type: string) => {
  const { w, h, l, t } = getDrawArea()
  const style: any = { stroke: currentColor.value, strokeWidth: 1, selectable: false, evented: false, opacity: 0.5, isGuide: true }

  isStateSavingLocked = true

  // 三分法
  if (type === 'thirds' || type === 'all') {
    ;[1/3, 2/3].forEach((f: number) => {
      fCanvas.value.add(new fabric.Line([l+w*f, t, l+w*f, t+h], style))
      fCanvas.value.add(new fabric.Line([l, t+h*f, l+w, t+h*f], style))
    })
  }

  // 黄金比例 (0.618)
  if (type === 'golden' || type === 'all') {
    const phi = 0.618
    ;[phi, 1 - phi].forEach((f: number) => {
      fCanvas.value.add(new fabric.Line([l+w*f, t, l+w*f, t+h], { ...style, stroke: '#f59e0b', opacity: 0.7 }))
      fCanvas.value.add(new fabric.Line([l, t+h*f, l+w, t+h*f], { ...style, stroke: '#f59e0b', opacity: 0.7 }))
    })
  }

  // 对角线
  if (type === 'diagonal' || type === 'all') {
    fCanvas.value.add(new fabric.Line([l, t, l+w, t+h], { ...style, opacity: 0.3 }))
    fCanvas.value.add(new fabric.Line([l+w, t, l, t+h], { ...style, opacity: 0.3 }))
  }

  // 中心点
  if (type === 'center' || type === 'all') {
    const cx = l + w / 2, cy = t + h / 2
    fCanvas.value.add(new fabric.Line([cx, t, cx, t+h], style))
    fCanvas.value.add(new fabric.Line([l, cy, l+w, cy], style))
    fCanvas.value.add(Object.assign(new fabric.Circle({
      left: cx, top: cy, radius: 6,
      fill: 'transparent', stroke: currentColor.value, strokeWidth: 1.5,
      originX: 'center', originY: 'center',
      selectable: false, evented: false, opacity: 0.6
    }), { isGuide: true }))
  }

  // φ 网格 (黄金螺旋近似)
  if (type === 'phi' || type === 'all') {
    const phi = 0.618
    // 主矩形
    fCanvas.value.add(Object.assign(new fabric.Rect({
      left: l, top: t, width: w, height: h,
      fill: 'transparent', stroke: currentColor.value, strokeWidth: 1,
      selectable: false, evented: false, opacity: 0.3
    }), { isGuide: true }))
    // 黄金分割点连线
    fCanvas.value.add(new fabric.Line([l, t, l+w*phi, t+h], { ...style, stroke: '#8b5cf6', opacity: 0.4 }))
    fCanvas.value.add(new fabric.Line([l+w, t, l+w*(1-phi), t+h], { ...style, stroke: '#8b5cf6', opacity: 0.4 }))
    fCanvas.value.add(new fabric.Line([l, t+h*phi, l+w, t], { ...style, stroke: '#8b5cf6', opacity: 0.4 }))
    fCanvas.value.add(new fabric.Line([l, t+h, l+w, t+h*(1-phi)], { ...style, stroke: '#8b5cf6', opacity: 0.4 }))
  }

  // 黄金螺旋（斐波那契螺旋）
  if (type === 'spiral' || type === 'all') {
    const phi = 0.618
    const spiralColor = '#f97316'

    // 绘制斐波那契矩形
    const fibRects = [
      { x: l, y: t, w: w, h: h },
      { x: l, y: t, w: w * phi, h: h },
      { x: l + w * phi, y: t, w: w * (1 - phi), h: w * (1 - phi) },
      { x: l + w * phi, y: t + w * (1 - phi), w: w * (1 - phi) * phi, h: w * (1 - phi) * phi },
      { x: l + w * phi + w * (1 - phi) * phi, y: t + w * (1 - phi), w: w * (1 - phi) * (1 - phi), h: w * (1 - phi) * (1 - phi) },
    ]

    fibRects.forEach((r) => {
      fCanvas.value.add(Object.assign(new fabric.Rect({
        left: r.x, top: r.y, width: r.w, height: r.h,
        fill: 'transparent', stroke: spiralColor, strokeWidth: 1,
        selectable: false, evented: false, opacity: 0.3
      }), { isGuide: true }))
    })

    // 绘制黄金螺旋线（使用二次贝塞尔曲线近似）
    const p1 = { x: l + w, y: t + h }
    const p2 = { x: l + w, y: t }
    const p3 = { x: l, y: t }
    const p4 = { x: l, y: t + h * phi }
    const p5 = { x: l + w * phi, y: t + h * phi }
    const p6 = { x: l + w * phi, y: t + h }

    const spiralPath = [
      `M ${p1.x} ${p1.y}`,
      `Q ${p1.x} ${p2.y}, ${p2.x} ${p2.y}`,
      `Q ${p2.x} ${p3.y + h * (1 - phi)}, ${p3.x + w * (1 - phi)} ${p3.y + h * (1 - phi)}`,
      `Q ${p3.x} ${p3.y + h * (1 - phi)}, ${p4.x} ${p4.y}`,
      `Q ${p4.x} ${p5.y - w * (1 - phi) * phi}, ${p5.x} ${p5.y}`,
      `Q ${p5.x} ${p6.y + w * (1 - phi) * phi * phi}, ${p6.x + w * (1 - phi) * phi * phi} ${p6.y}`,
    ].join(' ')

    fCanvas.value.add(Object.assign(new fabric.Path(spiralPath, {
      stroke: spiralColor,
      strokeWidth: 2.5,
      fill: 'transparent',
      selectable: false,
      evented: false,
      opacity: 0.9
    }), { isGuide: true }))
  }

  isStateSavingLocked = false
  fCanvas.value.renderAll()
  saveState()
}

/**
 * 删除所有参考线
 */
const deleteGuides = () => {
  const guides = fCanvas.value.getObjects().filter((o: any) => o.isGuide)
  if (guides.length === 0) {
    printInfo('没有参考线')
    return
  }
  guides.forEach((o: any) => fCanvas.value.remove(o))
  fCanvas.value.renderAll()
  saveState()
  printSuccess(`已删除 ${guides.length} 条参考线`)
}

// 辅助函数
// eslint-disable-next-line no-console
const printInfo = (msg: string) => console.log(`ℹ️ ${msg}`)
// eslint-disable-next-line no-console
const printSuccess = (msg: string) => console.log(`✅ ${msg}`)

// ─── Image Upload ──────────────────────────────────────────
const triggerFileInput = () => fileInput.value?.click()
const handleImageUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    fabric.Image.fromURL(ev.target?.result, (img: any) => {
      const cw = canvasContainer.value?.clientWidth || 800
      const ch = canvasContainer.value?.clientHeight || 600
      const scale = Math.min(cw / img.width, ch / img.height) * 0.9
      const fitW = img.width * scale
      const fitH = img.height * scale

      fCanvas.value.setDimensions({ width: fitW, height: fitH })
      img.set({
        originX: 'center', originY: 'center',
        left: fitW / 2, top: fitH / 2,
        scaleX: scale, scaleY: scale,
        selectable: false, evented: false,
        opacity: bgOpacity.value / 100
      })
      fCanvas.value.clipPath = new fabric.Rect({
        left: 0, top: 0, width: fitW, height: fitH, absolutePositioned: true
      })
      fCanvas.value.backgroundImage = img
      if (inkCanvas) {
        inkCanvas.width = fitW; inkCanvas.height = fitH
        if (inkLayer) { inkLayer.set({ left: 0, top: 0 }); inkLayer.setElement(inkCanvas) }
      }

      // 重置缩放和平移
      canvasScale = 1
      canvasTranslateX = 0
      canvasTranslateY = 0
      applyCanvasTransform()
      zoomSlider.value = 100
      currentZoom.value = 1

      fCanvas.value.renderAll()
      bgImageUploaded.value = true
      saveState()
    })
  }
  reader.readAsDataURL(file)
}

// ─── AI Model Loading ──────────────────────────────────────
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
const mapPoint = (k: any, offset: any) => { if (offset) return { x: offset.x + k.x * offset.sw, y: offset.y + k.y * offset.sh }; const bg = fCanvas.value.backgroundImage; if (!bg) return { x: k.x, y: k.y }; return { x: bg.left - bg.getScaledWidth() / 2 + k.x * bg.scaleX, y: bg.top - bg.getScaledHeight() / 2 + k.y * bg.scaleY } }

const drawPoseSkeleton = (pose: any, offset: any = null) => {
  const fp = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear']; const kp: any = {}
  pose.keypoints.forEach((k: any) => { if (k.score > 0.2 && !fp.includes(k.name)) kp[k.name] = mapPoint(k, offset) })
  const edges = [['left_shoulder','right_shoulder'],['left_shoulder','left_elbow'],['right_shoulder','right_elbow'],['left_elbow','left_wrist'],['right_elbow','right_wrist'],['left_shoulder','left_hip'],['right_shoulder','right_hip'],['left_hip','right_hip'],['left_hip','left_knee'],['right_hip','right_knee'],['left_knee','left_ankle'],['right_knee','right_ankle']]
  const nm: any = {}
  Object.entries(kp).forEach(([name, p]: [string, any]) => { const c = new fabric.Circle({ id: uuidv4(), left: p.x, top: p.y, radius: 8, fill: '#ffffff', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', selectable: true, evented: true, isSkeleton: true, padding: 12, name, erasable: true }); c.connectedLines = []; nm[name] = c; fCanvas.value.add(c); c.setCoords() })
  edges.forEach(([a, b]) => { if (!nm[a] || !nm[b]) return; const nA = nm[a], nB = nm[b], id = uuidv4(); const l = new fabric.Line([nA.left, nA.top, nB.left, nB.top], { id, stroke: currentColor.value, strokeWidth: 3, selectable: true, evented: true, isAutoGenerated: true, strokeLineCap: 'round', opacity: 0.8, erasable: true }); nA.connectedLines.push({ line: id, endpoint: 'start' }); nB.connectedLines.push({ line: id, endpoint: 'end' }); fCanvas.value.add(l); l.sendToBack() })
  Object.values(nm).forEach((c: any) => c.bringToFront());
}

const drawImageOutline = async (segs: any[], hex: string, offset: any = null) => {
  if (!segs?.length) return; const h = hex.replace('#', '')
  const fg = { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 255 }
  const mask = await bodySegmentation.toBinaryMask(segs, fg, { r: 0, g: 0, b: 0, a: 0 })
  const c1 = document.createElement('canvas'); c1.width = mask.width; c1.height = mask.height; c1.getContext('2d')!.putImageData(mask, 0, 0)
  const c2 = document.createElement('canvas'); c2.width = mask.width; c2.height = mask.height; const ctx = c2.getContext('2d')!
  ;[[4,0],[-4,0],[0,4],[0,-4]].forEach(([dx,dy]) => ctx.drawImage(c1, dx, dy)); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(c1, 0, 0)
  const bg = fCanvas.value.backgroundImage; const tx = offset ? offset.x : bg.left, ty = offset ? offset.y : bg.top, sx = offset ? offset.sw : bg.scaleX, sy = offset ? offset.sh : bg.scaleY
  inkCtx.save(); inkCtx.translate(tx, ty); inkCtx.scale(sx, sy); offset ? inkCtx.drawImage(c2, 0, 0) : inkCtx.drawImage(c2, -c2.width/2, -c2.height/2); inkCtx.restore(); refreshInkLayer()
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
  conn.forEach(([a,b]) => { if (pts[a] && pts[b]) fCanvas.value.add(new fabric.Line([pts[a].x,pts[a].y,pts[b].x,pts[b].y], { stroke: c, strokeWidth: 1.5, selectable: false, evented: false, opacity: 0.8, erasable: true })) })
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
      currentTool.value = 'select'
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
    const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch; tmp.getContext('2d')!.drawImage(el, cx, cy, cw, ch, 0, 0, cw, ch)
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

.tool-group { display: flex; flex-direction: column; gap: 4px; }
.tool-divider { width: 24px; height: 1px; background: rgba(255,255,255,0.06); margin: 8px 0; }

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
