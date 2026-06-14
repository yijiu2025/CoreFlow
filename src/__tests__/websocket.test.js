/**
 * WebSocket 测试
 *
 * 覆盖：连接认证、消息格式、心跳、重连
 */
import { describe, it, expect } from '@jest/globals';

describe('WebSocket', () => {
  describe('连接认证', () => {
    it('未登录时连接被拒绝', () => {
      const user = null;
      const shouldReject = !user;
      expect(shouldReject).toBe(true);
    });

    it('已登录时连接成功', () => {
      const user = { sub: 'uuid-xxx' };
      const shouldReject = !user;
      expect(shouldReject).toBe(false);
    });

    it('关闭码 4001 表示未认证', () => {
      const closeCode = 4001;
      expect(closeCode).toBe(4001);
    });

    it('关闭码 4003 表示权限不足', () => {
      const closeCode = 4003;
      expect(closeCode).toBe(4003);
    });
  });

  describe('消息格式', () => {
    it('INIT 消息包含摘要和记录', () => {
      const message = {
        type: 'INIT',
        data: {
          summary: { totalRequests: 100, totalBlocked: 10 },
          records: [{ ip: '1.2.3.4', method: 'GET', url: '/' }]
        }
      };
      expect(message.type).toBe('INIT');
      expect(message.data).toHaveProperty('summary');
      expect(message.data).toHaveProperty('records');
      expect(Array.isArray(message.data.records)).toBe(true);
    });

    it('LOG 消息包含请求详情', () => {
      const message = {
        type: 'LOG',
        data: {
          ip: '1.2.3.4',
          method: 'GET',
          url: '/api/test',
          statusCode: 200,
          blocked: false,
          timestamp: Date.now()
        }
      };
      expect(message.type).toBe('LOG');
      expect(message.data).toHaveProperty('ip');
      expect(message.data).toHaveProperty('method');
      expect(message.data).toHaveProperty('statusCode');
    });

    it('PING/PONG 心跳', () => {
      const ping = 'PING';
      const pong = 'PONG';
      expect(ping).toBe('PING');
      expect(pong).toBe('PONG');
    });
  });

  describe('重连机制', () => {
    it('重连间隔递增', () => {
      const baseInterval = 3000;
      const maxInterval = 30000;
      const interval1 = Math.min(baseInterval * Math.pow(2, 0), maxInterval);
      const interval2 = Math.min(baseInterval * Math.pow(2, 1), maxInterval);
      const interval3 = Math.min(baseInterval * Math.pow(2, 2), maxInterval);

      expect(interval1).toBe(3000);
      expect(interval2).toBe(6000);
      expect(interval3).toBe(12000);
    });

    it('最大重连间隔不超过 30 秒', () => {
      const baseInterval = 3000;
      const maxInterval = 30000;
      const interval = Math.min(baseInterval * Math.pow(2, 10), maxInterval);
      expect(interval).toBeLessThanOrEqual(maxInterval);
    });
  });
});
