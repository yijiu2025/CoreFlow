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
  let fileInputRef: any = null
  let canvasContainer: HTMLElement | null = null
  let inkCanvas: HTMLCanvasElement | null = null
  let inkCtx: CanvasRenderingContext2D | null = null
  let inkLayer: any = null
  let canvasScale = 1
  let canvasTranslateX = 0
  let canvasTranslateY = 0
  let rAFId: number | null = null

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

  /** 设置 fileInput 引用 */
  const setFileInput = (ref: any) => { fileInputRef = ref }

  /** 触发文件选择 */
  const triggerFileInput = () => fileInputRef?.click()

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

    const bx = cropBox.left, by = cropBox.top
    const bw = cropBox.width * (cropBox.scaleX || 1), bh = cropBox.height * (cropBox.scaleY || 1)

    // 复用已有的遮罩对象，只更新 clipPath
    if (!cropOverlay) {
      cropOverlay = new fabric.Rect({
        left: 0, top: 0, width: canvasW, height: canvasH,
        fill: 'rgba(0,0,0,0.5)', selectable: false, evented: false, isCropOverlay: true
      })
      fCanvas.value.add(cropOverlay)
    }

    // 更新裁剪区域
    cropOverlay.clipPath = new fabric.Rect({
      left: bx, top: by, width: bw, height: bh,
      absolutePositioned: true, inverted: true
    })
    cropBox.bringToFront()
    fCanvas.value.renderAll()
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
        fill: 'rgba(0,0,0,0.01)', stroke: '#6366f1', strokeWidth: 2, strokeDashArray: [8, 4],
        selectable: true, evented: true, hasControls: true, hasBorders: true,
        cornerColor: '#6366f1', cornerSize: 10, transparentCorners: false,
        borderColor: '#6366f1', isCropBox: true,
        lockUniScaling: true,
        hasRotatingPoint: false,
        perPixelTargetFind: false,
        hoverCursor: 'move',
        moveCursor: 'move',
        // 启用所有边线控制点
        controls: {
          ...fabric.Rect.prototype.controls,
          ml: new fabric.Control({ x: -0.5, y: 0, actionHandler: fabric.controlsUtils.scalingXOrSkewingY, cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler }),
          mr: new fabric.Control({ x: 0.5, y: 0, actionHandler: fabric.controlsUtils.scalingXOrSkewingY, cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler }),
          mt: new fabric.Control({ x: 0, y: -0.5, actionHandler: fabric.controlsUtils.scalingYOrSkewingX, cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler }),
          mb: new fabric.Control({ x: 0, y: 0.5, actionHandler: fabric.controlsUtils.scalingYOrSkewingX, cursorStyleHandler: fabric.controlsUtils.scaleSkewCursorStyleHandler })
        }
      })

      fCanvas.value.add(cropBox)
      fCanvas.value.setActiveObject(cropBox)

      // 监听对象移动事件（限制边界 + 节流）
      fCanvas.value.on('object:moving', (e: any) => {
        if (e.target === cropBox) {
          // 限制裁剪框不超出图片边界
          const bw = cropBox.width * (cropBox.scaleX || 1)
          const bh = cropBox.height * (cropBox.scaleY || 1)
          cropBox.set({
            left: Math.max(0, Math.min(cropBox.left, canvasWidth - bw)),
            top: Math.max(0, Math.min(cropBox.top, canvasHeight - bh))
          })
          if (rAFId) cancelAnimationFrame(rAFId)
          rAFId = requestAnimationFrame(() => {
            updateCropOverlay(canvasWidth, canvasHeight)
          })
        }
      })

      // 监听对象缩放事件（强制比例 + 限制边界 + 节流）
      fCanvas.value.on('object:scaling', (e: any) => {
        if (e.target === cropBox) {
          // 强制保持比例
          if (cropAspectRatio.value) {
            const ratio = cropAspectRatio.value
            const currentWidth = cropBox.width * cropBox.scaleX
            const currentHeight = cropBox.height * cropBox.scaleY
            const currentRatio = currentWidth / currentHeight

            if (Math.abs(currentRatio - ratio) > 0.01) {
              // 根据当前缩放方向调整
              if (currentRatio > ratio) {
                // 宽度偏大，调整宽度
                cropBox.set({ scaleX: (currentHeight * ratio) / cropBox.width })
              } else {
                // 高度偏大，调整高度
                cropBox.set({ scaleY: (currentWidth / ratio) / cropBox.height })
              }
            }
          }

          // 限制缩放不超出边界
          const bw = cropBox.width * (cropBox.scaleX || 1)
          const bh = cropBox.height * (cropBox.scaleY || 1)
          if (cropBox.left < 0) cropBox.set({ left: 0 })
          if (cropBox.top < 0) cropBox.set({ top: 0 })
          if (cropBox.left + bw > canvasWidth) cropBox.set({ scaleX: (canvasWidth - cropBox.left) / cropBox.width })
          if (cropBox.top + bh > canvasHeight) cropBox.set({ scaleY: (canvasHeight - cropBox.top) / cropBox.height })
          if (rAFId) cancelAnimationFrame(rAFId)
          rAFId = requestAnimationFrame(() => {
            updateCropOverlay(canvasWidth, canvasHeight)
          })
        }
      })

      updateCropOverlay(canvasWidth, canvasHeight)
      isCropping.value = true
      fCanvas.value.renderAll()
    })
  }

  /** 更新裁剪比例 */
  const updateCropAspectRatio = (ratio: number | null) => {
    cropAspectRatio.value = ratio
    if (!cropBox || !fCanvas.value) return

    if (ratio) {
      cropBox.set({ lockUniScaling: true })
      const currentWidth = cropBox.width * (cropBox.scaleX || 1)
      const newHeight = currentWidth / ratio
      cropBox.set({ height: newHeight / (cropBox.scaleY || 1), scaleY: cropBox.scaleX })
    } else {
      cropBox.set({ lockUniScaling: false })
    }

    updateCropOverlay(fCanvas.value.width, fCanvas.value.height)
    fCanvas.value.renderAll()
  }

  /** 确认裁剪 */
  const confirmCrop = () => {
    if (!fCanvas.value || !cropBox || !uploadedImage) return
    if (rAFId) cancelAnimationFrame(rAFId)
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
    if (rAFId) cancelAnimationFrame(rAFId)
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

  /** 更新背景透明度 */
  const updateBgOpacity = (opacity: number) => {
    bgOpacity.value = opacity
    if (!fCanvas.value) return
    const bg = fCanvas.value.backgroundImage
    if (bg) {
      bg.set({ opacity: opacity / 100 })
      fCanvas.value.renderAll()
      saveState()
    }
  }

  return {
    isCropping, cropAspectRatio,
    triggerFileInput, handleImageUpload, startCropMode,
    updateBgOpacity, updateCropAspectRatio, confirmCrop, cancelCrop,
    setDeps, setFileInput
  }
}
