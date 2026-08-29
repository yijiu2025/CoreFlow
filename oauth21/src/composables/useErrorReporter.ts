/**
 * 错误上报 composable
 *
 * 生产环境用 fetch 上报到后端（/api/v1/client-error），开发环境 console.warn 留痕
 * 替代直接 console.error(err) —— 避免生产泄露堆栈 + 集中错误监控
 *
 * 上报字段：
 * - message 错误消息（不传 stack 避免泄露源码位置）
 * - url/errorType/userAgent/userId 上下文
 * - digest 错误摘要（用于后端去重）
 *
 * 后端需提供 /api/v1/client-error 端点（如果不存在，fetch 失败不阻断主流程）
 *
 * @author yijiu2025
 * @since 2026-08-29
 */

const ERROR_REPORT_URL = '/api/v1/client-error';

/**
 * 上报错误（生产用 fetch + 失败兜底；开发用 console.warn 留痕）
 * @param err 错误对象（Error 或 string）
 * @param info 额外上下文（Vue errorHandler info / 组件名等）
 */
export async function reportError(err: unknown, info?: string): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const errorType = err instanceof Error ? err.name : 'UnknownError';
  const url = typeof location !== 'undefined' ? location.href : '';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const digest = await digestMessage(message);

  const payload = {
    message,
    errorType,
    info: info || '',
    url,
    userAgent,
    digest,
    timestamp: Date.now()
  };

  if (import.meta.env.DEV) {
    // 开发环境 console 留痕（不被 build drop 删除，因为只 dev 走）
    console.warn('[ClientError]', payload);
    return;
  }

  // 生产环境：fetch 上报，失败兜底（不发 throw，不阻断主流程）
  try {
    await fetch(ERROR_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // 1.5s 超时（监控上报不应阻塞业务）
      signal: AbortSignal.timeout(1500)
    });
  } catch {
    // 上报失败静默（监控系统不应把业务搞挂）
  }
}

/** SHA-256 摘要（不依赖 crypto.subtle，兼容性更好） */
async function digestMessage(msg: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(msg);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16); // 取前 16 位足够去重
  } catch {
    return msg.slice(0, 16); // 兜底：取前 16 字符
  }
}
