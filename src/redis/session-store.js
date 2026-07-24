/**
 * 统一会话管理模块 (Session Store)
 * 提供对 Redis 的封装，同时在没有 Redis 的环境下自动使用 Map 进行内存降级兜底。
 * 建议全局引入，统一管理各种临时状态（如验证码、登录凭证、扫码状态等）
 *
 * @author yijiu2025
 * @since 2026-07-24
 */

/* eslint-disable no-console */

/** 前缀 → 数据库编号映射表 */
const prefixDbMap = new Map();

/** 内存降级最大条目数，防止 DoS 耗尽内存 */
const MAX_MEMORY_ENTRIES = 10000;

/**
 * 根据前缀的哈希值分配数据库编号
 * 哈希算法确保：同前缀始终返回同一编号，重启后依然一致
 */
function getDbForPrefix(prefix) {
  if (!prefixDbMap.has(prefix)) {
    // djb2 哈希算法：将字符串映射到 1-15 的数据库编号（0 保留给默认）
    let hash = 5381;
    for (const ch of prefix) hash = (hash << 5) + hash + ch.charCodeAt(0);
    prefixDbMap.set(prefix, (Math.abs(hash) % 15) + 1);
  }
  return prefixDbMap.get(prefix);
}

/**
 * 统一会话管理适配器
 * @param {import('fastify').FastifyInstance} fastify fastify 实例，用于访问 fastify.redis
 * @param {string} prefix Redis Key 前缀 (默认为 session)
 * @returns {{ get: (key: string) => Promise<any>, set: (key: string, value: any, ttl?: number) => Promise<void>, delete: (key: string) => Promise<void>, destroy: () => void }}
 */
export const getSessionStore = (fastify, prefix = 'session') => {
  /** 简易会话存储（兜底方案） */
  const localSessions = new Map();

  /** 缓存 Redis 连接，避免每次操作都异步获取 */
  let _redisCache = null;

  /** 定期清理内存中的过期 Key，防止内存泄漏 (10分钟执行一次) */
  const cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [k, v] of localSessions.entries()) {
        if (v.expiredAt && v.expiredAt < now) {
          localSessions.delete(k);
        }
      }
    },
    10 * 60 * 1000
  );
  cleanupInterval.unref();

  /** 清理定时器和内存（用于优雅关闭） */
  function destroy() {
    clearInterval(cleanupInterval);
    localSessions.clear();
  }

  /** 获取指定数据库的 Redis 连接，自动分配数据库编号（结果缓存） */
  async function getRedis() {
    if (_redisCache) return _redisCache;
    const db = getDbForPrefix(prefix);
    _redisCache = fastify.redisDb ? await fastify.redisDb(db) : fastify.redis;
    return _redisCache;
  }

  return {
    async get(key) {
      const fullKey = `${prefix}:${key}`;
      const redis = await getRedis();

      if (redis) {
        try {
          const raw = await redis.get(fullKey);
          return raw ? JSON.parse(raw) : null;
        } catch (err) {
          console.warn(`⚠️ [Session] Redis 读取失败 (db${getDbForPrefix(prefix)}), 降级到内存: ${err.message}`);
        }
      }

      const data = localSessions.get(fullKey);
      if (data && data.expiredAt && data.expiredAt < Date.now()) {
        localSessions.delete(fullKey);
        return null;
      }
      return data ? data.value : null;
    },

    async set(key, value, ttl = 600) {
      const fullKey = `${prefix}:${key}`;
      const redis = await getRedis();

      if (redis) {
        try {
          await redis.set(fullKey, JSON.stringify(value), { EX: ttl });
          return;
        } catch (err) {
          console.warn(`⚠️ [Session] Redis 写入失败 (db${getDbForPrefix(prefix)}), 降级到内存: ${err.message}`);
        }
      }

      localSessions.set(fullKey, { value, expiredAt: Date.now() + ttl * 1000 });
      // 内存降级上限保护：超过最大条目时丢弃最旧的一半
      if (localSessions.size > MAX_MEMORY_ENTRIES) {
        const entries = [...localSessions.entries()].sort((a, b) => a[1].expiredAt - b[1].expiredAt);
        const toDelete = Math.floor(entries.length / 2);
        for (let i = 0; i < toDelete; i++) localSessions.delete(entries[i][0]);
      }
    },

    async delete(key) {
      const fullKey = `${prefix}:${key}`;
      const redis = await getRedis();

      if (redis) {
        try {
          await redis.del(fullKey);
          return;
        } catch (err) {
          console.warn(`⚠️ [Session] Redis 删除失败 (db${getDbForPrefix(prefix)}), 降级到内存: ${err.message}`);
        }
      }

      localSessions.delete(fullKey);
    },

    destroy
  };
};
