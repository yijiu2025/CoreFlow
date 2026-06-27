import { ref } from 'vue'

import * as fabricLib from 'fabric'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
import type { Ref } from 'vue'

/**
 * 构图参考线管理
 */
export function useReferenceLines(fCanvas: Ref<any>, currentColor: Ref<string>, strokeWidth: Ref<number>, saveState: () => void) {
  const activeGuides = ref<string[]>([])

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
    const style: any = { stroke: currentColor.value, strokeWidth: strokeWidth.value, selectable: false, evented: false, opacity: 0.5, isGuide: true }

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
        fCanvas.value.add(new fabric.Line([l+w*f, t, l+w*f, t+h], { ...style, opacity: 0.7 }))
        fCanvas.value.add(new fabric.Line([l, t+h*f, l+w, t+h*f], { ...style, opacity: 0.7 }))
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
      fCanvas.value.add(Object.assign(new fabric.Rect({
        left: l, top: t, width: w, height: h,
        fill: 'transparent', stroke: currentColor.value, strokeWidth: 1,
        selectable: false, evented: false, opacity: 0.3
      }), { isGuide: true }))
      fCanvas.value.add(new fabric.Line([l, t, l+w*phi, t+h], { ...style, opacity: 0.4 }))
      fCanvas.value.add(new fabric.Line([l+w, t, l+w*(1-phi), t+h], { ...style, opacity: 0.4 }))
      fCanvas.value.add(new fabric.Line([l, t+h*phi, l+w, t], { ...style, opacity: 0.4 }))
      fCanvas.value.add(new fabric.Line([l, t+h, l+w, t+h*(1-phi)], { ...style, opacity: 0.4 }))
    }

    // 黄金螺旋
    if (type === 'spiral' || type === 'all') {
      const spiralColor = currentColor.value
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
          fill: 'transparent', stroke: spiralColor, strokeWidth: 1,
          selectable: false, evented: false, opacity: 0.3,
          strokeUniform: true
        }))
      }

      const spiralPath = new fabric.Path(pathStr, {
        stroke: spiralColor, strokeWidth: 2, fill: 'transparent',
        selectable: false, evented: false, opacity: 0.8,
        strokeUniform: true
      })
      objects.push(spiralPath)

      const isInteractive = (type === 'spiral')
      const group = new fabric.Group(objects, {
        selectable: isInteractive, evented: isInteractive,
        hasControls: isInteractive, hasBorders: isInteractive,
        erasable: true, isGuide: true,
        originX: 'center', originY: 'center'
      })

      fCanvas.value.add(group)
      if (isInteractive) fCanvas.value.setActiveObject(group)
    }
  }

  /** 删除所有参考线 */
  const deleteGuides = () => {
    if (!fCanvas.value) return
    const guides = fCanvas.value.getObjects().filter((o: any) => o.isGuide)
    guides.forEach((o: any) => fCanvas.value.remove(o))
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
    deleteGuides()
    activeGuides.value.forEach(t => drawReference(t))
    saveState()
  }

  return { activeGuides, drawReference, deleteGuides, toggleGuide }
}
