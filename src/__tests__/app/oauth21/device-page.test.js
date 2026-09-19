/**
 * 设备授权页渲染：不得在请求路径上做同步磁盘 I/O + XSS 逃逸必须有效
 *
 * 背景：原实现在每次请求里用 `readFileSync` 读 device.html（且就地做三次动态 import）。
 * 同步 I/O 会占住事件循环，属于与密码哈希同一类的问题。
 *
 * 本测试用「一被调用就抛错」的 `readFileSync` 替身来锁死这条不变量：
 *   · 实现走异步读 → 全绿
 *   · 有人改回 readFileSync → 立刻变红
 * 这比断言"返回了 HTML"更强 —— 后者即使实现退化成同步读也照样通过。
 */
import { jest } from '@jest/globals';
import fsReal from 'node:fs';

const stats = { syncRead: 0, asyncRead: 0 };

jest.unstable_mockModule('node:fs', () => ({
  default: {
    ...fsReal,
    promises: {
      ...fsReal.promises,
      readFile: (...args) => {
        stats.asyncRead++;
        return fsReal.promises.readFile(...args);
      }
    },
    readFileSync: (...args) => {
      stats.syncRead++;
      throw new Error('__SYNC_READ__ 请求路径上出现同步文件读取');
    }
  }
}));

const { DeviceService } = await import('../../../app/oauth21/services/device.service.js');

describe('设备授权页渲染', () => {
  let svc;

  beforeAll(() => {
    svc = new DeviceService({});
  });

  beforeEach(() => {
    stats.syncRead = 0;
    stats.asyncRead = 0;
  });

  test('渲染过程从未使用同步文件读取', async () => {
    await svc.renderDevicePage('ABCD-1234');
    expect(stats.syncRead).toBe(0);
    expect(stats.asyncRead).toBeGreaterThan(0);
  });

  test('user_code 被替换进模板（占位符不应残留）', async () => {
    const html = await svc.renderDevicePage('ABCD-1234');
    expect(html).toContain('ABCD-1234');
    expect(html).not.toContain('{{USER_CODE}}');
  });

  test('HTML 特殊字符被转义，无法注入脚本（XSS）', async () => {
    const html = await svc.renderDevicePage('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('引号与 & 一并转义（覆盖全部 5 个实体的关键几个）', async () => {
    const html = await svc.renderDevicePage(`a&b"c'd`);
    expect(html).toContain('a&amp;b&quot;c&#39;d');
  });

  test('userCode 为 undefined / 空值时不应崩（占位符替换为空串）', async () => {
    const html = await svc.renderDevicePage(undefined);
    expect(html).not.toContain('{{USER_CODE}}');
    expect(typeof html).toBe('string');
  });
});
