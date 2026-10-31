/**
 * 下载 TensorFlow.js AI 模型到本地
 *
 * 用法: node scripts/download-models.js
 *
 * 模型列表:
 * - MoveNet Thunder: 人体姿态检测
 * - Selfie Segmentation: 人体分割
 * - Face Detection: 面部检测
 * - Face Landmark: 面部网格 (468 点)
 * - Hand Detection: 手部检测
 * - Hand Landmark: 手部网格 (21 点)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger, logStdout } from '../src/framework/log/index.js';
import { assertNotHtmlPayload } from '../src/utils/payload-guard.js';

const log = createLogger('scripts.download-models');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '../public/models');

// 模型配置
const MODELS = [
  {
    name: 'MoveNet Thunder',
    dir: 'movenet',
    url: 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/thunder/4?tfjs-format=file'
  },
  {
    name: 'Selfie Segmentation',
    dir: 'selfie_segmentation',
    url: 'https://tfhub.dev/google/tfjs-model/selfie_segmentation/general/2?tfjs-format=file'
  },
  {
    name: 'Face Detection',
    dir: 'face_detector',
    url: 'https://tfhub.dev/mediapipe/tfjs-model/face_detection/short/1?tfjs-format=file'
  },
  {
    name: 'Face Landmark',
    dir: 'face_landmark',
    url: 'https://tfhub.dev/mediapipe/tfjs-model/face_landmark_detection/1?tfjs-format=file'
  },
  {
    name: 'Hand Detection',
    dir: 'hand_detector',
    url: 'https://tfhub.dev/mediapipe/tfjs-model/hand_detection/1?tfjs-format=file'
  },
  {
    name: 'Hand Landmark',
    dir: 'hand_landmark',
    url: 'https://tfhub.dev/mediapipe/tfjs-model/hand_landmark_detection/1?tfjs-format=file'
  }
];

/**
 * 下载文件
 *
 * 两道闸门都保留：
 *   1. `content-type` —— 服务端自己声明的（可能是错的，所以只当第一道）；
 *   2. `assertNotHtmlPayload` —— 看实际字节（`src/utils/payload-guard.js`）。
 * 2026-06 那批"Kaggle 网页存成 .bin"就是只过了第 1 道（甚至没有它）的结果。
 */
async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status} ${response.statusText}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error(`下载失败: 返回的是 HTML（content-type=${contentType}），不是模型数据`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  assertNotHtmlPayload(buffer, path.basename(dest));

  fs.writeFileSync(dest, buffer);
}

/**
 * 主函数
 */
async function main() {
  logStdout('📦 开始下载 AI 模型...\n');

  // 确保目录存在
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  for (const model of MODELS) {
    const modelDir = path.join(MODELS_DIR, model.dir);
    const modelFile = path.join(modelDir, 'model.json');

    // 创建目录
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // 检查是否已存在
    if (fs.existsSync(modelFile)) {
      logStdout(`  ⏭️  ${model.name}: 已存在，跳过`);
      continue;
    }

    // 下载
    logStdout(`  ⬇️  ${model.name}...`);
    try {
      await downloadFile(model.url, modelFile);
      logStdout(`  ✅ ${model.name}: 下载完成`);
    } catch (err) {
      log.error(`  ❌ ${model.name}: ${err.message}`);
    }
  }

  logStdout('\n✅ 模型下载完成！');
  logStdout(`📁 模型位置: ${MODELS_DIR}/`);
}

/**
 * 仅当作为脚本直接执行时才跑 main —— 这样单测可以 import 它来验守卫，
 * 而不会在 import 时触发真实下载。
 */
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch(log.error);
}

export { MODELS, downloadFile };
