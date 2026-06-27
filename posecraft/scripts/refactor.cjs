const fs = require('fs')

const path = 'c:/Users/22701/Desktop/nodeServers/posecraft/src/views/EditorView.vue'
let content = fs.readFileSync(path, 'utf8')

const startScript = content.indexOf('<script setup lang="ts">')
const endScript = content.indexOf('</script>') + 9

if (startScript === -1 || endScript === -1) {
  console.log('Could not find script block')
  process.exit(1)
}

const scriptContent = `<script setup lang="ts">
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

const detectionType = ref<'all' | 'pose' | 'face' | 'hand' | 'segmentation'>('all')

let isStateSavingLocked = false
let spacePressed = false

const eraserSize = ref(20)
const brushSize = ref(8)
const brushFeather = ref(0)
const textFontSize = ref(24)
const pathBlur = ref(0)

const strokeWidth = ref(3)
const fillColor = ref('#6366f1')
const currentColor = ref('#6366f1')
const noFill = ref(true)
const lineStyle = ref('solid')
const shapeOpacity = ref(100)

const {
  fCanvas, currentZoom, zoomSlider, zoomPercent,
  initCanvas, resizeCanvas, resetZoom, fitToScreen, zoomIn, zoomOut,
  applyCanvasTransform, syncCanvasDimensions, getCanvasDeps
} = useCanvasInit(canvasContainer, eraserSize)

const { undoStack, redoStack, saveState, undo, redo, setOnStateRestored } = useHistory(fCanvas, { value: isStateSavingLocked }, null, null)
const { selectTab, selectHandTool, setDrawTool, setTool } = useTools(fCanvas, activeTool, canvasTool)
const { applyColor, isBrushObject, updatePathStrokeWidth, updatePathScale, updatePathBlur, createStar, createPolygon, addArrowHead } = useShapes(fCanvas, currentColor, fillColor)
const { activeGuides, drawReference, deleteGuides, toggleGuide } = useReferenceLines(fCanvas, fillColor, strokeWidth, saveState)
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
  fCanvas, canvasTool, activeTool, currentColor, strokeWidth, noFill, fillColor, shapeOpacity, lineStyle, eraserSize, textFontSize, canvasDeps, saveState, addSkeletonNode, addMidpointNode, connectNodes, createStar, createPolygon, addArrowHead, analyzeArea, applyCanvasTransform, () => spacePressed
)

watch(fillColor, (v) => { currentColor.value = v })
watch(currentColor, (v) => { fillColor.value = v })

let resizeObserver: any = null

watch(brushSize, (newVal) => {
  if (fCanvas.value?.isDrawingMode && fCanvas.value.freeDrawingBrush) fCanvas.value.freeDrawingBrush.width = newVal
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
}

onMounted(async () => {
  if (!authStore.isLoggedIn) { router.push('/login'); return }
  initCanvas()
  
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

const { isCropping, cropAspectRatio, triggerFileInput, handleImageUpload, startCropMode, updateBgOpacity, updateCropAspectRatio, confirmCrop, cancelCrop, setFileInput, setDeps } = useImageUpload(fCanvas, activeTool, bgImageUploaded, bgOpacity, zoomSlider, currentZoom, saveState, applyCanvasTransform)
watch(fileInput, (v) => { if (v) setFileInput(v) }, { immediate: true })
watch(canvasContainer, (v) => { if (v) setDeps({ canvasContainer: v }) }, { immediate: true })
setOnStateRestored(() => { if (isCropping.value) { isCropping.value = false } })

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
  const p = new Promise((resolve) => { if (!snapshot.ink) return resolve(null); const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = snapshot.ink })
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
</script>`

const newContent = content.substring(0, startScript) + scriptContent + content.substring(endScript)
fs.writeFileSync(path, newContent)
console.log('Successfully updated EditorView.vue')
