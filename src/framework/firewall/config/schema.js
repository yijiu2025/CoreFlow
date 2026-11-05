/**
 * 防火墙安全策略的**配置规格**（唯一一份规则表）
 *
 * ════════════════════════════════════════════════════════════════════
 * 这份表是"什么值算合法"的唯一事实源
 * ════════════════════════════════════════════════════════════════════
 * 同一份 spec 在三个边界执行（工具在 `framework/config/field-spec.js`）：
 *   ① 加载期：`persisted.js`（framework 启动读一次）与 `dao.js`（app 加载磁盘）——
 *      非法值丢弃 → 与默认值合并后自然回落，不会把机制弄坏；
 *   ② 写入期：`dao.updateSecuritySettings()`（面板 PATCH 落盘前）—— 同样清洗 +
 *      形状归位（`{maxConn: 100}` 这种"忘了套 defense"的载荷会被归位而不是写错层）；
 *   ③ API 层：`api/firewall/v1/schemas/monitor.js` 的 properties **由本文件生成**，
 *      面板提交明显非法的值直接 400。
 *
 * 为什么必须统一（而不是各文件自己 if）：配置有成串的入口（`src/config` 静态覆盖、
 * `data/firewall_config.json` 手改、面板 PATCH），各写一套必然漂移。2026-11 实测过：
 * 把 `connStaleAfterMs: 0` / `maxConn: "abc"` 写进 JSON 能**原样**载入内存，
 * 全靠业务代码里 `Number.isFinite(x) && x > 0 ? x : 默认值` 兜着。
 *
 * 键集合的权威仍是 `defaults.js`（持久化 schema 契约）；本文件的覆盖度由
 * `__tests__/firewall-config-schema.test.js` 双向钉死：defaults 有的 spec 必须有，
 * spec 有的 defaults 必须存在。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { sanitizeBySpec, isPlainObject, toJsonProperties } from '../../config/field-spec.js';

/**
 * `defense` 下每个键的类型与约束
 *
 * 约束取值的依据（都是"写错就会静默失效"的地方）：
 *   · 计数/时长一律 ≥ 1：0 会让判定恒真（如 `now - lastAt > 0` 清空在飞连接）或恒假；
 *   · 数组里的条目要求非空字符串：空前缀/空模式会变成"匹配一切"，
 *     等于把该条规则整条关掉（`startsWith('')` 恒真、`includes('')` 恒真）；
 *   · 枚举（challengeDifficulty 由代码夹在 1~6）与 1~6 的上下限保持一致。
 *
 * @type {Object<string, object>}
 */
const DEFENSE_SPEC = {
  // ── 总开关 + 五道闸门各自的开关 ──
  // 关闸门 = 这道闸不再拦（其余照旧）；enableFirewall=false 是排障用的整机旁路
  enableFirewall: { type: 'bool' },
  enableGlobalBlock: { type: 'bool' },
  enableChallenge: { type: 'bool' },

  // ── 手动名单 ──
  manualBlacklistIps: { type: 'stringArray' },
  manualBlacklistUsers: { type: 'stringArray' },
  manualWhitelistIps: { type: 'stringArray' },

  // ── 扫描检测（404 扫描陷阱）──
  enableAutoBlacklist: { type: 'bool' },
  maxNotFoundAttempts: { type: 'int', min: 1 },
  notFoundWindow: { type: 'int', min: 1 },
  blacklistDuration: { type: 'int', min: 1 },
  safePaths: { type: 'stringArray' },
  loopbackPrefixes: { type: 'stringArray' },
  internalIpPrefixes: { type: 'stringArray' },
  idcIpPrefixes: { type: 'stringArray' },

  // ── 全局限频 ──
  enableRateLimit: { type: 'bool' },
  rateLimitRequests: { type: 'int', min: 1 },
  rateLimitWindow: { type: 'int', min: 1 },
  enableEndpointRateLimit: { type: 'bool' },

  // ── 暴力破解 ──
  enableBruteForce: { type: 'bool' },
  bruteLimit: { type: 'int', min: 1 },
  bruteWindow: { type: 'int', min: 1 },
  accountLockTime: { type: 'int', min: 1 },
  ipBlockTime: { type: 'int', min: 1 },
  bruteIpLimit: { type: 'int', min: 1 },

  // ── 并发连接 ──
  enableConnLimit: { type: 'bool' },
  maxConn: { type: 'int', min: 1 },
  connCleanupIntervalMs: { type: 'int', min: 1 },
  connStaleAfterMs: { type: 'int', min: 1 },
  connHighWater: { type: 'int', min: 1 },

  // ── 探针路径（部署相关）──
  probePaths: { type: 'stringArray' },

  // ── 地理围栏 ──
  enableGeoFilter: { type: 'bool' },
  geoRules: {
    type: 'object',
    // 子键以 `geo-filter.js` 的真实读取点为准（`internalPrefixes` 存的是 **URL 路径**，
    // 与 `internalIpPrefixes`（IP 网段）不是一回事 —— 历史命名，未做迁移）。
    spec: {
      sensitivePaths: { type: 'stringArray' },
      internalPrefixes: { type: 'stringArray' },
      overseasInternalLimit: { type: 'int', min: 1 },
      overseasLimit: { type: 'int', min: 1 },
      overseasWindow: { type: 'int', min: 1 },
      overseasBlockTime: { type: 'int', min: 1 }
    }
  },

  // ── Bot 检测 ──
  // 总开关：false = `checkBotChallenge()` 直接放行（不做 UA 匹配与频率判定）
  enableBotChallenge: { type: 'bool' },
  botPatterns: { type: 'stringArray' },
  browserPatterns: { type: 'stringArray' },
  botChallengeNoUaLimit: { type: 'int', min: 1 },
  botChallengeBotLimit: { type: 'int', min: 1 },
  botChallengeBrowserLimit: { type: 'int', min: 1 },

  // ── 挑战难度（代码侧夹在 1~6，这里保持一致，避免两处口径不同）──
  challengeDifficulty: { type: 'int', min: 1, max: 6 },

  // ── 设备维度 / 匿名短路 ──
  enableDeviceBlock: { type: 'bool' },
  skipDeepCheckForAnonymous: { type: 'bool' },

  // ── 告警 ──
  alert: {
    type: 'object',
    spec: {
      enabled: { type: 'bool' },
      email: { type: 'string', minLength: 0 }, // 空串 = 不发邮件，允许
      webhookUrl: { type: 'string', minLength: 0 },
      cooldownMs: { type: 'int', min: 0 } // 0 = 不限流（允许，用于只发一条的调试场景）
    }
  }
};

/**
 * 面板层（`securitySettings` 顶层，不属于防护策略）的规格
 *
 * @type {Object<string, object>}
 */
const PANEL_SPEC = {
  // 公网 IP 归属查询数据源（面板「当前节点 IP」展示用）
  activeIpApi: { type: 'enum', values: ['sohu', 'ipinfo', 'ipapi', 'baidu'] },
  // 面板是否展示访问轨迹（省份热力图）
  showTrajectory: { type: 'bool' }
};

/** 清洗 `defense` 子对象 */
function sanitizeDefense(defense) {
  return sanitizeBySpec(DEFENSE_SPEC, defense, { label: 'defense' });
}

/**
 * 清洗整个 `securitySettings`（defense + 面板层两个键）
 *
 * 未知顶层键一律丢弃（例如把 defense 键写到了顶层的错位配置）。
 * 调用方拿到的 `value` 与默认值 deepMerge 后就是"能安全使用"的策略。
 *
 * @param {*} settings 磁盘/请求里的 securitySettings
 * @returns {{value: object, problems: Array<{kind: string, key: string, message: string}>}} 清洗结果
 */
function sanitizeSecuritySettings(settings) {
  if (settings === undefined || settings === null) return { value: {}, problems: [] };
  if (!isPlainObject(settings)) {
    return {
      value: {},
      problems: [{ kind: 'invalid', key: 'securitySettings', message: '必须是对象，已整体丢弃' }]
    };
  }

  const problems = [];
  const value = {};

  if ('defense' in settings) {
    const defense = sanitizeDefense(settings.defense);
    problems.push(...defense.problems);
    value.defense = defense.value;
  }

  const panel = sanitizeBySpec(PANEL_SPEC, omit(settings, ['defense']));
  problems.push(...panel.problems);
  Object.assign(value, panel.value);

  return { value, problems };
}

/**
 * 归位「忘记套 defense」的写入载荷
 *
 * 面板历史上有一处 `updateSecuritySettings(securitySettings.value.defense)` —— 直接
 * 把 defense 摊在顶层提交。后端 `deepMerge` 会把它写成 `securitySettings.maxConn`，
 * 下次启动被 `dropMisplacedDefenseKeys` 当错位键剔掉 → **保存看着成功、重启全丢**。
 * 写入期把这类键收回 `defense` 下，比"静默丢弃"或"直接 400"都对用户更友好。
 *
 * @param {*} patch 请求体
 * @returns {{value: object, misplaced: string[]}} 归位后的新对象 + 被归位的键名
 */
function normalizeSettingsPatch(patch) {
  if (!isPlainObject(patch)) return { value: patch, misplaced: [] };

  const defenseKeys = Object.keys(patch).filter(key => key in DEFENSE_SPEC);
  if (defenseKeys.length === 0) return { value: patch, misplaced: [] };

  const moved = {};
  const rest = {};
  for (const [key, val] of Object.entries(patch)) {
    if (key in DEFENSE_SPEC) moved[key] = val;
    else rest[key] = val;
  }
  rest.defense = { ...(isPlainObject(rest.defense) ? rest.defense : {}), ...moved };
  return { value: rest, misplaced: defenseKeys };
}

/**
 * 生成面板接口 schema 的 `defense` properties（与清洗规则同源）
 *
 * @returns {object} JSON-Schema properties
 */
function toDefenseJsonProperties() {
  return toJsonProperties(DEFENSE_SPEC);
}

/**
 * 生成面板接口 schema 的顶层 properties
 *
 * 面板只允许写 `defense` + 两个展示键；`defense` 内部用**同一份** spec 生成约束。
 *
 * @returns {object} JSON-Schema properties
 */
function toSettingsJsonProperties() {
  return { defense: { type: 'object', properties: toDefenseJsonProperties() }, ...toJsonProperties(PANEL_SPEC) };
}

/**
 * 取对象中除指定键之外的浅拷贝
 *
 * @param {object} object 源对象
 * @param {string[]} keys 要剔除的键
 * @returns {object} 新对象
 */
function omit(object, keys) {
  const out = {};
  for (const [key, val] of Object.entries(object)) {
    if (!keys.includes(key)) out[key] = val;
  }
  return out;
}

export {
  DEFENSE_SPEC,
  PANEL_SPEC,
  sanitizeDefense,
  sanitizeSecuritySettings,
  normalizeSettingsPatch,
  toDefenseJsonProperties,
  toSettingsJsonProperties
};
