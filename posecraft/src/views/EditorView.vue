<template>
  <div class="editor-root">
    <!-- 顶部导航栏子组件 -->
    <TopBar
      @exit="triggerExit"
      @undo="undo"
      @redo="redo"
      @help="showHelp = true"
      @save="saveTemplate"
    />

    <!-- 主编辑器工作区 -->
    <div class="main-content">
      <!-- 左侧工具切换栏子组件 -->
      <LeftToolbar
        :showColorPanel="showColorPanel"
        :showStylePanel="showStylePanel"
        @setTool="setTool"
        @selectTab="selectTab"
        @selectHandTool="selectHandTool"
        @toggleColorPanel="showColorPanel = !showColorPanel"
        @toggleStylePanel="showStylePanel = !showStylePanel"
        @clearCanvas="clearCanvas"
      />

      <!-- 中间主画布区域子组件 -->
      <CanvasArea
        ref="canvasAreaRef"
        :isCropping="isCropping"
        @imageFileChange="onImageFileChange"
        @triggerFileInput="triggerFileInput"
      />

      <!-- 右侧多功能属性面板子组件 -->
      <RightPanel
        :isCropping="isCropping"
        :detectionTypes="detectionTypes"
        
        :fontSize="textFontSize"
        :fontFamily="textFontFamily"
        :lineHeight="textLineHeight"
        :letterSpacing="textLetterSpacing"
        :bold="textBold"
        :italic="textItalic"
        :underline="textUnderline"
        :strikethrough="textStrikethrough"
        :textAlign="textAlign"
        :warpStyle="warpStyle"
        
        @autoAnalyze="autoAnalyze"
        @setTool="setTool"
        @setDrawTool="setDrawTool"
        @clearAnalysis="clearAnalysis"
        @saveState="saveState"
        @deleteSelected="deleteSelected"
        @bringToFront="bringToFront"
        @sendToBack="sendToBack"
        @moveUp="moveUp"
        @moveDown="moveDown"
        @copySelected="copySelected"
        @pasteClipboard="pasteClipboard"
        @updatePathStrokeWidth="updatePathStrokeWidth"
        @updatePathBlur="updatePathBlur"
        @updatePathScale="updatePathScale"
        @toggleGuide="toggleGuide"
        
        @addText="addText"
        @update:fontSize="(v) => { textFontSize = v; updateTextProperty('fontSize', v) }"
        @update:fontFamily="(v) => { textFontFamily = v; updateTextProperty('fontFamily', v) }"
        @update:lineHeight="(v) => { textLineHeight = v; updateTextProperty('lineHeight', v / 100) }"
        @update:letterSpacing="(v) => { textLetterSpacing = v; updateTextProperty('charSpacing', v * 10) }"
        @update:bold="(v) => { textBold = v; updateTextProperty('fontWeight', v ? 'bold' : 'normal') }"
        @update:italic="(v) => { textItalic = v; updateTextProperty('fontStyle', v ? 'italic' : 'normal') }"
        @update:underline="(v) => { textUnderline = v; updateTextProperty('underline', v) }"
        @update:strikethrough="(v) => { textStrikethrough = v; updateTextProperty('linethrough', v) }"
        @update:textAlign="(v) => { textAlign = v; updateTextProperty('textAlign', v) }"
        
        @zoomIn="zoomIn"
        @zoomOut="zoomOut"
        @resetZoom="resetZoom"
        @fitToScreen="fitToScreen"
        @replaceImage="triggerFileInput"
        @cropImage="startCropMode"
        @updateBgOpacity="updateBgOpacity"
        @updateCropAspectRatio="updateCropAspectRatio"
        @confirmCrop="confirmCrop"
        @cancelCrop="cancelCrop"
      />
    </div>

    <!-- 颜色浮动面板 -->
    <ColorFloatPanel
      :visible="showColorPanel"
      :currentColor="toolStore.currentColor"
      :fillColor="toolStore.fillColor"
      :noFill="toolStore.noFill"
      :presetColors="toolStore.presetColors"
      @close="showColorPanel = false"
      @update:currentColor="updateCurrentColorWrapper"
      @update:fillColor="updateFillColor"
      @update:noFill="updateNoFill"
      @saveState="saveState"
    />
    
    <!-- 样式浮动面板 -->
    <StyleFloatPanel
      :visible="showStylePanel"
      :strokeWidth="toolStore.strokeWidth"
      :strokeOpacity="toolStore.strokeOpacity"
      :fillOpacity="toolStore.fillOpacity"
      :cornerRadius="toolStore.cornerRadius"
      :lineStyle="toolStore.lineStyle"
      @close="showStylePanel = false"
      @update:strokeWidth="updateStrokeWidth"
      @update:strokeOpacity="updateStrokeOpacity"
      @update:fillOpacity="updateFillOpacity"
      @update:cornerRadius="updateCornerRadius"
      @update:lineStyle="updateLineStyle"
      @saveState="saveState"
    />

    <!-- 帮助快捷键说明弹窗 -->
    <HelpModal :isOpen="showHelp" @close="showHelp = false" />

    <!-- 发布/保存作品详情弹窗 -->
    <SaveModal
      :isOpen="showSaveModal"
      :initialName="canvasStore.templateName"
      :initialCoords="imageCoords"
      :initialExif="imageExif"
      @close="showSaveModal = false"
      @save="confirmSave"
    />

    <!-- 退出确认弹窗 -->
    <ExitModal
      :isOpen="showExitModal"
      @close="showExitModal = false"
      @confirm="goHome"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, toRef } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTemplateSave } from '@/composables/canvas/useTemplateSave'
import { useAuthStore } from '@/stores/auth'
import { templateApi } from '@/api/template'
import { useCanvasStore, useToolStore, useHistoryStore } from '@/stores/editor'
import { parseImageExif } from '@/utils/exif'
import ColorFloatPanel from '@/components/color/ColorFloatPanel.vue'
import StyleFloatPanel from '@/components/brush/StyleFloatPanel.vue'
import HelpModal from '@/components/modals/HelpModal.vue'
import SaveModal from '@/components/modals/SaveModal.vue'
import ExitModal from '@/components/modals/ExitModal.vue'
import { v4 as uuidv4 } from 'uuid'
import * as fabricLib from 'fabric'

// 导入重构拆分的子组件
import TopBar from '@/components/editor/TopBar.vue'
import LeftToolbar from '@/components/editor/LeftToolbar.vue'
import CanvasArea from '@/components/editor/CanvasArea.vue'
import RightPanel from '@/components/editor/RightPanel.vue'

// 导入核心画布操作 Composables
import { useHistory } from '@/composables/canvas/useHistory'
import { useTools } from '@/composables/canvas/useTools'
import { useShapes } from '@/composables/canvas/useShapes'
import { useReferenceLines } from '@/composables/canvas/useReferenceLines'
import { useSkeletonNodes } from '@/composables/canvas/useSkeletonNodes'
import { useImageUpload } from '@/composables/canvas/useImageUpload'
import { useCanvasInit } from '@/composables/canvas/useCanvasInit'
import { useAIAnalysis } from '@/composables/canvas/useAIAnalysis'
import { useMouseEvents } from '@/composables/canvas/useMouseEvents'
import { useText } from '@/composables/canvas/useText'
import { useKeyboard } from '@/composables/canvas/useKeyboard'
import { useCanvasProperties } from '@/composables/canvas/useCanvasProperties'
import { useCanvasSelection } from '@/composables/canvas/useCanvasSelection'

// 兼容并加载 Fabric 实例
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// 引入全局 Pinia 状态管理
const canvasStore = useCanvasStore()
const toolStore = useToolStore()
const historyStore = useHistoryStore()

// DOM 元素挂载引用
const canvasAreaRef = ref<any>(null)
const canvasContainer = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// 深度监控子组件中的 DOM 引用渲染情况并动态赋值
watch(() => canvasAreaRef.value?.canvasContainer, (v) => { if (v) canvasContainer.value = v })
watch(() => canvasAreaRef.value?.fileInput, (v) => { if (v) fileInput.value = v })

// 弹窗与控制面板的显示隐藏状态
const isStateSavingLocked = ref(false)
const showHelp = ref(false)
const showColorPanel = ref(false)
const showStylePanel = ref(false)

// ═══ Composables 模块初始化 ═══

/** 1. 画布初始化管理（缩放、视口平移适配） */
const {
  fCanvas, currentZoom, zoomSlider, zoomPercent,
  initCanvas, resizeCanvas, resetZoom, fitToScreen, zoomIn, zoomOut,
  applyCanvasTransform, syncCanvasDimensions, getCanvasDeps
} = useCanvasInit(canvasContainer, toRef(toolStore, 'eraserSize'))

// 实时双向将 local refs 同步注入至 canvasStore 以供全局消费
watch(fCanvas, (v) => { canvasStore.fCanvas = v }, { immediate: true })
watch(currentZoom, (v) => { canvasStore.currentZoom = v }, { immediate: true })
watch(zoomSlider, (v) => { canvasStore.zoomSlider = v }, { immediate: true })
watch(() => canvasStore.zoomSlider, (v) => { zoomSlider.value = v })

/** 2. 画布历史快照管理（撤销、重做） */
const { undoStack, redoStack, saveState, undo, redo, setOnStateRestored, setOnReapplyTool } = useHistory(fCanvas, isStateSavingLocked, null, null)

/** 3. 工具管理逻辑（工具切换、自定义笔刷或选择光标设置） */
const { selectTab, selectHandTool, setDrawTool, setTool, setDeps } = useTools(fCanvas, toRef(toolStore, 'activeTool'), toRef(toolStore, 'canvasTool'))

/** 4. 几何及自定义形状操作（五角星、多边形、箭头） */
const { applyColor, applyColorToImage, isBrushObject, updatePathStrokeWidth, updatePathScale, updatePathBlur, createStar, createPolygon, addArrowHead } = useShapes(fCanvas, toRef(toolStore, 'currentColor'), toRef(toolStore, 'fillColor'))

/** 5. 九宫格与黄金比例构图参考辅助线 */
const { activeGuides, drawReference, deleteGuides, toggleGuide } = useReferenceLines(fCanvas, toRef(toolStore, 'currentColor'), toRef(toolStore, 'strokeWidth'), saveState)
watch(activeGuides, (v) => { toolStore.activeGuides = v }, { immediate: true, deep: true })

/** 6. 姿势骨架节点及肢体连接线连接操作 */
const { drawPoseSkeleton, addSkeletonNode, addMidpointNode, connectNodes } = useSkeletonNodes(fCanvas, toRef(toolStore, 'currentColor'), saveState)

// 整合传递给各事件的画布上下文数据环境
const canvasDeps = Object.create(getCanvasDeps(), {
  eraserOpacity: { get() { return toolStore.eraserOpacity }, enumerable: true },
  eraserHardness: { get() { return toolStore.eraserHardness }, enumerable: true },
  eraserShape: { get() { return toolStore.eraserShape }, enumerable: true }
})

/** 7. AI 人体姿态智能识别与关键点自动渲染 */
const {
  isDetectorReady, detectionTypes, ensureModelsLoaded, runFullAnalysis, autoAnalyze, clearAnalysis, analyzeArea
} = useAIAnalysis(
  fCanvas, toRef(toolStore, 'currentColor'), toRef(canvasStore, 'detectionType'), toRef(canvasStore, 'bgImageUploaded'), toRef(canvasStore, 'loadingStep'), toRef(canvasStore, 'analysisComplete'), toRef(canvasStore, 'isAnalyzing'), saveState, drawPoseSkeleton, canvasDeps
)

/** 8. 文本对象添加与字体样式定制 Composable */
const {
  textFontSize, textFontFamily, textLineHeight, textLetterSpacing, textBold, textItalic, textUnderline, textStrikethrough, textAlign, warpStyle,
  addText, updateTextProperty
} = useText(saveState)

/** 9. 侧边栏属性修改处理器 Composable（填充色、线条宽度、虚实线） */
const {
  updateCurrentColor, updateFillColor, updateNoFill, updateStrokeWidth, updateStrokeOpacity, updateFillOpacity, updateCornerRadius, updateLineStyle, toRgba
} = useCanvasProperties(fCanvas)

// 封装颜色更新方法，支持图片变色处理器调用
const updateCurrentColorWrapper = (color: string) => {
  updateCurrentColor(color, applyColorToImage)
}

/** 10. 元素选中状态实时同步 Composable */
const { updateSelection } = useCanvasSelection(fCanvas, {
  textFontSize, textFontFamily, textLineHeight, textLetterSpacing, textBold, textItalic, textUnderline, textStrikethrough, textAlign
})

/** 11. 画布底层鼠标点击、拖拽移动、笔刷轨迹创建核心事件绑定 */
const {
  handleMouseDown, handleMouseMove, handleMouseUp, handlePathCreated
} = useMouseEvents(
  fCanvas, toRef(toolStore, 'canvasTool'), toRef(toolStore, 'activeTool'), toRef(toolStore, 'currentColor'), toRef(toolStore, 'strokeWidth'), toRef(toolStore, 'noFill'), toRef(toolStore, 'fillColor'), toRef(toolStore, 'strokeOpacity'), toRef(toolStore, 'fillOpacity'), toRef(toolStore, 'lineStyle'), toRef(toolStore, 'eraserSize'), textFontSize, toRef(toolStore, 'cornerRadius'), canvasDeps, saveState, addSkeletonNode, addMidpointNode, connectNodes, createStar, createPolygon, addArrowHead, analyzeArea, applyCanvasTransform, () => spacePressed.value
)

/** 12. 作品保存、导出数据封装与退出提示管理 */
const {
  showSaveModal,
  showExitModal,
  saveTemplate,
  triggerExit,
  goHome,
  confirmSave
} = useTemplateSave(fCanvas, toRef(canvasStore, 'templateName'), () => canvasDeps.inkCanvas)

// 照片读取后的经纬度地理与相机机型 EXIF 元信息
const imageCoords = ref<{ lat: number; lng: number } | null>(null)
const imageExif = ref<any>(null)

/**
 * 监听参考图片文件上传选择，提取 EXIF 机型信息及位置经纬度，开始参考背景图渲染
 */
const onImageFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    const res = await parseImageExif(file)
    if (res.coords) {
      imageCoords.value = res.coords
    } else {
      imageCoords.value = null
    }
    if (res.exif) {
      imageExif.value = res.exif
    } else {
      imageExif.value = null
    }
  }
  handleImageUpload(e)
}

let resizeObserver: any = null

// ════ 笔刷/参考背景透明度属性修改全局侦听与物理同步 ════

watch(() => toolStore.brushSize, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) fCanvas.value.freeDrawingBrush.width = Number(newVal)
})

watch([() => toolStore.currentColor, () => toolStore.brushOpacity], ([newColor, newOpacity]) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    const rgbaColor = toRgba(newColor as string, (newOpacity as number) / 100)
    fCanvas.value.freeDrawingBrush.color = rgbaColor
    if (toolStore.brushFeather > 0 && fCanvas.value.freeDrawingBrush.shadow) fCanvas.value.freeDrawingBrush.shadow.color = rgbaColor
  }
})

watch(() => toolStore.brushFeather, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) {
    if (newVal > 0) {
      const rgbaColor = toRgba(toolStore.currentColor, toolStore.brushOpacity / 100)
      fCanvas.value.freeDrawingBrush.shadow = new fabric.Shadow({ color: rgbaColor, blur: newVal, offsetX: 0, offsetY: 0 })
    } else {
      fCanvas.value.freeDrawingBrush.shadow = null
    }
  }
})

watch(() => canvasStore.bgOpacity, (newVal) => {
  if (!fCanvas.value) return
  const bg = fCanvas.value.backgroundImage
  if (bg) { bg.set({ opacity: newVal / 100 }); fCanvas.value.renderAll() }
})

// ════ 生命周期钩子绑定与卸载 ════

onMounted(async () => {
  if (!authStore.isLoggedIn) { router.push('/login'); return }
  initCanvas()
  
  setDeps({
    eraserCursor: canvasDeps.eraserCursor,
    eraserSize: toRef(toolStore, 'eraserSize'),
    brushSize: toRef(toolStore, 'brushSize'),
    brushOpacity: toRef(toolStore, 'brushOpacity'),
    brushFeather: toRef(toolStore, 'brushFeather'),
    brushStyle: toRef(toolStore, 'brushStyle'),
    brushBlend: toRef(toolStore, 'brushBlend'),
    currentColor: toRef(toolStore, 'currentColor')
  })
  
  // 绑定 Fabric.js 鼠标及选择更新事件监听器
  fCanvas.value.on('mouse:down', handleMouseDown)
  fCanvas.value.on('mouse:move', handleMouseMove)
  fCanvas.value.on('mouse:up', handleMouseUp)
  fCanvas.value.on('path:created', handlePathCreated)
  fCanvas.value.on('selection:created', updateSelection)
  fCanvas.value.on('selection:updated', updateSelection)
  fCanvas.value.on('selection:cleared', updateSelection)
  fCanvas.value.on('text:selection:changed', updateSelection)

  // 绑定双击快捷文字输入编辑交互
  fCanvas.value.on('mouse:dblclick', (e: any) => {
    const target = e.target
    if (target && (target.type === 'i-text' || target.type === 'text' || target.type === 'textbox')) {
      fCanvas.value.setActiveObject(target)
      target.enterEditing()
      target.selectAll()
      fCanvas.value.renderAll()
    }
  })
  
  // 联动骨架节点移动时重算并贴合肢体连接线坐标
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

  // 绑定窗口自适应大小缩放监听器
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)

  // 💡 如果有传入的模板 ID 且具备编辑权限，从后台拉取模板数据进行二次编辑
  const templateId = route.query.id ? Number(route.query.id) : null
  if (templateId) {
    try {
      const template = await templateApi.getDetail(templateId) as any
      if (template) {
        canvasStore.templateName = template.title
        
        let poseData = template.pose_data
        if (typeof poseData === 'string') {
          try { poseData = JSON.parse(poseData) } catch (e) {}
        }
        
        if (poseData?.fabricData && fCanvas.value) {
          fCanvas.value.loadFromJSON(poseData.fabricData, () => {
            const bgImage = fCanvas.value.backgroundImage
            if (bgImage) {
              bgImage.set({
                originX: 'center',
                originY: 'center',
                left: fCanvas.value.width / 2,
                top: fCanvas.value.height / 2
              })
              canvasStore.bgImageUploaded = true
            }
            fCanvas.value.renderAll()
            saveState()
          })
        }
      }
    } catch (err) {
      console.error('加载模板编辑数据失败:', err)
    }
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (fCanvas.value) fCanvas.value.dispose()
})

// ════ 图像裁剪及上传绑定 ════

const { isCropping, cropAspectRatio, triggerFileInput, handleImageUpload, startCropMode, updateBgOpacity, updateCropAspectRatio, confirmCrop, cancelCrop, setFileInput, setDeps: setUploadDeps } = useImageUpload(fCanvas, toRef(toolStore, 'activeTool'), toRef(canvasStore, 'bgImageUploaded'), toRef(canvasStore, 'bgOpacity'), zoomSlider, currentZoom, saveState, applyCanvasTransform)
watch(fileInput, (v) => { if (v) setFileInput(v) }, { immediate: true })
watch(canvasContainer, (v) => { if (v) setUploadDeps({ canvasContainer: v }) }, { immediate: true })
setOnStateRestored(() => { if (isCropping.value) { isCropping.value = false } })
setOnReapplyTool(() => { setDrawTool(toolStore.canvasTool) })

// 双向监控裁剪比例值
watch(cropAspectRatio, (v) => { toolStore.cropAspectRatio = v }, { immediate: true })
watch(() => toolStore.cropAspectRatio, (v) => { cropAspectRatio.value = v })

// ════ 键盘快捷按键绑定及调用动作 ════

const deleteSelected = () => { fCanvas.value.getActiveObjects().forEach((o: any) => fCanvas.value.remove(o)); fCanvas.value.discardActiveObject(); fCanvas.value.renderAll(); saveState() }
const clearCanvas = () => { if (!confirm('确定清空画布？')) return; fCanvas.value.getObjects().slice().forEach((o: any) => fCanvas.value.remove(o)); fCanvas.value.renderAll(); saveState() }

// 物理层级前后移动操作
const bringToFront = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.bringToFront(); fCanvas.value.renderAll() } }
const sendToBack = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.sendToBack(); fCanvas.value.renderAll() } }
const moveUp = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.bringForward(); fCanvas.value.renderAll() } }
const moveDown = () => { const obj = fCanvas.value?.getActiveObject(); if (obj) { obj.sendBackwards(); fCanvas.value.renderAll() } }

// 组合复制粘贴剪贴板
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

// 全局注册键盘快捷键处理 Hook
const { spacePressed } = useKeyboard({
  undo,
  redo,
  deleteSelected,
  zoomIn,
  zoomOut,
  resetZoom,
  saveState
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import '@/assets/styles/common.css';
* { box-sizing: border-box; }

/* 编辑器根部及主体布局样式 */
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #0a0a0f;
  color: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.shortcut-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
.shortcut-item kbd {
  display: inline-block; padding: 2px 6px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px; font-size: 11px; font-family: 'Inter', monospace; color: #94a3b8;
}
</style>
