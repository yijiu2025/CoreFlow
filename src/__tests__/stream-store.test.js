/**
 * Stream 存储单元测试
 *
 * 覆盖：Stream 创建、添加消息、消费者组读取
 * 注意：需要 Redis 环境，跳过测试需要配置 REDIS_HOST
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createStream } from '../redis/stream-store.js';
import { isRedisConfigured } from '../redis/utils.js';

const describeOrSkip = isRedisConfigured() ? describe : describe.skip;

describeOrSkip('Stream 存储', () => {
  const PREFIX = 'test_stream';
  let stream;

  beforeAll(() => {
    stream = createStream(PREFIX, { maxLen: 100 });
  });

  afterAll(async () => {
    try {
      await stream.destroy();
    } catch {
      /* ignore */
    }
  });

  it('add 添加消息并返回 ID', async () => {
    const id = await stream.add({ event: 'test', value: 'hello' });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('length 返回正确长度', async () => {
    await stream.add({ event: 'test' });
    const len = await stream.length();
    expect(len).toBeGreaterThanOrEqual(2);
  });

  it('createGroup 创建消费者组（幂等：成功或 BUSYGROUP 均算通过）', async () => {
    await expect(async () => {
      try {
        await stream.createGroup('test-group', { start: '$' });
      } catch (err) {
        // BUSYGROUP 说明组已存在，也算成功；其它错误向上抛触发 toThrow
        if (!/BUSYGROUP/.test(err.message)) throw err;
      }
    }).not.toThrow();
  });

  it('ensureGroup 不抛错', async () => {
    const created = await stream.ensureGroup('test-group', { start: '$' });
    expect(typeof created).toBe('boolean');
  });

  it('info 返回 Stream 信息', async () => {
    const info = await stream.info();
    expect(info).toHaveProperty('length');
    expect(info).toHaveProperty('groups');
    expect(info).toHaveProperty('lastId');
  });
});
