/**
 * Bot 检测器契约测试（真身 `checkBotChallenge`）
 *
 * ⚠️ 为什么要重写（AUDIT-REPORT-2026-09-15 🟡-7）：
 * 本文件的前身把 `classifyRequest` **内联复制**在测试文件里，测的是副本而不是真身
 * （`app/firewall/engine/detectors/bot-detector.js`）。副本与真身早已漂移 ——
 * 副本把 `curl` 列为 bot 模式并断言「curl 超限触发挑战」，而真身默认配置里
 * **只有 `libcurl`（config.js:249 起）**，裸 `curl/7.68.0` 既不匹配 bot 模式、也不匹配
 * 浏览器模式，无论请求多少次都只走 PASS。也就是说那条断言若打向真身是**失败**的。
 * 这类"副本掩盖真身行为"正是 4 个 🔴 能长期漏过测试的原因。
 *
 * 现在的做法：直接 import 真身，只把它依赖的「配置来源」替换成一个**真实默认值的副本**
 * （`DEFAULT_SECURITY_SETTINGS.defense`），既避免读写磁盘上的 firewall_config.json，
 * 又不复制任何策略逻辑 —— 默认值一旦变化，这里的断言会跟着变。
 * Redis 不在 jest 环境时访问层走内存实现，因此可以真实断言「挑战态是否写入」。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-15 重写为真身契约测试（🟡-7），并固化 curl/libcurl 漂移
 */
import { describe, test, expect, jest } from '@jest/globals';

// ── 只替换配置来源，不替换被测逻辑 ────────────────────────────────────────────
// 用真身默认值做一份**可写副本**：dao.js 不再被 initDao 触碰，也就不会在测试结束时
// 把防火墙配置文件写回磁盘（triggerSave 是 1s 防抖，jest 进程必然活过 1s）。
const { DEFAULT_SECURITY_SETTINGS } = await import('../app/firewall/config/config.js');

const settings = {
  ...DEFAULT_SECURITY_SETTINGS,
  defense: {
    ...DEFAULT_SECURITY_SETTINGS.defense,
    manualBlacklistIps: [...(DEFAULT_SECURITY_SETTINGS.defense.manualBlacklistIps || [])]
  }
};

jest.unstable_mockModule('../app/firewall/dao/dao.js', () => ({
  getSecuritySettings: () => settings,
  initDao: () => {},
  getServerNode: () => ({})
}));

const { checkBotChallenge } = await import('../app/firewall/engine/detectors/bot-detector.js');
const { checkGlobalBlock, getActiveBlocks } = await import('../app/firewall/engine/dao/block-manager.js');
const { generateServerSideDeviceId } = await import('../framework/auth/device-id-service.js');

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OTHER_IP = '198.51.100.231';

/** 调用封禁检查，把抛出的封禁错误当返回值（不抛则 null） */
async function stateOf(ip, deviceId) {
  try {
    await checkGlobalBlock(ip, undefined, deviceId);
    return null;
  } catch (err) {
    return err;
  }
}

describe('Bot 检测器（真身）', () => {
  describe('无 User-Agent', () => {
    test('未超阈值放行，且不写入任何封禁/挑战态', async () => {
      const ip = '203.0.113.240';
      expect(await checkBotChallenge(ip, '', 10)).toBe(false);
      expect(await stateOf(ip)).toBeNull();
    });

    test('超过阈值触发挑战（阈值取自真身默认配置 botChallengeNoUaLimit）', async () => {
      const ip = '203.0.113.241';
      expect(await checkBotChallenge(ip, '', settings.defense.botChallengeNoUaLimit + 1)).toBe(true);

      // 落进的是「挑战态」而不是硬封禁：入口会渲染挑战页（statusCode 200）而不是 429
      const err = await stateOf(ip);
      expect(err).not.toBeNull();
      expect(err.isChallenge).toBe(true);
      expect(err.statusCode).toBe(200);
    });
  });

  describe('Bot User-Agent', () => {
    test('恰好等于阈值放行，超过 1 次触发', async () => {
      const limit = settings.defense.botChallengeBotLimit;
      expect(await checkBotChallenge('203.0.113.242', 'python-requests/2.28.0', limit)).toBe(false);
      expect(await checkBotChallenge('203.0.113.243', 'python-requests/2.28.0', limit + 1)).toBe(true);
    });

    test('scrapy / headless 等其余默认模式同样命中', async () => {
      expect(await checkBotChallenge('203.0.113.244', 'Scrapy/2.7.1', limitPlus(1))).toBe(true);
      expect(await checkBotChallenge('203.0.113.245', 'Mozilla/5.0 HeadlessChrome/100.0', limitPlus(1))).toBe(true);
    });

    /**
     * 固化「副本 vs 真身」的漂移：默认 bot 模式里只有 `libcurl`，**没有裸 `curl`**。
     * 旧内联副本把 `curl` 当成 bot 模式，于是「curl 超限触发挑战」在副本上通过、
     * 在真身上失败。这条用例把真身语义钉死，副本式写法再犯会立刻暴露。
     */
    test('libcurl 命中而裸 curl 不命中（真身默认模式列表的既有语义）', async () => {
      const patterns = settings.defense.botPatterns;
      expect(patterns).toContain('libcurl');
      expect(patterns).not.toContain('curl');

      // 行为层验证：libcurl 超限触发挑战
      expect(await checkBotChallenge('203.0.113.246', 'libcurl/7.68.0', limitPlus(1))).toBe(true);
      // 裸 curl 既不是 bot 模式也不是浏览器模式 → 请求次数再多也只走 PASS
      expect(await checkBotChallenge('203.0.113.247', 'curl/7.68.0', 100_000)).toBe(false);
    });
  });

  describe('浏览器 User-Agent', () => {
    test('未超浏览器阈值放行，超过触发', async () => {
      const limit = settings.defense.botChallengeBrowserLimit;
      expect(await checkBotChallenge('203.0.113.248', CHROME_UA, limit)).toBe(false);
      expect(await checkBotChallenge('203.0.113.249', CHROME_UA, limit + 1)).toBe(true);
    });

    test('自定义阈值来自配置而非硬编码', async () => {
      const original = settings.defense.botChallengeNoUaLimit;
      settings.defense.botChallengeNoUaLimit = 3;
      try {
        expect(await checkBotChallenge('203.0.113.250', '', 3)).toBe(false);
        expect(await checkBotChallenge('203.0.113.251', '', 4)).toBe(true);
      } finally {
        settings.defense.botChallengeNoUaLimit = original;
      }
    });
  });

  describe('设备维度：挑战跨 IP 生效（自动封禁同时写 IP 与设备）', () => {
    test('携带设备 ID 触发挑战后，换一个 IP 仍然命中', async () => {
      const dev = generateServerSideDeviceId(CHROME_UA);
      expect(await checkBotChallenge('203.0.113.252', '', 11, dev)).toBe(true);

      // 同 IP 命中
      expect((await stateOf('203.0.113.252'))?.isChallenge).toBe(true);
      // 换 IP、带同一设备 ID → 仍然命中（这正是设备维度的全部意义）
      expect((await stateOf(OTHER_IP, dev))?.isChallenge).toBe(true);
      // 对照组：换 IP 且不带设备 ID → 什么都读不到
      expect(await stateOf(OTHER_IP)).toBeNull();
    });

    test('enableDeviceBlock=false 时退回纯 IP 维度（一键关掉跨 IP 封禁）', async () => {
      const dev = generateServerSideDeviceId(CHROME_UA);
      settings.defense.enableDeviceBlock = false;
      try {
        expect(await checkBotChallenge('203.0.113.253', '', 11, dev)).toBe(true);
        // IP 维度照旧生效
        expect((await stateOf('203.0.113.253'))?.isChallenge).toBe(true);
        // 设备维度**没有**被写入 → 换 IP 后不再命中
        expect(await stateOf(OTHER_IP, dev)).toBeNull();
      } finally {
        settings.defense.enableDeviceBlock = true;
      }
    });

    test('挑战态 TTL 与 CHALLENGE_TTL_SEC 一致（30 分钟，不会变成永久封禁）', async () => {
      const ip = '203.0.113.254';
      await checkBotChallenge(ip, '', 11);
      const entry = (await getActiveBlocks()).find(b => b.ip === ip);
      expect(entry).toBeDefined();
      expect(entry.status).toBe('CHALLENGE');
      expect(entry.permanent).toBe(false);
      expect(entry.remainingSeconds).toBeGreaterThan(1790);
      expect(entry.remainingSeconds).toBeLessThanOrEqual(1800);
    });
  });
});

/** 真身默认 bot 阈值 + delta，避免在用例里硬编码 31 这类数字 */
function limitPlus(delta) {
  return settings.defense.botChallengeBotLimit + delta;
}
