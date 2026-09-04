/**
 * SHA-256 单元测试
 *
 * 重点对拍：纯 JS 降级实现（sha256Pure）必须与 Node 原生 crypto 产出
 * 完全一致——H5 签名在 HTTP 非安全上下文走纯 JS 路径，与后端校验强耦合。
 *
 * @author yijiu2025
 * @since 2026-09-04
 */

import { describe, test, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import { sha256, sha256Pure } from '../sha256.js';

/** Node 原生 SHA-256 参考实现 */
function nodeSha256(message) {
  return createHash('sha256').update(message, 'utf8').digest('hex');
}

describe('SHA-256 纯 JS 降级实现与 Node crypto 对拍', () => {
  const vectors = [
    ['空字符串', ''],
    ['abc 标准向量', 'abc'],
    ['中文', '设备指纹指纹指纹'],
    ['emoji（四字节 UTF-8）', 'CoreFlow device fingerprint 🌐'],
    ['长文本（跨多个 64 字节块）', 'a'.repeat(1000)],
    ['恰好 55 字节（单块临界）', 'b'.repeat(55)],
    ['恰好 56 字节（需padding临界）', 'c'.repeat(56)],
    ['恰好 64 字节（整块临界）', 'd'.repeat(64)],
    ['特殊字符', 'x-device-id=WEB-DaBOSbNdSuc-8s4T&ts=1717000000']
  ];

  test.each(vectors)('%s', (_name, message) => {
    expect(sha256Pure(message)).toBe(nodeSha256(message));
  });

  test('Web Crypto 路径与纯 JS 路径产出一致', async () => {
    // Node 19+ 全局 crypto.subtle 可用，sha256 走 Web Crypto 路径
    for (const message of ['abc', '跨路径一致性验证 🌐', 'z'.repeat(200)]) {
      await expect(sha256(message)).resolves.toBe(sha256Pure(message));
    }
  });

  test('产出为 64 位小写 hex', async () => {
    const hash = await sha256('format-check');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
