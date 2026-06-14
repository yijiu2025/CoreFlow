/**
 * 自动响应模块
 *
 * 检测到攻击时自动封禁 IP 并发送告警通知。
 * 阈值可配置，支持邮件和 Webhook 告警。
 */

import Logger from '../../../log/index.js';
import { setBlock } from './index.js';
import { pushRecord } from '../data/store.js';

/** 默认配置 */
const DEFAULT_CONFIG = {
  enabled: true,
  autoBlock: {
    enabled: true,
    scanThreshold: 20,      // 404/403 扫描次数阈值
    rateLimitThreshold: 100, // 限频触发次数阈值
    blockDuration: 3600      // 自动封禁时长（秒）
  },
  alert: {
    enabled: true,
    email: '',               // 告警邮箱
    webhookUrl: '',          // Webhook URL
    cooldownMs: 300000       // 同一 IP 告警冷却时间（5 分钟）
  }
};

/** 告警冷却记录 */
const alertCooldown = new Map();

/**
 * 处理攻击事件
 * @param {object} params
 * @param {object} params.redis - Redis 客户端
 * @param {string} params.ip - 攻击者 IP
 * @param {string} params.type - 攻击类型
 * @param {object} params.details - 攻击详情
 * @param {object} params.config - 防火墙配置
 */
export async function handleAttackEvent(params) {
  const { redis, ip, type, details, config } = params;
  const autoConfig = { ...DEFAULT_CONFIG.autoBlock, ...config?.defense };
  const alertConfig = { ...DEFAULT_CONFIG.alert };

  if (!autoConfig.enabled) return;

  // 1. 记录攻击事件
  pushRecord({
    time: new Date().toISOString(),
    ip,
    method: 'ATTACK',
    url: type,
    statusCode: 0,
    blocked: true,
    details
  });

  Logger.warn(`[AutoResponder] 检测到攻击: ${type} from ${ip}`);

  // 2. 自动封禁
  if (autoConfig.enabled && shouldAutoBlock(type, autoConfig)) {
    try {
      await setBlock(redis, ip, {
        reason: `自动封禁: ${type}`,
        duration: autoConfig.blockDuration,
        auto: true,
        timestamp: Date.now()
      });
      Logger.warn(`[AutoResponder] 已自动封禁 IP: ${ip}，时长 ${autoConfig.blockDuration}秒`);
    } catch (err) {
      Logger.error(`[AutoResponder] 自动封禁失败: ${err.message}`);
    }
  }

  // 3. 发送告警
  if (alertConfig.enabled) {
    await sendAlert(ip, type, details, alertConfig);
  }
}

/**
 * 判断是否应该自动封禁
 */
function shouldAutoBlock(type, config) {
  if (!config.autoBlock?.enabled) return false;
  // 扫描攻击和暴力破解自动封禁
  return ['scan', 'brute_force', 'bot_attack'].includes(type);
}

/**
 * 发送告警通知
 */
async function sendAlert(ip, type, details, config) {
  // 告警冷却：同一 IP 5 分钟内只告警一次
  const cooldownKey = `alert:${ip}:${type}`;
  const lastAlert = alertCooldown.get(cooldownKey);
  if (lastAlert && Date.now() - lastAlert < config.cooldownMs) return;
  alertCooldown.set(cooldownKey, Date.now());

  const message = `[安全告警] ${type} 攻击来自 ${ip}\n详情: ${JSON.stringify(details)}`;

  // 邮件告警
  if (config.email) {
    try {
      // 动态导入避免循环依赖
      const emailService = await import('../../notice/services/email.js');
      await emailService.default.send(
        config.email,
        `[安全告警] ${type} 攻击检测`,
        `<p>${message.replace(/\n/g, '<br>')}</p>`
      );
    } catch (err) {
      Logger.warn(`[AutoResponder] 邮件告警失败: ${err.message}`);
    }
  }

  // Webhook 告警
  if (config.webhookUrl) {
    try {
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: type, ip, details, timestamp: new Date().toISOString() })
      });
    } catch (err) {
      Logger.warn(`[AutoResponder] Webhook 告警失败: ${err.message}`);
    }
  }
}
