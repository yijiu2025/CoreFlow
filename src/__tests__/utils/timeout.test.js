/**
 * 超时配置解析的边界测试
 *
 * 这条判据的失效方式很隐蔽：把 `-1` / `abc` 静默算成 0 既不报错也不抛异常，
 * 只是让 keepAliveTimeout / requestTimeout 悄悄变成 Fastify 的默认值（或 0），
 * 表现为"配置改了却没生效"。因此逐项钉住每种非法输入的回退行为。
 *
 * @author yijiu2025
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTimeoutMs } from '../../utils/timeout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('resolveTimeoutMs', () => {
  it('缺省值（undefined / 空串）回退到 fallback', () => {
    expect(resolveTimeoutMs(undefined, 72_000)).toBe(72_000);
    expect(resolveTimeoutMs('', 72_000)).toBe(72_000);
  });

  it('非数字回退到 fallback（不能静默变成 0）', () => {
    expect(resolveTimeoutMs('abc', 72_000)).toBe(72_000);
    expect(resolveTimeoutMs('300ms', 72_000)).toBe(72_000);
    expect(resolveTimeoutMs(NaN, 72_000)).toBe(72_000);
    expect(resolveTimeoutMs(Infinity, 72_000)).toBe(72_000);
  });

  it('"假 0"必须回退：null / 空白串 / 布尔被 Number() 强转会算成 0', () => {
    // Number(null) === 0、Number('   ') === 0、Number(true) === 1 —— 都不是调用方本意
    expect(resolveTimeoutMs(null, 72_000)).toBe(72_000);
    expect(resolveTimeoutMs('   ', 72_000)).toBe(72_000);
    expect(resolveTimeoutMs(true, 72_000)).toBe(72_000);
    expect(resolveTimeoutMs({}, 72_000)).toBe(72_000);
  });

  it('负数回退到 fallback', () => {
    expect(resolveTimeoutMs(-1, 300_000)).toBe(300_000);
    expect(resolveTimeoutMs('-5000', 300_000)).toBe(300_000);
  });

  it('合法的 0 必须原样保留（显式交给 Fastify 内置默认值）', () => {
    expect(resolveTimeoutMs(0, 72_000)).toBe(0);
    expect(resolveTimeoutMs('0', 72_000)).toBe(0);
  });

  it('字符串数字与小数：转成整数毫秒（向下取整）', () => {
    expect(resolveTimeoutMs('90000', 72_000)).toBe(90_000);
    expect(resolveTimeoutMs(1234.9, 0)).toBe(1234);
    expect(resolveTimeoutMs('300000', 0)).toBe(300_000);
  });

  it('app.js 不再保留同名本地实现（否则会遮蔽 util，两处判据各自漂移）', () => {
    const appSource = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
    expect(appSource).not.toMatch(/function\s+resolveTimeoutMs\s*\(/);
    expect(appSource).toMatch(/from '\.\/utils\/timeout\.js'/);
  });
});
