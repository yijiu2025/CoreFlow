/**
 * Redis Stream 消息队列
 *
 * 基于 Redis Stream 的可靠消息队列，支持消费者组、消息 ACK、消息持久化。
 * 相比 List 队列，Stream 支持：
 * - 消费者组：一条消息只被组内一个消费者消费
 * - 消息 ACK：消费成功才确认，失败可重试
 * - 消息持久化：Redis 重启后数据不丢失
 * - 历史回溯：从头开始消费历史消息
 *
 * 适用场景：邮件队列、审计日志流、事件总线、任务调度
 *
 * @example
 * const stream = createStream('notify', { maxLen: 10000 });
 *
 * // 生产者
 * await stream.add({ email: 'user@example.com', subject: 'Hello' });
 *
 * // 消费者组（先创建组，再消费）
 * await stream.createGroup('email-sender', { start: '$' });
 * const msgs = await stream.readGroup('email-sender', 'consumer-1', { count: 10 });
 * for (const msg of msgs) {
 *   console.log(msg.data);
 *   await stream.ack('email-sender', msg.id);
 * }
 *
 * @author yijiu2025
 * @since 2026-08-06
 */

import { getStore } from './get-store.js';
import { isRedisConfigured } from './utils.js';

/**
 * 创建 Stream 消息队列
 * @param {string} prefix - 队列命名空间
 * @param {object} [options]
 * @param {number} [options.maxLen=10000] - 最大长度，超限时自动裁剪旧消息
 * @param {number} [options.timeout=5000] - Redis 操作超时（毫秒）
 * @returns {object} Stream 操作对象
 */
function createStream(prefix, options = {}) {
  const { maxLen = 10000, timeout = 5000 } = options;

  if (!isRedisConfigured()) {
    throw new Error(`Stream[${prefix}]: Redis 未配置，Stream 需要 Redis 支持`);
  }

  const store = getStore(prefix, { timeout, backup: true });

  /**
   * 构建完整的 Stream key
   */
  function _key(sub) {
    return sub ? `${prefix}:${sub}` : prefix;
  }

  return {
    /**
     * 添加消息到 Stream
     * @param {object} data - 消息内容（扁平对象，字段值必须是字符串）
     * @param {string} [id='*'] - 消息 ID，'*' 由 Redis 自动生成
     * @returns {Promise<string>} 消息 ID
     */
    async add(data, id = '*') {
      return store.call(client => client.xAdd(_key('stream'), id, data, { MAXLEN: { approx: maxLen } }), timeout);
    },

    /**
     * 创建消费者组
     * @param {string} group - 消费者组名称
     * @param {object} [options]
     * @param {'$'|'0'|string} [options.start='$'] - 起始位置：'$' 仅新消息，'0' 从头开始
     * @throws {Error} 组已存在时抛错
     */
    async createGroup(group, options = {}) {
      const { start = '$' } = options;
      // XGROUP CREATE 在组已存在时抛错，调用方需 catch
      return store.call(client => client.xGroupCreate(_key('stream'), group, start), timeout);
    },

    /**
     * 创建消费者组（不存在时才创建）
     * @param {string} group - 消费者组名称
     * @param {object} [options]
     * @param {'$'|'0'|string} [options.start='$'] - 起始位置
     * @returns {Promise<boolean>} true = 新建，false = 已存在
     */
    async ensureGroup(group, options = {}) {
      try {
        await this.createGroup(group, options);
        return true;
      } catch (err) {
        if (err.message?.includes('BUSYGROUP')) return false;
        throw err;
      }
    },

    /**
     * 从消费者组读取消息
     * @param {string} group - 消费者组名称
     * @param {string} consumer - 消费者名称
     * @param {object} [options]
     * @param {number} [options.count=10] - 最多返回条数
     * @param {number} [options.block=0] - 阻塞等待毫秒，0 不阻塞
     * @returns {Promise<Array<{ id: string, data: object }>>}
     */
    async readGroup(group, consumer, options = {}) {
      const { count = 10, block = 0 } = options;
      const result = await store.call(
        client => client.xReadGroup(group, consumer, { key: _key('stream'), id: '>' }, { COUNT: count, BLOCK: block }),
        timeout + (block || 0)
      );
      if (!result || result.length === 0) return [];
      // 解析返回格式：[[key, [{ id, message: { field, value, ... } }]]]
      const messages = result[0]?.messages || [];
      return messages.map(m => ({
        id: m.id,
        data: m.message || {}
      }));
    },

    /**
     * 确认消息已消费
     * @param {string} group - 消费者组名称
     * @param {string|string[]} id - 消息 ID 或 ID 数组
     * @returns {Promise<number>} 确认的消息数
     */
    async ack(group, id) {
      const ids = Array.isArray(id) ? id : [id];
      return store.call(client => client.xAck(_key('stream'), group, ...ids), timeout);
    },

    /**
     * 获取待处理消息（未 ACK 或已超时）
     * @param {string} group - 消费者组名称
     * @param {object} [options]
     * @param {string} [options.start='-'] - 起始 ID
     * @param {string} [options.end='+'] - 结束 ID
     * @param {number} [options.count=10] - 返回条数
     * @param {string} [options.consumer] - 按消费者过滤
     * @returns {Promise<Array<{ id: string, consumer: string, delivered: number, data: object }>>}
     */
    async pending(group, options = {}) {
      const { start = '-', end = '+', count = 10, consumer } = options;
      const result = await store.call(
        client => client.xPendingRange(_key('stream'), group, start, end, count, consumer),
        timeout
      );
      return (result || []).map(item => ({
        id: item.id,
        consumer: item.consumer,
        delivered: item.delivered,
        data: {}
      }));
    },

    /**
     * 认领超时的待处理消息（取回重试）
     * @param {string} group - 消费者组名称
     * @param {string} consumer - 目标消费者
     * @param {number} minIdle - 最小空闲时间（毫秒），超过此时间算超时
     * @param {string|string[]} id - 消息 ID 或 ID 数组
     * @returns {Promise<Array<{ id: string, data: object }>>}
     */
    async claim(group, consumer, minIdle, id) {
      const ids = Array.isArray(id) ? id : [id];
      const result = await store.call(
        client => client.xClaim(_key('stream'), group, consumer, minIdle, ...ids),
        timeout
      );
      return (result || []).map(m => ({
        id: m.id,
        data: m.message || {}
      }));
    },

    /**
     * 获取 Stream 长度
     * @returns {Promise<number>}
     */
    async length() {
      return store.call(client => client.xLen(_key('stream')), timeout);
    },

    /**
     * 裁剪 Stream（删除旧消息）
     * @param {number} [maxLen] - 保留的最大长度，默认使用构造时的 maxLen
     * @returns {Promise<number>} 删除的消息数
     */
    async trim(maxLenOverride) {
      const len = maxLenOverride ?? maxLen;
      return store.call(client => client.xTrim(_key('stream'), 'MAXLEN', { approx: len }), timeout);
    },

    /**
     * 删除 Stream（销毁所有数据）
     * @returns {Promise<void>}
     */
    async destroy() {
      await store.call(client => client.del(_key('stream')), timeout);
    },

    /**
     * 获取 Stream 信息
     * @returns {Promise<{ length: number, groups: number, lastId: string }>}
     */
    async info() {
      const raw = await store.call(client => client.xInfoStream(_key('stream')), timeout);
      return {
        length: raw.length,
        groups: raw['groups'] || 0,
        lastId: raw['last-generated-id'] || '0-0'
      };
    }
  };
}

export { createStream };
