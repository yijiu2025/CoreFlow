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
import { setBlockForSubject } from '../../block-manager.js';
import { DEFAULT_SECURITY_SETTINGS } from '../../config/defaults.js';
import { createLogger } from '../../../../support/log/index.js';

const log = createLogger('framework.firewall.engine.detectors.bot-detector');

/**
 * 三档挑战阈值的兜底来源 —— **唯一一份数字**
 *
 * 生效值一律来自 config（`defense.botChallenge*Limit`：framework 默认值 → src/config →
 * 面板热改）。这里读 defaults 里的同一份定义，不再自己写 10 / 30 / 120。
 */
const BOT_DEFAULTS = DEFAULT_SECURITY_SETTINGS.defense;

/** 日志里回显配置原文的最大长度（外部输入截断，避免配置里塞长串撑爆日志） */
const MAX_PATTERN_LOG_LEN = 64;

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
 * 批量编译正则，非法模式丢弃（不能让一条坏配置使整个检测失效）
 *
 * ⚠️ 丢弃时**必须告警**：这是纯配置驱动的安全开关，静默丢弃会让「我明明配了
 * 这个 UA 模式」和「它其实没生效」看起来一模一样。历史上这里 `catch { return null }`
 * 没有任何日志 —— 整份 botPatterns 写错（例如转义漏了反斜杠）时 Bot 检测直接失效，
 * 面板上却一切正常。
 *
 * @param {string[]} patterns 正则源码数组
 * @returns {RegExp[]} 编译成功的正则
 */
function compilePatterns(patterns) {
  return patterns
    .map(p => {
      try {
        return new RegExp(p, 'i');
      } catch (err) {
        log.warn(
          `⚠️ [Firewall] botPatterns/browserPatterns 中有非法正则，已丢弃（该模式不生效）: ` +
            `${String(p).slice(0, MAX_PATTERN_LOG_LEN)} — ${err.message}`
        );
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
 * `defense.enableBotChallenge === false` 时**整体旁路**（直接返回"未命中"）：
 * 这是面板「Bot 检测」模块的开关，只关这一路，地理围栏/限流/扫描陷阱不受影响。
 *
 * @param {string} ip 客户端 IP
 * @param {string} ua User-Agent
 * @param {number} requestCount 当前窗口内请求数
 * @param {string|null} [deviceId] 设备 ID（客户端未携带合法值时传 null）
 * @returns {Promise<boolean>} true 表示已触发挑战
 */
const checkBotChallenge = async (ip, ua, requestCount, deviceId = null) => {
  // 总开关最先判：关掉时连正则编译都不做（省一次配置读取后的模式比对），
  // 语义就是"Bot 检测整套旁路"，而不是把阈值调大那种"近似关掉"。
  // 注意只关 Bot 这一路：地理围栏、限流、扫描陷阱各自有独立开关。
  const settings = getConfig().defense;
  if (settings.enableBotChallenge === false) return false;

  ensurePatternsCompiled();

  // enableDeviceBlock=false 时退回纯 IP 维度（运维可一键关掉跨 IP 的设备封禁）
  const subject = { ip, deviceId: settings.enableDeviceBlock === false ? null : deviceId };

  // 三档阈值只认 config（`defense.botChallenge*Limit`），兜底取 framework 默认值的
  // **同一份定义** —— 代码里不再抄 10 / 30 / 120：
  //   · 抄一份的后果：改 defaults 忘了改这里，运行时还是老数字，看不出来；
  //   · `|| 默认值` 还有第二个坑：配成 0 时 `0 || 30` 会变回 30（配置被静默改写）。
  // 现在「非有限正数」才回退，语义是"配置写坏 = 当没配"，与连接表那套（CONN_DEFAULTS）一致。
  const limitOf = key => {
    const configured = Number(settings[key]);
    return Number.isFinite(configured) && configured > 0 ? configured : BOT_DEFAULTS[key];
  };

  if (!ua) {
    if (requestCount > limitOf('botChallengeNoUaLimit')) {
      await challengeSubject(subject);
      return true;
    }
    return false;
  }

  const isBotUA = compiledBotPatterns.some(p => p.test(ua));
  const isBrowserUA = compiledBrowserPatterns.some(p => p.test(ua));

  if (isBotUA && requestCount > limitOf('botChallengeBotLimit')) {
    await challengeSubject(subject);
    return true;
  }

  if (isBrowserUA && requestCount > limitOf('botChallengeBrowserLimit')) {
    await challengeSubject(subject);
    return true;
  }

  return false;
};

export { checkBotChallenge };
