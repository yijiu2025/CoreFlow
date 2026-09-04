/**
 * 设备指纹单元测试
 *
 * node 环境无 DOM，通过桩对象模拟 canvas/WebGL 采集面，覆盖：
 * 开关判定（meta / 无 document 守卫 / 环境变量）、采集合并、
 * 双失败空结果缓存（修复前空串不缓存导致每次重采）。
 *
 * @author yijiu2025
 * @since 2026-09-04
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { getDeviceFingerprint, isDeviceFingerprintEnabled, __resetFingerprintForTest } from '../device-fingerprint.js';

/** 构造 2d context 桩 */
function create2dContextStub() {
  return {
    textBaseline: '',
    font: '',
    fillStyle: '',
    fillRect: () => {},
    fillText: () => {}
  };
}

/** 构造 WebGL context 桩 */
function createWebglStub({ withDebugInfo = true } = {}) {
  return {
    getExtension: name =>
      name === 'WEBGL_debug_renderer_info' && withDebugInfo
        ? { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 }
        : null,
    getParameter: param => (param === 1 ? 'Google Inc. (NVIDIA)' : 'ANGLE (NVIDIA GeForce)')
  };
}

/** 安装 document 桩（可控制 canvas 能力） */
let originalDocument;

function installDocumentStub({ canvas2d = true, webgl = true, withDebugInfo = true, meta } = {}) {
  originalDocument = globalThis.document;
  const created = [];
  globalThis.document = {
    created,
    createElement: tag => {
      const canvas = {
        width: 0,
        height: 0,
        _created: true,
        toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
        getContext: type => {
          if (type === '2d') return canvas2d ? create2dContextStub() : null;
          if (type === 'webgl' || type === 'experimental-webgl') {
            return webgl ? createWebglStub({ withDebugInfo }) : null;
          }
          return null;
        }
      };
      created.push(canvas);
      return canvas;
    },
    querySelector: selector => (selector === 'meta[name="device-fp"]' && meta ? { getAttribute: () => meta } : null)
  };
  return globalThis.document;
}

beforeEach(() => {
  __resetFingerprintForTest();
  originalDocument = undefined;
});

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('isDeviceFingerprintEnabled 开关判定', () => {
  test('无 document（SSR / node）时恒为 false，不抛异常', () => {
    globalThis.document = undefined;
    expect(isDeviceFingerprintEnabled()).toBe(false);
  });

  test('meta 标签 true 时启用', () => {
    installDocumentStub({ meta: 'true' });
    expect(isDeviceFingerprintEnabled()).toBe(true);
  });

  test('meta 非 true / 无 meta 时默认不启用（隐私友好）', () => {
    installDocumentStub({ meta: 'false' });
    expect(isDeviceFingerprintEnabled()).toBe(false);

    installDocumentStub({});
    expect(isDeviceFingerprintEnabled()).toBe(false);
  });
});

describe('getDeviceFingerprint 采集', () => {
  test('canvas + WebGL 正常采集时返回 32 位 hex', async () => {
    installDocumentStub({});
    const fp = await getDeviceFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  test('canvas 可用 + WebGL 不可用时仍产出指纹', async () => {
    installDocumentStub({ webgl: false });
    const fp = await getDeviceFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  test('双失败（headless/反指纹）返回空串且缓存（修复前每次重采）', async () => {
    const doc = installDocumentStub({ canvas2d: false, webgl: false });

    const first = await getDeviceFingerprint();
    expect(first).toBe('');

    const createdBefore = doc.created.length;
    const second = await getDeviceFingerprint();
    expect(second).toBe('');
    // 空结果走缓存：不再创建新 canvas 重新采集
    expect(doc.created.length).toBe(createdBefore);
  });

  test('并发调用只采集一次（Promise 去重）', async () => {
    const doc = installDocumentStub({});
    const [a, b, c] = await Promise.all([getDeviceFingerprint(), getDeviceFingerprint(), getDeviceFingerprint()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // canvas + webgl 各采集一次，共 2 个 canvas
    expect(doc.created).toHaveLength(2);
  });

  test('WebGL 无调试扩展（renderer/vendor 不可得）时降级为 canvas 单源指纹', async () => {
    installDocumentStub({ withDebugInfo: false });
    const fp = await getDeviceFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });
});
