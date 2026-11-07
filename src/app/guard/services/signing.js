/**
 * 放宽配置的签名信封
 *
 * ── 解决什么问题 ──
 * 守卫配置有三个写入入口：面板 PATCH、直接改 DB、进程启动时读 DB 合并。
 * 面板那条路有鉴权与二次认证，但 **DB 那条路绕过了全部鉴权** ——
 * 一句 `UPDATE guard_configs SET config = ...` 就能把某个组的角色门槛清空。
 *
 * 做法：放宽方向的值在写入时必须附带服务端签发的 HMAC 签名（`_relaxation`）。
 * 启动/同步合并时验签，签名不符就**忽略该节点并告警**。
 * 于是：
 *   - 面板改的 → 服务端签名 → 生效
 *   - SQL 直改的 → 没有签名（或签名覆盖不到新值）→ 不生效
 *   - 应急改配置 → 用脚本生成带签名的记录 → 生效且留痕
 *
 * ── 密钥 ──
 * 由 `APP_SECRET` 派生（`APP_SECRET` 生产已强校验 ≥32 位，见 framework/config/env.js）。
 * 用独立的派生域字符串做密钥分离，避免与 AES 加密共用同一把子密钥。
 * 轮换 APP_SECRET 会让旧签名全部失效 → 放宽项回落代码基线（方向更严），
 * 启动时会逐条告警，运维重新授权即可，不会静默放开。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import crypto from 'node:crypto';
import { canonicalJson, pickRuntimeFields } from './direction.js';

/** 签名信封版本（将来换算法时用它做区分，旧版本可保留验签逻辑） */
const ENVELOPE_VERSION = 1;

/** APP_SECRET 最小长度，与 framework/config/env.js 的判据一致 */
const MIN_SECRET_LENGTH = 32;

/** 签名域分隔：同一把 APP_SECRET 派生出只用于本用途的子密钥 */
const KEY_DOMAIN = 'coreflow/guard-relaxation/v1';

/** 派生后的子密钥（首次使用时计算并缓存） */
let cachedKey = null;

/**
 * 取签名子密钥
 *
 * @returns {Buffer|null} 未配置 APP_SECRET 时返回 null（调用方按 fail-closed 处理）
 */
function getKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.APP_SECRET || '';
  if (secret.length < MIN_SECRET_LENGTH) return null;
  cachedKey = crypto.createHmac('sha256', secret).update(KEY_DOMAIN).digest();
  return cachedKey;
}

/** 签名能力是否可用（生产环境恒为 true；本地未配 APP_SECRET 时为 false） */
function isSigningAvailable() {
  return getKey() !== null;
}

/**
 * 构造待签名内容
 *
 * 覆盖：目标路径、该节点的全部运行时字段、操作者、时间、原因。
 * **字段值参与签名**是关键 —— 签名后再改任何一个运行时字段都会失配，
 * 因此不存在"签一次名，之后随便改"的空间。
 *
 * @param {object} params
 * @param {string} params.path 目标路径（`system/group/apiKey`）
 * @param {object} params.node 写入后的节点（只取运行时字段）
 * @param {string} params.at ISO 时间
 * @param {string} params.by 操作者 uid
 * @param {string} params.reason 放宽原因
 * @returns {string}
 */
function buildPayload({ path, node, at, by, reason }) {
  return canonicalJson({
    v: ENVELOPE_VERSION,
    path: String(path || ''),
    fields: pickRuntimeFields(node),
    at: String(at || ''),
    by: String(by || ''),
    reason: String(reason || '')
  });
}

/**
 * 签发放宽信封
 *
 * @param {object} params 见 buildPayload
 * @returns {object} 可直接挂在配置节点上的 `_relaxation`
 * @throws {Error} APP_SECRET 未配置时（不允许在无密钥环境下产生"看似合法"的放宽）
 */
function signRelaxation({ path, node, at, by, reason }) {
  const key = getKey();
  if (!key) {
    throw new Error('RELAXATION_SIGNING_UNAVAILABLE:APP_SECRET 未配置或长度不足，无法签发放宽签名');
  }

  const payload = buildPayload({ path, node, at, by, reason });
  const sig = crypto.createHmac('sha256', key).update(payload).digest('hex');

  return {
    v: ENVELOPE_VERSION,
    at,
    by,
    reason,
    fields: Object.keys(pickRuntimeFields(node)),
    sig
  };
}

/**
 * 校验节点上的放宽信封
 *
 * @param {string} path 目标路径
 * @param {object} node DB 中的节点（含 `_relaxation`）
 * @returns {{ok:boolean, code?:string, reason?:string}}
 */
function verifyRelaxation(path, node) {
  const envelope = node?._relaxation;
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, code: 'MISSING_SIGNATURE', reason: '放宽变更缺少签名信封' };
  }
  if (envelope.v !== ENVELOPE_VERSION) {
    return { ok: false, code: 'UNSUPPORTED_VERSION', reason: `签名信封版本不受支持: ${envelope.v}` };
  }

  const key = getKey();
  if (!key) {
    return { ok: false, code: 'SIGNING_UNAVAILABLE', reason: 'APP_SECRET 未配置，无法校验放宽签名' };
  }

  const payload = buildPayload({
    path,
    node,
    at: envelope.at,
    by: envelope.by,
    reason: envelope.reason
  });
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  const actual = String(envelope.sig || '');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(actual, 'utf8');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, code: 'SIGNATURE_MISMATCH', reason: '签名与当前字段值不符（值可能被绕过面板直接改写）' };
  }

  return { ok: true };
}

export { ENVELOPE_VERSION, signRelaxation, verifyRelaxation, isSigningAvailable, buildPayload };
