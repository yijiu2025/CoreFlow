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

  /** 动态更新裁剪框四边控制点的缩放行为 */
  const setCropBoxControls = (isLocked: boolean) => {
    if (!cropBox) return
    // 浅拷贝 controls，避免污染全局的 fabric.Rect 原型
    if (cropBox.controls === fabric.Rect.prototype.controls) {
      cropBox.controls = { ...fabric.Rect.prototype.controls }
    }

    const sideKeys = ['ml', 'mr', 'mt', 'mb']
    sideKeys.forEach(key => {
      // 深度拷贝当前的控制点实例，避免相互影响
      const ctrl = Object.assign(new fabric.Control({}), cropBox.controls[key])

      // 如果锁定比例，则将四边的行为全部改为「等比缩放」(scalingEqually)
      // 如果自由比例，则恢复左右缩放(scalingX)或上下缩放(scalingY)
      if (isLocked) {
        ctrl.actionHandler = fabric.controlsUtils.scalingEqually
      } else {
        ctrl.actionHandler = (key === 'ml' || key === 'mr') ? fabric.controlsUtils.scalingX : fabric.controlsUtils.scalingY
      }
      cropBox.controls[key] = ctrl
    })

    // 强制四边控制点始终显示
    cropBox.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true })
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
      const hasRatio = cropAspectRatio.value !== null

      cropBox = new fabric.Rect({
        left: margin, top: margin,
        width: canvasWidth - margin * 2, height: canvasHeight - margin * 2,
        fill: 'rgba(0,0,0,0.01)', stroke: '#6366f1', strokeWidth: 2, strokeDashArray: [8, 4],
        selectable: true, evented: true, hasControls: true, hasBorders: true,
        cornerColor: '#6366f1', cornerSize: 10, transparentCorners: false,
        borderColor: '#6366f1', isCropBox: true,
        lockUniScaling: hasRatio
      })

      // 动态应用控制点配置
      setCropBoxControls(hasRatio)

      // 如果初始就有固定比例，重置宽高贴合比例
      if (hasRatio && cropAspectRatio.value) {
        const currentWidth = cropBox.width * (cropBox.scaleX || 1)
        const newHeight = currentWidth / cropAspectRatio.value
        cropBox.set({ height: newHeight / (cropBox.scaleY || 1), scaleY: cropBox.scaleX })
      }

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

      // 监听对象缩放事件（精确控制边界和锚点，修复拉伸错位）
      fCanvas.value.on('object:scaling', (e: any) => {
        if (e.target === cropBox) {
          let left = cropBox.left
          let top = cropBox.top
          let bw = cropBox.width * cropBox.scaleX
          let bh = cropBox.height * cropBox.scaleY

          // 记录当前拖拽的锚点（例如拖右侧，锚点其实在左侧；拖左侧，锚点在右侧）
          const originX = e.transform?.originX || 'left'
          const originY = e.transform?.originY || 'top'
          // 计算锚点在画布上的绝对坐标（缩放时锚点这头应当岿然不动）
          const anchorX = originX === 'right' ? left + bw : (originX === 'center' ? left + bw / 2 : left)
          const anchorY = originY === 'bottom' ? top + bh : (originY === 'center' ? top + bh / 2 : top)

          // 1. 限制不超出左上边界
          if (left < 0) { bw += left; left = 0 }
          if (top < 0) { bh += top; top = 0 }

          // 2. 限制不超出右下边界
          if (left + bw > canvasWidth) { bw = canvasWidth - left }
          if (top + bh > canvasHeight) { bh = canvasHeight - top }

          // 3. 强制比例约束（如果有）
          if (cropAspectRatio.value) {
            const ratio = cropAspectRatio.value
            const currentRatio = bw / bh
            if (Math.abs(currentRatio - ratio) > 0.001) {
              if (currentRatio > ratio) {
                bw = bh * ratio // 宽超出，基于高缩小宽
              } else {
                bh = bw / ratio // 高超出，基于宽缩小高
              }
            }
          }

          // 4. 根据锚点重新推算 left 和 top，防止未操作的对边发生反向漂移
          if (originX === 'right') { left = anchorX - bw }
          else if (originX === 'center') { left = anchorX - bw / 2 }

          if (originY === 'bottom') { top = anchorY - bh }
          else if (originY === 'center') { top = anchorY - bh / 2 }

          // 兜底校验：修正比例后极小概率会导致坐标出现微弱负数
          if (left < 0) left = 0
          if (top < 0) top = 0

          // 应用修正后的最终尺寸
          cropBox.set({
            left: left,
            top: top,
            scaleX: bw / cropBox.width,
            scaleY: bh / cropBox.height
          })

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

    const isLocked = ratio !== null
    // 更新等比锁定状态
    cropBox.set({ lockUniScaling: isLocked })

    // 动态更新四边控制点行为并保持可见
    setCropBoxControls(isLocked)

    if (ratio) {
      const currentWidth = cropBox.width * (cropBox.scaleX || 1)
      const newHeight = currentWidth / ratio
      cropBox.set({ height: newHeight / (cropBox.scaleY || 1), scaleY: cropBox.scaleX })
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
