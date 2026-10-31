/**
 * 下载/上传载荷的形状守卫：判断一段字节到底是「数据」还是「网页」。
 *
 * 为什么需要这个看似多余的判断：
 * 2026-06 有一批 TensorFlow.js 的 `.bin` 权重文件，实际内容是保存下来的 Kaggle 页面
 * （5401 字节 HTML），里面带着 Kaggle 自己的公开前端 Google API key。后果有两条：
 *   1. Security 页面挂了一条 `google_api_key` 告警，2026-10-31 才按误报关闭；
 *   2. 那批"权重"根本加载不了模型，属于静默坏数据。
 * 根因是下载时只检查 HTTP 状态码：目标地址返回登录页 / 换页 HTML 时也会 200，
 * 于是网页被原样写成 `.bin`。
 *
 * 判据刻意只看**开头几个字节**，不看 content-type：content-type 由服务端声明（可能是错的），
 * 而 `<` 开头的文本几乎不可能是合法的模型权重或图片/字体二进制。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */

/** 只看开头这么多字节：HTML 文档的声明/DOM 起点必然在头部 */
const SNIFF_BYTES = 256;

/** `<` + 常见文档标签，容忍前导 BOM / 空白 / 注释前的换行 */
const HTML_HEAD_RE = /^\s*<(!doctype\s+html|html|head|body|meta|script|title)/i;

/**
 * 这段字节是否像一份 HTML 页面。
 *
 * @param {Buffer|Uint8Array|string} payload 响应体 / 文件内容
 * @returns {boolean}
 */
function looksLikeHtml(payload) {
  if (payload === null || payload === undefined) return false;

  let head;
  if (typeof payload === 'string') {
    head = payload.slice(0, SNIFF_BYTES);
  } else {
    // Buffer / Uint8Array 都有 subarray；只取头部再按 UTF-8 解（HTML 头部必为 ASCII 兼容）
    const slice = typeof payload.subarray === 'function' ? payload.subarray(0, SNIFF_BYTES) : payload;
    head = Buffer.from(slice).toString('utf8');
  }

  // 去掉 UTF-8 BOM：有些页面导出后带 BOM，不去掉会漏判
  return HTML_HEAD_RE.test(head.replace(/^\uFEFF/, ''));
}

/**
 * 断言载荷不是网页；是网页就抛错（调用方据此中止写入）。
 *
 * @param {Buffer|Uint8Array|string} payload 载荷
 * @param {string} [label] 出错时用于定位的标签（文件名 / URL）
 * @returns {void}
 * @throws {Error} 载荷像 HTML 时
 */
function assertNotHtmlPayload(payload, label = '载荷') {
  if (!looksLikeHtml(payload)) return;
  throw new Error(
    `${label} 收到的是网页（以 <!DOCTYPE html>/<html> 开头），不是期望的二进制数据 —— 多半是下载地址需要登录、已失效或返回了错误页`
  );
}

export { looksLikeHtml, assertNotHtmlPayload };
