/**
 * 守卫运行时字段的「变更方向」判定
 *
 * ── 为什么需要方向 ──
 * 守卫配置的运行时字段（enabled / requireLogin / allowIps / allowRoles）里，
 * 有的改动只会更严，有的会放宽访问面。放宽必须付一次二次认证，收紧不必。
 * 判定方向是这套策略的唯一判据，因此集中在本文件，避免各处各写一份规则。
 *
 * ── 三个必须钉死的语义 ──
 * 1. `allowRoles: []` / `allowIps: []` 的含义是**不限制**，不是"禁止任何人"。
 *    所以 `['a'] → []` 是放宽，`[] → ['a']` 是收紧。子集比较天然覆盖这两种，
 *    不需要为"空数组"写特判 —— 写了反而容易在两个方向上同时弄反。
 * 2. 一次 patch 里可能同时有收紧项与放宽项（例如给 allowRoles 加一个、删一个），
 *    这种 mixed 必须按**放宽**处理，否则"夹带一个删除"就能绕过认证。
 * 3. 字段缺失（undefined）表示"本次不修改"，不参与方向计算。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

/** 允许运维调整的运行时字段（唯一来源，guard-config 与 config.service 都从这里取） */
const RUNTIME_FIELDS = ['enabled', 'requireLogin', 'allowIps', 'allowRoles'];

/**
 * 判断单个字段的方向
 *
 * @param {string} field 字段名
 * @param {*} from 当前生效值
 * @param {*} to 待写入值
 * @returns {'tighten'|'relax'|'mixed'|'neutral'}
 */
function directionOfField(field, from, to) {
  if (field === 'enabled') {
    if (from === to) return 'neutral';
    return to === false ? 'tighten' : 'relax';
  }

  if (field === 'requireLogin') {
    if (from === to) return 'neutral';
    return to === true ? 'tighten' : 'relax';
  }

  if (field === 'allowRoles' || field === 'allowIps') {
    const before = Array.isArray(from) ? from : [];
    const after = Array.isArray(to) ? to : [];
    const removed = before.filter(v => !after.includes(v));
    const added = after.filter(v => !before.includes(v));
    if (removed.length === 0 && added.length === 0) return 'neutral';
    if (removed.length > 0 && added.length > 0) return 'mixed';
    return removed.length > 0 ? 'relax' : 'tighten';
  }

  // 不认识的字段一律按放宽处理：宁可多要一次认证，也不能让新字段成为静默后门
  if (from !== to) return 'relax';
  return 'neutral';
}

/**
 * 把一组字段方向归并成一个整体方向
 *
 * 只要存在任一放宽（含 mixed），整体就是放宽 —— 这是 fail-safe 的方向：
 * 认证成本由"最危险的那一项"决定，而不是由多数项决定。
 *
 * @param {Array<{direction:string}>} changes
 * @returns {'tighten'|'relax'|'neutral'}
 */
function combineDirection(changes) {
  if (changes.length === 0) return 'neutral';
  if (changes.some(c => c.direction === 'relax' || c.direction === 'mixed')) return 'relax';
  return 'tighten';
}

/**
 * 计算一次 patch 相对当前值的变更方向
 *
 * @param {object} current 当前生效节点（内存中的真相）
 * @param {object} patch 待写入的字段
 * @returns {{direction:'tighten'|'relax'|'neutral', changes:Array<{field:string, from:*, to:*, direction:string}>}}
 */
function diffPatch(current, patch) {
  const changes = [];
  const source = patch && typeof patch === 'object' ? patch : {};

  for (const field of RUNTIME_FIELDS) {
    if (source[field] === undefined) continue;
    const from = current ? current[field] : undefined;
    const to = source[field];
    const direction = directionOfField(field, from, to);
    if (direction === 'neutral') continue;
    changes.push({ field, from, to, direction });
  }

  return { direction: combineDirection(changes), changes };
}

/**
 * 计算两个完整节点之间的变更方向（用于 DB 合并时对照代码基线）
 *
 * 与 diffPatch 的区别：这里比较的是两棵"完整值"，字段缺失按 undefined 参与比较，
 * 因此 DB 里显式删掉某个键也会被算成变更。
 *
 * @param {object} baseline 代码基线节点
 * @param {object} candidate DB 中的节点
 * @returns {{direction:'tighten'|'relax'|'neutral', changes:Array}}
 */
function diffNode(baseline, candidate) {
  const changes = [];
  const base = baseline && typeof baseline === 'object' ? baseline : {};
  const next = candidate && typeof candidate === 'object' ? candidate : {};

  for (const field of RUNTIME_FIELDS) {
    const from = base[field];
    const to = next[field];
    const direction = directionOfField(field, from, to);
    if (direction === 'neutral') continue;
    changes.push({ field, from, to, direction });
  }

  return { direction: combineDirection(changes), changes };
}

/**
 * 稳定序列化：键排序、数组保序、剔除 undefined
 *
 * 签名与 patchHash 都依赖它。用 `JSON.stringify` 直接序列化对象会受键顺序影响，
 * 同一个语义的两次请求可能算出不同摘要，导致签名校验随机失败。
 *
 * @param {*} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const keys = Object.keys(value)
    .filter(k => value[k] !== undefined)
    .sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

/**
 * 取节点的运行时字段快照（用于签名与展示，剔除结构字段与时间戳）
 *
 * @param {object} node
 * @returns {object}
 */
function pickRuntimeFields(node) {
  const out = {};
  for (const field of RUNTIME_FIELDS) {
    if (node && node[field] !== undefined) out[field] = node[field];
  }
  return out;
}

export { RUNTIME_FIELDS, directionOfField, diffPatch, diffNode, canonicalJson, pickRuntimeFields };
