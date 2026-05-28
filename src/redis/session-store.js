/**
 * 统一会话管理模块 (Session Store)
 * 提供对 Redis 的封装，同时在没有 Redis 的环境下自动使用 Map 进行内存降级兜底。
 * 建议全局引入，统一管理各种临时状态（如验证码、登录凭证、扫码状态等）
 */

/** 简易会话存储（兜底方案） */
const localSessions = new Map();

/**
 * 定期清理内存中的过期 Key，防止内存泄漏 (10分钟执行一次)
 */
setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of localSessions.entries()) {
      if (v.expiredAt && v.expiredAt < now) {
        localSessions.delete(k);
      }
    }
  },
  10 * 60 * 1000
).unref();

/**
 * 统一会话管理适配器
 * @param {import('fastify').FastifyInstance} fastify fastify 实例，用于访问 fastify.redis
 * @param {string} prefix Redis Key 前缀 (默认为 session)
 * @returns {object} 包含 get, set, delete 方法的 store 对象
 */
export const getSessionStore = (fastify, prefix = 'session') => ({
  /**
   * 获取会话
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    const fullKey = `${prefix}:${key}`;

    if (fastify.redis) {
      try {
        const raw = await fastify.redis.get(fullKey);
        return raw ? JSON.parse(raw) : null;
      } catch {
        // Redis 故障时降级到内存
        const data = localSessions.get(fullKey);
        if (data && data.expiredAt && data.expiredAt < Date.now()) {
          localSessions.delete(fullKey);
          return null;
        }
        return data ? data.value : null;
      }
    }

    const data = localSessions.get(fullKey);
    if (data && data.expiredAt && data.expiredAt < Date.now()) {
      localSessions.delete(fullKey);
      return null;
    }
    return data ? data.value : null;
  },

  /**
   * 设置会话
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - 过期时间（秒），默认 600 秒 (10分钟)
   * @returns {Promise<void>}
   */
  async set(key, value, ttl = 600) {
    const fullKey = `${prefix}:${key}`;

    if (fastify.redis) {
      try {
        await fastify.redis.set(fullKey, JSON.stringify(value), { EX: ttl });
        return;
      } catch {
        // Redis 故障时降级到内存
      }
    }

    localSessions.set(fullKey, { value, expiredAt: Date.now() + ttl * 1000 });
  },

  /**
   * 删除会话
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    const fullKey = `${prefix}:${key}`;

    if (fastify.redis) {
      try {
        await fastify.redis.del(fullKey);
        return;
      } catch {
        // Redis 故障时降级到内存
      }
    }

    localSessions.delete(fullKey);
  }
});
