/**
 * 临时密码服务
 *
 * 用途：管理员在排障 / 交接时，为某个账号签发一个**短时、一次性**的登录凭据，
 * 而不是去改用户密码（改密码等于永久接管，且用户本人会立刻发现"我的密码变了"）。
 *
 * 约束（全部是安全要求，不是可选项）：
 * - 明文只在签发响应里出现一次，库里只留 bcrypt 哈希；
 * - 默认 30 分钟失效、1 次可用；
 * - 签发时作废该用户此前的全部临时密码（否则"发过的每一个"都还能用）；
 * - 每次使用都记 `last_used_at` 并自增次数，用满即失效；
 * - 签发与使用都写审计（谁给谁开的、谁用它登录了）。
 *
 * @author yijiu2025
 * @since 2026-11-11
 */
import { hashPassword, verifyPassword } from '../../../framework/security/auth/index.js';
import tempPasswordDao, { generatePlainPassword } from '../dao/temp-password.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.user.services.temp-password');

/** 默认有效期（分钟） */
const DEFAULT_TTL_MINUTES = 30;

/** 有效期上限（分钟）—— 再长就不叫"临时"了 */
const MAX_TTL_MINUTES = 24 * 60;

class TempPasswordService {
  /**
   * 签发临时密码
   *
   * @param {object} params 参数
   * @param {number} params.userId 目标用户 ID
   * @param {object} params.actor 签发人（{ id, username }）
   * @param {number} [params.ttlMinutes] 有效期（分钟）
   * @param {number} [params.maxUses] 可用次数
   * @param {string} [params.reason] 原因
   * @returns {Promise<{id: number, password: string, expiresAt: Date, maxUses: number}>} 结果（明文只此一次）
   */
  async issue({ userId, actor, ttlMinutes = DEFAULT_TTL_MINUTES, maxUses = 1, reason }) {
    const minutes = normalizeTtl(ttlMinutes);
    const uses = normalizeUses(maxUses);

    // 先作废旧密码：否则用户手里可能同时握着好几张有效凭据
    const revoked = await tempPasswordDao.revokeAllByUser(userId);

    const plain = generatePlainPassword();
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    const row = await tempPasswordDao.create({
      userId,
      passwordHash: await hashPassword(plain),
      expiresAt,
      maxUses: uses,
      createdBy: actor?.id ?? null,
      createdByName: actor?.username ?? null,
      reason: reason ?? null
    });

    log.info(
      `🔑 [TempPassword] 用户 ${userId} 由 ${actor?.username || '未知'} 签发临时密码，` +
        `${minutes} 分钟 / ${uses} 次（作废旧记录 ${revoked} 条）`
    );

    return { id: Number(row.id), password: plain, expiresAt, maxUses: uses };
  }

  /**
   * 校验临时密码（登录时真实密码不匹配才走到这里）
   *
   * @param {number} userId 用户 ID
   * @param {string} plain 待校验明文
   * @returns {Promise<{ok: boolean, id?: number, usedCount?: number, maxUses?: number}>} 结果
   */
  async verify(userId, plain) {
    if (!plain) return { ok: false };
    const candidates = await tempPasswordDao.findActiveByUser(userId);
    for (const row of candidates) {
      if (!(await verifyPassword(plain, row.password_hash))) continue;

      // 命中后再原子消费：并把"还剩次数"放进 WHERE，两个并发请求只有一个能成功
      const consumed = await tempPasswordDao.consume(row.id);
      if (!consumed) continue;
      return {
        ok: true,
        id: Number(row.id),
        usedCount: Number(row.used_count) + 1,
        maxUses: Number(row.max_uses)
      };
    }
    return { ok: false };
  }

  /**
   * 当前有效的临时密码（管理端展示）
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<object[]>} 记录（不含哈希与明文）
   */
  async listActive(userId) {
    return tempPasswordDao.listActive(userId);
  }

  /**
   * 作废某用户全部临时密码
   *
   * @param {number} userId 用户 ID
   * @returns {Promise<number>} 作废条数
   */
  async revokeAll(userId) {
    return tempPasswordDao.revokeAllByUser(userId);
  }

  /**
   * 清理过期记录（定时任务）
   *
   * @param {number} [retentionDays=7] 过期后再保留的天数（审计窗口）
   * @returns {Promise<number>} 删除条数
   */
  async prune(retentionDays = 7) {
    return tempPasswordDao.pruneExpired(retentionDays);
  }
}

/**
 * 归一化有效期
 *
 * @param {*} value 入参
 * @returns {number} 分钟（1 ~ MAX_TTL_MINUTES）
 */
function normalizeTtl(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(Math.floor(n), MAX_TTL_MINUTES);
}

/**
 * 归一化可用次数
 *
 * @param {*} value 入参
 * @returns {number} 次数（1 ~ 10）
 */
function normalizeUses(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(Math.floor(n), 10);
}

const tempPasswordService = new TempPasswordService();

export { DEFAULT_TTL_MINUTES, MAX_TTL_MINUTES };
export default tempPasswordService;
