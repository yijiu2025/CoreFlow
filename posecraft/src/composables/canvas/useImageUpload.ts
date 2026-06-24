import { ref } from 'vue'

import * as fabricLib from 'fabric'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
import type { Ref } from 'vue'

/**
 * 图片上传和裁剪管理
 */
export function useImageUpload(
  fCanvas: Ref<any>,
  activeTool: Ref<string>,
  bgImageUploaded: Ref<boolean>,
  bgOpacity: Ref<number>,
  zoomSlider: Ref<number>,
  currentZoom: Ref<number>,
  saveState: () => void,
  applyCanvasTransform: () => void
) {
  const isCropping = ref(false)
  const cropAspectRatio = ref<number | null>(null)
  let cropBox: any = null
  let uploadedImage: any = null
  let cropOverlay: any = null
  let canvasContainer: HTMLElement | null = null
  let inkCanvas: HTMLCanvasElement | null = null
  let inkCtx: CanvasRenderingContext2D | null = null
  let inkLayer: any = null
  let canvasScale = 1
  let canvasTranslateX = 0
  let canvasTranslateY = 0

  /** 设置外部依赖 */
  const setDeps = (deps: { canvasContainer?: HTMLElement; inkCanvas?: HTMLCanvasElement; inkCtx?: CanvasRenderingContext2D; inkLayer?: any; canvasScale?: number; canvasTranslateX?: number; canvasTranslateY?: number }) => {
    if (deps.canvasContainer) canvasContainer = deps.canvasContainer
    if (deps.inkCanvas) inkCanvas = deps.inkCanvas
    if (deps.inkCtx) inkCtx = deps.inkCtx
    if (deps.inkLayer) inkLayer = deps.inkLayer
    if (deps.canvasScale !== undefined) canvasScale = deps.canvasScale
    if (deps.canvasTranslateX !== undefined) canvasTranslateX = deps.canvasTranslateX
    if (deps.canvasTranslateY !== undefined) canvasTranslateY = deps.canvasTranslateY
  }

  /** 触发文件选择 */
  const triggerFileInput = (fileInput: any) => fileInput?.click()

  /** 处理图片上传 */
  const handleImageUpload = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    ;(e.target as HTMLInputElement).value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      fabric.Image.fromURL(ev.target?.result, (img: any) => {
        const cw = canvasContainer?.clientWidth || 800
        const ch = canvasContainer?.clientHeight || 600
        const scale = Math.min(cw / img.width, ch / img.height)
        const fitW = img.width * scale
        const fitH = img.height * scale

        fCanvas.value.clear()
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

        canvasScale = 1; canvasTranslateX = 0; canvasTranslateY = 0
        applyCanvasTransform()
        zoomSlider.value = 100; currentZoom.value = 1

        fCanvas.value.renderAll()
        bgImageUploaded.value = true
        activeTool.value = 'image'
        saveState()
      })
    }
    reader.readAsDataURL(file)
  }

  /** 更新裁剪遮罩 */
  const updateCropOverlay = (canvasW: number, canvasH: number) => {
    if (!fCanvas.value || !cropBox) return
    if (cropOverlay) fCanvas.value.remove(cropOverlay)

    const bx = cropBox.left, by = cropBox.top
    const bw = cropBox.width * (cropBox.scaleX || 1), bh = cropBox.height * (cropBox.scaleY || 1)

    cropOverlay = new fabric.Rect({
      left: 0, top: 0, width: canvasW, height: canvasH,
      fill: 'rgba(0,0,0,0.5)', selectable: false, evented: false, isCropOverlay: true
    })
    fCanvas.value.add(cropOverlay)

    const clipRect = new fabric.Rect({
      left: bx, top: by, width: bw, height: bh,
      absolutePositioned: true, inverted: true
    })
    cropOverlay.clipPath = clipRect
    cropBox.bringToFront()
    fCanvas.value.renderAll()
  }

  /** 裁剪框移动回调 */
  const onCropBoxMoving = () => {
    if (!fCanvas.value || !cropBox) return
    updateCropOverlay(fCanvas.value.width, fCanvas.value.height)
  }

  /** 裁剪框缩放回调 */
  const onCropBoxScaling = () => {
    if (!cropBox || !cropAspectRatio.value) return
    const ratio = cropAspectRatio.value
    const newWidth = cropBox.width * (cropBox.scaleX || 1)
    const newHeight = newWidth / ratio
    cropBox.set({ height: newHeight / (cropBox.scaleY || 1), scaleY: cropBox.scaleX })
  }

  /** 开始裁剪模式 */
  const startCropMode = () => {
    if (!fCanvas.value || !bgImageUploaded.value) return
    const bg = fCanvas.value.backgroundImage
    if (!bg) return

    const canvasWidth = fCanvas.value.width
    const canvasHeight = fCanvas.value.height

    bg.clone((clonedImg: any) => {
      clonedImg.set({ selectable: false, evented: false, isCropImage: true })
      fCanvas.value.backgroundImage = null
      fCanvas.value.clipPath = null
      fCanvas.value.add(clonedImg)
      uploadedImage = clonedImg

      const margin = 20
      cropBox = new fabric.Rect({
        left: margin, top: margin,
        width: canvasWidth - margin * 2, height: canvasHeight - margin * 2,
        fill: 'transparent', stroke: '#6366f1', strokeWidth: 2, strokeDashArray: [8, 4],
        selectable: true, evented: true, hasControls: true, hasBorders: true,
        cornerColor: '#6366f1', cornerSize: 10, transparentCorners: false,
        borderColor: '#6366f1', isCropBox: true
      })
      fCanvas.value.add(cropBox)
      fCanvas.value.setActiveObject(cropBox)
      cropBox.on('moving', onCropBoxMoving)
      cropBox.on('scaling', onCropBoxScaling)
      updateCropOverlay(canvasWidth, canvasHeight)
      isCropping.value = true
      fCanvas.value.renderAll()
    })
  }

  /** 更新裁剪比例 */
  const updateCropAspectRatio = (ratio: number | null) => {
    cropAspectRatio.value = ratio
    if (!cropBox || !ratio || !fCanvas.value) return
    const currentWidth = cropBox.width * (cropBox.scaleX || 1)
    const newHeight = currentWidth / ratio
    cropBox.set({ height: newHeight / (cropBox.scaleY || 1), scaleY: cropBox.scaleX })
    updateCropOverlay(fCanvas.value.width, fCanvas.value.height)
    fCanvas.value.renderAll()
  }

  /** 确认裁剪 */
  const confirmCrop = () => {
    if (!fCanvas.value || !cropBox || !uploadedImage) return
    const bx = cropBox.left, by = cropBox.top
    const bw = cropBox.width * (cropBox.scaleX || 1), bh = cropBox.height * (cropBox.scaleY || 1)

    const img = uploadedImage
    const imgLeft = img.left - img.getScaledWidth() / 2
    const imgTop = img.top - img.getScaledHeight() / 2
    const cropX = (bx - imgLeft) / img.scaleX
    const cropY = (by - imgTop) / img.scaleY
    const cropW = bw / img.scaleX
    const cropH = bh / img.scaleY

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = cropW; tempCanvas.height = cropH
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img.getElement(), cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    fCanvas.value.clear()
    fabric.Image.fromURL(tempCanvas.toDataURL(), (croppedImg: any) => {
      const cw = canvasContainer?.clientWidth || 800
      const ch = canvasContainer?.clientHeight || 600
      const scale = Math.min(cw / croppedImg.width, ch / croppedImg.height)
      const fitW = croppedImg.width * scale, fitH = croppedImg.height * scale

      fCanvas.value.setDimensions({ width: fitW, height: fitH })
      croppedImg.set({
        originX: 'center', originY: 'center', left: fitW / 2, top: fitH / 2,
        scaleX: scale, scaleY: scale, selectable: false, evented: false,
        opacity: bgOpacity.value / 100
      })
      fCanvas.value.clipPath = new fabric.Rect({ left: 0, top: 0, width: fitW, height: fitH, absolutePositioned: true })
      fCanvas.value.backgroundImage = croppedImg

      if (inkCanvas) {
        inkCanvas.width = fitW; inkCanvas.height = fitH
        if (inkLayer) { inkLayer.set({ left: 0, top: 0 }); inkLayer.setElement(inkCanvas) }
      }

      canvasScale = 1; canvasTranslateX = 0; canvasTranslateY = 0
      applyCanvasTransform()
      zoomSlider.value = 100; currentZoom.value = 1

      isCropping.value = false; cropBox = null; cropOverlay = null; uploadedImage = null
      fCanvas.value.renderAll(); bgImageUploaded.value = true; saveState()
    })
  }

  /** 取消裁剪 */
  const cancelCrop = () => {
    if (!fCanvas.value || !uploadedImage) return
    const canvasW = fCanvas.value.width, canvasH = fCanvas.value.height

    fCanvas.value.clear()
    fCanvas.value.setDimensions({ width: canvasW, height: canvasH })
    uploadedImage.set({
      originX: 'center', originY: 'center', left: canvasW / 2, top: canvasH / 2,
      selectable: false, evented: false, opacity: bgOpacity.value / 100
    })
    fCanvas.value.clipPath = new fabric.Rect({ left: 0, top: 0, width: canvasW, height: canvasH, absolutePositioned: true })
    fCanvas.value.backgroundImage = uploadedImage

    if (inkCanvas) {
      inkCanvas.width = canvasW; inkCanvas.height = canvasH
      if (inkLayer) { inkLayer.set({ left: 0, top: 0 }); inkLayer.setElement(inkCanvas) }
    }

    canvasScale = 1; canvasTranslateX = 0; canvasTranslateY = 0
    applyCanvasTransform()
    zoomSlider.value = 100; currentZoom.value = 1

    isCropping.value = false; cropBox = null; cropOverlay = null; uploadedImage = null
    fCanvas.value.renderAll(); bgImageUploaded.value = true; saveState()
  }

  return {
    isCropping, cropAspectRatio,
    triggerFileInput, handleImageUpload, startCropMode,
    updateCropAspectRatio, confirmCrop, cancelCrop, setDeps
  }
}
