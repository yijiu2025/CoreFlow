/**
 * 编辑器状态管理
 * 集中管理颜色、画笔、形状等共享状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useEditorStore = defineStore('editor', () => {
  // ═══ 颜色状态（独立设置） ═══
  const currentColor = ref('#6366f1')  // 描边/线条颜色
  const fillColor = ref('#6366f1')     // 填充颜色
  const noFill = ref(true)

  // 预设颜色
  const presetColors = ref([
    '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308',
    '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
  ])

  // 独立设置颜色
  function setCurrentColor(color: string) {
    currentColor.value = color
  }

  function setFillColor(color: string) {
    fillColor.value = color
  }

  // ═══ 画笔状态 ═══
  const brushSize = ref(8)
  const brushOpacity = ref(100)
  const brushFeather = ref(0)
  const brushStyle = ref('solid') // solid | dashed | dotted
  const brushBlend = ref('source-over')

  // ═══ 形状状态 ═══
  const strokeWidth = ref(3)
  const lineStyle = ref('solid') // solid | dashed | dotted
  const shapeOpacity = ref(100)

  // ═══ 橡皮擦状态 ═══
  const eraserSize = ref(20)

  // ═══ 文字状态 ═══
  const textFontSize = ref(24)

  // ═══ 背景状态 ═══
  const bgOpacity = ref(50)

  // ═══ 参考线状态 ═══
  const activeGuides = ref<string[]>([])
  const guideColor = ref('#6366f1')

  // ═══ 工具状态 ═══
  const activeTool = ref('select')
  const canvasTool = ref('select')

  // ═══ 裁剪状态 ═══
  const cropAspectRatio = ref<number | null>(null)

  return {
    // 颜色
    currentColor, fillColor, noFill, presetColors,
    setCurrentColor, setFillColor,
    // 画笔
    brushSize, brushOpacity, brushFeather, brushStyle, brushBlend,
    // 形状
    strokeWidth, lineStyle, shapeOpacity,
    // 橡皮擦
    eraserSize,
    // 文字
    textFontSize,
    // 背景
    bgOpacity,
    // 参考线
    activeGuides, guideColor,
    // 工具
    activeTool, canvasTool,
    // 裁剪
    cropAspectRatio
  }
})
