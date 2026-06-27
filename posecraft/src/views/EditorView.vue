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

        <!-- 浮动面板开关 -->
        <button class="sub-btn" :class="{ active: showColorPanel }" @click="showColorPanel = !showColorPanel" title="颜色面板">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="13.5" cy="6.5" r="2.5"/>
            <circle cx="17.5" cy="10.5" r="2.5"/>
            <circle cx="8.5" cy="7.5" r="2.5"/>
            <circle cx="6.5" cy="12.5" r="2.5"/>
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
          </svg>
        </button>
        <button class="sub-btn" :class="{ active: showStylePanel }" @click="showStylePanel = !showStylePanel" title="样式面板">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <!-- 清空画布 -->
        <button class="sub-btn danger" @click="clearCanvas" title="清空画布">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>

        <div class="tool-spacer"></div>

        <!-- 主颜色预览（左下角） -->
        <div class="main-color-area" @click="showColorPanel = !showColorPanel" title="点击打开颜色面板">
          <div class="main-color-swatch" :style="{ background: currentColor }"></div>
          <span class="color-hint">颜色</span>
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
          :detectionTypes="detectionTypes"
          @autoAnalyze="autoAnalyze"
          @setTool="setTool"
          @setDrawTool="setDrawTool"
          @clearAnalysis="clearAnalysis"
        />

        <SelectPanel v-show="activeTool === 'select'"
          :selectedObject="selectedObject"
          :pathBlur="pathBlur"
          @deleteSelected="deleteSelected"
          @bringToFront="bringToFront"
          @sendToBack="sendToBack"
          @moveUp="moveUp"
          @moveDown="moveDown"
          @copySelected="copySelected"
          @pasteClipboard="pasteClipboard"
          @update:pathStrokeWidth="updatePathStrokeWidth"
          @update:pathBlur="updatePathBlur"
          @update:pathScale="updatePathScale"
          @saveState="saveState"
        />

        <DrawPanel v-show="activeTool === 'draw'"
          v-model:brushSize="brushSize"
          v-model:brushOpacity="brushOpacity"
          v-model:brushFeather="brushFeather"
          v-model:brushStyle="brushStyle"
          v-model:brushBlend="brushBlend"
          v-model:currentColor="currentColor"
          :presetColors="presetColors"
          @saveState="saveState"
        />

        <EraserPanel v-show="activeTool === 'eraser'"
          v-model:eraserSize="eraserSize"
          v-model:eraserOpacity="eraserOpacity"
          v-model:eraserHardness="eraserHardness"
          v-model:eraserShape="eraserShape"
          v-model:eraserMode="eraserMode"
          @saveState="saveState"
        />

        <ShapesPanel v-show="activeTool === 'shapes'"
          :canvasTool="canvasTool"
          :activeGuides="activeGuides"
          @toggleGuide="toggleGuide"
          @setDrawTool="setDrawTool"
        />

        <TextPanel v-show="activeTool === 'text'"
          v-model:fontSize="textFontSize"
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
          :cropAspectRatio="cropAspectRatio"
          @replaceImage="triggerFileInput"
          @cropImage="startCropMode"
          @update:bgOpacity="updateBgOpacity"
          @update:cropAspectRatio="cropAspectRatio = $event"
        />

        <CropPanel v-show="isCropping"
          :cropAspectRatio="cropAspectRatio"
          @update:cropAspectRatio="updateCropAspectRatio"
          @confirmCrop="confirmCrop"
          @cancelCrop="cancelCrop"
        />
      </aside>
    </div>

    <!-- 浮动面板 -->
    <ColorFloatPanel
      :visible="showColorPanel"
      :currentColor="currentColor"
      :fillColor="fillColor"
      :noFill="noFill"
      :presetColors="presetColors"
      @close="showColorPanel = false"
      @update:currentColor="updateCurrentColor"
      @update:fillColor="updateFillColor"
      @update:noFill="updateNoFill"
    />
    <StyleFloatPanel
      :visible="showStylePanel"
      :strokeWidth="strokeWidth"
      :strokeOpacity="strokeOpacity"
      :fillOpacity="fillOpacity"
      :cornerRadius="cornerRadius"
      :lineStyle="lineStyle"
      @close="showStylePanel = false"
      @update:strokeWidth="updateStrokeWidth"
      @update:strokeOpacity="updateStrokeOpacity"
      @update:fillOpacity="updateFillOpacity"
      @update:cornerRadius="updateCornerRadius"
      @update:lineStyle="updateLineStyle"
      @saveState="saveState"
    />

    <!-- 帮助弹窗 -->
    <HelpModal :isOpen="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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
import ColorFloatPanel from '@/components/color/ColorFloatPanel.vue'
import StyleFloatPanel from '@/components/brush/StyleFloatPanel.vue'
import { v4 as uuidv4 } from 'uuid'
import * as fabricLib from 'fabric'

// Composables
import { useHistory } from '@/composables/canvas/useHistory'
import { useTools } from '@/composables/canvas/useTools'
import { useShapes } from '@/composables/canvas/useShapes'
import { useReferenceLines } from '@/composables/canvas/useReferenceLines'
import { useSkeletonNodes } from '@/composables/canvas/useSkeletonNodes'
import { useImageUpload } from '@/composables/canvas/useImageUpload'
import { useCanvasInit } from '@/composables/canvas/useCanvasInit'
import { useAIAnalysis } from '@/composables/canvas/useAIAnalysis'
import { useMouseEvents } from '@/composables/canvas/useMouseEvents'

const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
const router = useRouter()
const authStore = useAuthStore()
const presetColors = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

const canvasContainer = ref<any>(null)
const fileInput = ref<any>(null)
const bgImageUploaded = ref(false)
const bgOpacity = ref(50)

const activeTool = ref('select')
const canvasTool = ref('select')

const templateName = ref('')
const isAnalyzing = ref(false)
const loadingStep = ref('')
const analysisComplete = ref(false)
const showHelp = ref(false)
const showColorPanel = ref(false)
const showStylePanel = ref(false)

const detectionType = ref<'all' | 'pose' | 'face' | 'hand' | 'segmentation'>('all')

let isStateSavingLocked = false
let spacePressed = false

const eraserSize = ref(20)
const eraserOpacity = ref(100)
const eraserHardness = ref(100)
const eraserShape = ref('circle')
const eraserMode = ref('all')
const brushSize = ref(8)
const brushOpacity = ref(100)
const brushFeather = ref(0)
const brushStyle = ref('solid')
const brushBlend = ref('source-over')
const textFontSize = ref(24)
const pathBlur = ref(0)

const strokeWidth = ref(3)
const fillColor = ref('#6366f1')
const currentColor = ref('#6366f1')
const noFill = ref(true)
const lineStyle = ref('solid')
const strokeOpacity = ref(100)
const fillOpacity = ref(100)
const cornerRadius = ref(0)

const {
  fCanvas, currentZoom, zoomSlider, zoomPercent,
  initCanvas, resizeCanvas, resetZoom, fitToScreen, zoomIn, zoomOut,
  applyCanvasTransform, syncCanvasDimensions, getCanvasDeps
} = useCanvasInit(canvasContainer, eraserSize)

const { undoStack, redoStack, saveState, undo, redo, setOnStateRestored, setOnReapplyTool } = useHistory(fCanvas, { value: isStateSavingLocked }, null, null)
const { selectTab, selectHandTool, setDrawTool, setTool, setDeps } = useTools(fCanvas, activeTool, canvasTool)
const { applyColor, applyColorToImage, isBrushObject, updatePathStrokeWidth, updatePathScale, updatePathBlur, createStar, createPolygon, addArrowHead } = useShapes(fCanvas, currentColor, fillColor)
const { activeGuides, drawReference, deleteGuides, toggleGuide } = useReferenceLines(fCanvas, currentColor, strokeWidth, saveState)
const { drawPoseSkeleton, addSkeletonNode, addMidpointNode, connectNodes } = useSkeletonNodes(fCanvas, currentColor, saveState)

const canvasDeps = computed(() => getCanvasDeps()).value

const {
  isDetectorReady, detectionTypes, ensureModelsLoaded, runFullAnalysis, autoAnalyze, clearAnalysis, analyzeArea
} = useAIAnalysis(
  fCanvas, currentColor, detectionType, bgImageUploaded, loadingStep, analysisComplete, isAnalyzing, saveState, drawPoseSkeleton, canvasDeps
)

const {
  handleMouseDown, handleMouseMove, handleMouseUp, handlePathCreated
} = useMouseEvents(
  fCanvas, canvasTool, activeTool, currentColor, strokeWidth, noFill, fillColor, strokeOpacity, fillOpacity, lineStyle, eraserSize, textFontSize, cornerRadius, canvasDeps, saveState, addSkeletonNode, addMidpointNode, connectNodes, createStar, createPolygon, addArrowHead, analyzeArea, applyCanvasTransform, () => spacePressed
)

// currentColor 和 fillColor 现在独立设置，不再同步

let resizeObserver: any = null

watch(brushSize, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) fCanvas.value.freeDrawingBrush.width = Number(newVal)
})

watch(currentColor, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    fCanvas.value.freeDrawingBrush.color = newVal
    if (brushFeather.value > 0 && fCanvas.value.freeDrawingBrush.shadow) fCanvas.value.freeDrawingBrush.shadow.color = newVal
  }
})

watch(brushFeather, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    if (newVal > 0) {
      fCanvas.value.freeDrawingBrush.shadow = new fabric.Shadow({ color: currentColor.value, blur: newVal, offsetX: 0, offsetY: 0 })
    } else {
      fCanvas.value.freeDrawingBrush.shadow = null
    }
  }
})

watch(bgOpacity, (newVal) => {
  if (!fCanvas.value) return
  const bg = fCanvas.value.backgroundImage
  if (bg) { bg.set({ opacity: newVal / 100 }); fCanvas.value.renderAll() }
})

const handleKeydown = (e: KeyboardEvent) => {
  if (e.code === 'Space' && !spacePressed && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault(); spacePressed = true; if (fCanvas.value) fCanvas.value.defaultCursor = 'grab'; return
  }
  if (e.key === 'h' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault()
    if (activeTool.value === 'hand') {
      activeTool.value = 'select'
      if (fCanvas.value) { fCanvas.value.isDrawingMode = false; fCanvas.value.selection = true; fCanvas.value.defaultCursor = 'default' }
    } else {
      activeTool.value = ''; activeTool.value = 'hand'
      if (fCanvas.value) { fCanvas.value.isDrawingMode = false; fCanvas.value.selection = false; fCanvas.value.defaultCursor = 'grab' }
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) { e.preventDefault(); deleteSelected() }
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn() }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut() }
  if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); resetZoom() }
}

const handleKeyup = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    spacePressed = false
    if (fCanvas.value && activeTool.value !== 'hand') fCanvas.value.defaultCursor = 'default'
  }
}

const updateSelection = () => {
  const obj = fCanvas.value?.getActiveObject() || null
  selectedObject.value = obj
  if (isBrushObject(obj) && obj.shadow) pathBlur.value = Math.round(obj.shadow.blur / 2)
  else pathBlur.value = 0

  if (obj) {
    const parseColor = (colorStr: any) => {
      if (!colorStr || colorStr === 'transparent') return null
      if (colorStr.startsWith('#')) {
        return { hex: colorStr, opacity: 1 }
      } else if (colorStr.startsWith('rgb')) {
        const match = colorStr.match(/[\d.]+/g)
        if (match && match.length >= 3) {
          const r = parseInt(match[0])
          const g = parseInt(match[1])
          const b = parseInt(match[2])
          const a = match[3] !== undefined ? parseFloat(match[3]) : 1
          const hexR = r.toString(16).padStart(2, '0')
          const hexG = g.toString(16).padStart(2, '0')
          const hexB = b.toString(16).padStart(2, '0')
          return { hex: `#${hexR}${hexG}${hexB}`, opacity: a }
        }
      }
      return null
    }

    if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
      const parsed = parseColor(obj.fill)
      if (parsed) currentColor.value = parsed.hex
      noFill.value = true
    } else {
      const parsedStroke = parseColor(obj.stroke)
      if (parsedStroke) {
        currentColor.value = parsedStroke.hex
        if (obj.type !== 'path') strokeOpacity.value = Math.round(parsedStroke.opacity * 100)
      }
      if (obj.fill === 'transparent' || !obj.fill) {
        noFill.value = true
      } else {
        noFill.value = false
        const parsedFill = parseColor(obj.fill)
        if (parsedFill) {
          fillColor.value = parsedFill.hex
          fillOpacity.value = Math.round(parsedFill.opacity * 100)
        }
      }
    }
    if (obj.strokeWidth !== undefined) strokeWidth.value = obj.strokeWidth
    if (obj.type === 'path' && obj.opacity !== undefined) {
      strokeOpacity.value = Math.round(obj.opacity * 100)
    } else if (obj.strokeOpacity !== undefined) {
      strokeOpacity.value = Math.round(obj.strokeOpacity * 100)
    }
    if (obj.fillOpacity !== undefined) fillOpacity.value = Math.round(obj.fillOpacity * 100)
    if (obj.rx !== undefined) cornerRadius.value = obj.rx
    
    if (obj.strokeDashArray) {
      if (obj.strokeDashArray.length > 0 && obj.strokeDashArray[0] === 10) lineStyle.value = 'dashed'
      else if (obj.strokeDashArray.length > 0 && obj.strokeDashArray[0] === 3) lineStyle.value = 'dotted'
      else lineStyle.value = 'solid'
    } else {
      lineStyle.value = 'solid'
    }
  }

  // 骨架节点选中特效
  if (fCanvas.value) {
    // 清除之前的选中特效
    fCanvas.value.getObjects().forEach((o: any) => {
      if (o.isSkeleton && o._selectedEffect) {
        o.set({
          shadow: null,
          strokeWidth: 3
        })
        o._selectedEffect = false
      }
    })
    // 添加选中特效
    if (obj?.isSkeleton) {
      obj.set({
        shadow: new fabric.Shadow({
          color: '#6366f1',
          blur: 10,
          offsetX: 0,
          offsetY: 0
        }),
        strokeWidth: 4
      })
      obj._selectedEffect = true
      fCanvas.value.renderAll()
    }
  }
}

// ═══ 浮动面板更新函数（同步更新全局状态和选中元素）═══

/** 应用属性到选中元素 */
const applyToSelected = (props: Record<string, any>) => {
  const obj = fCanvas.value?.getActiveObject()
  if (!obj) return
  
  const applyProps = (target: any) => {
    target.set(props)
    target.setCoords()
    target.dirty = true
  }

  if (obj.type === 'activeSelection' || obj.type === 'group') {
    obj.getObjects().forEach(applyProps)
    obj.addWithUpdate()
  } else {
    applyProps(obj)
  }

  fCanvas.value.renderAll()
  // 注意：saveState 由滑块的 @change 事件触发，不在这里调用
}

/** 将颜色和透明度转换为 rgba */
const toRgba = (colorStr: string, opacity: number) => {
  let r = 0, g = 0, b = 0
  if (colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '')
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    } else if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    }
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/[\d.]+/g)
    if (match && match.length >= 3) {
      r = parseInt(match[0])
      g = parseInt(match[1])
      b = parseInt(match[2])
    }
  }
  return `rgba(${r},${g},${b},${opacity})`
}

/** 更新描边颜色（主颜色） */
const updateCurrentColor = (color: string) => {
  currentColor.value = color
  const activeObj = fCanvas.value?.getActiveObject()
  if (!activeObj) return

  const processObject = (obj: any) => {
    if (obj.type === 'i-text' || obj.type === 'textbox' || obj.type === 'text') {
      obj.set({ fill: color })
    } else if (isBrushObject(obj)) {
      if (obj.type === 'image') {
        applyColorToImage(obj, color)
      } else {
        obj.set({ stroke: color })
        if (obj.shadow) {
          obj.set('shadow', new fabric.Shadow({
            color: color,
            blur: obj.shadow.blur,
            offsetX: obj.shadow.offsetX,
            offsetY: obj.shadow.offsetY
          }))
        }
      }
    } else {
      obj.set({ stroke: toRgba(color, strokeOpacity.value / 100) })
    }
    obj.setCoords()
    obj.dirty = true
  }

  if (activeObj.type === 'activeSelection' || activeObj.type === 'group') {
    activeObj.getObjects().forEach(processObject)
    activeObj.addWithUpdate()
  } else {
    processObject(activeObj)
  }
  fCanvas.value.renderAll()
  saveState()
}

/** 更新填充颜色 */
const updateFillColor = (color: string) => {
  fillColor.value = color
  applyToSelected({ fill: toRgba(color, fillOpacity.value / 100) })
}

/** 更新填充开关 */
const updateNoFill = (val: boolean) => {
  noFill.value = val
  applyToSelected({ fill: val ? 'transparent' : toRgba(fillColor.value, fillOpacity.value / 100) })
}

/** 更新描边粗细 */
const updateStrokeWidth = (val: number) => {
  strokeWidth.value = val
  brushSize.value = val // 同步画笔粗细
  applyToSelected({ strokeWidth: val })
}

/** 更新描边透明度 */
const updateStrokeOpacity = (val: number) => {
  strokeOpacity.value = val
  brushOpacity.value = val // 同步画笔透明度
  const activeObj = fCanvas.value?.getActiveObject()
  if (!activeObj) return

  const processObject = (obj: any) => {
    if (isBrushObject(obj)) {
      obj.set({ opacity: val / 100 })
    } else {
      obj.set({ stroke: toRgba(currentColor.value, val / 100) })
    }
    obj.setCoords()
    obj.dirty = true
  }

  if (activeObj.type === 'activeSelection' || activeObj.type === 'group') {
    activeObj.getObjects().forEach(processObject)
    activeObj.addWithUpdate()
  } else {
    processObject(activeObj)
  }
  fCanvas.value.renderAll()
  saveState()
}

/** 更新填充透明度 */
const updateFillOpacity = (val: number) => {
  fillOpacity.value = val
  applyToSelected({ fill: noFill.value ? 'transparent' : toRgba(fillColor.value, val / 100) })
}

/** 更新圆角 */
const updateCornerRadius = (val: number) => {
  cornerRadius.value = val
  applyToSelected({ rx: val, ry: val })
}

/** 更新线条样式 */
const updateLineStyle = (val: string) => {
  lineStyle.value = val
  brushStyle.value = val // 同步画笔虚线样式
  const dashArray = val === 'dashed' ? [10, 5] : val === 'dotted' ? [3, 5] : undefined
  applyToSelected({ strokeDashArray: dashArray })
}

onMounted(async () => {
  if (!authStore.isLoggedIn) { router.push('/login'); return }
  initCanvas()
  
  setDeps({
    eraserCursor: canvasDeps.eraserCursor,
    eraserSize,
    brushSize,
    brushOpacity,
    brushFeather,
    brushStyle,
    brushBlend,
    currentColor
  })
  
  fCanvas.value.on('mouse:down', handleMouseDown)
  fCanvas.value.on('mouse:move', handleMouseMove)
  fCanvas.value.on('mouse:up', handleMouseUp)
  fCanvas.value.on('path:created', handlePathCreated)
  fCanvas.value.on('selection:created', updateSelection)
  fCanvas.value.on('selection:updated', updateSelection)
  fCanvas.value.on('selection:cleared', updateSelection)
  
  let activeDragLines: Array<{ id: string, endpoint: 'start' | 'end' }> = []
  fCanvas.value.on('mouse:down', (e: any) => {
    const obj = e.target
    if (!obj || !obj.isSkeleton) { activeDragLines = []; return }
    activeDragLines = (obj.connectedLines || []).map((c: any) => ({ id: c.id || c.line, endpoint: c.endpoint }))
  })
  fCanvas.value.on('object:moving', (e: any) => {
    const obj = e.target; if (!obj || !obj.isSkeleton) return
    const canvas = fCanvas.value; if (!canvas) return
    const objs = canvas.getObjects()
    const idMap: any = {}
    objs.forEach((o: any) => { if (o.id) idMap[o.id] = o })
    if (activeDragLines.length > 0) {
      activeDragLines.forEach(({ id, endpoint }) => {
        const line = idMap[id]; if (!line) return
        const targetEndpoint = endpoint === 'start' ? 'end' : 'start';
        const otherNode = objs.find((o: any) => o.isSkeleton && o.connectedLines?.some((c: any) => (c.id || c.line) === id && c.endpoint === targetEndpoint));
        if (!otherNode) return;
        const x1 = endpoint === 'start' ? obj.left : otherNode.left;
        const y1 = endpoint === 'start' ? obj.top : otherNode.top;
        const x2 = endpoint === 'end' ? obj.left : otherNode.left;
        const y2 = endpoint === 'end' ? obj.top : otherNode.top;
        line.set({ x1, y1, x2, y2, scaleX: 1, scaleY: 1 });
        if (line._setWidthHeight) line._setWidthHeight();
        else line.set({ width: Math.abs(x1 - x2), height: Math.abs(y1 - y2), left: Math.min(x1, x2), top: Math.min(y1, y2) });
        line.setCoords()
      })
    } else {
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
  fCanvas.value.on('mouse:up', () => { activeDragLines = [] })
  fCanvas.value.on('object:modified', (e: any) => {
    if (e.target?.isCropBox) return
    saveState()
  })

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

const { isCropping, cropAspectRatio, triggerFileInput, handleImageUpload, startCropMode, updateBgOpacity, updateCropAspectRatio, confirmCrop, cancelCrop, setFileInput, setDeps: setUploadDeps } = useImageUpload(fCanvas, activeTool, bgImageUploaded, bgOpacity, zoomSlider, currentZoom, saveState, applyCanvasTransform)
watch(fileInput, (v) => { if (v) setFileInput(v) }, { immediate: true })
watch(canvasContainer, (v) => { if (v) setUploadDeps({ canvasContainer: v }) }, { immediate: true })
setOnStateRestored(() => { if (isCropping.value) { isCropping.value = false } })
// 撤销/重做后重新应用当前工具的设置
setOnReapplyTool(() => { setDrawTool(canvasTool.value) })

const addShape = (type: string) => {
  if (!fCanvas.value) return
  const c = fCanvas.value.getCenter()
  const shape = type === 'rect'
    ? new fabric.Rect({ left: c.left, top: c.top, width: 120, height: 80, fill: 'transparent', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', erasable: true })
    : new fabric.Circle({ left: c.left, top: c.top, radius: 60, fill: 'transparent', stroke: currentColor.value, strokeWidth: 3, originX: 'center', originY: 'center', erasable: true })
  fCanvas.value.add(shape); fCanvas.value.setActiveObject(shape); fCanvas.value.renderAll(); saveState(); setDrawTool('select')
}

const addText = () => {
  if (!fCanvas.value) return
  const c = fCanvas.value.getCenter()
  const text = new fabric.IText('双击编辑', { left: c.left, top: c.top, fontSize: textFontSize.value, fill: currentColor.value, originX: 'center', originY: 'center', erasable: true })
  fCanvas.value.add(text); fCanvas.value.setActiveObject(text); fCanvas.value.renderAll(); saveState()
}

const deleteSelected = () => { fCanvas.value.getActiveObjects().forEach((o: any) => fCanvas.value.remove(o)); fCanvas.value.discardActiveObject(); fCanvas.value.renderAll(); saveState() }
const clearCanvas = () => { if (!confirm('确定清空画布？')) return; fCanvas.value.getObjects().slice().forEach((o: any) => fCanvas.value.remove(o)); fCanvas.value.renderAll(); saveState() }

const selectedObject = ref<any>(null)

const bringToFront = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.bringToFront(); fCanvas.value.renderAll() } }
const sendToBack = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.sendToBack(); fCanvas.value.renderAll() } }
const moveUp = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.bringForward(); fCanvas.value.renderAll() } }
const moveDown = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.sendBackwards(); fCanvas.value.renderAll() } }

let clipboard: any = null
const copySelected = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.clone((cloned: any) => { clipboard = cloned }) } }
const pasteClipboard = () => {
  if (!clipboard || !fCanvas.value) return
  clipboard.clone((cloned: any) => {
    fCanvas.value.discardActiveObject()
    cloned.set({ left: cloned.left + 20, top: cloned.top + 20, evented: true, selectable: true })
    fCanvas.value.add(cloned); fCanvas.value.setActiveObject(cloned); fCanvas.value.renderAll(); saveState()
  })
}

const restoreState = (snapshot: any) => {
  if (!snapshot || !snapshot.fabric) return; isStateSavingLocked = true
  const p = new Promise<HTMLImageElement | null>((resolve) => { if (!snapshot.ink) return resolve(null); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = snapshot.ink })
  fCanvas.value.loadFromJSON(snapshot.fabric, async () => {
    const img = await p; 
    const { inkCtx, inkLayer, inkCanvas } = canvasDeps;
    if (img && inkCtx) { inkCtx.save(); inkCtx.globalCompositeOperation = 'copy'; inkCtx.drawImage(img, 0, 0); inkCtx.restore() };
    const layer = fCanvas.value.getObjects().find((o: any) => o.isInkLayer);
    if (layer && inkCanvas) layer.setElement(inkCanvas);
    const bg = fCanvas.value.backgroundImage
    if (bg) { bgOpacity.value = Math.round((bg.opacity || 1) * 100) }
    fCanvas.value.renderAll(); isStateSavingLocked = false
  })
}

const updateColor = (e: Event) => { applyColor((e.target as HTMLInputElement).value) }
const updateColorFromPanel = (newColor: string) => { applyColor(newColor) }
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

/* 主颜色预览区域 */
.main-color-area {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px; cursor: pointer;
  border-radius: 8px; transition: all 0.15s;
}
.main-color-area:hover { background: rgba(255,255,255,0.04); }
.main-color-swatch {
  width: 32px; height: 32px; border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.15);
  transition: all 0.2s;
}
.main-color-area:hover .main-color-swatch { border-color: rgba(99,102,241,0.5); }
.color-hint {
  font-size: 10px; color: #4a5568; font-weight: 500;
}

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
