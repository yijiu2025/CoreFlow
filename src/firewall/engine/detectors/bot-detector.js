/**
 * 僵尸网络 / 机器人挑战检测
 * 基于 User-Agent 模式匹配 + 请求频率，超过阈值触发人机挑战
 */
import { getConfig } from '../../util/shared.js';
import { setBlock } from '../dao/block-manager.js';

/**
 * 僵尸网络/机器人挑战检查
 */
export const checkBotChallenge = async (redisClient, ip, ua, requestCount) => {
  const settings = getConfig().defense;
  const botPatterns = (settings.botPatterns || []).map(p => new RegExp(p, 'i'));
  const browserPatterns = (settings.browserPatterns || []).map(p => new RegExp(p, 'i'));
  const now = Date.now();

  if (!ua) {
    if (requestCount > (settings.botChallengeNoUaLimit || 10)) {
      await setBlock(redisClient, ip, {
        status: 'CHALLENGE', source: 'auto', permanent: false,
        createdAt: now, expiresAt: now + 1800 * 1000,
      });
      return true;
    }
    return false;
  }

  const isBotUA = botPatterns.some((p) => p.test(ua));
  const isBrowserUA = browserPatterns.some((p) => p.test(ua));

  if (isBotUA && requestCount > (settings.botChallengeBotLimit || 30)) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + 1800 * 1000,
    });
    return true;
  }

  if (isBrowserUA && requestCount > (settings.botChallengeBrowserLimit || 120)) {
    await setBlock(redisClient, ip, {
      status: 'CHALLENGE', source: 'auto', permanent: false,
      createdAt: now, expiresAt: now + 1800 * 1000,
    });
    return true;
  }

  return false;
};
