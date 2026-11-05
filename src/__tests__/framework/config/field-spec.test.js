/**
 * `framework/config/field-spec.js` 单元测试
 *
 * 这一层是"所有配置校验"的地基：spec 表 → 加载期清洗 / 写入期清洗 / API schema。
 * 地基错了，上面三处会一起错，所以这里把每种类型的边界都钉住。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { describe, it, expect } from '@jest/globals';
import {
  isPlainObject,
  normalizeField,
  sanitizeBySpec,
  toJsonProperties
} from '../../../framework/config/field-spec.js';

describe('normalizeField · 类型归一化', () => {
  it('bool：字符串 "false" 必须转成 false（JS 里它是 truthy，不清洗会被当成"开"）', () => {
    expect(normalizeField({ type: 'bool' }, 'false')).toEqual({ ok: true, value: false, coerced: true });
    expect(normalizeField({ type: 'bool' }, 'true')).toEqual({ ok: true, value: true, coerced: true });
    expect(normalizeField({ type: 'bool' }, false)).toEqual({ ok: true, value: false, coerced: false });
    expect(normalizeField({ type: 'bool' }, 'yes').ok).toBe(false);
    expect(normalizeField({ type: 'bool' }, 1).ok).toBe(false);
  });

  it('int：数字字符串可归一化，小数/非数字/越界一律拒绝', () => {
    expect(normalizeField({ type: 'int', min: 1 }, '600000')).toEqual({ ok: true, value: 600000, coerced: true });
    expect(normalizeField({ type: 'int', min: 1 }, 100).ok).toBe(true);
    expect(normalizeField({ type: 'int', min: 1 }, 1.5).ok).toBe(false);
    expect(normalizeField({ type: 'int', min: 1 }, 'abc').ok).toBe(false);
    expect(normalizeField({ type: 'int', min: 1 }, 0).ok).toBe(false);
    expect(normalizeField({ type: 'int', min: 1, max: 6 }, 7).ok).toBe(false);
  });

  it('stringArray：空串/非字符串条目必须拒绝（空前缀会变成"匹配一切"）', () => {
    expect(normalizeField({ type: 'stringArray' }, ['/a', '/b']).ok).toBe(true);
    expect(normalizeField({ type: 'stringArray' }, []).ok).toBe(true);
    for (const bad of [['/a', ''], ['/a', '  '], ['/a', null], ['/a', 42], 'not-array', {}]) {
      expect(normalizeField({ type: 'stringArray' }, bad).ok).toBe(false);
    }
  });

  it('enum / string / object 的边界', () => {
    expect(normalizeField({ type: 'enum', values: ['sohu', 'baidu'] }, 'baidu').ok).toBe(true);
    expect(normalizeField({ type: 'enum', values: ['sohu', 'baidu'] }, 'nope').ok).toBe(false);
    expect(normalizeField({ type: 'string', minLength: 1 }, '').ok).toBe(false);
    expect(normalizeField({ type: 'string', minLength: 0 }, '').ok).toBe(true);
    expect(normalizeField({ type: 'object' }, { a: 1 }).ok).toBe(true);
    expect(normalizeField({ type: 'object' }, [1, 2]).ok).toBe(false);
    expect(normalizeField({ type: 'object' }, null).ok).toBe(false);
  });
});

describe('sanitizeBySpec · 对象级清洗', () => {
  const SPEC = {
    port: { type: 'int', min: 1, max: 65535 },
    flag: { type: 'bool' },
    paths: { type: 'stringArray' },
    nested: { type: 'object', spec: { keep: { type: 'int', min: 0 } } }
  };

  it('未知键丢弃并留痕（"写了却不生效"要看得见）', () => {
    const { value, problems } = sanitizeBySpec(SPEC, { port: 3000, mystery: 1 });
    expect(value).toEqual({ port: 3000 });
    expect(problems).toEqual([expect.objectContaining({ kind: 'unknown', key: 'mystery' })]);
  });

  it('非法值丢弃（调用方与默认值合并后自然回落）', () => {
    const { value, problems } = sanitizeBySpec(SPEC, { port: 0, flag: 'abc', paths: ['', 'x'] });
    expect(value).toEqual({});
    expect(problems.filter(p => p.kind === 'invalid')).toHaveLength(3);
  });

  it('可归一化的值归一化后保留，并标记为 coerced', () => {
    const { value, problems } = sanitizeBySpec(SPEC, { port: '8080', flag: 'false' });
    expect(value).toEqual({ port: 8080, flag: false });
    expect(problems.every(p => p.kind === 'coerced')).toBe(true);
  });

  it('嵌套对象递归清洗：未知子键丢弃、非法子值丢弃', () => {
    const { value, problems } = sanitizeBySpec(SPEC, { nested: { keep: 1, drop: 2 } });
    expect(value).toEqual({ nested: { keep: 1 } });
    expect(problems).toEqual([expect.objectContaining({ kind: 'unknown', key: 'nested.drop' })]);

    const bad = sanitizeBySpec(SPEC, { nested: { keep: -1 } });
    expect(bad.value).toEqual({ nested: {} });
    expect(bad.problems[0]).toEqual(expect.objectContaining({ kind: 'invalid', key: 'nested.keep' }));
  });

  it('源本身不是对象：整体丢弃而不是抛错', () => {
    for (const src of ['str', 42, [1, 2], null, undefined]) {
      const result = sanitizeBySpec(SPEC, src);
      expect(result.value).toEqual({});
      expect(Array.isArray(result.problems)).toBe(true);
    }
    // null / undefined 不算"问题"（配置本来就可能没这一层）
    expect(sanitizeBySpec(SPEC, null).problems).toEqual([]);
  });
});

describe('toJsonProperties · 与 spec 同源生成 schema', () => {
  it('数值给上下界、数组给 items 约束、枚举给 enum、布尔给 type', () => {
    const props = toJsonProperties({
      n: { type: 'int', min: 1 },
      m: { type: 'number', max: 10 },
      s: { type: 'stringArray' },
      e: { type: 'enum', values: ['a'] },
      b: { type: 'bool' },
      t: { type: 'string', minLength: 0 }
    });
    expect(props.n).toEqual({ type: 'number', minimum: 1 });
    expect(props.m).toEqual({ type: 'number', maximum: 10 });
    expect(props.s).toEqual({ type: 'array', items: { type: 'string', minLength: 1 } });
    expect(props.e).toEqual({ type: 'string', enum: ['a'] });
    expect(props.b).toEqual({ type: 'boolean' });
    expect(props.t).toEqual({ type: 'string', minLength: 0 });
  });
});

describe('isPlainObject', () => {
  it('只认普通对象（数组/null/类实例都不算）', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
  });
});
