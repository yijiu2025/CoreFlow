/**
 * 逗号列表解析的边界测试
 *
 * 这类"看起来不会错"的函数最容易在复制粘贴中丢语义：`' , '` 该解析成 `['']` 还是 `[]`、
 * 未配置该回退空数组还是回退默认值，各调用点的答案并不相同（CORS 空 = 拒绝全部跨域，
 * trustProxy 空 = 回退回环）。所以钉住的是「显式声明 fallback」这个契约本身。
 *
 * @author yijiu2025
 */
import { describe, it, expect } from '@jest/globals';
import { parseCsvList } from '../../utils/strings.js';

describe('parseCsvList', () => {
  it('去空白、去空项', () => {
    expect(parseCsvList(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('未配置 / 空白串 / 全空项 → 空数组（不写 fallback 时的默认语义）', () => {
    for (const raw of [undefined, null, '', '   ', ' , , ']) {
      expect(parseCsvList(raw)).toEqual([]);
    }
  });

  it('非字符串按未配置处理（配置层可能给数字 / 布尔）', () => {
    expect(parseCsvList(123)).toEqual([]);
    expect(parseCsvList(true)).toEqual([]);
    expect(parseCsvList(['a', 'b'])).toEqual([]);
  });

  it('fallback 只在「没解析出任何项」时生效', () => {
    expect(parseCsvList('', { fallback: ['x'] })).toEqual(['x']);
    expect(parseCsvList(' , ', { fallback: ['x'] })).toEqual(['x']);
    expect(parseCsvList('a', { fallback: ['x'] })).toEqual(['a']);
  });

  it('fallback 返回副本：调用方改不到内部常量（默认值常是模块级常量）', () => {
    const fallback = ['127.0.0.1'];
    const first = parseCsvList('', { fallback });
    first.push('evil');

    expect(fallback).toEqual(['127.0.0.1']);
    expect(parseCsvList('', { fallback })).toEqual(['127.0.0.1']);
  });

  it('支持自定义分隔符', () => {
    expect(parseCsvList('a;b; c', { separator: ';' })).toEqual(['a', 'b', 'c']);
  });

  it('不做去重（语义由调用方决定：白名单需要去重，顺序列表不需要）', () => {
    expect(parseCsvList('a,a')).toEqual(['a', 'a']);
  });
});
