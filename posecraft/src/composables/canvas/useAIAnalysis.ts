import { ref } from 'vue'
import type { Ref } from 'vue'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import * as poseDetection from '@tensorflow-models/pose-detection'
import * as bodySegmentation from '@tensorflow-models/body-segmentation'
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection'
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection'
import * as fabricLib from 'fabric'
const fabric = (fabricLib as any).fabric || (fabricLib as any).default || fabricLib

export function useAIAnalysis(
  fCanvas: Ref<any>,
  currentColor: Ref<string>,
  detectionType: Ref<string>,
  bgImageUploaded: Ref<boolean>,
  loadingStep: Ref<string>,
  analysisComplete: Ref<boolean>,
  isAnalyzing: Ref<boolean>,
  saveState: () => void,
  drawPoseSkeleton: (pose: any, offset: any) => void,
  canvasDeps: any
) {
  const origin = () => window.location.origin
  const MOVENET_MODEL_URL = () => `${origin()}/models/movenet/model.json`
  const isDetectorReady = ref(false)
  let detector: any = null
  let segmenter: any = null
  let faceDetector: any = null
  let handDetector: any = null
  let isStateSavingLocked = false

  const detectionTypes = [
    { value: 'all', label: '全部', icon: '✨', desc: '姿势+面部+手部+轮廓' },
    { value: 'pose', label: '姿势', icon: '🏃', desc: '人体骨骼关键点' },
    { value: 'face', label: '面部', icon: '😊', desc: '面部网格 468 点' },
    { value: 'hand', label: '手部', icon: '✋', desc: '手部关键点 21 点' },
    { value: 'segmentation', label: '轮廓', icon: '👤', desc: '人体分割描边' },
  ]

  const originalWarn = console.warn
  const originalError = console.error
  console.warn = (...args: any[]) => {
    const msg = String(args[0] || '')
    if (msg.includes('powerPreference') || msg.includes('willReadFrequently')) return
    originalWarn(...args)
  }
  console.error = (...args: any[]) => {
    const msg = String(args[0] || '')
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) return
    originalError(...args)
  }

  const ensureModelsLoaded = async () => {
    if (isDetectorReady.value) return
    try {
      loadingStep.value = '正在初始化 AI 引擎...'; await tf.ready(); const base = origin()
      loadingStep.value = '正在读取骨架模型...'
      detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, modelUrl: MOVENET_MODEL_URL() })
      loadingStep.value = '正在读取遮罩模型...'
      segmenter = await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation, { runtime: 'tfjs', modelUrl: `${base}/models/selfie_segmentation/model.json` })
      loadingStep.value = '正在读取面部模型...'
      faceDetector = await faceLandmarksDetection.createDetector(faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh, { runtime: 'tfjs', refineLandmarks: true, detectorModelUrl: `${base}/models/face_detector/model.json`, landmarkModelUrl: `${base}/models/face_landmark/model.json` })
      loadingStep.value = '正在读取手部模型...'
      handDetector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, { runtime: 'tfjs', modelType: 'full', detectorModelUrl: `${base}/models/hand_detector/model.json`, landmarkModelUrl: `${base}/models/hand_landmark/model.json` })
      isDetectorReady.value = true; loadingStep.value = ''
    } catch (err) { console.error('AI models load fail:', err); loadingStep.value = '模型加载失败'; setTimeout(() => { loadingStep.value = ''; isAnalyzing.value = false }, 3000) }
  }

  const drawImageOutline = async (segs: any[], hex: string, offset: any = null) => {
    if (!segs?.length) { console.warn('[AI] 轮廓数据为空'); return }
    try {
      const h = hex.replace('#', '')
      const fg = { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 255 }
      console.log('[AI] 生成轮廓遮罩...')
      const mask = await bodySegmentation.toBinaryMask(segs, fg, { r: 0, g: 0, b: 0, a: 0 })
      console.log('[AI] 遮罩尺寸:', mask.width, 'x', mask.height)
      const c1 = document.createElement('canvas'); c1.width = mask.width; c1.height = mask.height; c1.getContext('2d', { willReadFrequently: true })!.putImageData(mask, 0, 0)
      const c2 = document.createElement('canvas'); c2.width = mask.width; c2.height = mask.height; const ctx = c2.getContext('2d', { willReadFrequently: true })!
      
      const bg = fCanvas.value.backgroundImage
      if (!bg) { console.warn('[AI] 背景图不存在'); return }
      const actualSx = (offset ? offset.sw : bg.scaleX) || 1
      const offsetPx = Math.max(2, Math.ceil(3 / actualSx))
      
      const offsets = [
        [offsetPx, 0], [-offsetPx, 0], [0, offsetPx], [0, -offsetPx],
        [offsetPx, offsetPx], [-offsetPx, -offsetPx], [offsetPx, -offsetPx], [-offsetPx, offsetPx]
      ]
      offsets.forEach(([dx, dy]) => ctx.drawImage(c1, dx, dy))
      
      ctx.globalCompositeOperation = 'destination-out'
      ctx.drawImage(c1, 0, 0)
  
      const tx = offset ? offset.x : bg.left
      const ty = offset ? offset.y : bg.top
      const sx = offset ? offset.sw : bg.scaleX
      const sy = offset ? offset.sh : bg.scaleY
  
      const outlineImg = new fabric.Image(c2, {
        left: tx,
        top: ty,
        originX: offset ? 'left' : 'center',
        originY: offset ? 'top' : 'center',
        scaleX: sx,
        scaleY: sy,
        selectable: false,
        evented: false,
        isAutoGenerated: true,
        isOutline: true,
        isUserStroke: true,
        erasable: true
      })
      
      fCanvas.value.add(outlineImg)
      outlineImg.bringToFront()
      fCanvas.value.renderAll()
  
      console.log('[AI] 轮廓绘制完成')
    } catch (err) {
      console.error('[AI] 轮廓绘制失败:', err)
    }
  }

  const mapPoint = (k: any, offset: any) => {
    if (offset) return { x: offset.x + k.x * offset.sw, y: offset.y + k.y * offset.sh }
    const bg = fCanvas.value.backgroundImage
    if (!bg) return { x: k.x, y: k.y }
    return { x: bg.left - bg.getScaledWidth() / 2 + k.x * bg.scaleX, y: bg.top - bg.getScaledHeight() / 2 + k.y * bg.scaleY }
  }

  const drawFaceMesh = (face: any, offset: any = null) => {
    if (!face?.keypoints?.length) return; const kps = face.keypoints
    const mp = (i: number) => { const k = kps[i]; return k ? mapPoint({ x: k.x, y: k.y, score: 1 }, offset) : null }
    const addLine = (c: string, w: number, ...ps: [number,number][]) => { ps.forEach(([a,b]) => { const pA = mp(a), pB = mp(b); if (pA && pB) fCanvas.value.add(new fabric.Line([pA.x,pA.y,pB.x,pB.y], { stroke: c, strokeWidth: w, selectable: false, evented: false, isAutoGenerated: true, isFace: true, erasable: true, opacity: 0.85 })) }) }
    const addDot = (c: string, r: number, i: number) => { const p = mp(i); if (p) fCanvas.value.add(new fabric.Circle({ left: p.x, top: p.y, radius: r, fill: c, originX: 'center', originY: 'center', selectable: false, evented: false, isAutoGenerated: true, isFace: true, erasable: true, opacity: 0.9 })) }
    const le = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,33]; for (let i = 0; i < le.length-1; i++) addLine('#34d399', 1.5, [le[i], le[i+1]])
    const re = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382,362]; for (let i = 0; i < re.length-1; i++) addLine('#34d399', 1.5, [re[i], re[i+1]])
    addLine('#fb923c', 1.5, [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19]); addDot('#fb923c', 3, 1)
    const mo = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,61]; for (let i = 0; i < mo.length-1; i++) addLine('#f472b6', 1.5, [mo[i], mo[i+1]])
  }

  const drawHandSkeleton = (hand: any, offset: any = null) => {
    if (!hand?.keypoints?.length) return
    const c = currentColor.value
    const conn = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20]]
    const pts = hand.keypoints.map((k: any) => mapPoint({ x: k.x, y: k.y, score: 1 }, offset))
    conn.forEach(([a,b]) => {
      if (pts[a] && pts[b]) fCanvas.value.add(new fabric.Line([pts[a].x,pts[a].y,pts[b].x,pts[b].y], {
        stroke: c, strokeWidth: 1.5,
        selectable: false, evented: false,
        opacity: 0.8, erasable: true,
        isAutoGenerated: true, isHand: true
      }))
    })
  }

  const runFullAnalysis = async (src: any, offset: any = null) => {
    if (!bgImageUploaded.value || !detector) return; let found = false; isStateSavingLocked = true
    const type = detectionType.value
    console.log('[AI] 分析类型:', type, 'segmenter:', !!segmenter, 'detector:', !!detector)
    try {
      if ((type === 'all' || type === 'segmentation') && segmenter) {
        console.log('[AI] 开始轮廓识别...')
        try {
          const s = await segmenter.segmentPeople(src)
          console.log('[AI] 轮廓识别结果:', s?.length, '个人体', s)
          if (s?.length) { found = true; await drawImageOutline(s, currentColor.value, offset) }
          else { console.warn('[AI] 未检测到人体轮廓') }
        } catch (segErr) {
          console.error('[AI] 轮廓识别失败:', segErr)
        }
      } else {
        console.log('[AI] 跳过轮廓识别 - type:', type, 'segmenter:', !!segmenter)
      }
      if ((type === 'all' || type === 'pose') && detector) {
        const p = await detector.estimatePoses(src)
        if (p?.length) { drawPoseSkeleton(p[0], offset); found = true }
      }
      if ((type === 'all' || type === 'face') && faceDetector) {
        const f = await faceDetector.estimateFaces(src)
        if (f?.length) { drawFaceMesh(f[0], offset); found = true }
      }
      if ((type === 'all' || type === 'hand') && handDetector) {
        const h = await handDetector.estimateHands(src)
        if (h?.length) { h.forEach((x: any) => drawHandSkeleton(x, offset)); found = true }
      }
      fCanvas.value.getObjects().forEach((o: any) => { if (o.type === 'circle' || o.type === 'line') o.bringToFront() })
    } catch (e) { console.error('Analysis error:', e) } finally {
      isStateSavingLocked = false
      if (!offset) {
        isAnalyzing.value = false
        if (!found) {
          const typeLabel = detectionTypes.find(d => d.value === type)?.label || '特征'
          loadingStep.value = `未检测到${typeLabel}`
          setTimeout(() => { loadingStep.value = '' }, 2000)
        }
        fCanvas.value.renderAll()
        if (found) { analysisComplete.value = true; setTimeout(() => { analysisComplete.value = false }, 2000) }
      }
    }
  }

  const autoAnalyze = async () => {
    if (isAnalyzing.value || !bgImageUploaded.value) return; await ensureModelsLoaded(); if (!detector) return
    isAnalyzing.value = true; loadingStep.value = '正在分析构图...'
    const el = fCanvas.value.backgroundImage.getElement()
    const type = detectionType.value
  
    if (type === 'all' || type === 'segmentation') {
      if (canvasDeps.inkCtx && canvasDeps.inkCanvas) {
        canvasDeps.inkCtx.clearRect(0, 0, canvasDeps.inkCanvas.width, canvasDeps.inkCanvas.height)
      }
      fCanvas.value.getObjects().slice().forEach((o: any) => {
        if (o.isOutline) fCanvas.value.remove(o)
      })
    }
    if (type === 'all' || type === 'pose') {
      fCanvas.value.getObjects().slice().forEach((o: any) => {
        if (o.isSkeleton) fCanvas.value.remove(o)
      })
    }
    if (type === 'all' || type === 'face') {
      fCanvas.value.getObjects().slice().forEach((o: any) => {
        if (o.isFace) fCanvas.value.remove(o)
      })
    }
    if (type === 'all' || type === 'hand') {
      fCanvas.value.getObjects().slice().forEach((o: any) => {
        if (o.isHand) fCanvas.value.remove(o)
      })
    }
  
    await runFullAnalysis(el); loadingStep.value = ''; saveState()
  }

  const clearAnalysis = () => {
    if (!fCanvas.value) return
    fCanvas.value.getObjects().slice().forEach((o: any) => {
      if (o.isSkeleton || o.isFace || o.isHand || o.isOutline || o.isAutoGenerated) {
        fCanvas.value.remove(o)
      }
    })
    if (canvasDeps.inkCtx && canvasDeps.inkCanvas) {
      canvasDeps.inkCtx.clearRect(0, 0, canvasDeps.inkCanvas.width, canvasDeps.inkCanvas.height)
    }
    fCanvas.value.renderAll()
    saveState()
  }

  const analyzeArea = async (rect: any) => {
    if (isAnalyzing.value) return; await ensureModelsLoaded(); isAnalyzing.value = true
    try {
      const bg = fCanvas.value.backgroundImage, el = bg.getElement()
      const cx = (rect.left - (bg.left - bg.getScaledWidth()/2)) / bg.scaleX, cy = (rect.top - (bg.top - bg.getScaledHeight()/2)) / bg.scaleY
      const cw = rect.width / bg.scaleX, ch = rect.height / bg.scaleY
      const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch; tmp.getContext('2d', { willReadFrequently: true })!.drawImage(el, cx, cy, cw, ch, 0, 0, cw, ch)
      await runFullAnalysis(tmp, { x: rect.left, y: rect.top, sw: rect.width / cw, sh: rect.height / ch })
      saveState() // 记录步数
    } catch (e) { console.error('Area analysis error:', e) } finally { isAnalyzing.value = false }
  }

  return {
    isDetectorReady,
    detectionTypes,
    ensureModelsLoaded,
    runFullAnalysis,
    autoAnalyze,
    clearAnalysis,
    analyzeArea
  }
}
