import { ref } from 'vue'
import type { Ref } from 'vue'
import * as fabricLib from 'fabric'
import { v4 as uuidv4 } from 'uuid'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib

export function useMouseEvents(
  fCanvas: Ref<any>,
  canvasTool: Ref<string>,
  activeTool: Ref<string>,
  currentColor: Ref<string>,
  strokeWidth: Ref<number>,
  noFill: Ref<boolean>,
  fillColor: Ref<string>,
  strokeOpacity: Ref<number>,
  fillOpacity: Ref<number>,
  lineStyle: Ref<string>,
  eraserSize: Ref<number>,
  textFontSize: Ref<number>,
  cornerRadius: Ref<number>,
  canvasDeps: any,
  saveState: () => void,
  addSkeletonNode: (x: number, y: number) => void,
  addMidpointNode: (node: any) => void,
  connectNodes: (nodeA: any, nodeB: any) => void,
  createStar: (x: number, y: number, points: number, innerRadius: number, outerRadius: number, options: any) => any,
  createPolygon: (x: number, y: number, sides: number, radius: number, options: any) => any,
  addArrowHead: (line: any) => void,
  analyzeArea: (rect: any) => void,
  applyCanvasTransform: () => void,
  getSpacePressed: () => boolean
) {
  const isErasing = ref(false)
  const isDrawingLine = ref(false)
  const isDrawingCrop = ref(false)
  const isDrawingRect = ref(false)
  let isPanning = false
  let lastPanPoint: any = null
  let currentLine: any = null
  let currentRect: any = null
  let startNode: any = null
  let lastMouseEvent: any = null
  let cropRect: any = null
  let startPoint: any = null

  const refreshInkLayer = () => {
    const { inkLayer, inkCanvas } = canvasDeps
    if (!inkLayer || !fCanvas.value) return
    inkLayer.setElement(inkCanvas)
    inkLayer.dirty = true
    fCanvas.value.requestRenderAll()
  }

  const distToSegment = (p: any, v: any, w: any) => {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y)
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)))
  }

  const handleMouseDown = (opt: any) => {
    if (!fCanvas.value) return
    const pointer = fCanvas.value.getPointer(opt.e)
    const tool = canvasTool.value

    if (tool === 'hand' || getSpacePressed()) {
      isPanning = true
      lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY }
      fCanvas.value.defaultCursor = 'grabbing'
      return
    }

    if (['draw', 'eraser'].includes(tool)) {
      isErasing.value = true; startPoint = pointer; saveState()
      if (tool === 'eraser' && canvasDeps.eraserCursor) {
        canvasDeps.eraserCursor.set({ left: pointer.x, top: pointer.y })
        fCanvas.value.bringToFront(canvasDeps.eraserCursor)
      }
    } else if (tool === 'line') {
      const target = fCanvas.value.findTarget(opt.e, false)
      if (target && target.isSkeleton) {
        // 点击节点：开始连接
        isDrawingLine.value = true; startPoint = { x: target.left, y: target.top }
        startNode = target
        currentLine = new fabric.Line([target.left, target.top, target.left, target.top], {
          stroke: currentColor.value, strokeWidth: strokeWidth.value,
          selectable: false, evented: false, strokeLineCap: 'round', erasable: true,
          strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
        })
        fCanvas.value.add(currentLine)
      } else if (!target) {
        // 点击空白处：开始画线
        isDrawingLine.value = true; startPoint = pointer
        startNode = null
        currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: currentColor.value, strokeWidth: strokeWidth.value,
          selectable: false, evented: false, strokeLineCap: 'round', erasable: true,
          strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
        })
        fCanvas.value.add(currentLine)
      }
    } else if (tool === 'moveNode') {
      // 操作节点工具：点击节点可拖拽移动
      const target = fCanvas.value.findTarget(opt.e, false)
      if (target && target.isSkeleton) {
        fCanvas.value.setActiveObject(target)
        target.set({ selectable: true, hasControls: false, hasBorders: false })
        fCanvas.value.renderAll()
      }
    } else if (['rect', 'circle', 'triangle', 'star', 'polygon', 'arrow'].includes(tool)) {
      const target = fCanvas.value.findTarget(opt.e, false)
      if (!target) {
        isDrawingRect.value = true; startPoint = pointer
        const baseStyle = {
          left: pointer.x, top: pointer.y,
          stroke: currentColor.value,
          strokeWidth: strokeWidth.value,
          strokeOpacity: strokeOpacity.value / 100,
          fill: noFill.value ? 'transparent' : fillColor.value,
          fillOpacity: fillOpacity.value / 100,
          selectable: false, evented: false, erasable: true,
          strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined,
          rx: cornerRadius.value,
          ry: cornerRadius.value
        }
        if (tool === 'rect') {
          currentRect = new fabric.Rect({ ...baseStyle, width: 0, height: 0 })
        } else if (tool === 'circle') {
          currentRect = new fabric.Ellipse({ ...baseStyle, rx: 0, ry: 0 })
        } else if (tool === 'triangle') {
          currentRect = new fabric.Triangle({ ...baseStyle, width: 0, height: 0 })
        } else if (tool === 'star') {
          currentRect = createStar(pointer.x, pointer.y, 5, 0, 0, baseStyle)
          currentRect._isStar = true
          currentRect._starPoints = 5
        } else if (tool === 'polygon') {
          currentRect = createPolygon(pointer.x, pointer.y, 6, 0, baseStyle)
          currentRect._sides = 6
        } else if (tool === 'arrow') {
          isDrawingRect.value = false
          isDrawingLine.value = true
          currentLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: currentColor.value, strokeWidth: strokeWidth.value,
            selectable: false, evented: false, strokeLineCap: 'round', erasable: true,
            strokeDashArray: lineStyle.value === 'dashed' ? [10, 5] : lineStyle.value === 'dotted' ? [3, 5] : undefined
          })
          fCanvas.value.add(currentLine)
        }
        if (currentRect) fCanvas.value.add(currentRect)
      }
    } else if (tool === 'addNode') {
      const target = fCanvas.value.findTarget(opt.e, false)
      if (!target) {
        // 点击空白处：添加新节点
        addSkeletonNode(pointer.x, pointer.y)
      } else if (target.isSkeleton && target.connectedLines?.length > 0) {
        // 点击现有节点：在中点添加新节点
        addMidpointNode(target)
      }
    } else if (tool === 'crop') {
      isDrawingCrop.value = true; startPoint = pointer
      cropRect = new fabric.Rect({ left: pointer.x, top: pointer.y, width: 0, height: 0, fill: 'rgba(99,102,241,0.1)', stroke: '#6366f1', strokeWidth: 1, strokeDashArray: [5, 5], selectable: false, evented: false, isCropRect: true })
      fCanvas.value.add(cropRect)
    } else if (tool === 'text') {
      const target = fCanvas.value.findTarget(opt.e, false)
      if (target && target.type === 'i-text') {
        fCanvas.value.setActiveObject(target)
        target.enterEditing()
        target.selectAll()
        fCanvas.value.renderAll()
      } else if (!target) {
        const text = new fabric.IText('双击编辑', {
          left: pointer.x, top: pointer.y,
          fontSize: textFontSize.value,
          fill: currentColor.value,
          originX: 'center', originY: 'center',
          erasable: true
        })
        fCanvas.value.add(text)
        fCanvas.value.setActiveObject(text)
        fCanvas.value.renderAll()
        saveState()
      }
    }
  }

  const handleMouseMove = (opt: any) => {
    if (!fCanvas.value) return
    const pointer = fCanvas.value.getPointer(opt.e)
    const tool = canvasTool.value
    lastMouseEvent = opt.e

    if (isPanning && lastPanPoint) {
      const dx = opt.e.clientX - lastPanPoint.x
      const dy = opt.e.clientY - lastPanPoint.y
      canvasDeps.canvasTranslateX += dx
      canvasDeps.canvasTranslateY += dy
      applyCanvasTransform()
      lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY }
      return
    }

    if (canvasDeps.eraserCursor && tool === 'eraser') {
      canvasDeps.eraserCursor.set({ left: pointer.x, top: pointer.y, radius: eraserSize.value / 2 })
      fCanvas.value.bringToFront(canvasDeps.eraserCursor)
      fCanvas.value.renderAll()
    }

    if (isErasing.value && tool === 'eraser') {
      const { inkCtx } = canvasDeps
      if (inkCtx) {
        inkCtx.save()
        inkCtx.globalCompositeOperation = 'destination-out'
        inkCtx.beginPath()
        inkCtx.arc(pointer.x, pointer.y, eraserSize.value / 2, 0, Math.PI * 2)
        inkCtx.fill()
        inkCtx.restore()
        refreshInkLayer()
      }
      const radius = eraserSize.value / 2
      const objects = fCanvas.value.getObjects().filter((o: any) =>
        o.erasable && !o.isInkLayer && !o.isEraserCursor
      )
      objects.forEach((obj: any) => {
        if (obj.isUserStroke && obj.getElement && obj.getElement().tagName === 'CANVAS') {
          const el = obj.getElement()
          const ctx = el.getContext('2d', { willReadFrequently: true })
          if (!ctx) return
          const localPoint = obj.toLocalPoint(pointer, 'left', 'top')
          const dpr = window.devicePixelRatio || 1
          const px = localPoint.x * dpr
          const py = localPoint.y * dpr
          const scaleApprox = Math.sqrt(obj.scaleX * obj.scaleX + obj.scaleY * obj.scaleY) / Math.SQRT2
          const eraserRadius = (radius * dpr) / (scaleApprox || 1)

          ctx.save()
          ctx.globalCompositeOperation = 'destination-out'
          ctx.beginPath()
          ctx.arc(px, py, eraserRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          obj.dirty = true
        } else if (obj.type === 'line') {
          const dist = distToSegment(pointer, { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 })
          if (dist < radius) fCanvas.value.remove(obj)
        } else if (['circle', 'rect', 'triangle', 'i-text'].includes(obj.type)) {
          const dist = Math.hypot(obj.left - pointer.x, obj.top - pointer.y)
          if (dist < radius + 10) fCanvas.value.remove(obj)
        }
      })
      fCanvas.value.renderAll()
    }

    if (isDrawingLine.value && currentLine) {
      currentLine.set({ x2: pointer.x, y2: pointer.y })
      fCanvas.value.renderAll()
    }

    if (isDrawingCrop.value && cropRect && startPoint) {
      const l = Math.min(startPoint.x, pointer.x)
      const t = Math.min(startPoint.y, pointer.y)
      cropRect.set({ left: l, top: t, width: Math.abs(startPoint.x - pointer.x), height: Math.abs(startPoint.y - pointer.y) })
      fCanvas.value.renderAll()
    }

    if (isDrawingRect.value && currentRect && startPoint) {
      let w = Math.abs(startPoint.x - pointer.x)
      let h = Math.abs(startPoint.y - pointer.y)
      if (opt.e.ctrlKey || opt.e.metaKey) {
        const size = Math.max(w, h)
        w = size; h = size
      }
      const l = Math.min(startPoint.x, pointer.x)
      const t = Math.min(startPoint.y, pointer.y)

      if (currentRect.type === 'ellipse') {
        currentRect.set({ left: l, top: t, rx: w / 2, ry: h / 2 })
      } else if (currentRect.type === 'triangle') {
        currentRect.set({ left: l, top: t, width: w, height: h })
      } else if (currentRect.type === 'polygon' && !currentRect._isStar) {
        const sides = currentRect._sides || 6
        const rx = w / 2, ry = h / 2
        const pts: any[] = []
        for (let i = 0; i < sides; i++) {
          const angle = (Math.PI * 2 / sides) * i - Math.PI / 2
          pts.push({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) })
        }
        let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
        pts.forEach(p => {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        })
        currentRect.set({
          points: pts, width: maxX - minX, height: maxY - minY,
          pathOffset: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 },
          left: l, top: t, originX: 'left', originY: 'top', dirty: true
        })
      } else if (currentRect._isStar) {
        const points = currentRect._starPoints || 5
        const rx = w / 2, ry = h / 2
        const innerRx = rx * 0.4, innerRy = ry * 0.4
        const pts: any[] = []
        for (let i = 0; i < points * 2; i++) {
          const rX = i % 2 === 0 ? rx : innerRx
          const rY = i % 2 === 0 ? ry : innerRy
          const angle = (Math.PI / points) * i - Math.PI / 2
          pts.push({ x: rX * Math.cos(angle), y: rY * Math.sin(angle) })
        }
        let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
        pts.forEach(p => {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        })
        currentRect.set({
          points: pts, width: maxX - minX, height: maxY - minY,
          pathOffset: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 },
          left: l, top: t, originX: 'left', originY: 'top', dirty: true
        })
      } else {
        currentRect.set({ left: l, top: t, width: w, height: h })
      }
      fCanvas.value.renderAll()
    }
  }

  const handleMouseUp = () => {
    if (!fCanvas.value) return
    if (isPanning) {
      isPanning = false
      lastPanPoint = null
      fCanvas.value.defaultCursor = canvasTool.value === 'hand' ? 'grab' : 'default'
      return
    }

    if (isErasing.value) { isErasing.value = false; saveState() }
    
    if (isDrawingLine.value) {
      isDrawingLine.value = false
      if (currentLine) {
        if (startNode && canvasTool.value === 'line' && lastMouseEvent) {
          const endTarget = fCanvas.value.findTarget(lastMouseEvent, false)
          fCanvas.value.remove(currentLine)
          currentLine = null
          if (endTarget && endTarget.isSkeleton && endTarget !== startNode) {
            connectNodes(startNode, endTarget)
          }
          startNode = null
        } else if (canvasTool.value === 'arrow') {
          addArrowHead(currentLine)
          currentLine.set({ id: uuidv4() }); currentLine.setCoords(); saveState()
        } else {
          currentLine.set({ id: uuidv4() }); currentLine.setCoords(); saveState()
          startNode = null
        }
      }
    }

    if (isDrawingCrop.value) {
      isDrawingCrop.value = false
      if (cropRect && cropRect.width > 5) analyzeArea(cropRect)
      if (cropRect) fCanvas.value.remove(cropRect)
      cropRect = null
    }

    if (isDrawingRect.value) {
      isDrawingRect.value = false
      if (currentRect) {
        const minSize = 5
        let hasSize = false
        if (currentRect.type === 'ellipse') {
          hasSize = currentRect.rx > minSize && currentRect.ry > minSize
        } else if (currentRect.type === 'polygon') {
          hasSize = currentRect.points && currentRect.points.length > 2
        } else {
          hasSize = currentRect.width > minSize && currentRect.height > minSize
        }
        if (hasSize) {
          currentRect.set({ id: uuidv4(), selectable: true, evented: true })
          currentRect.setCoords()
          fCanvas.value.setActiveObject(currentRect)
          saveState()
        } else {
          fCanvas.value.remove(currentRect)
        }
        currentRect = null
      }
    }

    if (canvasDeps.eraserCursor && canvasTool.value !== 'eraser') {
      canvasDeps.eraserCursor.set('visible', false)
    }
    fCanvas.value.renderAll()
  }

  const handlePathCreated = (opt: any) => {
    if (!fCanvas.value) return
    const path = opt.path; if (!path) return; path.setCoords()
    const center = path.getCenterPoint(), dpr = window.devicePixelRatio || 1
    const el = path.toCanvasElement({ multiplier: dpr })
    const img = new fabric.Image(el, { left: center.x, top: center.y, originX: 'center', originY: 'center', scaleX: (path.scaleX || 1) / dpr, scaleY: (path.scaleY || 1) / dpr, angle: path.angle || 0, erasable: true, isUserStroke: true })
    if (activeTool.value !== 'select') {
      img.selectable = false
      img.evented = false
    }
    fCanvas.value.add(img); fCanvas.value.remove(path); saveState(); fCanvas.value.renderAll()
  }

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handlePathCreated,
    isErasing,
    isDrawingLine,
    isDrawingRect,
    isDrawingCrop
  }
}
