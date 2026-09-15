/**
 * 僵尸网络 / 机器人挑战检测
 * 基于 User-Agent 模式匹配 + 请求频率，超过阈值触发人机挑战
 *
 * 正则表达式在模块加载时预编译，避免每次请求创建 RegExp 对象
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getConfig } from '../../util/shared.js';
import { setBlock } from '../dao/block-manager.js';

/** 预编译的正则缓存（启动时填充，运行时只读） */
let compiledBotPatterns = [];
let compiledBrowserPatterns = [];
let lastBotPatternsRef = null;
let lastBrowserPatternsRef = null;

/**
 * 检查配置是否变更，如变更则重新编译正则
 *
 * 用**引用比较**而不是 `JSON.stringify(...)` 拼接哈希：旧实现每个请求（含 Bot 检测
 * 命中的每一个请求）都要把两个模式数组序列化一遍拼成字符串再比 —— 纯属浪费，
 * 而配置更新是整体替换数组（deepMerge 直接取源数组引用）的实现，引用变了就是变了。
 */
function ensurePatternsCompiled() {
  const settings = getConfig().defense;
  const botPatterns = settings.botPatterns || [];
  const browserPatterns = settings.browserPatterns || [];

  if (botPatterns === lastBotPatternsRef && browserPatterns === lastBrowserPatternsRef) return;
  lastBotPatternsRef = botPatterns;
  lastBrowserPatternsRef = browserPatterns;

  compiledBotPatterns = compilePatterns(botPatterns);
  compiledBrowserPatterns = compilePatterns(browserPatterns);
}

/**
 * 批量编译正则，非法模式直接丢弃（不能让一条坏配置使整个检测失效）
 *
 * @param {string[]} patterns 正则源码数组
 * @returns {RegExp[]} 编译成功的正则
 */
function compilePatterns(patterns) {
  return patterns
    .map(p => {
      try {
        return new RegExp(p, 'i');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * 僵尸网络/机器人挑战检查
 */
const checkBotChallenge = async (ip, ua, requestCount) => {
  ensurePatternsCompiled();

  const settings = getConfig().defense;
  const now = Date.now();

  if (!ua) {
    if (requestCount > (settings.botChallengeNoUaLimit || 10)) {
      await setBlock(ip, {
        status: 'CHALLENGE',
        source: 'auto',
        permanent: false,
        createdAt: now,
        expiresAt: now + 1800 * 1000
      });
      return true;
    }
    return false;
  }

  const isBotUA = compiledBotPatterns.some(p => p.test(ua));
  const isBrowserUA = compiledBrowserPatterns.some(p => p.test(ua));

  if (isBotUA && requestCount > (settings.botChallengeBotLimit || 30)) {
    await setBlock(ip, {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      createdAt: now,
      expiresAt: now + 1800 * 1000
    });
    return true;
  }

  if (isBrowserUA && requestCount > (settings.botChallengeBrowserLimit || 120)) {
    await setBlock(ip, {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      createdAt: now,
      expiresAt: now + 1800 * 1000
    });
    return true;
  }

  return false;
};

export { checkBotChallenge };
