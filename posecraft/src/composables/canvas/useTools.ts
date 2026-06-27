import { ref } from 'vue'

import * as fabricLib from 'fabric'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib
import type { Ref } from 'vue'

/**
 * 工具管理
 */
export function useTools(fCanvas: Ref<any>, activeTool: Ref<string>, canvasTool: Ref<string>) {
  // 工具状态引用（由外部传入）
  let eraserCursor: any = null
  let eraserSize: Ref<number> | null = null
  let brushSize: Ref<number> | null = null
  let brushOpacity: Ref<number> | null = null
  let brushFeather: Ref<number> | null = null
  let brushStyle: Ref<string> | null = null
  let brushBlend: Ref<string> | null = null
  let currentColor: Ref<string> | null = null

  /** 设置外部依赖 */
  const setDeps = (deps: {
    eraserCursor?: any; eraserSize?: Ref<number> | null; brushSize?: Ref<number> | null;
    brushOpacity?: Ref<number> | null; brushFeather?: Ref<number> | null;
    brushStyle?: Ref<string> | null; brushBlend?: Ref<string> | null;
    currentColor?: Ref<string> | null
  }) => {
    eraserCursor = deps.eraserCursor ?? null
    eraserSize = deps.eraserSize ?? null
    brushSize = deps.brushSize ?? null
    brushOpacity = deps.brushOpacity ?? null
    brushFeather = deps.brushFeather ?? null
    brushStyle = deps.brushStyle ?? null
    brushBlend = deps.brushBlend ?? null
    currentColor = deps.currentColor ?? null
  }

  /** Tab 面板切换 */
  const selectTab = (tab: string) => {
    activeTool.value = tab
    canvasTool.value = tab
    if (fCanvas.value) {
      fCanvas.value.isDrawingMode = false
      fCanvas.value.discardActiveObject()
      fCanvas.value.selection = false
      fCanvas.value.forEachObject((obj: any) => {
        if (!obj.isInkLayer && !obj.isEraserCursor) {
          obj.selectable = false
          obj.evented = false
        }
      })
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'default'
      fCanvas.value.renderAll()
    }
  }

  /** 抓手工具 */
  const selectHandTool = () => {
    setTool('hand')
  }

  /** 绘图子工具（不切换 activeTool） */
  const setDrawTool = (tool: string) => {
    canvasTool.value = tool
    if (tool !== 'eraser' && eraserCursor) {
      eraserCursor.set({ visible: false })
    }

    if (!fCanvas.value) return

    if (tool === 'select') {
      fCanvas.value.selection = true
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'move'
      fCanvas.value.isDrawingMode = false
      fCanvas.value.forEachObject((obj: any) => {
        if (obj.isInkLayer || obj.isEraserCursor) return
        obj.selectable = true
        obj.evented = true
      })
      fCanvas.value.renderAll()
      return
    }

    const isNodeTool = tool === 'addNode' || tool === 'line' || tool === 'moveNode'
    fCanvas.value.forEachObject((obj: any) => {
      if (obj.isInkLayer || obj.isEraserCursor) return
      if (isNodeTool && obj.isSkeleton) {
        obj.selectable = tool === 'moveNode' // 只有 moveNode 工具允许选中
        obj.evented = true
      } else {
        obj.selectable = false
        obj.evented = false
      }
    })

    fCanvas.value.discardActiveObject()
    fCanvas.value.selection = false

    // 设置光标
    if (tool === 'line' || tool === 'addNode' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'star' || tool === 'polygon' || tool === 'arrow') {
      fCanvas.value.defaultCursor = 'crosshair'
      fCanvas.value.hoverCursor = 'crosshair'
    } else if (tool === 'moveNode') {
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'move'
    } else if (tool === 'hand') {
      fCanvas.value.defaultCursor = 'grab'
      fCanvas.value.hoverCursor = 'grab'
    } else {
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'default'
    }

    if (tool === 'draw' && brushSize && currentColor) {
      if (!fCanvas.value.freeDrawingBrush) {
        fCanvas.value.freeDrawingBrush = new fabric.PencilBrush(fCanvas.value)
      }
      fCanvas.value.freeDrawingBrush.width = brushSize.value
      fCanvas.value.freeDrawingBrush.color = currentColor.value
      // 透明度
      if (brushOpacity) fCanvas.value.freeDrawingBrush.opacity = brushOpacity.value / 100
      // 虚线样式
      if (brushStyle) {
        fCanvas.value.freeDrawingBrush.strokeDashArray = brushStyle.value === 'dashed' ? [10, 5] : brushStyle.value === 'dotted' ? [3, 5] : undefined
      }
      // 混合模式
      if (brushBlend) fCanvas.value.freeDrawingBrush.globalCompositeOperation = brushBlend.value
      // 羽化
      if (brushFeather && brushFeather.value > 0) {
        fCanvas.value.freeDrawingBrush.shadow = new fabric.Shadow({
          color: currentColor.value,
          blur: brushFeather.value,
          offsetX: 0,
          offsetY: 0
        })
      } else {
        fCanvas.value.freeDrawingBrush.shadow = null
      }
    }
    // 画笔模式必须在画笔配置后设置，否则 Fabric 第一次绘制会使用默认画笔 (1px)
    fCanvas.value.isDrawingMode = (tool === 'draw')

    fCanvas.value.renderAll()
  }

  /** 主工具切换 */
  const setTool = (tool: string) => {
    canvasTool.value = tool
    if (tool !== 'crop') {
      activeTool.value = tool
    }

    if (tool !== 'eraser' && eraserCursor) {
      eraserCursor.set({ visible: false })
    }

    if (!fCanvas.value) return

    const isNodeTool = tool === 'addNode' || tool === 'line'
    const setSelectable = (selectable: boolean) => {
      fCanvas.value.forEachObject((obj: any) => {
        if (obj.isInkLayer || obj.isEraserCursor) return
        if (isNodeTool && obj.isSkeleton) {
          obj.selectable = false
          obj.evented = true
        } else {
          obj.selectable = selectable
          obj.evented = selectable
        }
      })
    }

    if (tool === 'select') {
      fCanvas.value.selection = true
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'move'
      setSelectable(true)
    } else {
      fCanvas.value.discardActiveObject()
      fCanvas.value.selection = false
      setSelectable(false)
    }
    fCanvas.value.renderAll()

    if (tool === 'draw' && brushSize && currentColor) {
      if (!fCanvas.value.freeDrawingBrush) {
        fCanvas.value.freeDrawingBrush = new fabric.PencilBrush(fCanvas.value)
      }
      fCanvas.value.freeDrawingBrush.width = brushSize.value
      fCanvas.value.freeDrawingBrush.color = currentColor.value
      if (brushFeather && brushFeather.value > 0) {
        fCanvas.value.freeDrawingBrush.shadow = new fabric.Shadow({
          color: currentColor.value,
          blur: brushFeather.value,
          offsetX: 0,
          offsetY: 0
        })
      } else {
        fCanvas.value.freeDrawingBrush.shadow = null
      }
    }
    // 画笔模式必须在画笔配置后设置
    fCanvas.value.isDrawingMode = (tool === 'draw')

    // 光标设置
    if (tool === 'text') {
      fCanvas.value.defaultCursor = 'text'
      fCanvas.value.hoverCursor = 'text'
    } else if (tool === 'addNode' || tool === 'line') {
      fCanvas.value.defaultCursor = 'crosshair'
      fCanvas.value.hoverCursor = 'crosshair'
    } else if (tool === 'hand') {
      fCanvas.value.defaultCursor = 'grab'
      fCanvas.value.hoverCursor = 'grab'
    } else if (tool === 'eraser') {
      fCanvas.value.defaultCursor = 'none'
      fCanvas.value.hoverCursor = 'none'
      if (eraserCursor && eraserSize) {
        eraserCursor.set({ visible: true, radius: eraserSize.value / 2 })
        fCanvas.value.bringToFront(eraserCursor)
        fCanvas.value.renderAll()
      }
    } else if (tool === 'draw' || tool === 'crop') {
      fCanvas.value.defaultCursor = 'crosshair'
      fCanvas.value.hoverCursor = 'crosshair'
    }
  }

  return { selectTab, selectHandTool, setDrawTool, setTool, setDeps }
}
