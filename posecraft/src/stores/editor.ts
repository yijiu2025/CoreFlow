import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'

/**
 * ═══ 画布状态 Store ═══
 * 集中管理 Fabric.js 画布实例、画布的缩放比例、背景图片的上传状态、透明度、文件名
 * 以及 AI 姿势分析过程中的各种加载和步骤提示状态
 */
export const useCanvasStore = defineStore('canvasStore', () => {
  // 缓存 Fabric.js Canvas 的非代理引用，防止性能开销
  const fCanvas = shallowRef<any>(null)
  
  // 缩放状态管理
  const currentZoom = ref(1) // 实际的缩放比，如 1.2, 0.8
  const zoomSlider = ref(100) // 绑定的缩放滑块百分比值 (10 - 500)
  const zoomPercent = computed(() => Math.round(currentZoom.value * 100)) // 计算出的百分比显示文本
  
  // 图像上传与背景参考图状态
  const bgImageUploaded = ref(false) // 参考图是否已上传成功
  const bgOpacity = ref(50) // 参考背景图的透明度百分比 (10 - 100)
  const templateName = ref('') // 当前作品或模板的可编辑标题名称
  
  // AI 智能分析运行状态
  const isAnalyzing = ref(false) // 是否正在执行 AI 人体/面部/手部姿势识别
  const loadingStep = ref('') // AI 状态指示文本，如 "正在加载模型..."
  const analysisComplete = ref(false) // AI 识别是否全部完成并展现成功提示
  const detectionType = ref<'all' | 'pose' | 'face' | 'hand' | 'segmentation'>('all') // 选中的 AI 识别模式类型

  return {
    fCanvas,
    currentZoom,
    zoomSlider,
    zoomPercent,
    bgImageUploaded,
    bgOpacity,
    templateName,
    isAnalyzing,
    loadingStep,
    analysisComplete,
    detectionType
  }
})

/**
 * ═══ 工具与样式状态 Store ═══
 * 集中管理编辑器中各个工具的激活状态，以及当前画笔、橡皮擦、形状描边与填充等样式设置
 * 同时也同步当前被选中 Fabric 对象的模糊度、圆角及层级属性
 */
export const useToolStore = defineStore('toolStore', () => {
  // 当前激活的左侧一级工具类型 (select | ai | shapes | draw | eraser | text | image)
  const activeTool = ref('select')
  // 当前画布具体的操作二级工具 (select | hand | draw | eraser | text | rect | circle 等)
  const canvasTool = ref('select')
  
  // ═══ 画笔工具样式 ═══
  const brushSize = ref(8) // 画笔描边粗细 (1 - 50)
  const brushOpacity = ref(100) // 画笔不透明度 (0 - 100)
  const brushFeather = ref(0) // 画笔阴影羽化大小 (0 - 30)
  const brushStyle = ref('solid') // 画笔描边虚实线样式 (solid | dashed | dotted)
  const brushBlend = ref('source-over') // 画笔混合模式 (如叠底等)
  
  // ═══ 橡皮擦工具样式 ═══
  const eraserSize = ref(20) // 橡皮擦擦除半径大小
  const eraserOpacity = ref(100) // 橡皮擦透明度
  const eraserHardness = ref(100) // 橡皮擦硬度 (0=边缘模糊羽化，100=硬实边缘)
  const eraserShape = ref('circle') // 橡皮擦形状 (circle | square)
  const eraserMode = ref('all') // 橡皮擦擦除作用模式 (all=擦除全部, brush=仅擦除画笔, shape=仅擦除形状)
  
  // ═══ 形状与文本的描边和填充样式 ═══
  const strokeWidth = ref(3) // 几何形状的描边粗细 (0 - 20)
  const strokeOpacity = ref(100) // 描边线条的透明度 (0 - 100)
  const fillColor = ref('#6366f1') // 封闭图形的填充颜色 Hex 值
  const fillOpacity = ref(100) // 形状填充色的不透明度百分比 (0 - 100)
  const currentColor = ref('#6366f1') // 全局当前描边颜色（与画笔/形状描边共用）
  const noFill = ref(true) // 是否开启 "无填充" 模式（仅有描边）
  const lineStyle = ref('solid') // 形状描边的线条样式 (solid | dashed | dotted)
  const cornerRadius = ref(0) // 矩形等形状的圆角半径 (0 - 50)
  
  // ═══ 当前画布中选中元素的状态 ═══
  const selectedObject = ref<any>(null) // 选中的 Fabric 元素对象引用
  const pathBlur = ref(0) // 选中路径/画笔元素的模糊半径值

  // ═══ 右侧和左侧调色盘的预设颜色 ═══
  const presetColors = ref([
    '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308',
    '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
  ])

  // ═══ 构图参考线状态 ═══
  const activeGuides = ref<string[]>([]) // 当前开启的构图线列表 (如 RuleOfThirds | GoldenRatio)
  
  // ═══ 图像裁剪状态 ═══
  const cropAspectRatio = ref<number | null>(null) // 裁剪工具指定的纵横比 (如 1:1, 4:3)

  return {
    activeTool,
    canvasTool,
    brushSize,
    brushOpacity,
    brushFeather,
    brushStyle,
    brushBlend,
    eraserSize,
    eraserOpacity,
    eraserHardness,
    eraserShape,
    eraserMode,
    strokeWidth,
    strokeOpacity,
    fillColor,
    fillOpacity,
    currentColor,
    noFill,
    lineStyle,
    cornerRadius,
    selectedObject,
    pathBlur,
    presetColors,
    activeGuides,
    cropAspectRatio
  }
})

/**
 * ═══ 历史撤销/重做状态 Store ═══
 * 集中存放编辑器的历史撤销与重做数据栈快照
 */
export const useHistoryStore = defineStore('historyStore', () => {
  const undoStack = ref<any[]>([]) // 撤销栈：存放之前每一步操作的画布 JSON 快照
  const redoStack = ref<any[]>([]) // 重做栈：存放被撤销的操作快照，便于重做恢复

  return {
    undoStack,
    redoStack
  }
})
