import { ref } from 'vue';
import type { Ref } from 'vue';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
// 🔴 必须用 tfjs-core + 显式 backend，不要 import 聚合包 '@tensorflow/tfjs'：
//    ① package.json 根本没装它（只有 tfjs-core/converter/backend-webgl）⇒ vite dev 报
//       "Failed to resolve import @tensorflow/tfjs"；② 它会把 wasm/webgpu backend 一起拖进来，
//       而本项目只走 webgl（见 vite.config.ts 的 DEAD_PEERS）。
//    口径与 useAIAnalysis.ts 保持一致。
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

/**
 * AI 分析功能
 */
export function useAi(fCanvas: Ref<any>, bgImageUploaded: Ref<boolean>) {
  const isDetectorReady = ref(false);
  const isAnalyzing = ref(false);
  const loadingStep = ref('');
  const analysisComplete = ref(false);
  const detectionType = ref<'all' | 'pose' | 'face' | 'hand' | 'segmentation'>('all');

  let detector: any = null;
  let segmenter: any = null;
  let faceDetector: any = null;
  let handDetector: any = null;

  const origin = () => window.location.origin;
  const MOVENET_MODEL_URL = () => `${origin()}/models/movenet/model.json`;

  /** 加载 AI 模型 */
  const ensureModelsLoaded = async () => {
    if (isDetectorReady.value) return;
    try {
      loadingStep.value = '正在初始化 AI 引擎...';
      await tf.ready();
      const base = origin();

      loadingStep.value = '正在读取骨架模型...';
      detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        modelUrl: MOVENET_MODEL_URL()
      });

      loadingStep.value = '正在读取遮罩模型...';
      segmenter = await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation, {
        runtime: 'tfjs',
        modelUrl: `${base}/models/selfie_segmentation/model.json`
      });

      loadingStep.value = '正在读取面部模型...';
      faceDetector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'tfjs',
          refineLandmarks: true,
          detectorModelUrl: `${base}/models/face_detector/model.json`,
          landmarkModelUrl: `${base}/models/face_landmark/model.json`
        }
      );

      loadingStep.value = '正在读取手部模型...';
      handDetector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
        runtime: 'tfjs',
        modelType: 'full',
        detectorModelUrl: `${base}/models/hand_detector/model.json`,
        landmarkModelUrl: `${base}/models/hand_landmark/model.json`
      });

      isDetectorReady.value = true;
      loadingStep.value = '';
    } catch (err) {
      console.error('AI models load fail:', err);
      loadingStep.value = '模型加载失败';
      setTimeout(() => {
        loadingStep.value = '';
        isAnalyzing.value = false;
      }, 3000);
    }
  };

  return {
    isDetectorReady,
    isAnalyzing,
    loadingStep,
    analysisComplete,
    detectionType,
    detector: () => detector,
    segmenter: () => segmenter,
    faceDetector: () => faceDetector,
    handDetector: () => handDetector,
    ensureModelsLoaded
  };
}
