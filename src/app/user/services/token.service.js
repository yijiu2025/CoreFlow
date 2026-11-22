/**
 * 个人 API 令牌服务
 *
 * 生命周期：签发（明文只回一次）→ 校验（按 sha256 查、写 last_used_at）→ 吊销（软删）。
 *
 * 为什么不用 bcrypt：
 * 令牌是 32 字节随机数，熵足够，sha256 已能防"库被读走后反推明文"；
 * bcrypt 每次校验要几十毫秒，给脚本高频调用会造成不必要的 CPU 开销。
 * 密码是**人选的低熵字符串**才需要慢哈希 —— 两类凭据的威胁模型不同。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import crypto from 'node:crypto';
import {
  listActiveByUser,
  countActiveByUser,
  createRow,
  findActiveByHash,
  revokeById,
  touchLastUsed
} from '../dao/api-token.js';
import { SCOPE_REGISTRY } from '../../oauth21/config/scope-registry.js';

/** 每个用户最多保留的未吊销令牌数（超出时要求先删旧的） */
const MAX_ACTIVE_TOKENS = 20;

/** prefix 长度：只够界面辨认，不足以缩小暴力猜测空间 */
const PREFIX_LENGTH = 12;

/** 未指定作用域时的默认值：只读公开资料，避免默认发一张大权限令牌 */
const DEFAULT_SCOPES = ['profile'];

/** 有效期上限（天）：再长就不像"可撤销的临时凭据"了 */
const MAX_EXPIRES_DAYS = 3650;

/** 令牌长度上限（天）对应的输入校验：必须是正整数 */
const MIN_EXPIRES_DAYS = 1;

/**
 * 令牌服务错误
 *
 * 路由层据此翻译成 HTTP 状态码；不把内部错误原样回显给调用方。
 */
class TokenServiceError extends Error {
  /**
   * @param {string} message 面向用户的说明
   * @param {number} [statusCode=400] HTTP 状态码
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TokenServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * 生成明文令牌
 *
 * 32 字节 = 256 位熵；base64url 无 `+ / =`，可直接放进 Header / URL，不用二次转义。
 *
 * @returns {string} 明文令牌
 */
function generatePlainToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * 计算令牌哈希
 *
 * @param {string} plain 明文令牌
 * @returns {string} sha256 十六进制（64 字符）
 */
function hashToken(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

/**
 * 可供前端展示的令牌字段
 *
 * 白名单式返回：新增列（比如以后的备注、IP 限制）不会因为"忘了排除"而泄漏；
 * `token_hash` 永远不在这里。
 *
 * @param {object} row Sequelize 实例
 * @returns {object} 公开字段
 */
function toPublicRow(row) {
  const expiresAt = row.expires_at || null;
  return {
    id: Number(row.id),
    name: row.name,
    prefix: row.prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    lastUsedAt: row.last_used_at || null,
    expiresAt,
    createdAt: row.createdAt || row.created_at || null,
    // 过期与否交给前端显示，但判定口径只在服务端这一份
    expired: Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now())
  };
}

/**
 * 作用域候选（前端多选）
 *
 * 直接复用 oauth21 的 scope 注册表：个人令牌能声明的作用域与 OIDC 授权页保持同一套口径，
 * 不在前端另写一份（两边漂移时，用户会以为令牌能拿到某个字段，实际拿不到）。
 *
 * @returns {Array<{id: string, label: string, description: string, required: boolean}>} 候选
 */
function listScopeOptions() {
  return Object.entries(SCOPE_REGISTRY).map(([id, meta]) => ({
    id,
    label: id,
    description: meta.desc,
    required: Boolean(meta.required)
  }));
}

/**
 * 归一化名称
 *
 * @param {unknown} raw 原始输入
 * @returns {string} 去空白后的名称
 * @throws {TokenServiceError} 为空或超长
 */
function normalizeName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new TokenServiceError('请填写令牌名称');
  if (name.length > 64) throw new TokenServiceError('令牌名称不能超过 64 个字符');
  return name;
}

/**
 * 归一化作用域
 *
 * @param {unknown} raw 原始输入
 * @returns {string[]} 去重后的合法 scope id 列表
 * @throws {TokenServiceError} 格式错误或包含未知 scope
 */
function normalizeScopes(raw) {
  if (raw === undefined || raw === null) return [...DEFAULT_SCOPES];
  if (!Array.isArray(raw)) throw new TokenServiceError('作用域必须是字符串数组');

  const scopes = [];
  for (const item of raw) {
    if (typeof item !== 'string') throw new TokenServiceError('作用域必须是字符串数组');
    const id = item.trim();
    if (!id) continue;
    if (!SCOPE_REGISTRY[id]) throw new TokenServiceError(`未知的作用域：${id}`);
    if (!scopes.includes(id)) scopes.push(id);
  }
  return scopes;
}

/**
 * 归一化有效期
 *
 * @param {unknown} raw 原始输入（天）
 * @returns {number|null} 天数；null 表示不过期
 * @throws {TokenServiceError} 不是 1~3650 的整数
 */
function normalizeExpiresInDays(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < MIN_EXPIRES_DAYS || days > MAX_EXPIRES_DAYS) {
    throw new TokenServiceError(`有效期必须是 ${MIN_EXPIRES_DAYS}~${MAX_EXPIRES_DAYS} 之间的整数（天）`);
  }
  return days;
}

class TokenService {
  /**
   * 当前用户的令牌列表（不含哈希与明文）
   *
   * 只列未吊销的：吊销等价于"删除"，再留在列表里会让用户以为它还能用。
   *
   * @param {number} userId 用户 ID（来自会话，不接受请求参数）
   * @returns {Promise<{tokens: object[], availableScopes: object[], maxTokens: number}>} 列表与作用域候选
   */
  async list(userId) {
    const rows = await listActiveByUser(userId);

    return {
      tokens: rows.map(toPublicRow),
      availableScopes: listScopeOptions(),
      maxTokens: MAX_ACTIVE_TOKENS
    };
  }

  /**
   * 签发令牌
   *
   * 明文只在返回值里出现这一次；库里只写 hash 与前 12 字符 prefix。
   *
   * @param {object} params 参数
   * @param {number} params.userId 用户 ID
   * @param {unknown} params.name 名称
   * @param {unknown} [params.scopes] 作用域
   * @param {unknown} [params.expiresInDays] 有效期（天，可空）
   * @returns {Promise<object>} 公开字段 + `token` 明文 + `warning`
   * @throws {TokenServiceError} 名称/作用域/有效期非法，或未吊销令牌已达上限
   */
  async create({ userId, name, scopes, expiresInDays }) {
    const normalizedName = normalizeName(name);
    const normalizedScopes = normalizeScopes(scopes);
    const days = normalizeExpiresInDays(expiresInDays);

    const active = await countActiveByUser(userId);
    if (active >= MAX_ACTIVE_TOKENS) {
      throw new TokenServiceError(`最多只能保留 ${MAX_ACTIVE_TOKENS} 个未吊销的访问令牌，请先删除不再使用的令牌`);
    }

    const plain = generatePlainToken();
    const row = await createRow({
      user_id: userId,
      name: normalizedName,
      prefix: plain.slice(0, PREFIX_LENGTH),
      token_hash: hashToken(plain),
      scopes: normalizedScopes,
      expires_at: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null,
      last_used_at: null,
      revoked_at: null
    });

    return {
      ...toPublicRow(row),
      token: plain,
      warning: '这串令牌只显示一次'
    };
  }

  /**
   * 吊销令牌（软删除）
   *
   * where 同时带 `id` 与 `user_id`：拿到别人的 id 也改不动，
   * 且"不存在"与"不是你的"返回同一个 404，不泄露别的用户有几条令牌。
   *
   * @param {object} params 参数
   * @param {number} params.userId 用户 ID
   * @param {number} params.id 令牌 ID
   * @returns {Promise<void>}
   * @throws {TokenServiceError} 令牌不存在、不属于该用户或已吊销
   */
  async revoke({ userId, id }) {
    const affected = await revokeById({ userId, id });

    if (affected === 0) throw new TokenServiceError('令牌不存在或已删除', 404);
  }

  /**
   * 校验明文令牌
   *
   * 命中后写 `last_used_at`（失败不写）；过期 / 已吊销一律视为无效。
   * 本期未接入登录认证链路，此方法供后续 Bearer 鉴权与自测使用。
   *
   * @param {string} plain 明文令牌
   * @returns {Promise<{id: number, userId: number, name: string, scopes: string[]}|null>} 命中信息
   */
  async verify(plain) {
    if (typeof plain !== 'string' || !plain) return null;

    const row = await findActiveByHash(hashToken(plain));
    if (!row) return null;

    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;

    await touchLastUsed(row, new Date());

    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      name: row.name,
      scopes: Array.isArray(row.scopes) ? row.scopes : []
    };
  }
}

const tokenService = new TokenService();

export {
  tokenService,
  TokenServiceError,
  generatePlainToken,
  hashToken,
  listScopeOptions,
  MAX_ACTIVE_TOKENS,
  PREFIX_LENGTH
};
export default tokenService;
