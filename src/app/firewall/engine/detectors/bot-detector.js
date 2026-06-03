/**
 * 僵尸网络 / 机器人挑战检测
 * 基于 User-Agent 模式匹配 + 请求频率，超过阈值触发人机挑战
 *
 * 正则表达式在模块加载时预编译，避免每次请求创建 RegExp 对象
 */
import { getConfig } from '../../util/shared.js';
import { setBlock } from '../dao/block-manager.js';

/** 预编译的正则缓存（启动时填充，运行时只读） */
let compiledBotPatterns = [];
let compiledBrowserPatterns = [];
let lastConfigHash = '';

/**
 * 检查配置是否变更，如变更则重新编译正则
 */
function ensurePatternsCompiled() {
  const settings = getConfig().defense;
  const hash = JSON.stringify(settings.botPatterns) + JSON.stringify(settings.browserPatterns);

  if (hash === lastConfigHash) return;
  lastConfigHash = hash;

  compiledBotPatterns = (settings.botPatterns || []).map((p) => {
    try {
      return new RegExp(p, 'i');
    } catch {
      return null;
    }
  }).filter(Boolean);

  compiledBrowserPatterns = (settings.browserPatterns || []).map((p) => {
    try {
      return new RegExp(p, 'i');
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * 僵尸网络/机器人挑战检查
 */
export const checkBotChallenge = async (redisClient, ip, ua, requestCount) => {
  ensurePatternsCompiled();

  const settings = getConfig().defense;
  const now = Date.now();

  if (!ua) {
    if (requestCount > (settings.botChallengeNoUaLimit || 10)) {
      await setBlock(redisClient, ip, {
        status: 'CHALLENGE', source: 'auto', permanent: false,
        createdAt: now, expiresAt: now + 1800 * 1000
      });
      return true;
    }
    return false;
  }

  const isBotUA = compiledBotPatterns.some((p) => p.test(ua));
  const isBrowserUA = compiledBrowserPatterns.some((p) => p.test(ua));

  if (isBotUA && requestCount > (settings.botChallengeBotLimit || 30)) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + 1800 * 1000
    });
    return true;
  }

  if (isBrowserUA && requestCount > (settings.botChallengeBrowserLimit || 120)) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + 1800 * 1000
    });
    return true;
  }

  return false;
};
