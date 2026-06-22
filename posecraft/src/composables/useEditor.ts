/**
 * Fabric.js 编辑器组合式函数
 */
import { ref, shallowRef, onUnmounted } from 'vue'
import { fabric } from 'fabric'

export function useEditor() {
  const canvas = shallowRef<fabric.Canvas | null>(null)
  const activeTool = ref<string>('select')
  const history = ref<string[]>([])
  const historyIndex = ref(-1)
  const canUndo = ref(false)
  const canRedo = ref(false)

  /**
   * 初始化画布
   */
  function initCanvas(canvasEl: HTMLCanvasElement, width: number, height: number) {
    canvas.value = new fabric.Canvas(canvasEl, {
      width,
      height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true
    })

    // 监听变化保存历史
    canvas.value.on('object:modified', saveHistory)
    canvas.value.on('object:added', saveHistory)

    saveHistory()
    return canvas.value
  }

  /**
   * 保存历史状态
   */
  function saveHistory() {
    if (!canvas.value) return

    const json = JSON.stringify(canvas.value.toJSON())
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(json)
    historyIndex.value = history.value.length - 1

    canUndo.value = historyIndex.value > 0
    canRedo.value = false
  }

  /**
   * 撤销
   */
  function undo() {
    if (!canvas.value || historyIndex.value <= 0) return

    historyIndex.value--
    const json = history.value[historyIndex.value]
    canvas.value.loadFromJSON(json, () => {
      canvas.value?.renderAll()
      canUndo.value = historyIndex.value > 0
      canRedo.value = historyIndex.value < history.value.length - 1
    })
  }

  /**
   * 重做
   */
  function redo() {
    if (!canvas.value || historyIndex.value >= history.value.length - 1) return

    historyIndex.value++
    const json = history.value[historyIndex.value]
    canvas.value.loadFromJSON(json, () => {
      canvas.value?.renderAll()
      canUndo.value = historyIndex.value > 0
      canRedo.value = historyIndex.value < history.value.length - 1
    })
  }

  /**
   * 加载图片到画布
   */
  function loadImage(url: string): Promise<fabric.Image> {
    return new Promise((resolve, reject) => {
      fabric.Image.fromURL(url, (img) => {
        if (!canvas.value) {
          reject(new Error('画布未初始化'))
          return
        }

        // 缩放图片适应画布
        const canvasWidth = canvas.value.getWidth()
        const canvasHeight = canvas.value.getHeight()
        const scale = Math.min(
          canvasWidth / (img.width || 1),
          canvasHeight / (img.height || 1)
        )

        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (canvasWidth - (img.width || 0) * scale) / 2,
          top: (canvasHeight - (img.height || 0) * scale) / 2,
          selectable: true
        })

        canvas.value.add(img)
        canvas.value.setActiveObject(img)
        canvas.value.renderAll()
        resolve(img)
      }, { crossOrigin: 'anonymous' })
    })
  }

  /**
   * 添加文字
   */
  function addText(text = '双击编辑', options?: fabric.ITextOptions) {
    if (!canvas.value) return

    const textObj = new fabric.IText(text, {
      left: canvas.value.getWidth() / 2,
      top: canvas.value.getHeight() / 2,
      fontSize: 24,
      fill: '#000000',
      fontFamily: 'Arial',
      originX: 'center',
      originY: 'center',
      ...options
    })

    canvas.value.add(textObj)
    canvas.value.setActiveObject(textObj)
    canvas.value.renderAll()
  }

  /**
   * 添加形状
   */
  function addShape(type: 'rect' | 'circle' | 'triangle', options?: fabric.IObjectOptions) {
    if (!canvas.value) return

    const defaultOptions = {
      left: canvas.value.getWidth() / 2,
      top: canvas.value.getHeight() / 2,
      fill: '#6366f1',
      width: 100,
      height: 100,
      radius: 50,
      originX: 'center' as const,
      originY: 'center' as const,
      ...options
    }

    let shape: fabric.Object

    switch (type) {
      case 'rect':
        shape = new fabric.Rect(defaultOptions)
        break
      case 'circle':
        shape = new fabric.Circle(defaultOptions)
        break
      case 'triangle':
        shape = new fabric.Triangle(defaultOptions)
        break
      default:
        return
    }

    canvas.value.add(shape)
    canvas.value.setActiveObject(shape)
    canvas.value.renderAll()
  }

  /**
   * 设置画笔
   */
  function setDrawingMode(enabled: boolean, color = '#000000', width = 5) {
    if (!canvas.value) return

    canvas.value.isDrawingMode = enabled
    if (enabled) {
      canvas.value.freeDrawingBrush.color = color
      canvas.value.freeDrawingBrush.width = width
    }
    activeTool.value = enabled ? 'draw' : 'select'
  }

  /**
   * 删除选中对象
   */
  function deleteSelected() {
    if (!canvas.value) return

    const activeObjects = canvas.value.getActiveObjects()
    activeObjects.forEach(obj => canvas.value?.remove(obj))
    canvas.value.discardActiveObject()
    canvas.value.renderAll()
  }

  /**
   * 设置滤镜
   */
  function applyFilter(filterType: string, value?: number) {
    if (!canvas.value) return

    const activeObject = canvas.value.getActiveObject() as fabric.Image
    if (!activeObject || activeObject.type !== 'image') return

    const filters: Record<string, any> = {
      brightness: new fabric.Image.filters.Brightness({ brightness: (value || 0) / 100 }),
      contrast: new fabric.Image.filters.Contrast({ contrast: (value || 0) / 100 }),
      blur: new fabric.Image.filters.Blur({ blur: (value || 0) / 10 }),
      grayscale: new fabric.Image.filters.Grayscale(),
      invert: new fabric.Image.filters.Invert(),
      sepia: new fabric.Image.filters.Sepia()
    }

    const filter = filters[filterType]
    if (filter) {
      activeObject.filters = [filter]
      activeObject.applyFilters()
      canvas.value.renderAll()
    }
  }

  /**
   * 导出为图片
   */
  function exportImage(format: 'png' | 'jpeg' = 'png', quality = 1): string | null {
    if (!canvas.value) return null

    return canvas.value.toDataURL({
      format,
      quality,
      multiplier: 2
    })
  }

  /**
   * 导出为 JSON
   */
  function exportJSON(): string | null {
    if (!canvas.value) return null
    return JSON.stringify(canvas.value.toJSON())
  }

  /**
   * 从 JSON 加载
   */
  function loadFromJSON(json: string): Promise<void> {
    return new Promise((resolve) => {
      if (!canvas.value) {
        resolve()
        return
      }

      canvas.value.loadFromJSON(json, () => {
        canvas.value?.renderAll()
        resolve()
      })
    })
  }

  /**
   * 清空画布
   */
  function clearCanvas() {
    if (!canvas.value) return
    canvas.value.clear()
    canvas.value.backgroundColor = '#ffffff'
    canvas.value.renderAll()
  }

  /**
   * 销毁画布
   */
  function dispose() {
    if (canvas.value) {
      canvas.value.dispose()
      canvas.value = null
    }
  }

  onUnmounted(() => {
    dispose()
  })

  return {
    canvas,
    activeTool,
    canUndo,
    canRedo,
    initCanvas,
    loadImage,
    addText,
    addShape,
    setDrawingMode,
    deleteSelected,
    applyFilter,
    exportImage,
    exportJSON,
    loadFromJSON,
    clearCanvas,
    undo,
    redo,
    dispose
  }
}
