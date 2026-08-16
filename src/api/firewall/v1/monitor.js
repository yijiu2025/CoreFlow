/**
 * 防火墙监控路由
 *
 * 仪表盘基础 / 节点定位 / 安全策略 / 黑名单 / 封禁 / 白名单 / WebSocket
 *
 * 业务逻辑见 app/firewall/services/monitor.service.js（WS 广播 + 封禁/白名单编排）。
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
  blocksSchema,
  whitelistSchema
} from './schemas/monitor.js';
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
  removeFpWhitelist
} from '../../../app/firewall/services/monitor.service.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'firewall-monitor',
    alias: '防火墙中控面板',
    description: '负责分析实时流量、地理位置分布及异常请求检测。',
    prefix: '/v1/monitor',
    enabled: true,
    requireLogin: false,
    allowIps: [],
    allowRoles: []
  });

  // ==================== 仪表盘基础 API ====================
  registerSecureRoute(fastify, {
    name: 'summary',
    alias: '全局统计摘要',
    method: 'GET',
    url: '/summary',
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
    handler: async (req, reply) => reply.result.success('操作成功', getRecentRecords())
  });

  registerSecureRoute(fastify, {
    name: 'clear',
    alias: '清空审计记录',
    method: 'POST',
    url: '/clear',
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
    schema: updateNodeSchema,
    handler: async (req, reply) => reply.result.success('更新成功', updateServerNodeMetadata(req.body))
  });

  registerSecureRoute(fastify, {
    name: 'refreshNode',
    alias: '触发自动定位',
    method: 'POST',
    url: '/node/refresh',
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
    schema: updateSettingsSchema,
    handler: async (req, reply) => reply.result.success('设置已更新', updateSecuritySettings(req.body))
  });

  // ==================== 动态黑名单管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addBlacklist',
    alias: '添加黑名单(IP/用户)',
    method: 'POST',
    url: '/blacklist',
    schema: blacklistSchema,
    handler: async (req, reply) => {
      const result = await addBlacklistEntry(req.server.redis, req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message, result.defenseState);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlacklist',
    alias: '移除黑名单',
    method: 'DELETE',
    url: '/blacklist',
    handler: async (req, reply) => {
      const result = await removeBlacklistEntry(req.server.redis, req.body);
      return reply.result.success(result.message, result.defenseState);
    }
  });

  // ==================== 封禁管理 API ====================
  registerSecureRoute(fastify, {
    name: 'listBlocks',
    alias: '获取所有活跃封禁列表',
    method: 'GET',
    url: '/blocks',
    handler: async (req, reply) => {
      const blocks = await getActiveBlocks(req.server.redis);
      return reply.result.success('操作成功', blocks);
    }
  });

  registerSecureRoute(fastify, {
    name: 'addBlock',
    alias: '添加封禁(IP)',
    method: 'POST',
    url: '/blocks',
    schema: blocksSchema,
    handler: async (req, reply) => {
      const result = await addIpBlock(req.server.redis, req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlock',
    alias: '移除封禁',
    method: 'DELETE',
    url: '/blocks/:ip',
    handler: async (req, reply) => {
      const result = await removeIpBlock(req.server.redis, req.params.ip);
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
    handler: async (req, reply) => {
      const list = await getActiveWhitelist(req.server.redis);
      return reply.result.success('操作成功', list);
    }
  });

  registerSecureRoute(fastify, {
    name: 'addWhitelist',
    alias: '添加白名单',
    method: 'POST',
    url: '/whitelist',
    schema: whitelistSchema,
    handler: async (req, reply) => {
      const result = await addIpWhitelist(req.server.redis, req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelist',
    alias: '移除白名单',
    method: 'DELETE',
    url: '/whitelist/:ip',
    handler: async (req, reply) => {
      const result = await removeIpWhitelist(req.server.redis, req.params.ip);
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
    handler: async (req, reply) => {
      const result = await addFpBlock(req.server.redis, req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlockFp',
    alias: '移除指纹封禁',
    method: 'DELETE',
    url: '/blocks/fp/:fingerprint',
    handler: async (req, reply) => {
      const result = await removeFpBlock(req.server.redis, req.params.fingerprint);
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
    handler: async (req, reply) => {
      const result = await addFpWhitelist(req.server.redis, req.body);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelistFp',
    alias: '移除指纹白名单',
    method: 'DELETE',
    url: '/whitelist/fp/:fingerprint',
    handler: async (req, reply) => {
      const result = await removeFpWhitelist(req.server.redis, req.params.fingerprint);
      if (!result.ok) return reply.result.badRequest(result.message);
      return reply.result.success(result.message);
    }
  });

  // ==================== WebSocket ====================
  const wsUrl = getFullUrl('/ws');
  registerSecureWebSocket(fastify, {
    url: wsUrl,
    requireLogin: true,
    handler: (connection, req, client) => registerMonitorClient(client)
  });
}
