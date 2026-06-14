/**
 * 防火墙规则导入导出 API
 *
 * GET  /api/firewall/v1/export/blocks      — 导出封禁列表
 * GET  /api/firewall/v1/export/whitelist   — 导出白名单
 * POST /api/firewall/v1/import/blocks      — 导入封禁列表
 * POST /api/firewall/v1/import/whitelist   — 导入白名单
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import { getActiveBlocks, getActiveWhitelist, setBlock, setWhitelist } from '../../../app/firewall/dao/block-manager.js';

export default async function (fastify) {
  registerGroupMetadata({
    name: 'export',
    alias: '规则导入导出',
    description: '封禁/白名单批量导入导出',
    prefix: '/v1/export',
    enabled: true,
    requireLogin: true,
    allowRoles: ['admin']
  });

  /**
   * GET /api/firewall/v1/export/blocks
   * 导出封禁列表为 JSON
   */
  registerSecureRoute(fastify, {
    name: 'exportBlocks',
    alias: '导出封禁列表',
    method: 'GET',
    url: '/blocks',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (req, reply) => {
      const blocks = await getActiveBlocks(req.server.redis);
      const exported = blocks.map(b => ({
        ip: b.ip,
        fingerprint: b.fingerprint,
        type: b.type || 'ip',
        reason: b.reason || '',
        status: b.status || 'BLOCKED',
        permanent: b.permanent || false,
        createdAt: b.createdAt
      }));
      return reply.result.success('导出成功', { count: exported.length, blocks: exported });
    }
  });

  /**
   * GET /api/firewall/v1/export/whitelist
   * 导出白名单为 JSON
   */
  registerSecureRoute(fastify, {
    name: 'exportWhitelist',
    alias: '导出白名单',
    method: 'GET',
    url: '/whitelist',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (req, reply) => {
      const whitelist = await getActiveWhitelist(req.server.redis);
      const exported = whitelist.map(w => ({
        ip: w.ip,
        fingerprint: w.fingerprint,
        type: w.type || 'ip',
        reason: w.reason || '',
        createdAt: w.createdAt
      }));
      return reply.result.success('导出成功', { count: exported.length, whitelist: exported });
    }
  });

  /**
   * POST /api/firewall/v1/import/blocks
   * 批量导入封禁列表
   */
  registerSecureRoute(fastify, {
    name: 'importBlocks',
    alias: '导入封禁列表',
    method: 'POST',
    url: '/blocks',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (req, reply) => {
      const { blocks } = req.body;
      if (!Array.isArray(blocks) || blocks.length === 0) {
        return reply.code(400).send({ code: 400, message: '缺少 blocks 数组', data: null });
      }
      if (blocks.length > 1000) {
        return reply.code(400).send({ code: 400, message: '单次导入不能超过 1000 条', data: null });
      }

      let imported = 0;
      let skipped = 0;
      for (const block of blocks) {
        try {
          await setBlock(req.server.redis, block.ip || block.fingerprint, {
            type: block.type || 'ip',
            reason: block.reason || '批量导入',
            status: block.status || 'BLOCKED',
            permanent: block.permanent !== false,
            timestamp: Date.now()
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      return reply.result.success('导入完成', { imported, skipped, total: blocks.length });
    }
  });

  /**
   * POST /api/firewall/v1/import/whitelist
   * 批量导入白名单
   */
  registerSecureRoute(fastify, {
    name: 'importWhitelist',
    alias: '导入白名单',
    method: 'POST',
    url: '/whitelist',
    requireLogin: true,
    allowRoles: ['admin'],
    handler: async (req, reply) => {
      const { whitelist } = req.body;
      if (!Array.isArray(whitelist) || whitelist.length === 0) {
        return reply.code(400).send({ code: 400, message: '缺少 whitelist 数组', data: null });
      }

      let imported = 0;
      let skipped = 0;
      for (const item of whitelist) {
        try {
          await setWhitelist(req.server.redis, item.ip || item.fingerprint, {
            type: item.type || 'ip',
            reason: item.reason || '批量导入',
            timestamp: Date.now()
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      return reply.result.success('导入完成', { imported, skipped, total: whitelist.length });
    }
  });
}
