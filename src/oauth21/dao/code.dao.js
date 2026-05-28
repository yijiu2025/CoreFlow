/**
 * OAuth 授权码数据访问层 (已支持 Redis / MySQL 混合模式)
 *
 * 授权码作为短效临时票据将直接存于 Redis 内存中，
 * 并提供自带的 TTL 过期及原子性"一次性消费" (GETDEL)，消除任何并发竞争与重放安全隐患。
 * Redis 不可用时自动降级到 MySQL。
 */
import { Op } from 'sequelize';
import sequelize from '../../db/index.js';
import { globalRedis } from '../../redis/index.js';

/** 获取当前可用的 Redis 客户端（null 表示降级到 MySQL） */
function getRedis() {
  return globalRedis;
}

/** 获取 OauthCode 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthCode;

const CodeDao = {
  /**
   * 保存授权码
   */
  async save(code, data) {
    const expiresIn = data.expiresIn || 600;
    const redis = getRedis();

    if (redis) {
      const key = `oauth_code:${code}`;
      const payload = {
        code,
        client_id: data.client_id,
        sub: data.sub,
        redirect_uri: data.redirect_uri,
        scope: data.scope,
        code_challenge: data.code_challenge,
        code_challenge_method: data.code_challenge_method || 'S256',
        nonce: data.nonce,
        consumed: false,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
      };
      await redis.set(key, JSON.stringify(payload), { EX: expiresIn });
    } else {
      const model = getModel();
      await model.create({
        code,
        client_id: data.client_id,
        sub: data.sub,
        redirect_uri: data.redirect_uri,
        scope: data.scope,
        code_challenge: data.code_challenge,
        code_challenge_method: data.code_challenge_method || 'S256',
        nonce: data.nonce,
        consumed: false,
        expires_at: new Date(Date.now() + expiresIn * 1000)
      });
    }
  },

  /**
   * 查找授权码（不消耗）
   */
  async find(code) {
    const redis = getRedis();

    if (redis) {
      const key = `oauth_code:${code}`;
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    }

    const model = getModel();
    const entry = await model.findByPk(code);
    return entry ? entry.toJSON() : null;
  },

  /**
   * 消费授权码（一次性使用，带重放检测）
   */
  async consume(code) {
    const redis = getRedis();

    if (redis) {
      const key = `oauth_code:${code}`;
      let raw;

      if (typeof redis.getDel === 'function') {
        raw = await redis.getDel(key);
      } else {
        raw = await redis.get(key);
        if (raw) await redis.del(key);
      }

      if (!raw) return null;

      const data = JSON.parse(raw);
      return { ...data, consumed: true };
    }

    const model = getModel();
    const entry = await model.findByPk(code);
    if (!entry) return null;

    const data = entry.toJSON();

    if (data.consumed) {
      return { ...data, replay_detected: true };
    }

    if (new Date() > new Date(data.expires_at)) {
      return null;
    }

    await entry.update({ consumed: true });
    return { ...data, consumed: true };
  },

  /**
   * 清理过期授权码
   */
  async cleanup() {
    if (getRedis()) {
      return 0; // Redis TTL 自动清理
    }

    const model = getModel();
    return model.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() }
      }
    });
  }
};

export default CodeDao;
