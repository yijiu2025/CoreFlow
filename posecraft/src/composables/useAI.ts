/**
 * AI 引擎组合式函数
 * 封装 TensorFlow.js 人体姿态检测、面部识别、手部追踪
 */
import { ref, shallowRef } from 'vue'

export type AnalysisType = 'pose' | 'face' | 'hand'

export interface Keypoint {
  x: number
  y: number
  score: number
  name?: string
}

export interface AnalysisResult {
  type: AnalysisType
  keypoints?: Keypoint[]
  score?: number
  processingTime: number
}

export function useAI() {
  const isLoading = ref(false)
  const isReady = ref(false)
  const error = ref<string | null>(null)
  const currentModel = shallowRef<any>(null)

  /**
   * 加载 MoveNet 模型（人体姿态检测）
   */
  async function loadPoseModel() {
    try {
      isLoading.value = true
      const tf = await import('@tensorflow/tfjs-core')
      await import('@tensorflow/tfjs-converter')
      await import('@tensorflow/tfjs-backend-webgl')

      const poseDetection = await import('@tensorflow-models/pose-detection')

      await tf.ready()
      const model = poseDetection.SupportedModels.MoveNet
      const detector = await poseDetection.createDetector(model, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
      })

      currentModel.value = detector
      isReady.value = true
      return detector
    } catch (err: any) {
      error.value = `加载姿态模型失败: ${err.message}`
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 检测人体姿态
   */
  async function detectPose(imageSource: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<AnalysisResult | null> {
    const startTime = performance.now()

    try {
      let detector = currentModel.value
      if (!detector) {
        detector = await loadPoseModel()
        if (!detector) return null
      }

      const poses = await detector.estimatePoses(imageSource)
      const processingTime = Math.round(performance.now() - startTime)

      if (poses.length === 0) {
        return { type: 'pose', keypoints: [], score: 0, processingTime }
      }

      const pose = poses[0]
      const keypoints: Keypoint[] = pose.keypoints.map((kp: any) => ({
        x: kp.x,
        y: kp.y,
        score: kp.score,
        name: kp.name
      }))

      return {
        type: 'pose',
        keypoints,
        score: pose.score,
        processingTime
      }
    } catch (err: any) {
      error.value = `姿态检测失败: ${err.message}`
      return null
    }
  }

  /**
   * 绘制姿势骨架
   */
  function drawPoseSkeleton(
    ctx: CanvasRenderingContext2D,
    keypoints: Keypoint[],
    width: number,
    height: number
  ) {
    // 骨架连接定义
    const connections = [
      ['nose', 'left_eye'], ['nose', 'right_eye'],
      ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
      ['left_shoulder', 'right_shoulder'],
      ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
      ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
      ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
      ['left_hip', 'right_hip'],
      ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
      ['right_hip', 'right_knee'], ['right_knee', 'right_ankle']
    ]

    ctx.strokeStyle = '#6366f1'
    ctx.lineWidth = 3

    // 绘制连线
    connections.forEach(([startName, endName]) => {
      const start = keypoints.find(kp => kp.name === startName)
      const end = keypoints.find(kp => kp.name === endName)

      if (start && end && start.score > 0.3 && end.score > 0.3) {
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
      }
    })

    // 绘制关键点
    keypoints.forEach(kp => {
      if (kp.score > 0.3) {
        ctx.fillStyle = kp.score > 0.7 ? '#22c55e' : '#f59e0b'
        ctx.beginPath()
        ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI)
        ctx.fill()

        // 绘制标签
        if (kp.name) {
          ctx.fillStyle = '#ffffff'
          ctx.font = '10px sans-serif'
          ctx.fillText(kp.name, kp.x + 8, kp.y - 8)
        }
      }
    })
  }

  /**
   * 综合分析
   */
  async function analyze(
    imageSource: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    type: AnalysisType
  ): Promise<AnalysisResult | null> {
    switch (type) {
      case 'pose':
        return detectPose(imageSource)
      default:
        error.value = `不支持的分析类型: ${type}`
        return null
    }
  }

  /**
   * 清理资源
   */
  function dispose() {
    if (currentModel.value) {
      currentModel.value.dispose?.()
      currentModel.value = null
    }
    isReady.value = false
  }

  return {
    isLoading,
    isReady,
    error,
    loadPoseModel,
    detectPose,
    drawPoseSkeleton,
    analyze,
    dispose
  }
}
