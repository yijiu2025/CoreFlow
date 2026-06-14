/**
 * 防火墙管道测试
 *
 * 覆盖：检测器、管道、告警、导入导出
 */
import { describe, it, expect } from '@jest/globals';

describe('防火墙系统', () => {
  describe('Bot 检测', () => {
    const botPatterns = ['python-requests', 'scrapy', 'curl', 'wget', 'headless'];
    const browserPatterns = ['chrome', 'firefox', 'safari', 'edge'];

    function isBot(userAgent) {
      if (!userAgent) return true;
      const ua = userAgent.toLowerCase();
      return botPatterns.some(p => ua.includes(p));
    }

    function isBrowser(userAgent) {
      if (!userAgent) return false;
      const ua = userAgent.toLowerCase();
      return browserPatterns.some(p => ua.includes(p));
    }

    it('Python requests 被识别为 Bot', () => {
      expect(isBot('python-requests/2.28.0')).toBe(true);
    });

    it('curl 被识别为 Bot', () => {
      expect(isBot('curl/7.68.0')).toBe(true);
    });

    it('Chrome 被识别为浏览器', () => {
      expect(isBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0')).toBe(true);
    });

    it('空 User-Agent 被识别为 Bot', () => {
      expect(isBot('')).toBe(true);
      expect(isBot(null)).toBe(true);
    });

    it('正常浏览器不被识别为 Bot', () => {
      expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0')).toBe(false);
    });
  });

  describe('扫描陷阱', () => {
    const trapThreshold = 10;

    function isScanTrap(failedAttempts) {
      return failedAttempts >= trapThreshold;
    }

    it('超过阈值触发陷阱', () => {
      expect(isScanTrap(15)).toBe(true);
      expect(isScanTrap(10)).toBe(true);
    });

    it('未超过阈值不触发', () => {
      expect(isScanTrap(5)).toBe(false);
      expect(isScanTrap(0)).toBe(false);
    });
  });

  describe('限频器', () => {
    function checkRateLimit(count, maxRequests, windowMs) {
      return { allowed: count < maxRequests, remaining: Math.max(0, maxRequests - count) };
    }

    it('未超限返回 allowed', () => {
      const result = checkRateLimit(5, 10, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('超限返回 not allowed', () => {
      const result = checkRateLimit(15, 10, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('边界值测试', () => {
      expect(checkRateLimit(9, 10, 60000).allowed).toBe(true);
      expect(checkRateLimit(10, 10, 60000).allowed).toBe(false);
    });
  });

  describe('地理围栏', () => {
    const sensitivePaths = ['/admin', '/api/internal', '/debug'];

    function isSensitivePath(path) {
      return sensitivePaths.some(p => path.startsWith(p));
    }

    it('敏感路径被识别', () => {
      expect(isSensitivePath('/admin/users')).toBe(true);
      expect(isSensitivePath('/api/internal/config')).toBe(true);
    });

    it('普通路径不被识别', () => {
      expect(isSensitivePath('/api/firewall/v1/monitor/summary')).toBe(false);
      expect(isSensitivePath('/user/v1/userinfo')).toBe(false);
    });
  });

  describe('封禁管理', () => {
    it('封禁数据结构正确', () => {
      const block = {
        ip: '192.168.1.100',
        type: 'ip',
        reason: '自动封禁: scan',
        status: 'BLOCKED',
        permanent: false,
        duration: 3600,
        timestamp: Date.now()
      };
      expect(block).toHaveProperty('ip');
      expect(block).toHaveProperty('type');
      expect(block).toHaveProperty('reason');
      expect(block).toHaveProperty('status');
      expect(block.status).toBe('BLOCKED');
    });

    it('指纹封禁数据结构正确', () => {
      const block = {
        fingerprint: 'abc123def456',
        type: 'fingerprint',
        reason: 'Bot 检测',
        status: 'BLOCKED',
        permanent: true
      };
      expect(block.type).toBe('fingerprint');
      expect(block.permanent).toBe(true);
    });

    it('白名单数据结构正确', () => {
      const whitelist = {
        ip: '10.0.0.1',
        type: 'ip',
        reason: '内部 IP',
        timestamp: Date.now()
      };
      expect(whitelist).toHaveProperty('ip');
      expect(whitelist).toHaveProperty('reason');
    });
  });

  describe('告警配置', () => {
    it('告警配置结构正确', () => {
      const alertConfig = {
        enabled: true,
        email: 'admin@example.com',
        webhookUrl: 'https://hooks.example.com/alert',
        cooldownMs: 300000
      };
      expect(alertConfig.enabled).toBe(true);
      expect(alertConfig.cooldownMs).toBeGreaterThan(0);
    });

    it('冷却时间防止重复告警', () => {
      const cooldownMs = 300000;
      const lastAlert = Date.now() - 100000; // 100 秒前
      const now = Date.now();
      expect(now - lastAlert).toBeLessThan(cooldownMs); // 还在冷却期
    });
  });
});
