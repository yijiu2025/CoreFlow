/**
 * 配置字段的**声明式规格**（spec）与通用校验/清洗工具
 *
 * ════════════════════════════════════════════════════════════════════
 * 为什么要有这一层（回答"统一校验还是各自校验"）
 * ════════════════════════════════════════════════════════════════════
 * 配置的入口不止一个：
 *   ① `src/config/*.js`           部署时的静态覆盖
 *   ② `data/*.json`               手改 / 面板落盘
 *   ③ 面板 `PATCH` 接口            运行期热改
 * 每个入口各写一套 `if (typeof x === 'number' && x > 0)` 必然漂移 —— 某天只改了其中
 * 一处，就是"看起来校过、其实没校"。所以：**规则只写一份（spec 表），在所有边界执行
 * 同一份规则**：
 *   · 加载期（文件 → 内存）：非法值丢弃 → 由默认值兜底；
 *   · 写入期（API patch → 内存/磁盘）：同样清洗 + 形状归位；
 *   · API schema：由 spec 生成 ajv properties（面板 400 的第一道闸）。
 *
 * 与 `framework/config/env.js` 的关系：那边是**环境变量**（全是字符串、带 fallback
 * 文本、缺失即致命），这边是**结构化配置对象**（boolean / number / array / object，
 * 非法值丢弃后由默认值兜底）。思路一致（声明式表 + 纯函数），形态不同，不强行合并。
 *
 * ════════════════════════════════════════════════════════════════════
 * spec 条目长什么样
 * ════════════════════════════════════════════════════════════════════
 *   { type: 'bool' }
 *   { type: 'int',   min: 1, max: 6 }        // int 额外要求 Number.isInteger
 *   { type: 'number', min: 0 }
 *   { type: 'string', minLength: 1 }
 *   { type: 'stringArray' }                  // 逐条要求非空字符串
 *   { type: 'enum', values: ['sohu'] }
 *   { type: 'object' }                       // 只要求 plain object（嵌套结构自行再声明）
 *
 * @author yijiu2025
 * @since 2026-11-05
 */

/**
 * 是否为「普通对象」（排除 null / 数组 / 类实例）
 *
 * @param {*} value 待判定值
 * @returns {boolean} true = 可直接参与 deepMerge 的普通对象
 */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 把一个值渲染成便于写进日志/错误信息的短串
 *
 * @param {*} value 任意值
 * @returns {string} 形如 `0`、`"abc"`、`[object]`、`null`
 */
function describeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return 'object';
  return typeof value;
}

/** 区间说明文本（用于错误信息） */
function describeRange(rule) {
  const min = rule.min ?? null;
  const max = rule.max ?? null;
  if (min !== null && max !== null) return `${min}~${max}`;
  if (min !== null) return `≥ ${min}`;
  if (max !== null) return `≤ ${max}`;
  return '任意';
}

/**
 * 按 spec 条目归一化单个字段值
 *
 * 归一化（而不是一律拒绝）是刻意的：`data/*.json` 手改、环境拼接都可能给出
 * `"600000"` / `"false"` 这种"语义正确、类型错误"的值，直接丢掉反而会让配置
 * 静默回落到默认值（用户改的东西不生效还不报错）。
 *
 * @param {object} rule spec 条目
 * @param {*} raw 原始值
 * @returns {{ok: true, value: *, coerced: boolean} | {ok: false, message: string}} 归一化结果
 */
function normalizeField(rule, raw) {
  if (raw === undefined) return { ok: false, message: '值为 undefined' };

  switch (rule.type) {
    case 'bool': {
      if (typeof raw === 'boolean') return { ok: true, value: raw, coerced: false };
      // ⚠️ 关键：字符串 "false" 在 JS 里是 **truthy**，不清洗就会被当成"开启"
      if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true', coerced: true };
      return { ok: false, message: `必须是布尔值，实际是 ${describeValue(raw)}` };
    }

    case 'int':
    case 'number': {
      const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      const coerced = typeof raw !== 'number';
      if (!Number.isFinite(numeric)) return { ok: false, message: `必须是数字，实际是 ${describeValue(raw)}` };
      if (rule.type === 'int' && !Number.isInteger(numeric)) {
        return { ok: false, message: `必须是整数，实际是 ${numeric}` };
      }
      const min = rule.min ?? -Infinity;
      const max = rule.max ?? Infinity;
      if (numeric < min || numeric > max) {
        return { ok: false, message: `必须满足 ${describeRange(rule)}，实际是 ${numeric}` };
      }
      return { ok: true, value: numeric, coerced };
    }

    case 'string': {
      if (typeof raw !== 'string') return { ok: false, message: `必须是字符串，实际是 ${describeValue(raw)}` };
      // 默认要求非空（空串当配置值几乎总是笔误）；确实允许空串的键显式写 minLength: 0
      const minLength = rule.minLength ?? 1;
      if (raw.trim().length < minLength) {
        return { ok: false, message: `长度必须 ≥ ${minLength}，实际是 ${describeValue(raw)}` };
      }
      return { ok: true, value: raw, coerced: false };
    }

    case 'stringArray': {
      if (!Array.isArray(raw)) return { ok: false, message: `必须是字符串数组，实际是 ${describeValue(raw)}` };
      // 空串/非字符串混进数组是真实事故源：空前缀 `startsWith('')` 恒真，
      // 一条空串就能把整条规则变成"匹配一切"（见 scan-trap 的 isSafePath）。
      const bad = raw.filter(item => typeof item !== 'string' || item.trim() === '');
      if (bad.length > 0) {
        return { ok: false, message: `数组里有 ${bad.length} 个空串/非字符串条目，实际是 ${describeValue(raw)}` };
      }
      return { ok: true, value: [...raw], coerced: false };
    }

    case 'enum': {
      const allowed = rule.values ?? [];
      if (!allowed.includes(raw)) {
        return { ok: false, message: `必须是 ${allowed.join(' / ')} 之一，实际是 ${describeValue(raw)}` };
      }
      return { ok: true, value: raw, coerced: false };
    }

    case 'object': {
      if (!isPlainObject(raw)) return { ok: false, message: `必须是对象，实际是 ${describeValue(raw)}` };
      return { ok: true, value: { ...raw }, coerced: false };
    }

    default:
      return { ok: false, message: `未知的 spec 类型 "${rule.type}"` };
  }
}

/**
 * 按 spec 清洗一个对象：**已知键归一化、非法值丢弃、未知键丢弃**
 *
 * 丢弃 = 不写进结果对象。调用方随后与默认值 deepMerge，于是非法值自然回落到默认值 ——
 * 这就是"配置写坏不会把机制弄坏"的实现方式（而不是在业务代码里散落 `|| 默认值`）。
 *
 * @param {Object<string, object>} spec 键 → spec 条目
 * @param {*} source 待清洗的对象（可为 null / 非法值）
 * @param {object} [options]
 * @param {string} [options.label=''] 用于问题描述的前缀（如 'defense'）
 * @returns {{value: object, problems: Array<{kind: string, key: string, message: string}>}}
 *          value = 清洗后的新对象（只含合法键）；problems = 发现的问题（kind: unknown/invalid/coerced）
 */
function sanitizeBySpec(spec, source, { label = '' } = {}) {
  const value = {};
  const problems = [];
  const prefix = label ? `${label}.` : '';

  if (!isPlainObject(source)) {
    if (source !== undefined && source !== null) {
      problems.push({
        kind: 'invalid',
        key: label || '(root)',
        message: `必须是对象，实际是 ${describeValue(source)}，已整体丢弃`
      });
    }
    return { value, problems };
  }

  for (const [key, raw] of Object.entries(source)) {
    const rule = spec[key];
    if (!rule) {
      problems.push({
        kind: 'unknown',
        key: `${prefix}${key}`,
        message: '不是已知配置项（没有读取点），已丢弃'
      });
      continue;
    }

    // 嵌套对象：递归清洗已知子键（`geoRules` / `alert` 这类）
    if (rule.type === 'object' && rule.spec) {
      if (!isPlainObject(raw)) {
        problems.push({
          kind: 'invalid',
          key: `${prefix}${key}`,
          message: `必须是对象，实际是 ${describeValue(raw)}，已丢弃（回落默认值）`
        });
        continue;
      }
      const nested = sanitizeBySpec(rule.spec, raw, { label: `${prefix}${key}` });
      problems.push(...nested.problems);
      value[key] = nested.value;
      continue;
    }

    const result = normalizeField(rule, raw);
    if (!result.ok) {
      problems.push({ kind: 'invalid', key: `${prefix}${key}`, message: `${result.message}，已丢弃（回落默认值）` });
      continue;
    }
    if (result.coerced) {
      problems.push({
        kind: 'coerced',
        key: `${prefix}${key}`,
        message: `类型已归一化：${describeValue(raw)} → ${describeValue(result.value)}`
      });
    }
    value[key] = result.value;
  }

  return { value, problems };
}

/**
 * 把 spec 转成 ajv/JSON-Schema 的 properties（供面板接口 schema 使用）
 *
 * 与 `sanitizeBySpec` 同源：改了 spec，API 校验与加载期清洗**同时**跟着变，
 * 不会出现"接口放行、加载又丢弃"的自相矛盾。
 *
 * @param {Object<string, object>} spec 键 → spec 条目
 * @returns {Object<string, object>} JSON-Schema properties
 */
function toJsonProperties(spec) {
  const properties = {};
  for (const [key, rule] of Object.entries(spec)) {
    properties[key] = toJsonSchema(rule);
  }
  return properties;
}

/**
 * 单个 spec 条目 → JSON-Schema 片段
 *
 * @param {object} rule spec 条目
 * @returns {object} JSON-Schema 片段
 */
function toJsonSchema(rule) {
  switch (rule.type) {
    case 'bool':
      return { type: 'boolean' };
    case 'int':
    case 'number': {
      const schema = { type: 'number' };
      if (rule.min !== undefined) schema.minimum = rule.min;
      if (rule.max !== undefined) schema.maximum = rule.max;
      return schema;
    }
    case 'string':
      return { type: 'string', minLength: rule.minLength ?? 1 };
    case 'stringArray':
      return { type: 'array', items: { type: 'string', minLength: 1 } };
    case 'enum':
      return { type: 'string', enum: [...(rule.values ?? [])] };
    case 'object':
      // 有子 spec 的（geoRules / alert）在 API 层也给出子键类型，避免"对象里随便写"
      return rule.spec ? { type: 'object', properties: toJsonProperties(rule.spec) } : { type: 'object' };
    default:
      // 未知类型不生成约束（而不是生成一个宽松到会误放的 schema）：
      // 由 spec 覆盖度测试来保证不会走到这里。
      return {};
  }
}

export { isPlainObject, describeValue, normalizeField, sanitizeBySpec, toJsonProperties, toJsonSchema };
