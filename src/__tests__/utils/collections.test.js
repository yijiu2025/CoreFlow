/**
 * Map 上限保护的边界测试
 *
 * 这条判据的失效方式同样是静默的：淘汰少了一半，`map.size` 依然超过上限，
 * 内存该涨还是涨，只是涨得慢一点 —— 线上表现是"降级兜底跑了两小时才 OOM"，
 * 没有任何报错指向这里。因此钉住三件事：**真封顶**、**只淘汰最旧的**、**不误伤未超限的表**。
 *
 * @author yijiu2025
 */
import { describe, it, expect } from '@jest/globals';
import { capMapSize } from '../../utils/collections.js';

/** 造一个按 0..n-1 插入的 Map（插入顺序 = key 升序，最旧的在最前） */
function makeMap(n) {
  const map = new Map();
  for (let i = 0; i < n; i++) map.set(`k${i}`, i);
  return map;
}

describe('capMapSize', () => {
  it('远超上限时也必须真正封顶（不是砍一半）', () => {
    const map = makeMap(1000);
    const evicted = capMapSize(map, 10);

    expect(map.size).toBe(10);
    expect(evicted).toBe(990);
  });

  it('只淘汰最旧的，保留最近写入的（热数据）', () => {
    const map = makeMap(100);
    capMapSize(map, 20);

    expect([...map.keys()]).toEqual(Array.from({ length: 20 }, (_, i) => `k${80 + i}`));
  });

  it('未超限时原样不动，返回 0', () => {
    const map = makeMap(5);
    expect(capMapSize(map, 5)).toBe(0);
    expect(capMapSize(map, 99)).toBe(0);
    expect(map.size).toBe(5);
  });

  it('上限为 0 表示清空；非法上限按 0 处理（宁清空也不放任增长）', () => {
    expect(capMapSize(makeMap(3), 0)).toBe(3);
    const cleared = makeMap(3);
    capMapSize(cleared, 0);
    expect(cleared.size).toBe(0);

    const invalid = makeMap(4);
    capMapSize(invalid, Number.NaN);
    expect(invalid.size).toBe(0);
  });

  it('传入非 Map 不抛错（调用点常在降级路径里，不能再制造新故障）', () => {
    expect(capMapSize(null, 10)).toBe(0);
    expect(capMapSize({ size: 100 }, 10)).toBe(0);
  });

  it('空 Map 不产生淘汰', () => {
    expect(capMapSize(new Map(), 10)).toBe(0);
  });
});
