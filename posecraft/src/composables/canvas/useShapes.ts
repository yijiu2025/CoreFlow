import { ref } from 'vue'

import * as fabricLib from 'fabric'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
import type { Ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'

/**
 * 形状绘制和颜色管理
 */
export function useShapes(fCanvas: Ref<any>, currentColor: Ref<string>, fillColor: Ref<string>) {
  const strokeWidth = ref(3)
  const noFill = ref(true)
  const lineStyle = ref('solid')
  const shapeOpacity = ref(100)
  const pathBlur = ref(0)

  /** 给图片对象应用颜色滤镜 */
  const applyColorToImage = (imgObj: any, color: string) => {
    imgObj.filters = []
    imgObj.filters.push(new fabric.Image.filters.BlendColor({
      color,
      mode: 'tint',
      alpha: 0.8
    }))
    imgObj.applyFilters()
  }

  /** 应用颜色到画笔和选中对象 */
  const applyColor = (newColor: string) => {
    currentColor.value = newColor
    if (!fCanvas.value) return

    if (fCanvas.value.isDrawingMode && fCanvas.value.freeDrawingBrush) {
      fCanvas.value.freeDrawingBrush.color = newColor
    }

    const activeObj = fCanvas.value.getActiveObject()
    if (!activeObj) return

    switch (activeObj.type) {
      case 'i-text':
      case 'text':
      case 'textbox':
        activeObj.set('fill', newColor)
        break
      case 'line':
      case 'path':
        activeObj.set('stroke', newColor)
        break
      case 'rect':
      case 'circle':
      case 'triangle':
      case 'polygon':
      case 'ellipse':
        activeObj.set('stroke', newColor)
        break
      case 'group':
        activeObj.getObjects().forEach((obj: any) => {
          if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
            obj.set('fill', newColor)
          } else {
            obj.set('stroke', newColor)
          }
        })
        break
      case 'image':
        applyColorToImage(activeObj, newColor)
        break
      default:
        try { activeObj.set('fill', newColor) } catch { activeObj.set('stroke', newColor) }
    }

    fCanvas.value.renderAll()
  }

  /** 判断是否为画笔对象 */
  const isBrushObject = (obj: any) => {
    return obj && (
      (obj.type === 'path' && obj.erasable === true) ||
      (obj.type === 'image' && obj.isUserStroke === true)
    )
  }

  /** 更新选中画笔的描边粗细 */
  const updatePathStrokeWidth = (width: number) => {
    if (!fCanvas.value) return
    const activeObj = fCanvas.value.getActiveObject()
    if (!activeObj || !isBrushObject(activeObj)) return
    if (activeObj.type === 'path') {
      activeObj.set('strokeWidth', width)
      activeObj.setCoords()
      activeObj.dirty = true
    }
    fCanvas.value.renderAll()
  }

  /** 更新选中画笔的缩放比例 */
  const updatePathScale = (scale: number) => {
    if (!fCanvas.value) return
    const activeObj = fCanvas.value.getActiveObject()
    if (!activeObj || activeObj.type !== 'image' || !activeObj.isUserStroke) return
    activeObj.set({ scaleX: scale, scaleY: scale })
    activeObj.setCoords()
    activeObj.dirty = true
    fCanvas.value.renderAll()
  }

  /** 更新选中画笔的羽化效果 */
  const updatePathBlur = (blur: number) => {
    pathBlur.value = blur
    if (!fCanvas.value) return
    const activeObj = fCanvas.value.getActiveObject()
    if (!activeObj || !isBrushObject(activeObj)) return
    if (blur > 0) {
      if (activeObj.shadow) {
        activeObj.shadow.blur = blur * 2
      } else {
        activeObj.set('shadow', new fabric.Shadow({
          color: activeObj.stroke || currentColor.value,
          blur: blur * 2,
          offsetX: 0,
          offsetY: 0
        }))
      }
    } else {
      activeObj.set('shadow', null)
    }
    activeObj.dirty = true
    fCanvas.value.renderAll()
  }

  /** 创建星形 */
  const createStar = (cx: number, cy: number, points: number, outerR: number, innerR: number, style: any) => {
    const oR = Math.max(outerR, 2)
    const iR = Math.max(innerR, oR * 0.4)
    const pts: any[] = []
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? oR : iR
      const angle = (Math.PI / points) * i - Math.PI / 2
      pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
    }
    return new fabric.Polygon(pts, { ...style, left: cx, top: cy })
  }

  /** 创建正多边形 */
  const createPolygon = (cx: number, cy: number, sides: number, radius: number, style: any) => {
    const r = Math.max(radius, 2)
    const pts: any[] = []
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
      pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
    }
    return new fabric.Polygon(pts, { ...style, left: cx, top: cy })
  }

  /** 为线条添加箭头头部 */
  const addArrowHead = (line: any) => {
    if (!fCanvas.value || !line) return
    const x2 = line.x2, y2 = line.y2
    const angle = Math.atan2(y2 - line.y1, x2 - line.x1)
    const headLen = 15 + line.strokeWidth

    const arrowHead = new fabric.Triangle({
      width: headLen,
      height: headLen * 0.8,
      left: x2, top: y2,
      originX: 'center', originY: 'center',
      angle: (angle * 180 / Math.PI) + 90,
      fill: line.stroke || currentColor.value,
      stroke: null,
      selectable: false, evented: false,
      erasable: true, isAutoGenerated: true
    })
    fCanvas.value.add(arrowHead)
  }

  /** 添加矩形 */
  const addShape = (type: string) => {
    if (!fCanvas.value) return
    const c = fCanvas.value.getCenter()
    const baseStyle = {
      left: c.left, top: c.top,
      fill: noFill.value ? 'transparent' : fillColor.value,
      stroke: currentColor.value, strokeWidth: strokeWidth.value,
      originX: 'center', originY: 'center', erasable: true
    }
    const shape = type === 'rect'
      ? new fabric.Rect({ ...baseStyle, width: 120, height: 80 })
      : new fabric.Circle({ ...baseStyle, radius: 60 })
    fCanvas.value.add(shape)
    fCanvas.value.setActiveObject(shape)
    fCanvas.value.renderAll()
  }

  /** 添加文字 */
  const addText = (fontSize: number = 24) => {
    if (!fCanvas.value) return
    const c = fCanvas.value.getCenter()
    const text = new fabric.IText('双击编辑', {
      left: c.left, top: c.top,
      fontSize,
      fill: currentColor.value,
      originX: 'center', originY: 'center',
      erasable: true
    })
    fCanvas.value.add(text)
    fCanvas.value.setActiveObject(text)
    fCanvas.value.renderAll()
  }

  return {
    strokeWidth, noFill, lineStyle, shapeOpacity, pathBlur,
    applyColor, applyColorToImage, isBrushObject,
    updatePathStrokeWidth, updatePathScale, updatePathBlur,
    createStar, createPolygon, addArrowHead, addShape, addText
  }
}
