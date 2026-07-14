/**
 * PoseCraft 预览图生成工具
 * 将 pose_data 中的 fabricData 骨骼数据合成为纯骨架 PNG（透明背景）
 *
 * 用途：
 *   - 模板 thumbnail_url：纯骨架 PNG（透明背景）
 *   - 作品 thumbnail_url：底图原图（image_url），不生成骨架预览
 *
 * 前端 PoseCard 已有 base-image + skeleton-overlay 双层结构，
 * 作品卡片显示底图后，叠加模板的 thumbnail_url（骨架）即可看到完整效果。
 *
 * @author Claude
 * @since 2026-07-13
 */
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 预览图存储根目录（绝对路径） */
const PREVIEW_ROOT = path.resolve(__dirname, '../../../public/uploads/posecraft/previews')

/**
 * 根据类型获取预览图存储子目录
 * - work     → previews/work/
 * - template → previews/template/
 */
const getPreviewDir = (type) => path.join(PREVIEW_ROOT, type === 'template' ? 'template' : 'work')

/** 预览图 URL 前缀 */
const getPreviewUrlPrefix = (type) => `/uploads/posecraft/previews/${type === 'template' ? 'template' : 'work'}`;

/** 预览图最大宽度（缩略图），像素 */
const THUMB_MAX_WIDTH = 600;

/**
 * 根据 fabricData 骨骼数据生成 SVG buffer（透明背景，仅骨架线条）
 * @param {object} fabricData - pose_data.fabricData
 * @returns {Buffer} SVG buffer
 */
export function generateSvgFromFabric(fabricData) {
  const width = fabricData.width || 800;
  const height = fabricData.height || 600;
  let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  const objects = fabricData.objects || [];
  for (const obj of objects) {
    if (obj.type === 'line') {
      const x1 = obj.x1;
      const y1 = obj.y1;
      const x2 = obj.x2;
      const y2 = obj.y2;
      const stroke = obj.stroke || '#6366f1';
      const strokeWidth = obj.strokeWidth || 3;
      const opacity = obj.opacity !== undefined ? obj.opacity : 1;
      svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" />`;
    } else if (obj.type === 'circle') {
      const radius = obj.radius || 8;
      const originX = obj.originX || 'left';
      const originY = obj.originY || 'top';
      const cx = originX === 'center' ? obj.left : obj.left + radius;
      const cy = originY === 'center' ? obj.top : obj.top + radius;
      const fill = obj.fill || '#ffffff';
      const stroke = obj.stroke || '#6366f1';
      const strokeWidth = obj.strokeWidth || 3;
      const opacity = obj.opacity !== undefined ? obj.opacity : 1;
      svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    } else if (obj.type === 'path') {
      const stroke = obj.stroke || '#6366f1';
      const strokeWidth = obj.strokeWidth || 3;
      const fill = obj.fill || 'none';
      const opacity = obj.opacity !== undefined ? obj.opacity : 1;
      let pathD = '';
      if (Array.isArray(obj.path)) {
        pathD = obj.path.map(cmd => cmd.join(' ')).join(' ');
      } else if (typeof obj.path === 'string') {
        pathD = obj.path;
      }
      if (pathD) {
        svgContent += `<path d="${pathD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round" />`;
      }
    }
  }
  svgContent += `</svg>`;
  return Buffer.from(svgContent);
}

/**
 * 尝试从 pose_data 中提取 fabricData
 * @param {object|string} poseData - 模板/作品的 pose_data
 * @returns {object|null}
 */
export function extractFabricData(poseData) {
  if (!poseData) return null;
  let data = poseData;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) { return null; }
  }
  let fabricData = data?.fabricData;
  if (typeof fabricData === 'string') {
    try { fabricData = JSON.parse(fabricData); } catch (e) { return null; }
  }
  return fabricData && fabricData.objects?.length ? fabricData : null;
}

/**
 * 作品的底图原图压缩为低画质缩略图（用于渐进加载，省带宽）
 *
 * 与骨架预览图不同：
 * - 骨架预览图（generateSkeletonPreview）= 透明背景，纯骨架，用于模板
 * - 本函数 = 底图原图压缩，**保持原始尺寸**，改用 WebP 70% 质量降低文件体积
 *
 * @param {string} imageUrl - 底图 URL，如 '/uploads/posecraft/xxx.jpg'
 * @returns {Promise<string|null>} 相对 URL；失败时返回 null（调用方应回退到原图）
 */
export async function generateImageThumbnail(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  try {
    // 仅处理本地上传图片（以 /uploads/ 开头）
    const localPath = path.resolve(process.cwd(), 'public', imageUrl.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) return null;

    // 保持原始尺寸，仅改格式为 WebP + 降低质量
    const thumbBuffer = await sharp(localPath)
      .webp({ quality: 70 })
      .toBuffer();

    // 仅当压缩后比原图小 30% 以上才使用缩略图，否则保留原图更划算
    const origStat = fs.statSync(localPath);
    if (thumbBuffer.length >= origStat.size * 0.7) return null;

    // 作品缩略图保存到 previews/work/
    const previewDir = getPreviewDir('work');
    fs.mkdirSync(previewDir, { recursive: true });
    const hash = crypto.createHash('sha256').update(thumbBuffer).digest('hex').slice(0, 16);
    const filename = `${hash}.webp`;
    const filePath = path.join(previewDir, filename);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, thumbBuffer);
    }

    return `${getPreviewUrlPrefix('work')}/${filename}`;
  } catch (err) {
    const log = globalThis?.fastify?.log || console;
    log.error?.(err, 'PoseCraft image thumbnail generation failed');
    return null;
  }
}

/**
 * 生成纯骨架预览图（透明背景），保存为静态文件
 * 用于模板（Template.thumbnail_url）
 *
 * @param {object|string} poseData - pose_data（含 fabricData）
 * @returns {Promise<string|null>} 相对 URL；失败或无骨架数据时返回 null
 */
export async function generateSkeletonPreview(poseData) {
  const fabricData = extractFabricData(poseData);
  if (!fabricData) return null;

  try {
    // 画布尺寸：按原始尺寸等比缩放，最大宽度 THUMB_MAX_WIDTH
    const origWidth = fabricData.width || 800;
    const origHeight = fabricData.height || 600;
    const scale = Math.min(1, THUMB_MAX_WIDTH / origWidth);
    const width = Math.round(origWidth * scale);
    const height = Math.round(origHeight * scale);

    // 生成骨骼 SVG → PNG
    const svgBuffer = generateSvgFromFabric(fabricData);
    const skeletonPng = await sharp(svgBuffer)
      .resize(width, height, { fit: 'fill' })
      .png()
      .toBuffer();

    // 合成到透明背景（保持骨架半透明效果）
    const finalBuffer = await sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{ input: skeletonPng, top: 0, left: 0 }])
      .png()
      .toBuffer();

    // 模板骨架预览图保存到 previews/template/
    const previewDir = getPreviewDir('template');
    fs.mkdirSync(previewDir, { recursive: true });
    const hash = crypto.createHash('sha256').update(finalBuffer).digest('hex').slice(0, 16);
    const filename = `${hash}.png`;
    const filePath = path.join(previewDir, filename);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, finalBuffer);
    }

    return `${getPreviewUrlPrefix('template')}/${filename}`;
  } catch (err) {
    // 预览图生成失败不应阻塞主流程，仅记录日志
    const log = globalThis?.fastify?.log || console;
    log.error?.(err, 'PoseCraft skeleton preview generation failed');
    return null;
  }
}
