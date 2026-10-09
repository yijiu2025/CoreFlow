/**
 * 路线树快照的压缩 / 解压
 *
 * 一棵深搜的逆合成树（含每步候选反应、AI 分析原文）轻松上 MB，直接存 JSON 会：
 *   · 撑大表与备份；· 拖慢列表查询（哪怕用不到）；· 更容易撞上传输/行大小限制。
 * 所以 `retroweb_task.snapshot` 存 **gzip 后的字节**（BLOB）。
 *
 * 🔴 压缩只在**存储边界**做一次，业务层拿到的始终是对象 —— 别让调用方记得"要解压"。
 * 🔴 `size_bytes` 记的是**压缩前**的原始字节数：它用于给用户解释"你的任务有多大"，
 *    压缩率随内容变，拿压缩后的值解释不通。
 *
 * @since 2026-10-09
 */
import { gzipSync, gunzipSync } from 'node:zlib';

/**
 * 对象 → gzip 字节
 * @param {object} obj 快照对象
 * @returns {Buffer}
 */
function packSnapshot(obj) {
  return gzipSync(Buffer.from(JSON.stringify(obj ?? {}), 'utf-8'));
}

/**
 * gzip 字节 → 对象（空 / 损坏 → null，不让调用方炸）
 * @param {Buffer|string|null} raw 数据库取出的值
 * @returns {object|null}
 */
function unpackSnapshot(raw) {
  if (!raw) return null;
  try {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    return JSON.parse(gunzipSync(buf).toString('utf-8'));
  } catch {
    return null;
  }
}

/** 原始字节数（写库时填 size_bytes） */
function byteSizeOf(obj) {
  return Buffer.byteLength(JSON.stringify(obj ?? {}), 'utf-8');
}

export { packSnapshot, unpackSnapshot, byteSizeOf };
