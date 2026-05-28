/**
 * Bot 检测器测试
 * 测试 UA 模式匹配 + 请求频率阈值判定逻辑
 */
import { describe, test, expect } from '@jest/globals';

// 提取 bot 检测核心逻辑（纯函数，不依赖 Redis）
function classifyRequest(ua, requestCount, settings = {}) {
  const {
    botPatterns = ['curl', 'wget', 'python-requests', 'scrapy', 'headless'],
    browserPatterns = ['Mozilla', 'Chrome', 'Firefox', 'Safari', 'Edge'],
    botChallengeNoUaLimit = 10,
    botChallengeBotLimit = 30,
    botChallengeBrowserLimit = 120
  } = settings;

  const botRegs = botPatterns.map((p) => new RegExp(p, 'i'));
  const browserRegs = browserPatterns.map((p) => new RegExp(p, 'i'));

  // 无 UA
  if (!ua) {
    return {
      type: requestCount > botChallengeNoUaLimit ? 'CHALLENGE' : 'PASS',
      reason: 'no_ua'
    };
  }

  const isBotUA = botRegs.some((p) => p.test(ua));
  const isBrowserUA = browserRegs.some((p) => p.test(ua));

  // Bot UA 超限
  if (isBotUA && requestCount > botChallengeBotLimit) {
    return { type: 'CHALLENGE', reason: 'bot_ua_exceeded' };
  }

  // 浏览器 UA 超限
  if (isBrowserUA && requestCount > botChallengeBrowserLimit) {
    return { type: 'CHALLENGE', reason: 'browser_exceeded' };
  }

  return { type: 'PASS', reason: isBotUA ? 'bot_ua' : isBrowserUA ? 'browser' : 'unknown_ua' };
}

describe('Bot 检测器', () => {
  describe('无 User-Agent', () => {
    test('低频请求应放行', () => {
      expect(classifyRequest(null, 5).type).toBe('PASS');
    });

    test('超过阈值应触发挑战', () => {
      expect(classifyRequest(null, 11).type).toBe('CHALLENGE');
      expect(classifyRequest(null, 100).type).toBe('CHALLENGE');
    });

    test('自定义阈值应生效', () => {
      expect(classifyRequest(null, 3, { botChallengeNoUaLimit: 5 }).type).toBe('PASS');
      expect(classifyRequest(null, 6, { botChallengeNoUaLimit: 5 }).type).toBe('CHALLENGE');
    });
  });

  describe('Bot User-Agent', () => {
    test('curl 低频应放行', () => {
      expect(classifyRequest('curl/7.68.0', 5).type).toBe('PASS');
    });

    test('curl 超限应触发挑战', () => {
      expect(classifyRequest('curl/7.68.0', 31).type).toBe('CHALLENGE');
    });

    test('python-requests 应识别为 Bot', () => {
      const result = classifyRequest('python-requests/2.28.0', 5);
      expect(result.reason).toBe('bot_ua');
    });

    test('scrapy 应识别为 Bot', () => {
      expect(classifyRequest('Scrapy/2.7.1', 5).reason).toBe('bot_ua');
    });

    test('HeadlessChrome 应识别为 Bot', () => {
      expect(classifyRequest('Mozilla/5.0 HeadlessChrome/100.0', 5).reason).toBe('bot_ua');
    });
  });

  describe('浏览器 User-Agent', () => {
    test('正常 Chrome 请求应放行', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
      expect(classifyRequest(ua, 50).type).toBe('PASS');
    });

    test('Chrome 超过 120 次应触发挑战', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
      expect(classifyRequest(ua, 121).type).toBe('CHALLENGE');
    });

    test('Firefox 应识别为浏览器', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
      expect(classifyRequest(ua, 50).reason).toBe('browser');
    });
  });

  describe('边界情况', () => {
    test('恰好等于阈值应放行', () => {
      expect(classifyRequest(null, 10).type).toBe('PASS');
      expect(classifyRequest('curl/7.0', 30).type).toBe('PASS');
    });

    test('超过阈值 1 应触发', () => {
      expect(classifyRequest(null, 11).type).toBe('CHALLENGE');
      expect(classifyRequest('curl/7.0', 31).type).toBe('CHALLENGE');
    });
  });
});
