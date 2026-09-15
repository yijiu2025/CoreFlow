/**
 * 防火墙规则导入导出 API
 *
 * GET  /api/firewall/v1/export/blocks      — 导出封禁列表
 * GET  /api/firewall/v1/export/whitelist   — 导出白名单
 * POST /api/firewall/v1/export/blocks      — 导入封禁列表
 * POST /api/firewall/v1/export/whitelist   — 导入白名单
 *
 * 授权：本组原先写 `allowRoles: ['admin']`，而仓库里**不存在** `code='admin'` 的角色
 * （admin 应用用的是 `admin_admin`，firewall 用 `fw_viewer/fw_operator/fw_admin`），
 * 该配置对所有人都不匹配 —— 导出/导入接口对任何人都 403。现改为按防火墙权限码校验。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import {
  getActiveBlocks,
  getActiveWhitelist,
  setBlock,
  setBlockFp,
  setWhitelist,
  setWhitelistFp
} from '../../../app/firewall/dao/block-manager.js';
import { FIREWALL_PERMISSIONS } from '../../../app/firewall/permission/index.js';

/** 导入数组上限（一次请求最多处理多少条） */
const MAX_IMPORT_ITEMS = 1000;
/** 导入时未给出 duration 的兜底 TTL（秒） */
const DEFAULT_IMPORT_TTL = 86400;

/**
 * 导入请求体 Schema
 *
 * 缺失 body schema 时，`req.body` 为 `undefined` → `const { blocks } = req.body` 直接抛
 * TypeError，Fastify 回 500（而不是 400）。这里补上结构约束，让非法入参稳定拿到 400。
 *
 * @param {string} key 数组字段名（blocks / whitelist）
 * @returns {object} JSON Schema
 */
function importSchema(key) {
  return {
    body: {
      type: 'object',
      required: [key],
      properties: {
        [key]: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_IMPORT_ITEMS,
          items: {
            type: 'object',
            properties: {
              ip: { type: 'string' },
              fingerprint: { type: 'string' },
              type: { type: 'string', enum: ['ip', 'fingerprint'] },
              reason: { type: 'string' },
              status: { type: 'string' },
              permanent: { type: 'boolean' },
              duration: { type: 'number' }
            }
          }
        }
      }
    }
  };
}

/**
 * 从导入条目解析出「目标 + TTL」
 *
 * @param {object} item 导入条目
 * @returns {{isFp:boolean, target:string|undefined, ttlSec:number}} 解析结果
 */
function resolveImportTarget(item) {
  const isFp = (item.type || 'ip') === 'fingerprint';
  const target = (isFp ? item.fingerprint : item.ip) || item.ip || item.fingerprint;
  const ttlSec = Number(item.duration) > 0 ? Math.ceil(Number(item.duration)) : DEFAULT_IMPORT_TTL;
  return { isFp, target, ttlSec };
}

async function registerExportRoutes(fastify) {
  registerGroupMetadata({
    name: 'export',
    alias: '规则导入导出',
    description: '封禁/白名单批量导入导出',
    prefix: '/v1/export',
    enabled: true,
    requireLogin: true,
    // 授权交给各路由的 requirePermission；allowRoles 留空表示「不限角色」（而非「禁止」）
    allowRoles: []
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
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.READ,
    handler: async (req, reply) => {
      const blocks = await getActiveBlocks();
      const exported = blocks.map(b => ({
        ip: b.ip,
        fingerprint: b.fingerprint,
        type: b.type || 'ip',
        reason: b.reason || '',
        status: b.status || 'BLOCKED',
        permanent: b.permanent || false,
        // 必须把「剩余有效期」导出成导入端认识的 `duration`：
        // 旧实现不导出该字段，导入端便一律回落到兜底 TTL(86400)，
        // 「导出 → 导入」会把一条还剩 5 分钟的临时封禁放大成 24 小时。
        duration: b.permanent ? null : b.remainingSeconds,
        remainingSeconds: b.remainingSeconds,
        expiresAt: b.expiresAt ?? null,
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
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.READ,
    handler: async (req, reply) => {
      const whitelist = await getActiveWhitelist();
      const exported = whitelist.map(w => ({
        ip: w.ip,
        fingerprint: w.fingerprint,
        type: w.type || 'ip',
        reason: w.reason || '',
        duration: w.remainingSeconds,
        remainingSeconds: w.remainingSeconds,
        createdAt: w.createdAt
      }));
      return reply.result.success('导出成功', { count: exported.length, whitelist: exported });
    }
  });

  /**
   * POST /api/firewall/v1/export/blocks
   * 批量导入封禁列表
   */
  registerSecureRoute(fastify, {
    name: 'importBlocks',
    alias: '导入封禁列表',
    method: 'POST',
    url: '/blocks',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.BLOCK.WRITE,
    schema: importSchema('blocks'),
    handler: async (req, reply) => {
      const { blocks } = req.body;
      if (!Array.isArray(blocks) || blocks.length === 0) {
        return reply.result.badRequest('缺少 blocks 数组');
      }
      if (blocks.length > MAX_IMPORT_ITEMS) {
        return reply.result.badRequest(`单次导入不能超过 ${MAX_IMPORT_ITEMS} 条`);
      }

      let imported = 0;
      let skipped = 0;
      const failures = [];
      for (const block of blocks) {
        try {
          const { isFp, target, ttlSec } = resolveImportTarget(block);
          if (!target) throw new Error('缺少 ip/fingerprint');
          const permanent = block.permanent !== false;
          const now = Date.now();
          const meta = {
            status: block.status || 'BLOCKED',
            source: 'manual',
            permanent,
            createdAt: now,
            // 旧实现只写了 { type, reason, permanent, timestamp }，临时封禁的 expiresAt 缺失
            // → TTL 算出 NaN → 写入直接失败被计入 skipped（导入静默失效）
            expiresAt: permanent ? null : now + ttlSec * 1000,
            reason: block.reason || '批量导入'
          };
          await (isFp ? setBlockFp(target, meta) : setBlock(target, meta));
          imported++;
        } catch (err) {
          // 逐条失败要留痕：旧实现只 catch{} 累加 skipped，运维无法知道是哪几条、
          // 为什么失败，只能整批重来。这里保留前 20 条原因。
          skipped++;
          if (failures.length < 20) {
            failures.push({ target: block.ip || block.fingerprint || null, message: err.message });
          }
        }
      }

      return reply.result.success('导入完成', { imported, skipped, total: blocks.length, failures });
    }
  });

  /**
   * POST /api/firewall/v1/export/whitelist
   * 批量导入白名单
   */
  registerSecureRoute(fastify, {
    name: 'importWhitelist',
    alias: '导入白名单',
    method: 'POST',
    url: '/whitelist',
    requireLogin: true,
    requirePermission: FIREWALL_PERMISSIONS.WHITELIST.WRITE,
    schema: importSchema('whitelist'),
    handler: async (req, reply) => {
      const { whitelist } = req.body;
      if (!Array.isArray(whitelist) || whitelist.length === 0) {
        return reply.result.badRequest('缺少 whitelist 数组');
      }
      if (whitelist.length > MAX_IMPORT_ITEMS) {
        return reply.result.badRequest(`单次导入不能超过 ${MAX_IMPORT_ITEMS} 条`);
      }

      let imported = 0;
      let skipped = 0;
      const failures = [];
      for (const item of whitelist) {
        try {
          const { isFp, target, ttlSec } = resolveImportTarget(item);
          if (!target) throw new Error('缺少 ip/fingerprint');
          await (isFp ? setWhitelistFp(target, ttlSec) : setWhitelist(target, ttlSec));
          imported++;
        } catch (err) {
          skipped++;
          if (failures.length < 20) {
            failures.push({ target: item.ip || item.fingerprint || null, message: err.message });
          }
        }
      }

      return reply.result.success('导入完成', { imported, skipped, total: whitelist.length, failures });
    }
  });
}

export default registerExportRoutes;
