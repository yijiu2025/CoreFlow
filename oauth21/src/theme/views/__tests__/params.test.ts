/**
 * `readDeviceParam` 设备维度参数解析测试
 *
 * 真实加载 `skinsuite` 的 `views/params.ts` 实现（通过 re-export 壳
 * `@/theme/views/params` 的底层实现），覆盖取值链：
 *   `view.<设备>` → `view` → undefined
 * 以及「空串/空数组 = 未指定」这条最容易踩坑的规则。
 */
import { describe, test, expect } from 'vitest';
import { readDeviceParam } from '@/theme/views/params';

describe('readDeviceParam —— 设备维度参数取值链', () => {
  test('设备专属键优先于通用键', () => {
    const query = { 'view.standard': 'compact', view: 'default' };
    expect(readDeviceParam(query, 'view', 'standard')).toBe('compact');
    expect(readDeviceParam(query, 'view', 'mobile')).toBe('default');
  });

  test('设备专属键缺席时退通用键', () => {
    const query = { view: 'compact' };
    expect(readDeviceParam(query, 'view', 'standard')).toBe('compact');
    expect(readDeviceParam(query, 'view', 'mobile')).toBe('compact');
  });

  test('两者都缺席返回 undefined（表示该设备未被显式指定）', () => {
    expect(readDeviceParam({}, 'view', 'standard')).toBeUndefined();
    expect(readDeviceParam(undefined, 'view', 'mobile')).toBeUndefined();
  });

  test('空串设备专属键不顶掉通用键（空串 = 未指定）', () => {
    // 部署方常把参数留空当作「这台设备不特殊指定」——`?view.standard=&view=compact`
    // 不能因为 standard 那条是空串就把 `view=compact` 顶掉。
    const query = { 'view.standard': '', view: 'compact' };
    expect(readDeviceParam(query, 'view', 'standard')).toBe('compact');
  });

  test('纯空白串同样视为未指定', () => {
    const query = { 'view.standard': '   ', view: 'compact' };
    expect(readDeviceParam(query, 'view', 'standard')).toBe('compact');
  });

  test('空数组视为未指定，非空数组视为指定', () => {
    // `?view=a&view=b` 会得到数组，下游按「非字符串即非法」处理，这里只保证取值键正确。
    expect(readDeviceParam({ 'view.standard': [], view: 'compact' }, 'view', 'standard')).toBe('compact');
    expect(readDeviceParam({ 'view.standard': ['x'], view: 'compact' }, 'view', 'standard')).toEqual(['x']);
  });

  test('theme 参数名同样适用（与配色侧同形）', () => {
    const query = { 'theme.mobile': 'blue', theme: 'black' };
    expect(readDeviceParam(query, 'theme', 'mobile')).toBe('blue');
    expect(readDeviceParam(query, 'theme', 'standard')).toBe('black');
  });
});
