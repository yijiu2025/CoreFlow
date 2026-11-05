/**
 * 防火墙持久化配置的**形状校验**（纯函数，无 I/O）
 *
 * ⚠️ 这里只管"键放错了层"，不管"值是否合法"：
 *   · 形状 → 本文件（`dropMisplacedDefenseKeys`）
 *   · 值   → `schema.js`（`sanitizeSecuritySettings`：类型/上下界/枚举/空串条目）
 * 两者都在加载期与写入期各跑一遍。别把值校验加到这里 —— 否则规则会有第二份。
 *
 * ════════════════════════════════════════════════════════════════════
 * 只允许一种形状，不做历史兼容
 * ════════════════════════════════════════════════════════════════════
 * `securitySettings` 的合法形状只有三类键：
 *   · `defense`                        防护策略（`DEFAULT_SECURITY_SETTINGS.defense`，38 个）
 *   · `activeIpApi` / `showTrajectory` 面板层展示配置（app 层所有，见 app/firewall/config/panel.js）
 *
 * 历史上有过把限流阈值**平铺在 securitySettings 顶层**的写法（`securitySettings.enableRateLimit`
 * 等）。那套形状早已没有读取点，留着就是"看着有配置、其实不生效"的陷阱。
 *
 * 这里**不做迁移、不写兼容分支**：任何属于 `defense` 的键出现在顶层，直接剔除并在启动时告警
 * 一次 —— 规则是通用的（对 defense 的每个键一视同仁），不是为某段历史写的补丁：
 * 以后谁把 `maxConn`、`botChallengeBotLimit` 写到顶层，同样会被发现。
 *
 * 为什么不能"静默忽略"：运维看着 `rateLimitRequests: 60` 会以为限流是 60，实际生效的是
 * `defense.rateLimitRequests`（出厂 600）。剔除 + 告警把"写得不对"变成看得见的事实。
 *
 * @author yijiu2025
 * @since 2026-11-04
 */

import { DEFAULT_SECURITY_SETTINGS } from './defaults.js';

/** defense 下的合法键集合（唯一事实源：core 默认值） */
const DEFENSE_KEYS = new Set(Object.keys(DEFAULT_SECURITY_SETTINGS.defense));

/**
 * 剔除写在 `securitySettings` 顶层的 defense 键（错位配置）
 *
 * @param {object} settings 磁盘上的 `securitySettings`（可为 null / 非法值）
 * @returns {{settings: object, misplaced: string[]}} 剔除后的新对象（不改原对象）+ 被剔除的键
 */
function dropMisplacedDefenseKeys(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { settings, misplaced: [] };
  }

  const out = { ...settings };
  const misplaced = [];
  for (const key of DEFENSE_KEYS) {
    if (!(key in out)) continue;
    delete out[key];
    misplaced.push(key);
  }
  return { settings: out, misplaced };
}

export { dropMisplacedDefenseKeys, DEFENSE_KEYS };
