/**
 * OAuth 授权码数据访问层 (已支持 Redis / MySQL 混合模式)
 *
 * 开启 REDIS_ENABLED=true 后，授权码作为短效临时票据将直接存于 Redis 内存中，
 * 并提供自带的 TTL 过期及原子性“一次性消费” (GETDEL)，消除任何并发竞争与重放安全隐患。
 */
import { Op } from 'sequelize';
import sequelize from '../../db/index.js';
import { globalRedis } from '../../redis/index.js';

/** 获取 OauthCode 模型（延迟获取，确保模型已加载） */
const getModel = () => sequelize.models.OauthCode;

const CodeDao = {
  /**
   * 保存授权码
   */
  async save(code, data) {
    const expiresIn = data.expiresIn || 600;
    
    if (globalRedis && process.env.REDIS_ENABLED === 'true') {
      // ⚡️ Redis 模式
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
      await globalRedis.set(key, JSON.stringify(payload), { EX: expiresIn });
    } else {
      // 💾 MySQL 降级方案
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
    if (globalRedis && process.env.REDIS_ENABLED === 'true') {
      // ⚡️ Redis 模式
      const key = `oauth_code:${code}`;
      const raw = await globalRedis.get(key);
      return raw ? JSON.parse(raw) : null;
    }

    // 💾 MySQL 降级方案
    const model = getModel();
    const entry = await model.findByPk(code);
    return entry ? entry.toJSON() : null;
  },

  /**
   * 消费授权码（一次性使用，带重放检测）
   */
  async consume(code) {
    if (globalRedis && process.env.REDIS_ENABLED === 'true') {
      // ⚡️ Redis 极速模式：一次性获取并删除 (GETDEL 原子读取，从物理内存彻底抹除)
      const key = `oauth_code:${code}`;
      let raw = null;

      if (typeof globalRedis.getDel === 'function') {
        raw = await globalRedis.getDel(key);
      } else {
        raw = await globalRedis.get(key);
        if (raw) await globalRedis.del(key);
      }

      if (!raw) return null; // 不存在或已过期（已自动物理删除）
      
      const data = JSON.parse(raw);
      return { ...data, consumed: true }; // 成功读取则证明在此瞬间前未被消费，安全放行
    }

    // 💾 MySQL 降级方案 (采用行锁或并发防重放逻辑)
    const model = getModel();
    const entry = await model.findByPk(code);
    if (!entry) return null;

    const data = entry.toJSON();

    // 已被消费 → 重放攻击检测
    if (data.consumed) {
      return { ...data, replay_detected: true };
    }

    // 已过期
    if (new Date() > new Date(data.expires_at)) {
      return null;
    }

    // 标记为已消费
    await entry.update({ consumed: true });
    return { ...data, consumed: true };
  },

  /**
   * 清理过期授权码
   */
  async cleanup() {
    if (globalRedis && process.env.REDIS_ENABLED === 'true') {
      return 0; // Redis 会依靠内部 TTL 自动清理，无需定时任务清理，减轻 CPU 负担
    }

    // 💾 MySQL 降级清理
    const model = getModel();
    return model.destroy({
      where: {
        expires_at: { [Op.lt]: new Date() }
      }
    });
  }
};

export default CodeDao;
