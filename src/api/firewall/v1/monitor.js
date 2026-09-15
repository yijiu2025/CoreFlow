/**
 * 防火墙监控路由
 *
 * 仪表盘基础 / 节点定位 / 安全策略 / 黑名单 / 封禁 / 白名单 / WebSocket
 *
 * 业务逻辑见 app/firewall/services/monitor.service.js（WS 广播 + 封禁/白名单编排）。
 *
 * 授权说明：
 *   - 本组 metadata 原先写 `requireLogin: false`，而 system.json 是 `requireLogin: true`，
 *     守卫是**级联**的（system → group → api），任一层的 requireLogin 为真即要求登录，
 *     因此 group 上的 false 从来没有生效过（实测未登录一律 401）。system 级改为
 *     `requireLogin: false` 之后，各组的声明才真正决定行为 —— 本组是中控面板，必须登录。
 *   - 15 个权限码此前只注册、不校验（所有路由无 requirePermission）。现已按
 *     `fw_viewer`（只读）/ `fw_operator`（可写名单与策略）/ `fw_admin`（含节点管理、重置）
 *     三个角色的策略逐一接线。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { registerGroupMetadata, registerSecureRoute, registerSecureWebSocket, getFullUrl } from '../../guard.js';
import { getRecentRecords, getSummary } from '../../../app/firewall/data/store.js';
import {
  getServerNode,
  updateServerNodeMetadata,
  refreshServerNodeAuto,
  getSecuritySettings,
  updateSecuritySettings,
  getIpApis
} from '../../../app/firewall/dao/dao.js';
import { getActiveBlocks, getActiveWhitelist } from '../../../app/firewall/dao/block-manager.js';
import {
  summarySchema,
  updateNodeSchema,
  updateSettingsSchema,
  blacklistSchema,
  removeBlacklistSchema,
  blocksSchema,
  whitelistSchema
} from './schemas/monitor.js';
import { FIREWALL_PERMISSIONS } from '../../../app/firewall/permission/index.js';
import {
  registerMonitorClient,
  clearRecordsAndBroadcast,
  addBlacklistEntry,
  removeBlacklistEntry,
  addIpBlock,
  removeIpBlock,
  addFpBlock,
  removeFpBlock,
  addIpWhitelist,
  removeIpWhitelist,
  addFpWhitelist,
  removeFpWhitelist,
  addDeviceBlock,
  removeDeviceBlock,
  addDeviceWhitelist,
  removeDeviceWhitelist
} from '../../../app/firewall/services/monitor.service.js';

async function registerMonitorRoutes(fastify) {
  registerGroupMetadata({
    name: 'firewall-monitor',
    alias: '防火墙中控面板',
    description: '负责分析实时流量、地理位置分布及异常请求检测。',
    prefix: '/v1/monitor',
    enabled: true,
    requireLogin: true,
    allowIps: [],
    allowRoles: []
  });

  // ==================== 仪表盘基础 API ====================
  registerSecureRoute(fastify, {
    name: 'summary',
    alias: '全局统计摘要',
    method: 'GET',
    url: '/summary',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.MONITOR.SUMMARY,
    schema: summarySchema,
    handler: async (request, reply) => {
      return reply.result.success('操作成功', {
        ...getSummary(),
        serverNode: getServerNode()
      });
    }
  });

  registerSecureRoute(fastify, {
    name: 'records',
    alias: '实时流量日志',
    method: 'GET',
    url: '/records',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.MONITOR.LOGS,
    handler: async (req, reply) => reply.result.success('操作成功', getRecentRecords())
  });

  registerSecureRoute(fastify, {
    name: 'clear',
    alias: '清空审计记录',
    method: 'POST',
    url: '/clear',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.ADMIN.RESET,
    handler: async (req, reply) => {
      clearRecordsAndBroadcast();
      return reply.result.success('审计记录已清空');
    }
  });

  // ==================== 节点与定位 API ====================
  registerSecureRoute(fastify, {
    name: 'updateNode',
    alias: '手动更新节点信息',
    method: 'PATCH',
    url: '/node/update',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.ADMIN.NODE,
    schema: updateNodeSchema,
    handler: async (req, reply) => reply.result.success('更新成功', updateServerNodeMetadata(req.body))
  });

  registerSecureRoute(fastify, {
    name: 'refreshNode',
    alias: '触发自动定位',
    method: 'POST',
    url: '/node/refresh',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.ADMIN.NODE,
    handler: async (req, reply) => {
      await refreshServerNodeAuto();
      return reply.result.success('位置检测已执行', getServerNode());
    }
  });

  // ==================== 高级安全策略 API ====================
  registerSecureRoute(fastify, {
    name: 'getSettings',
    alias: '获取全局安全设置',
    method: 'GET',
    url: '/settings',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.DEFENSE.READ,
    handler: async (req, reply) =>
      reply.result.success('操作成功', {
        settings: getSecuritySettings(),
        availableApis: getIpApis()
      })
  });

  registerSecureRoute(fastify, {
    name: 'updateSettings',
    alias: '更新安全设置 (支持局部更新)',
    method: 'PATCH',
    url: '/settings',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.DEFENSE.WRITE,
    schema: updateSettingsSchema,
    handler: async (req, reply) => reply.result.success('设置已更新', updateSecuritySettings(req.body))
  });

  // ==================== 动态黑名单管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addBlacklist',
    alias: '添加黑名单(IP/用户)',
    method: 'POST',
    url: '/blacklist',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.WRITE,
    schema: blacklistSchema,
    handler: async (req, reply) => {
      const result = await addBlacklistEntry(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message, result.defenseState);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlacklist',
    alias: '移除黑名单',
    method: 'DELETE',
    url: '/blacklist',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.WRITE,
    // DELETE 带 body 是合法的（Fastify 会解析），但原先没有 schema：body 缺失时
    // handler 里读 req.body.type 直接抛 TypeError → 500。补 schema 让它稳定回 400。
    schema: removeBlacklistSchema,
    handler: async (req, reply) => {
      const result = await removeBlacklistEntry(req.body);
      return reply.result.success(result.message, result.defenseState);
    }
  });

  // ==================== 封禁管理 API ====================
  registerSecureRoute(fastify, {
    name: 'listBlocks',
    alias: '获取所有活跃封禁列表',
    method: 'GET',
    url: '/blocks',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.READ,
    handler: async (req, reply) => {
      const blocks = await getActiveBlocks();
      return reply.result.success('操作成功', blocks);
    }
  });

  registerSecureRoute(fastify, {
    name: 'addBlock',
    alias: '添加封禁(IP)',
    method: 'POST',
    url: '/blocks',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.WRITE,
    schema: blocksSchema,
    handler: async (req, reply) => {
      const result = await addIpBlock(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlock',
    alias: '移除封禁',
    method: 'DELETE',
    url: '/blocks/:ip',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.WRITE,
    handler: async (req, reply) => {
      const result = await removeIpBlock(req.params.ip);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== 白名单管理 API ====================
  registerSecureRoute(fastify, {
    name: 'listWhitelist',
    alias: '获取所有活跃白名单',
    method: 'GET',
    url: '/whitelist',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.READ,
    handler: async (req, reply) => {
      const list = await getActiveWhitelist();
      return reply.result.success('操作成功', list);
    }
  });

  registerSecureRoute(fastify, {
    name: 'addWhitelist',
    alias: '添加白名单',
    method: 'POST',
    url: '/whitelist',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    schema: whitelistSchema,
    handler: async (req, reply) => {
      const result = await addIpWhitelist(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelist',
    alias: '移除白名单',
    method: 'DELETE',
    url: '/whitelist/:ip',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    handler: async (req, reply) => {
      const result = await removeIpWhitelist(req.params.ip);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== 指纹封禁管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addBlockFp',
    alias: '添加指纹封禁',
    method: 'POST',
    url: '/blocks/fp',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.FINGERPRINT,
    schema: fpSchema('fingerprint', true),
    handler: async (req, reply) => {
      const result = await addFpBlock(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlockFp',
    alias: '移除指纹封禁',
    method: 'DELETE',
    url: '/blocks/fp/:fingerprint',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.FINGERPRINT,
    handler: async (req, reply) => {
      const result = await removeFpBlock(req.params.fingerprint);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== 指纹白名单管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addWhitelistFp',
    alias: '添加指纹白名单',
    method: 'POST',
    url: '/whitelist/fp',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    schema: fpSchema('fingerprint', false),
    handler: async (req, reply) => {
      const result = await addFpWhitelist(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelistFp',
    alias: '移除指纹白名单',
    method: 'DELETE',
    url: '/whitelist/fp/:fingerprint',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    handler: async (req, reply) => {
      const result = await removeFpWhitelist(req.params.fingerprint);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== 设备封禁管理 API（跨 IP 生效） ====================
  // 设备 ID 是唯一与 IP 无关的身份维度：攻击者换 IP 重来时，只有这一维度还能拦住它。
  registerSecureRoute(fastify, {
    name: 'addBlockDevice',
    alias: '添加设备封禁',
    method: 'POST',
    url: '/blocks/device',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.FINGERPRINT,
    schema: fpSchema('deviceId', true),
    handler: async (req, reply) => {
      const result = await addDeviceBlock(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlockDevice',
    alias: '移除设备封禁',
    method: 'DELETE',
    url: '/blocks/device/:deviceId',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.FINGERPRINT,
    handler: async (req, reply) => {
      const result = await removeDeviceBlock(req.params.deviceId);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== 设备白名单管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addWhitelistDevice',
    alias: '添加设备白名单',
    method: 'POST',
    url: '/whitelist/device',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    schema: fpSchema('deviceId', false),
    handler: async (req, reply) => {
      const result = await addDeviceWhitelist(req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelistDevice',
    alias: '移除设备白名单',
    method: 'DELETE',
    url: '/whitelist/device/:deviceId',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    handler: async (req, reply) => {
      const result = await removeDeviceWhitelist(req.params.deviceId);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== WebSocket ====================
  const wsUrl = getFullUrl('/ws');
  registerSecureWebSocket(fastify, {
    url: wsUrl,
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.MONITOR.READ,
    handler: (connection, req, client) => registerMonitorClient(client)
  });
}

/**
 * 「单标识维度」接口的请求体 Schema（原先这些接口完全没有 schema，`req.body` 缺失即 500）
 *
 * 对 `fingerprint` 与 `deviceId` 通用：两者都只是「某个字符串标识」，
 * 差别仅在字段名与是否带封禁字段。
 *
 * @param {string} field 标识字段名（'fingerprint' | 'deviceId'）
 * @param {boolean} withBlockFields 是否带封禁相关字段（时长/永久/状态）
 * @returns {object} JSON Schema
 */
function fpSchema(field, withBlockFields) {
  const properties = {
    [field]: { type: 'string', minLength: 8 },
    duration: { type: 'number', minimum: 60 }
  };
  if (withBlockFields) {
    properties.permanent = { type: 'boolean' };
    properties.status = { type: 'string', enum: ['BLOCKED', 'SCANNER', 'CHALLENGE'] };
  }
  return {
    body: {
      type: 'object',
      required: [field],
      properties
    }
  };
}

export default registerMonitorRoutes;
