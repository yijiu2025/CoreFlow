import { registerGroupMetadata, registerSecureRoute, getFullUrl } from '../../guard.js';
import { getRecentRecords, getSummary, clearAll, setBroadcastHandler } from '../../../firewall/data/store.js';
import {
  getServerNode,
  updateServerNodeMetadata,
  refreshServerNodeAuto,
  getSecuritySettings,
  updateSecuritySettings,
  getIpApis,
  addToBlacklist,
  removeFromBlacklist,
  addToWhitelist,
  removeFromWhitelist
} from '../../../firewall/dao/dao.js';
import { setBlock, removeBlock } from '../../../firewall/engine/index.js';
import {
  getActiveBlocks,
  getActiveWhitelist,
  setWhitelist,
  removeWhitelist as removeWhitelistRedis,
  setBlockFp,
  removeBlockFp,
  setWhitelistFp,
  removeWhitelistFp
} from '../../../firewall/dao/block-manager.js';
import {
  summarySchema,
  updateNodeSchema,
  updateSettingsSchema,
  blacklistSchema,
  blocksSchema,
  whitelistSchema
} from './schemas.js';
// 保存所有活跃的 WebSocket 客户端
const clients = new Set();

export default async function (fastify) {
  // 1. 注册模块级配置 (Level 2)
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

  // 2. 订阅推送逻辑
  setBroadcastHandler((record) => {
    try {
      const data = JSON.stringify({ type: 'LOG', data: record });
      for (const client of clients) {
        try {
          if (client && client.readyState === 1) {
            client.send(data, (err) => {
              if (err) clients.delete(client);
            });
          }
        } catch (innerErr) {
          clients.delete(client);
        }
      }
    } catch (err) {
      console.error('🚨 [Monitor WS] 广播序列化失败:', err.message);
    }
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
      clearAll();
      const resetMsg = JSON.stringify({ type: 'INIT', data: { summary: getSummary(), records: [] } });
      for (const client of clients) if (client.readyState === 1) client.send(resetMsg);
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
        availableApis: getIpApis() // 连同可用的 API 列表一起下发给前端下拉框
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
    // Body 示例: { type: "ip", value: "192.168.1.1" } 或 { type: "user", value: "admin" }
    handler: async (req, reply) => {
      const { type, value, duration, permanent } = req.body;
      if (!['ip', 'user'].includes(type) || !value) return reply.result.badRequest('参数错误');

      const defenseState = addToBlacklist(type, value);

      // IP 类型时同步写入 Redis 封禁
      if (type === 'ip') {
        const isPermanent = permanent !== false && !duration;
        await setBlock(req.server.redis, value, {
          status: 'BLOCKED',
          source: 'manual',
          permanent: isPermanent,
          createdAt: Date.now(),
          expiresAt: isPermanent ? null : Date.now() + (duration || 86400) * 1000,
        });
      }

      return reply.result.success(`已加入${permanent === false ? '临时' : '永久'}黑名单`, defenseState);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlacklist',
    alias: '移除黑名单',
    method: 'DELETE',
    url: '/blacklist',
    handler: async (req, reply) => {
      const { type, value } = req.body;
      const defenseState = removeFromBlacklist(type, value);

      if (type === 'ip') {
        await removeBlock(req.server.redis, value);
      }
      try {
        await req.server.redis?.del(`fw:lock:${value}`);
      } catch (e) {
        console.error('❌ [Monitor] 删除 Redis 封禁失败:', e);
      }

      return reply.result.success(`已移出黑名单`, defenseState);
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
      const { ip, duration, permanent, status } = req.body;
      if (!ip) return reply.result.badRequest('缺少 IP 参数');

      const isPermanent = permanent === true || (!duration && permanent !== false);
      const blockStatus = status || 'BLOCKED';

      await setBlock(req.server.redis, ip, {
        status: blockStatus,
        source: 'manual',
        permanent: isPermanent,
        createdAt: Date.now(),
        expiresAt: isPermanent ? null : Date.now() + (duration || 86400) * 1000,
      });

      // 同步到配置持久化
      addToBlacklist('ip', ip);

      return reply.result.success(isPermanent ? '已永久封禁' : `已封禁 ${duration || 86400} 秒`);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlock',
    alias: '移除封禁',
    method: 'DELETE',
    url: '/blocks/:ip',
    handler: async (req, reply) => {
      const { ip } = req.params;
      if (!ip) return reply.result.badRequest('缺少 IP 参数');

      await removeBlock(req.server.redis, ip);
      removeFromBlacklist('ip', ip);

      return reply.result.success('已解除封禁');
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
      const { ip, duration } = req.body;
      if (!ip) return reply.result.badRequest('缺少 IP 参数');

      const dur = duration || 1200; // 默认 20 分钟
      await setWhitelist(req.server.redis, ip, dur);
      addToWhitelist(ip, dur);

      return reply.result.success(`已添加白名单 ${dur} 秒`);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelist',
    alias: '移除白名单',
    method: 'DELETE',
    url: '/whitelist/:ip',
    handler: async (req, reply) => {
      const { ip } = req.params;
      if (!ip) return reply.result.badRequest('缺少 IP 参数');

      await removeWhitelistRedis(req.server.redis, ip);
      removeFromWhitelist(ip);

      return reply.result.success('已移除白名单');
    }
  });

  // ==================== 指纹封禁管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addBlockFp',
    alias: '添加指纹封禁',
    method: 'POST',
    url: '/blocks/fp',
    handler: async (req, reply) => {
      const { fingerprint, duration, permanent, status } = req.body;
      if (!fingerprint) return reply.result.badRequest('缺少指纹参数');

      const isPermanent = permanent === true || (!duration && permanent !== false);
      const blockStatus = status || 'BLOCKED';

      await setBlockFp(req.server.redis, fingerprint, {
        status: blockStatus,
        source: 'manual',
        permanent: isPermanent,
        createdAt: Date.now(),
        expiresAt: isPermanent ? null : Date.now() + (duration || 86400) * 1000,
      });

      return reply.result.success(isPermanent ? '已永久封禁该指纹' : `已封禁指纹 ${duration || 86400} 秒`);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeBlockFp',
    alias: '移除指纹封禁',
    method: 'DELETE',
    url: '/blocks/fp/:fingerprint',
    handler: async (req, reply) => {
      const { fingerprint } = req.params;
      if (!fingerprint) return reply.result.badRequest('缺少指纹参数');

      await removeBlockFp(req.server.redis, fingerprint);

      return reply.result.success('已解除指纹封禁');
    }
  });

  // ==================== 指纹白名单管理 API ====================
  registerSecureRoute(fastify, {
    name: 'addWhitelistFp',
    alias: '添加指纹白名单',
    method: 'POST',
    url: '/whitelist/fp',
    handler: async (req, reply) => {
      const { fingerprint, duration } = req.body;
      if (!fingerprint) return reply.result.badRequest('缺少指纹参数');

      const dur = duration || 1200; // 默认 20 分钟
      await setWhitelistFp(req.server.redis, fingerprint, dur);

      return reply.result.success(`已添加指纹白名单 ${dur} 秒`);
    }
  });

  registerSecureRoute(fastify, {
    name: 'removeWhitelistFp',
    alias: '移除指纹白名单',
    method: 'DELETE',
    url: '/whitelist/fp/:fingerprint',
    handler: async (req, reply) => {
      const { fingerprint } = req.params;
      if (!fingerprint) return reply.result.badRequest('缺少指纹参数');

      await removeWhitelistFp(req.server.redis, fingerprint);

      return reply.result.success('已移除指纹白名单');
    }
  });

  // ==================== WebSocket ====================
  // WebSocket 升级处理
  const wsUrl = getFullUrl('/ws');
  fastify.get(wsUrl, { websocket: true }, (connection, req) => {
    // 鲁棒性获取 Socket 实例
    const client = connection.socket || connection;

    if (!client || typeof client.on !== 'function') {
      console.warn('⚠️  WebSocket 异常：未发现有效的 Socket 实例');
      return;
    }

    const onData = (data) => {
      if (data.toString() === 'PING') client.send('PONG');
    };
    client.on('message', onData);
    clients.add(client);
    client.on('close', () => {
      clients.delete(client);
      client.removeListener('message', onData);
    });

    // 确保连接处于开启状态后再发送
    if (client.readyState === 1) {
      client.send(
        JSON.stringify({
          type: 'INIT',
          data: {
            summary: {
              ...getSummary(),
              serverNode: getServerNode(),
              securitySettings: getSecuritySettings()
            },
            records: getRecentRecords()
          }
        })
      );
    }
  });
}
