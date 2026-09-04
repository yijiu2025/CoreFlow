/**
 * 设备指纹采集（canvas + WebGL）
 *
 * 用于增强验证码/consentKey 的客户端绑定，抵制代理池换 IP+UA 绕过。
 * 仅在 VITE_DEVICE_FINGERPRINT=true 或页面 meta[name=device-fp]=true 时
 * 由 request 拦截器采集并注入 X-Device-Fp 头。默认不启用（隐私友好），
 * 后端未启用时不影响现有 IP+UA 指纹逻辑。
 *
 * 采集维度：
 * - canvas：绘制特定文本 + 读取像素，利用 GPU/驱动渲染差异生成稳定指纹
 * - webgl：读取 renderer/vendor 等参数，利用显卡差异
 * - 合并后 SHA-256，取前 32 位 hex
 *
 * 实现为纯 JS（而非 TS）：根 Jest 配置 transform: {}（纯 ESM 不编译 TS），
 * 单元测试直接 import 本文件（与 base62-timestamp.js 同一约定）。
 *
 * @author yijiu2025
 * @since 2026-08-22
 * @since 2026-09-04 迁移 .js + .d.ts；Promise 缓存（并发去重 + 空结果缓存）；SSR 守卫；静态导入 sha256
 */

import { sha256 } from './sha256.js';

/** 已采集指纹的 Promise 缓存（并发调用去重；空结果也缓存，避免每次重采） */
let fingerprintPromise = null;

/**
 * 采集 canvas 指纹
 * 在离屏 canvas 绘制带样式文本，读取 dataURL，取 SHA-256
 * @returns {Promise<string>} canvas 指纹；不可用返回空串
 */
async function canvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 绘制带特定字体/颜色的文本，不同 GPU/驱动渲染结果有细微差异
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('CoreFlow device fingerprint 🌐', 2, 2);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('CoreFlow device fingerprint 🌐', 4, 4);

    const dataUrl = canvas.toDataURL();
    // 用 dataUrl 的内容哈希作指纹（避免传输完整 base64）
    return await sha256(dataUrl);
  } catch {
    return '';
  }
}

/**
 * 采集 WebGL 指纹（显卡 renderer/vendor）
 * @returns {Promise<string>} WebGL 指纹；不可用返回空串
 */
async function webglFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    return `${vendor}|${renderer}`;
  } catch {
    return '';
  }
}

/**
 * 采集完整设备指纹（canvas + WebGL 合并后 SHA-256，取前 32 位 hex）
 *
 * 结果以 Promise 缓存：同浏览器进程内稳定、并发调用只采集一次、
 * 两者均失败（headless、反指纹浏览器等）的空结果同样缓存。
 * @returns {Promise<string>} 指纹 hex；采集失败返回空串
 */
export function getDeviceFingerprint() {
  if (!fingerprintPromise) {
    fingerprintPromise = collectFingerprint();
  }
  return fingerprintPromise;
}

/** 实际采集流程（仅由 getDeviceFingerprint 调用一次） */ async function collectFingerprint() {
  const [canvas, webgl] = await Promise.all([canvasFingerprint(), webglFingerprint()]);

  // 两者均失败（headless、反指纹浏览器等）时返回空串：
  // 若退化为 hash("|") 常量，所有此类浏览器指纹相同，会造成误匹配
  if (!canvas && !webgl) {
    return '';
  }

  const hash = await sha256(`${canvas}|${webgl}`);
  return hash.slice(0, 32);
}

/**
 * 是否启用设备指纹（与后端 DEVICE_FINGERPRINT_ENABLED 对应）
 * 通过页面 meta 标签或 Vite 环境变量控制，默认不启用
 * @returns {boolean} 是否启用
 */
export function isDeviceFingerprintEnabled() {
  // 非浏览器环境（SSR / Jest node）不启用
  if (typeof document === 'undefined') return false;

  // 后端通过页面 meta 注入开关，或前端环境变量
  const meta = document.querySelector('meta[name="device-fp"]')?.getAttribute('content');
  if (meta === 'true') return true;

  // import.meta.env 由 Vite 编译期静态注入（build 期整体替换，此处写法兼容替换）；
  // 非 Vite 环境（Jest 等）下 import.meta.env 为 undefined，回落到空对象
  const env = import.meta.env || {};
  return env.VITE_DEVICE_FINGERPRINT === 'true';
}

/** 仅测试使用：清空指纹 Promise 缓存，隔离用例间状态 */
export function __resetFingerprintForTest() {
  fingerprintPromise = null;
}
