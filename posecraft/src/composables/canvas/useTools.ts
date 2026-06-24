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
  let brushFeather: Ref<number> | null = null
  let currentColor: Ref<string> | null = null

  /** 设置外部依赖 */
  const setDeps = (deps: { eraserCursor?: any; eraserSize?: Ref<number> | null; brushSize?: Ref<number> | null; brushFeather?: Ref<number> | null; currentColor?: Ref<string> | null }) => {
    eraserCursor = deps.eraserCursor ?? null
    eraserSize = deps.eraserSize ?? null
    brushSize = deps.brushSize ?? null
    brushFeather = deps.brushFeather ?? null
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

    const isNodeTool = tool === 'addNode' || tool === 'line'
    fCanvas.value.forEachObject((obj: any) => {
      if (obj.isInkLayer || obj.isEraserCursor) return
      if (isNodeTool && obj.isSkeleton) {
        obj.selectable = false
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
    } else if (tool === 'hand') {
      fCanvas.value.defaultCursor = 'grab'
      fCanvas.value.hoverCursor = 'grab'
    } else {
      fCanvas.value.defaultCursor = 'default'
      fCanvas.value.hoverCursor = 'default'
    }

    // 画笔模式
    fCanvas.value.isDrawingMode = (tool === 'draw')
    if (tool === 'draw' && brushSize && currentColor) {
      fCanvas.value.freeDrawingBrush = new fabric.PencilBrush(fCanvas.value)
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

    // 画笔模式
    fCanvas.value.isDrawingMode = (tool === 'draw')
    if (tool === 'draw' && brushSize && currentColor) {
      fCanvas.value.freeDrawingBrush = new fabric.PencilBrush(fCanvas.value)
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
