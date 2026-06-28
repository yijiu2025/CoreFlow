import { ref } from 'vue'

import * as fabricLib from 'fabric'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
import type { Ref } from 'vue'

/**
 * 构图参考线管理
 */
export function useReferenceLines(fCanvas: Ref<any>, currentColor: Ref<string>, strokeWidth: Ref<number>, saveState: () => void) {
  const activeGuides = ref<string[]>([])
  const guideStyles = ref<Record<string, { stroke: string; strokeWidth: number; opacity: number }>>({})

  const saveCurrentGuideStyles = () => {
    if (!fCanvas.value) return
    fCanvas.value.getObjects().forEach((obj: any) => {
      if (obj.isGuide && obj.guideType) {
        let child = obj
        if (obj.type === 'group') {
          child = obj.getObjects().find((o: any) => o.stroke || o.fill) || obj
        }
        guideStyles.value[obj.guideType] = {
          stroke: child.stroke || currentColor.value,
          strokeWidth: child.strokeWidth !== undefined ? child.strokeWidth : strokeWidth.value,
          opacity: obj.opacity !== undefined ? obj.opacity : 0.5
        }
      }
    })
  }

  /** 获取绘制区域 */
  const getDrawArea = () => {
    const bg = fCanvas.value?.backgroundImage
    if (bg) {
      const r = bg.getBoundingRect(true)
      return { w: r.width, h: r.height, l: r.left, t: r.top }
    }
    return { w: fCanvas.value?.width || 800, h: fCanvas.value?.height || 600, l: 0, t: 0 }
  }

  /** 绘制参考线 */
  const drawReference = (type: string) => {
    if (!fCanvas.value) return
    const { w, h, l, t } = getDrawArea()
    const isInteractive = (type !== 'all')
    
    const saved = guideStyles.value[type]
    const gStroke = saved ? saved.stroke : currentColor.value
    const gStrokeWidth = saved ? saved.strokeWidth : strokeWidth.value
    const gOpacity = saved ? saved.opacity : (type === 'golden' ? 0.7 : type === 'diagonal' ? 0.3 : type === 'phi' ? 0.4 : type === 'spiral' ? 0.8 : 0.5)

    const style: any = { stroke: gStroke, strokeWidth: gStrokeWidth, selectable: false, evented: false, opacity: gOpacity }

    // 三分法
    if (type === 'thirds' || type === 'all') {
      const objects: any[] = []
      ;[1/3, 2/3].forEach((f: number) => {
        objects.push(new fabric.Line([l+w*f, t, l+w*f, t+h], style))
        objects.push(new fabric.Line([l, t+h*f, l+w, t+h*f], style))
      })
      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        isGuide: true, guideType: type, type: 'group',
        originX: 'center', originY: 'center'
      })
      fCanvas.value.add(group)
      if (isInteractive && type === 'thirds') fCanvas.value.setActiveObject(group)
    }

    // 黄金比例 (0.618)
    if (type === 'golden' || type === 'all') {
      const phi = 0.618
      const objects: any[] = []
      ;[phi, 1 - phi].forEach((f: number) => {
        objects.push(new fabric.Line([l+w*f, t, l+w*f, t+h], { ...style, opacity: gOpacity }))
        objects.push(new fabric.Line([l, t+h*f, l+w, t+h*f], { ...style, opacity: gOpacity }))
      })
      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        isGuide: true, guideType: type, type: 'group',
        originX: 'center', originY: 'center'
      })
      fCanvas.value.add(group)
      if (isInteractive && type === 'golden') fCanvas.value.setActiveObject(group)
    }

    // 对角线
    if (type === 'diagonal' || type === 'all') {
      const objects: any[] = []
      objects.push(new fabric.Line([l, t, l+w, t+h], { ...style, opacity: gOpacity }))
      objects.push(new fabric.Line([l+w, t, l, t+h], { ...style, opacity: gOpacity }))
      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        isGuide: true, guideType: type, type: 'group',
        originX: 'center', originY: 'center'
      })
      fCanvas.value.add(group)
      if (isInteractive && type === 'diagonal') fCanvas.value.setActiveObject(group)
    }

    // 中心点
    if (type === 'center' || type === 'all') {
      const cx = l + w / 2, cy = t + h / 2
      const objects: any[] = []
      objects.push(new fabric.Line([cx, t, cx, t+h], style))
      objects.push(new fabric.Line([l, cy, l+w, cy], style))
      objects.push(new fabric.Circle({
        left: cx, top: cy, radius: 6,
        fill: 'transparent', stroke: gStroke, strokeWidth: 1.5,
        originX: 'center', originY: 'center',
        selectable: false, evented: false, opacity: gOpacity
      }))
      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        isGuide: true, guideType: type, type: 'group',
        originX: 'center', originY: 'center'
      })
      fCanvas.value.add(group)
      if (isInteractive && type === 'center') fCanvas.value.setActiveObject(group)
    }

    // φ 网格 / 黄金三角
    if (type === 'phi' || type === 'all') {
      const objects: any[] = []
      objects.push(new fabric.Rect({
        left: l, top: t, width: w, height: h,
        fill: 'transparent', stroke: gStroke, strokeWidth: 1,
        selectable: false, evented: false, opacity: gOpacity * 0.5
      }))

      const W2_H2 = w * w + h * h
      if (W2_H2 > 0) {
        // Main diagonal 1: Top-Left to Bottom-Right
        objects.push(new fabric.Line([l, t, l + w, t + h], { ...style, opacity: gOpacity }))
        // Perpendicular from Top-Right to Main diagonal 1
        const xA = l + (w * w * w) / W2_H2
        const yA = t + (w * w * h) / W2_H2
        objects.push(new fabric.Line([l + w, t, xA, yA], { ...style, opacity: gOpacity }))
        // Perpendicular from Bottom-Left to Main diagonal 1
        const xB = l + (w * h * h) / W2_H2
        const yB = t + (h * h * h) / W2_H2
        objects.push(new fabric.Line([l, t + h, xB, yB], { ...style, opacity: gOpacity }))

        // Main diagonal 2: Top-Right to Bottom-Left
        objects.push(new fabric.Line([l + w, t, l, t + h], { ...style, opacity: gOpacity }))
        // Perpendicular from Top-Left to Main diagonal 2
        const xC = l + (w * h * h) / W2_H2
        const yC = t + (w * w * h) / W2_H2
        objects.push(new fabric.Line([l, t, xC, yC], { ...style, opacity: gOpacity }))
        // Perpendicular from Bottom-Right to Main diagonal 2
        const xD = l + (w * w * w) / W2_H2
        const yD = t + (h * h * h) / W2_H2
        objects.push(new fabric.Line([l + w, t + h, xD, yD], { ...style, opacity: gOpacity }))
      }

      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        isGuide: true, guideType: type, type: 'group',
        originX: 'center', originY: 'center'
      })
      fCanvas.value.add(group)
      if (isInteractive && type === 'phi') fCanvas.value.setActiveObject(group)
    }

    // 黄金螺旋
    if (type === 'spiral' || type === 'all') {
      const R = 0.618
      let cx = l, cy = t, cw = w, ch = h
      let pathStr = ''
      const objects: any[] = []

      for (let i = 0; i < 6; i++) {
        let dir = i % 4
        let sqW, sqH, sqX, sqY
        let startX, startY, endX, endY, rx, ry

        if (dir === 0) {
          sqW = cw * R; sqH = ch; sqX = cx; sqY = cy
          startX = sqX; startY = sqY + sqH; endX = sqX + sqW; endY = sqY
          rx = sqW; ry = sqH
          if (i === 0) pathStr += `M ${startX} ${startY} `
          pathStr += `A ${rx} ${ry} 0 0 1 ${endX} ${endY} `
          cx += sqW; cw -= sqW
        } else if (dir === 1) {
          sqW = cw; sqH = ch * R; sqX = cx; sqY = cy
          startX = sqX; startY = sqY; endX = sqX + sqW; endY = sqY + sqH
          rx = sqW; ry = sqH
          pathStr += `A ${rx} ${ry} 0 0 1 ${endX} ${endY} `
          cy += sqH; ch -= sqH
        } else if (dir === 2) {
          sqW = cw * R; sqH = ch; sqX = cx + cw - sqW; sqY = cy
          startX = sqX + sqW; startY = sqY; endX = sqX; endY = sqY + sqH
          rx = sqW; ry = sqH
          pathStr += `A ${rx} ${ry} 0 0 1 ${endX} ${endY} `
          cw -= sqW
        } else if (dir === 3) {
          sqW = cw; sqH = ch * R; sqX = cx; sqY = cy + ch - sqH
          startX = sqX + sqW; startY = sqY + sqH; endX = sqX; endY = sqY
          rx = sqW; ry = sqH
          pathStr += `A ${rx} ${ry} 0 0 1 ${endX} ${endY} `
          ch -= sqH
        }

        objects.push(new fabric.Rect({
          left: sqX, top: sqY, width: sqW, height: sqH,
          fill: 'transparent', stroke: gStroke, strokeWidth: Math.max(gStrokeWidth, 1),
          selectable: false, evented: false, opacity: gOpacity * 0.5,
          strokeUniform: true
        }))
      }

      const spiralPath = new fabric.Path(pathStr, {
        stroke: gStroke, strokeWidth: Math.max(gStrokeWidth, 2), fill: 'transparent',
        selectable: false, evented: false, opacity: gOpacity,
        strokeUniform: true
      })
      objects.push(spiralPath)

      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        erasable: true, isGuide: true, guideType: type,
        originX: 'center', originY: 'center'
      })

      fCanvas.value.add(group)
      if (isInteractive && type === 'spiral') fCanvas.value.setActiveObject(group)
    }
  }

  /** 删除所有参考线 */
  const deleteGuides = () => {
    if (!fCanvas.value) return
    const guides = fCanvas.value.getObjects().filter((o: any) => o.isGuide)
    guides.forEach((o: any) => {
      // 如果是组合对象，先取消选中
      if (o.type === 'group') {
        fCanvas.value.discardActiveObject()
      }
      fCanvas.value.remove(o)
    })
    fCanvas.value.renderAll()
  }

  /** 切换参考线显示/隐藏 */
  const toggleGuide = (type: string) => {
    const idx = activeGuides.value.indexOf(type)
    if (idx > -1) {
      activeGuides.value.splice(idx, 1)
    } else {
      activeGuides.value.push(type)
    }
    saveCurrentGuideStyles()
    deleteGuides()
    activeGuides.value.forEach(t => drawReference(t))
    saveState()
  }

  return { activeGuides, drawReference, deleteGuides, toggleGuide }
}
