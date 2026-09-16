/**
 * 自动响应 / 攻击告警模块
 *
 * 检测到攻击时：① 记录攻击事件；② 按阈值自动封禁；③ 发送告警（邮件 / Webhook）。
 *
 * 历史问题（本模块此前**没有任何生产调用方**，属于死代码，且内部有 3 个真实缺陷）：
 *   1. `autoConfig` 用 `{ ...DEFAULT_CONFIG.autoBlock, ...config?.defense }` 合并 ——
 *      把 `autoBlock` 子对象的键**平铺**到了配置根上，于是 `autoConfig.autoBlock`
 *      永远是 `undefined`，紧接着 `shouldAutoBlock()` 里的 `config.autoBlock?.enabled`
 *      永远为假 → **自动封禁从来不可能触发**；
 *   2. `alertConfig = { ...DEFAULT_CONFIG.alert }` 完全丢弃了传入的告警配置，
 *      `email` / `webhookUrl` 恒为空串 → 即使接入也永远不告警；
 *   3. `alertCooldown` 这个 Map 只写不清理 → 每个 (ip, type) 组合常驻内存，无界增长。
 *
 * 现拆成两个入口：
 *   - `notifyAttack()`：**只告警**，供各检测器在完成封禁后调用（不会二次封禁）；
 *   - `handleAttackEvent()`：告警 + 自动封禁，保留给外部/程序化调用。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { createLogger } from '../../../framework/log/index.js';
import { setBlock } from '../dao/block-manager.js';
import { pushRecord } from '../data/store.js';
import { getConfig } from '../util/shared.js';

const log = createLogger('app.firewall.engine.auto-responder');

/** 默认告警配置（可被 `defense.alert` 覆盖） */
const DEFAULT_ALERT = {
  enabled: true,
  email: '',
  webhookUrl: '',
  cooldownMs: 300_000
};

/** 默认自动封禁配置（可被 `defense.autoBlock` 覆盖） */
const DEFAULT_AUTO_BLOCK = {
  enabled: true,
  scanThreshold: 20,
  rateLimitThreshold: 100,
  blockDuration: 3600
};

/** 告警冷却记录：(ip|type) → 上次告警时间戳 */
const alertCooldown = new Map();
/** 冷却记录的最大条目数，超出时按插入顺序淘汰最旧的（防止无界增长） */
const ALERT_COOLDOWN_MAX = 5000;

/** Webhook 超时（毫秒）——不设超时会让一个不响应的地址挂住整个请求链 */
const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * 读取自动响应配置（深层合并，不再把子对象平铺到根）
 *
 * @returns {{alert: object, autoBlock: object}} 归一化后的配置
 */
function readResponderConfig() {
  const defense = getConfig()?.defense || {};
  return {
    alert: { ...DEFAULT_ALERT, ...(defense.alert || {}) },
    autoBlock: { ...DEFAULT_AUTO_BLOCK, ...(defense.autoBlock || {}) }
  };
}

/**
 * 记录冷却时间戳（带容量上限，防止 Map 无界增长）
 *
 * @param {string} key 冷却键
 * @param {number} now 当前时间戳
 * @returns {void}
 */
function rememberCooldown(key, now) {
  if (alertCooldown.size >= ALERT_COOLDOWN_MAX) {
    // Map 保持插入顺序，删掉最早的若干个即可（无需精确 LRU）
    const excess = alertCooldown.size - ALERT_COOLDOWN_MAX + 1;
    let i = 0;
    for (const k of alertCooldown.keys()) {
      alertCooldown.delete(k);
      if (++i >= excess) break;
    }
  }
  alertCooldown.set(key, now);
}

/**
 * 发送告警通知（邮件 / Webhook）
 *
 * 未配置 `email` 且未配置 `webhookUrl` 时是**纯空操作**，因此可以安全地在
 * 请求链路上「触发后不管」地调用。
 *
 * @param {string} ip 攻击者 IP
 * @param {string} type 攻击类型
 * @param {object} [details] 攻击详情
 * @returns {Promise<void>}
 */
async function sendAlert(ip, type, details) {
  const { alert } = readResponderConfig();
  if (!alert.enabled) return;

  const cooldownKey = `${ip}|${type}`;
  const lastAlert = alertCooldown.get(cooldownKey);
  const now = Date.now();
  if (lastAlert && now - lastAlert < alert.cooldownMs) return;
  rememberCooldown(cooldownKey, now);

  const message = `[安全告警] ${type} 攻击来自 ${ip}\n详情: ${JSON.stringify(details ?? {})}`;

  // 邮件告警
  if (alert.email) {
    try {
      const emailService = await import('../../notice/services/email.js');
      await emailService.default.send(
        alert.email,
        `[安全告警] ${type} 攻击检测`,
        `<p>${message.replace(/\n/g, '<br>')}</p>`
      );
    } catch (err) {
      log.warn(`[AutoResponder] 邮件告警失败: ${err.message}`);
    }
  }

  // Webhook 告警
  if (alert.webhookUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      await fetch(alert.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: type, ip, details, timestamp: new Date().toISOString() }),
        signal: controller.signal
      });
    } catch (err) {
      log.warn(`[AutoResponder] Webhook 告警失败: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * 只做告警（供检测器封禁完成后调用；不会重复封禁）
 *
 * @param {string} ip 攻击者 IP
 * @param {string} type 攻击类型
 * @param {object} [details] 攻击详情
 * @returns {Promise<void>}
 */
async function notifyAttack(ip, type, details) {
  try {
    pushRecord({
      time: new Date().toISOString(),
      ip,
      method: 'ATTACK',
      url: type,
      statusCode: 0,
      blocked: true,
      details
    });
    log.warn(`[AutoResponder] 检测到攻击: ${type} from ${ip}`);
    await sendAlert(ip, type, details);
  } catch (err) {
    // 告警属于旁路能力，任何失败都不得影响主流程
    log.warn(`[AutoResponder] 告警处理失败: ${err.message}`);
  }
}

/**
 * 判断是否应该自动封禁
 *
 * @param {string} type 攻击类型
 * @param {object} autoBlock 自动封禁配置
 * @returns {boolean} 是否封禁
 */
function shouldAutoBlock(type, autoBlock) {
  if (!autoBlock?.enabled) return false;
  return ['scan', 'brute_force', 'bot_attack'].includes(type);
}

/**
 * 处理攻击事件（告警 + 自动封禁）
 *
 * @param {object} params 事件参数
 * @param {string} params.ip 攻击者 IP
 * @param {string} params.type 攻击类型
 * @param {object} [params.details] 攻击详情
 * @returns {Promise<void>}
 */
async function handleAttackEvent(params) {
  const { ip, type, details } = params || {};
  if (!ip || !type) return;

  const { autoBlock } = readResponderConfig();

  await notifyAttack(ip, type, details);

  if (!shouldAutoBlock(type, autoBlock)) return;

  try {
    // 元数据必须与封禁读取端一致：读的时候按 status / permanent / expiresAt 解释，
    // 写成 { reason, duration } 会让 expiresAt 缺失 → TTL 计算出 NaN → 临时封禁变永久封禁。
    const now = Date.now();
    await setBlock(ip, {
      status: 'BLOCKED',
      source: 'auto',
      permanent: false,
      createdAt: now,
      expiresAt: now + autoBlock.blockDuration * 1000,
      reason: `自动封禁: ${type}`
    });
    log.warn(`[AutoResponder] 已自动封禁 IP: ${ip}，时长 ${autoBlock.blockDuration}秒`);
  } catch (err) {
    log.error(`[AutoResponder] 自动封禁失败: ${err.message}`);
  }
}

export { handleAttackEvent, notifyAttack, sendAlert };
