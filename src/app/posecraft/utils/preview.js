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
import { getModel } from '../../../framework/persistence/db/index.js';
import { createLogger } from '../../../framework/support/log/index.js';
import { appDir, publicUrl, publicUrlToPath } from '../../../framework/persistence/storage/index.js';

const log = createLogger('app.posecraft.utils.preview');

/** 预览图存储根目录（绝对路径） */
const PREVIEW_ROOT = path.join(appDir('posecraft'), 'previews');

/**
 * 根据类型获取预览图存储子目录
 * - work     → previews/work/
 * - template → previews/template/
 */
const getPreviewDir = type => path.join(PREVIEW_ROOT, type === 'template' ? 'template' : 'work');

/** 预览图 URL 前缀 */
const getPreviewUrlPrefix = type => publicUrl('posecraft', `previews/${type === 'template' ? 'template' : 'work'}`);

/** 预览图最大宽度（缩略图），像素 */
const THUMB_MAX_WIDTH = 600;

// ============== SVG 属性消毒（fabricData 是用户提交数据，一律不信任） ==============
//
// 🔴 为什么必须消毒：下面的字段全部**插值进 SVG 标记**，再交给 sharp(libvips) 渲染。
// 不加约束时，`stroke='"><image href="http://内网/"/>'` 这类值可以闭合属性、
// 注入任意 SVG 元素（属性逃逸 = 潜伏的 SSRF / 渲染异常面，不能只依赖渲染器兜底）。
// 约束方式按字段类型分两类：
//   - 数值：Number 化 + 有限性 + 夹取（数字不可能携带引号/尖括号，插值天然安全）
//   - 颜色：只放行 `#RGB/#RRGGBB/#RRGGBBAA`（hex 字符集内无任何标记语法）
//   - path d：只保留 SVG 路径语法的合法字符（命令字母 + 数字 + 分隔符），并限长

/** 画布边长的安全上限：10^4 之内（decode 像素总量远低于 sharp 默认 268Mpx 限制） */
const SVG_DIM_MAX = 10000;
/** 坐标/半径类数值的绝对值上限（远超正常画布，只为拦掉 Infinity 级脏数据） */
const SVG_COORD_MAX = 1000000;
/** path d 的最大长度（pose 骨架路径远小于此；只防"超大字符串进渲染器"） */
const PATH_DATA_MAX_LENGTH = 100000;
/** 颜色白名单：#RGB / #RGBA / #RRGGBB / #RRGGBBAA */
const SVG_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
/** path d 白名单字符集：路径命令字母 + 数字 + e/E（科学计数）+ +-., 与空白 */
const SVG_PATH_DATA_RE = /[^MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]/g;

/**
 * 消毒数值属性：Number 化 + 有限性校验 + 夹取。非法值回退 fallback。
 * 返回的是 JS number，插值进属性后不可能携带引号/尖括号等标记语法。
 * @param {unknown} value 原始值
 * @param {number} fallback 非法/缺失时的兜底
 * @param {number} [min] 下限（含）
 * @param {number} [max] 上限（含）
 * @returns {number}
 */
function safeSvgNumber(value, fallback, min = -SVG_COORD_MAX, max = SVG_COORD_MAX) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * 消毒颜色属性：只放行 #hex 形态，其余回退 fallback（不猜、不转义后放行）
 * @param {unknown} value 原始值
 * @param {string} fallback 非法/缺失时的兜底
 * @returns {string}
 */
function safeSvgColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return SVG_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

/**
 * 消毒 path 的 d 属性：剔除白名单外字符（任何标记语法都进不来），并限长。
 * 剩余字符集内没有引号/尖括号/&，插值进属性是安全的。
 * @param {unknown} value 原始 path 数据（字符串或 fabric 的命令数组）
 * @returns {string} 消毒后的 d 值；空串表示跳过该元素
 */
function safeSvgPathData(value) {
  let raw;
  if (Array.isArray(value)) {
    raw = value.map(cmd => (Array.isArray(cmd) ? cmd.join(' ') : String(cmd))).join(' ');
  } else if (typeof value === 'string') {
    raw = value;
  } else {
    return '';
  }
  if (raw.length > PATH_DATA_MAX_LENGTH) raw = raw.slice(0, PATH_DATA_MAX_LENGTH);
  return raw.replace(SVG_PATH_DATA_RE, '').trim();
}

/**
 * 根据 fabricData 骨骼数据生成 SVG buffer（透明背景，仅骨架线条）
 *
 * ⚠️ fabricData 来自用户提交的 pose_data，**所有**插值字段都经过上方消毒器 ——
 * 本函数曾直接插值用户字段（stroke/fill/path/坐标），是属性逃逸型 SVG 注入点。
 * @param {object} fabricData - pose_data.fabricData
 * @returns {Buffer} SVG buffer
 */
function generateSvgFromFabric(fabricData) {
  const width = safeSvgNumber(fabricData.width, 800, 1, SVG_DIM_MAX);
  const height = safeSvgNumber(fabricData.height, 600, 1, SVG_DIM_MAX);
  let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

  const objects = Array.isArray(fabricData.objects) ? fabricData.objects : [];
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    if (obj.type === 'line') {
      const x1 = safeSvgNumber(obj.x1, 0);
      const y1 = safeSvgNumber(obj.y1, 0);
      const x2 = safeSvgNumber(obj.x2, 0);
      const y2 = safeSvgNumber(obj.y2, 0);
      const stroke = safeSvgColor(obj.stroke, '#6366f1');
      const strokeWidth = safeSvgNumber(obj.strokeWidth, 3, 0, 1000);
      const opacity = safeSvgNumber(obj.opacity, 1, 0, 1);
      svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" stroke-linecap="round" />`;
    } else if (obj.type === 'circle') {
      const radius = safeSvgNumber(obj.radius, 8, 0, SVG_COORD_MAX);
      const originX = obj.originX === 'center' ? 'center' : 'left';
      const originY = obj.originY === 'center' ? 'center' : 'top';
      const left = safeSvgNumber(obj.left, 0);
      const top = safeSvgNumber(obj.top, 0);
      const cx = originX === 'center' ? left : left + radius;
      const cy = originY === 'center' ? top : top + radius;
      const fill = safeSvgColor(obj.fill, '#ffffff');
      const stroke = safeSvgColor(obj.stroke, '#6366f1');
      const strokeWidth = safeSvgNumber(obj.strokeWidth, 3, 0, 1000);
      const opacity = safeSvgNumber(obj.opacity, 1, 0, 1);
      svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    } else if (obj.type === 'path') {
      const stroke = safeSvgColor(obj.stroke, '#6366f1');
      const strokeWidth = safeSvgNumber(obj.strokeWidth, 3, 0, 1000);
      // path 的 fill 额外允许 'none'（无填充语义）；其余只认 #hex，非法一律回退 none
      const fillRaw = typeof obj.fill === 'string' ? obj.fill.trim() : '';
      const fill = fillRaw === 'none' || SVG_COLOR_RE.test(fillRaw) ? fillRaw : 'none';
      const opacity = safeSvgNumber(obj.opacity, 1, 0, 1);
      const pathD = safeSvgPathData(obj.path);
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
function extractFabricData(poseData) {
  if (!poseData) return null;
  let data = poseData;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  let fabricData = data?.fabricData;
  if (typeof fabricData === 'string') {
    try {
      fabricData = JSON.parse(fabricData);
    } catch {
      return null;
    }
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
 * @param {string} imageUrl - 底图 URL，如 '/posecraft/xxx.jpg'（公开目录 public/<app>/）
 * @returns {Promise<string|null>} 相对 URL；失败时返回 null（调用方应回退到原图）
 */
async function generateImageThumbnail(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  try {
    // 仅处理本地上传图片：URL 以 / 开头且能在 public/ 下找到（OSS 等外链会返回 null）
    // 路径一律从 framework/storage 取 —— 不用 process.cwd()/相对层数去猜（曾因少写一层
    // 把预览图写进 src/public，静态服务读的却是根 public，于是全部 404）。
    const localPath = publicUrlToPath(imageUrl);
    if (!fs.existsSync(localPath)) return null;

    // 保持原始尺寸，仅改格式为 WebP + 降低质量
    const thumbBuffer = await sharp(localPath).webp({ quality: 70 }).toBuffer();

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
    log.error('PoseCraft image thumbnail generation failed', err);
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
async function generateSkeletonPreview(poseData) {
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
    const skeletonPng = await sharp(svgBuffer).resize(width, height, { fit: 'fill' }).png().toBuffer();

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
    log.error('PoseCraft skeleton preview generation failed', err);
    return null;
  }
}

/**
 * 后端实时合成模板预览图（透明背景 + 骨骼 SVG 合成），返回 PNG Buffer
 *
 * 从 api/posecraft/v1/template.js 的 getTemplatePreview handler 下沉。
 * 路由层只需 `reply.type('image/png').send(buffer)`。
 * @param {object} template - 模板对象（含 pose_data）
 * @returns {Promise<Buffer>} PNG Buffer
 */
async function composeTemplatePreview(template) {
  const fabricData = extractFabricData(template.pose_data);
  // 兜底为有限正整数，防止 width/height 为 0/非数/Infinity/浮点时 sharp 报错
  const rawW = Number(fabricData?.width);
  const rawH = Number(fabricData?.height);
  const width = Number.isFinite(rawW) && rawW > 0 && rawW < 100000 ? Math.floor(rawW) : 800;
  const height = Number.isFinite(rawH) && rawH > 0 && rawH < 100000 ? Math.floor(rawH) : 600;

  try {
    // 1. 初始化透明背景图（预览图应为透明背景的纯模板/骨架数据）
    const bgImg = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    });

    // 2. 若有骨骼数据，生成 SVG 并合成（SVG 生成/合成失败均降级为透明空图）
    if (fabricData) {
      const svgBuffer = generateSvgFromFabric(fabricData);
      return await bgImg
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // 无骨骼数据 → 返回透明空图
    return bgImg.png().toBuffer();
  } catch (err) {
    // 任意异常（SVG 尺寸不匹配、合成失败等）降级为透明占位图，预览端点不抛 500
    log.error('Compose transparent template image failed', err);
    return sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer();
  }
}

/**
 * 合成作品预览图：查关联模板 → 复用 composeTemplatePreview 合成
 *
 * 从 api/posecraft/v1/work.js 的 getWorkPreview handler 下沉。
 * 无关联模板或合成失败均返回透明占位图（路由直接 send）。
 * @param {object} work - 作品对象（含 template_id）
 * @returns {Promise<Buffer>} PNG Buffer
 */
async function composeWorkPreview(work) {
  try {
    if (work?.template_id) {
      const Template = getModel('Template');
      const template = await Template.findOne({
        where: { id: work.template_id, delete_version: 0 }
      });
      if (template) {
        return await composeTemplatePreview(template);
      }
    }
  } catch (err) {
    log.error('Compose work preview image failed', err);
  }
  // 兜底透明占位图
  return sharp({
    create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .png()
    .toBuffer();
}

export {
  generateSvgFromFabric,
  extractFabricData,
  generateImageThumbnail,
  generateSkeletonPreview,
  composeTemplatePreview,
  composeWorkPreview
};
