import { ref, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import * as fabric from 'fabric'

/**
 * 画布初始化和管理
 */
export function useCanvas() {
  const fCanvas = ref<any>(null)
  const canvasContainer = ref<HTMLElement | null>(null)
  const fileInput = ref<any>(null)

  let inkCanvas: HTMLCanvasElement | null = null
  let inkCtx: CanvasRenderingContext2D | null = null
  let inkLayer: any = null
  let canvasScale = 1
  let canvasTranslateX = 0
  let canvasTranslateY = 0
  let resizeObserver: any = null

  const zoomPercent = ref(100)
  const currentZoom = ref(1)
  const zoomSlider = ref(100)

  /** 应用画布变换 */
  const applyCanvasTransform = () => {
    if (!canvasContainer.value) return
    const el = canvasContainer.value.querySelector('canvas')
    if (el) {
      el.style.transform = `scale(${canvasScale}) translate(${canvasTranslateX}px, ${canvasTranslateY}px)`
      el.style.transformOrigin = 'center center'
    }
  }

  /** 缩放 */
  const zoomIn = () => {
    canvasScale = Math.min(canvasScale * 1.2, 5)
    currentZoom.value = Math.round(canvasScale * 100)
    zoomSlider.value = currentZoom.value
    applyCanvasTransform()
  }

  const zoomOut = () => {
    canvasScale = Math.max(canvasScale / 1.2, 0.2)
    currentZoom.value = Math.round(canvasScale * 100)
    zoomSlider.value = currentZoom.value
    applyCanvasTransform()
  }

  const resetZoom = () => {
    canvasScale = 1
    canvasTranslateX = 0
    canvasTranslateY = 0
    currentZoom.value = 100
    zoomSlider.value = 100
    applyCanvasTransform()
  }

  const fitToScreen = () => {
    resetZoom()
  }

  /** 处理滚轮缩放 */
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (!fCanvas.value) return
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    canvasScale = Math.max(0.2, Math.min(5, canvasScale + delta))
    currentZoom.value = Math.round(canvasScale * 100)
    zoomSlider.value = currentZoom.value
    applyCanvasTransform()
  }

  /** 同步画布尺寸 */
  const syncCanvasDimensions = () => {
    if (!fCanvas.value || !canvasContainer.value) return
    fCanvas.value.setDimensions({
      width: canvasContainer.value.clientWidth,
      height: canvasContainer.value.clientHeight
    })
  }

  return {
    fCanvas, canvasContainer, fileInput,
    inkCanvas: () => inkCanvas, inkCtx: () => inkCtx, inkLayer: () => inkLayer,
    setInkCanvas: (c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, layer: any) => {
      inkCanvas = c; inkCtx = ctx; inkLayer = layer
    },
    zoomPercent, currentZoom, zoomSlider,
    zoomIn, zoomOut, resetZoom, fitToScreen,
    handleWheel, applyCanvasTransform, syncCanvasDimensions
  }
}
