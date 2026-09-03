/**
 * 设备指纹采集（canvas + WebGL）
 *
 * 用于增强验证码/consentKey 的客户端绑定，抵制代理池换 IP+UA 绕过。
 * 仅在 DEVICE_FINGERPRINT_ENABLED=true 时由 request 拦截器采集并注入 X-Device-Fp 头。
 * 默认不启用（隐私友好），后端未启用时不影响现有 IP+UA 指纹逻辑。
 *
 * 采集维度：
 * - canvas：绘制特定文本 + 读取像素，利用 GPU/驱动渲染差异生成稳定指纹
 * - webgl：读取 renderer/vendor 等参数，利用显卡差异
 * - 合并后 SHA-256，32 位 hex
 *
 * @author yijiu2025
 * @since 2026-08-22
 */

let cachedFingerprint: string | null = null;

/**
 * 采集 canvas 指纹
 * 在离屏 canvas 绘制带样式文本，读取像素数据，取 SHA-256
 */
async function canvasFingerprint(): Promise<string> {
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
    const { sha256 } = await import('./sha256');
    return sha256(dataUrl);
  } catch {
    return '';
  }
}

/**
 * 采集 WebGL 指纹（显卡 renderer/vendor）
 */
async function webglFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext);
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
 * 采集完整设备指纹（canvas + WebGL 合并后 SHA-256）
 * 结果缓存（同浏览器进程内稳定），32 位 hex
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;

  const [canvas, webgl] = await Promise.all([canvasFingerprint(), webglFingerprint()]);

  // 两者均失败（headless、反指纹浏览器等）时返回空串：
  // 若退化为 hash("|") 常量，所有此类浏览器指纹相同，会造成误匹配
  if (!canvas && !webgl) {
    cachedFingerprint = '';
    return cachedFingerprint;
  }

  const material = `${canvas}|${webgl}`;

  const { sha256 } = await import('./sha256');
  const hash = await sha256(material);
  const fp = hash.slice(0, 32);
  cachedFingerprint = fp;
  return fp;
}

/**
 * 是否启用设备指纹（与后端 DEVICE_FINGERPRINT_ENABLED 对应）
 * 通过 meta 标签或环境变量控制，默认不启用
 */
export function isDeviceFingerprintEnabled(): boolean {
  // 后端通过页面 meta 注入开关，或前端环境变量
  const meta = document.querySelector('meta[name="device-fp"]')?.getAttribute('content');
  if (meta === 'true') return true;
  return import.meta.env.VITE_DEVICE_FINGERPRINT === 'true';
}
