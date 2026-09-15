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
import { setBlockForSubject } from '../dao/block-manager.js';

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

/** 挑战态 TTL（秒）：与历史行为一致 */
const CHALLENGE_TTL_SEC = 1800;

/**
 * 对触发者下发挑战（IP + 设备两个维度）
 *
 * 三个触发分支（无 UA / Bot UA / 浏览器超频）此前各抄一份同样的 setBlock 调用，
 * 参数还都是同一组常量 —— 合成一处后，改「挑战时长」只需改这里。
 * 设备维度让挑战跨 IP 生效：机器人换 IP 也还是要过验证。
 *
 * @param {{ip:string, deviceId:string|null}} subject 触发者
 * @returns {Promise<void>}
 */
async function challengeSubject(subject) {
  const now = Date.now();
  await setBlockForSubject(subject, {
    status: 'CHALLENGE',
    source: 'auto',
    permanent: false,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_SEC * 1000
  });
}

/**
 * 僵尸网络/机器人挑战检查
 *
 * @param {string} ip 客户端 IP
 * @param {string} ua User-Agent
 * @param {number} requestCount 当前窗口内请求数
 * @param {string|null} [deviceId] 设备 ID（客户端未携带合法值时传 null）
 * @returns {Promise<boolean>} true 表示已触发挑战
 */
const checkBotChallenge = async (ip, ua, requestCount, deviceId = null) => {
  ensurePatternsCompiled();

  const settings = getConfig().defense;
  // enableDeviceBlock=false 时退回纯 IP 维度（运维可一键关掉跨 IP 的设备封禁）
  const subject = { ip, deviceId: settings.enableDeviceBlock === false ? null : deviceId };

  if (!ua) {
    if (requestCount > (settings.botChallengeNoUaLimit || 10)) {
      await challengeSubject(subject);
      return true;
    }
    return false;
  }

  const isBotUA = compiledBotPatterns.some(p => p.test(ua));
  const isBrowserUA = compiledBrowserPatterns.some(p => p.test(ua));

  if (isBotUA && requestCount > (settings.botChallengeBotLimit || 30)) {
    await challengeSubject(subject);
    return true;
  }

  if (isBrowserUA && requestCount > (settings.botChallengeBrowserLimit || 120)) {
    await challengeSubject(subject);
    return true;
  }

  return false;
};

export { checkBotChallenge };
