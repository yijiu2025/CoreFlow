/**
 * Nonce 去重存储（Redis + 内存降级）
 * 用于 RSA 加密登录的防重放校验，支持多实例部署
 *
 * 核心安全设计：check 和 mark 合并为原子操作，消除并发窗口
 */

const PREFIX = 'nonce:';
const DEFAULT_TTL = 60; // 秒

/** 内存清理每次最大扫描条目数 */
const CLEANUP_BATCH_SIZE = 1000;

/**
 * Lua 脚本：原子性 check + mark
 * 如果 nonce 不存在则写入并返回 0（首次使用）
 * 如果 nonce 已存在则返回 1（重放攻击）
 */
const CHECK_AND_MARK_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SETEX', KEYS[1], tonumber(ARGV[1]), '1')
  return 0
else
  return 1
end
`;

/**
 * 创建 Nonce 存储实例
 * @param {import('redis').RedisClientType} redisClient - Redis 客户端实例（可为 null，自动降级到内存）
 * @param {number} ttlSeconds - Nonce 过期时间（秒）
 * @returns {{ check: (nonce: string) => Promise<boolean>, mark: (nonce: string) => Promise<void>, checkAndMark: (nonce: string) => Promise<boolean> }}
 */
export function createNonceStore(redisClient, ttlSeconds = DEFAULT_TTL) {
  // 内存降级：Map + 分批定时清理
  const memoryNonces = new Map();
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - ttlSeconds * 1000;
    let cleaned = 0;
    for (const [nonce, ts] of memoryNonces) {
      if (ts < cutoff) {
        memoryNonces.delete(nonce);
        if (++cleaned >= CLEANUP_BATCH_SIZE) break;
      }
    }
  }, ttlSeconds * 1000);
  cleanupInterval.unref();

  return {
    /**
     * 检查 nonce 是否已使用（仅查询，不标记）
     * @param {string} nonce
     * @returns {Promise<boolean>} true = 已重复，应拒绝
     */
    async check(nonce) {
      if (redisClient) {
        try {
          const exists = await redisClient.exists(`${PREFIX}${nonce}`);
          return exists === 1;
        } catch {
          return memoryNonces.has(nonce);
        }
      }
      return memoryNonces.has(nonce);
    },

    /**
     * 标记 nonce 为已使用
     * @param {string} nonce
     */
    async mark(nonce) {
      if (redisClient) {
        try {
          await redisClient.set(`${PREFIX}${nonce}`, '1', { EX: ttlSeconds });
          return;
        } catch {
          // 降级到内存
        }
      }
      memoryNonces.set(nonce, Date.now());
    },

    /**
     * 原子性检查并标记（推荐使用）
     * 消除 check + mark 之间的并发窗口，防止重放攻击
     * @param {string} nonce
     * @returns {Promise<boolean>} true = 已重复（重放），false = 首次使用
     */
    async checkAndMark(nonce) {
      if (redisClient) {
        try {
          const result = await redisClient.eval(CHECK_AND_MARK_SCRIPT, {
            keys: [`${PREFIX}${nonce}`],
            arguments: [String(ttlSeconds)]
          });
          return result === 1;
        } catch {
          // Redis 故障时降级到内存原子操作
        }
      }

      // 内存模式：同步操作天然原子
      if (memoryNonces.has(nonce)) {
        return true;
      }
      memoryNonces.set(nonce, Date.now());
      return false;
    }
  };
}
