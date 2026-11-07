/**
 * 面板层键的静态覆盖 —— 接线契约
 *
 * 背景（2026-11-07）：`activeIpApi` / `showTrajectory` 从 core 下沉到 app 层之后，
 * 合并方向写成了 `deepMerge(core, 面板默认)` —— 面板默认在后、直接盖掉用户写在
 * `src/config/firewall_config.js` 里的值，只留一条 warn。结果是**写了不生效**，
 * 用户以为改了源，实际还在用旧源。
 *
 * 本用例把「core 侧带了面板键」（= 用户显式写了）这个场景钉住：
 * 生效值必须是用户写的那个，而不是面板层内置默认。
 *
 * 为什么用 mock 而不是去改 `src/config/firewall_config.js`：
 * 那个文件是用户自己的配置，用例读写它会让测试结果随本机配置变化（假绿/假红）。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

import { describe, it, expect, jest } from '@jest/globals';

// core 默认值：内置只有 defense，面板键只可能来自 src/config 静态覆盖
jest.unstable_mockModule('../framework/ingress/firewall/config/defaults.js', () => ({
  DEFAULT_SECURITY_SETTINGS: {
    defense: { maxConn: 42 },
    activeIpApi: 'baidu',
    showTrajectory: false
  }
}));

const { DEFAULT_SECURITY_SETTINGS, DEFAULT_IP_API, applyPanelOverrides } =
  await import('../app/firewall/config/config.js');

describe('面板层键 · 用户静态覆盖优先', () => {
  it('用户写在 src/config 里的 activeIpApi 必须生效（不被面板默认覆盖）', () => {
    expect(DEFAULT_SECURITY_SETTINGS.activeIpApi).toBe('baidu');
  });

  it('showTrajectory 同理，且 false 不会被当成"没写"', () => {
    // false 是合法覆盖值：用 `||` 兜底会让它变回 true —— 这是最容易写错的一处
    expect(DEFAULT_SECURITY_SETTINGS.showTrajectory).toBe(false);
  });

  it('defense 仍来自 core，不被面板层逻辑影响', () => {
    expect(DEFAULT_SECURITY_SETTINGS.defense).toEqual({ maxConn: 42 });
  });

  it('生效形状不变：仍是 { activeIpApi, showTrajectory, defense }', () => {
    // 持久化 schema 冻结：data/firewall_config.json 与面板 GET /settings 按此形状读写
    expect(Object.keys(DEFAULT_SECURITY_SETTINGS).sort()).toEqual(['activeIpApi', 'defense', 'showTrajectory']);
  });

  it('默认 IP 数据源对象跟随覆盖值（不能写死 id，否则两处默认值漂移）', () => {
    expect(DEFAULT_IP_API.id).toBe('baidu');
  });

  it('纯函数本身仍保留「未写则用默认」的语义', () => {
    const { settings, overridden } = applyPanelOverrides(
      { defense: {} },
      { activeIpApi: 'ipapi', showTrajectory: true }
    );
    expect(settings).toEqual({ activeIpApi: 'ipapi', showTrajectory: true });
    expect(overridden).toEqual([]);
  });
});
