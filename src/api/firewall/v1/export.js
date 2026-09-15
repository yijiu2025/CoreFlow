/**
 * 防火墙规则导入导出 API
 *
 * GET  /api/firewall/v1/export/blocks      — 导出封禁列表
 * GET  /api/firewall/v1/export/whitelist   — 导出白名单
 * POST /api/firewall/v1/export/blocks      — 导入封禁列表
 * POST /api/firewall/v1/export/whitelist   — 导入白名单
 *
 * 支持三个身份维度：`ip` / `fingerprint` / `device`（设备 ID，与 IP 无关、跨 IP 生效）。
 * 维度由条目的 `type` 字段区分，写入口按维度分派（`BLOCK_WRITERS` / `WHITELIST_WRITERS`）。
 *
 * 授权：本组原先写 `allowRoles: ['admin']`，而仓库里**不存在** `code='admin'` 的角色
 * （admin 应用用的是 `admin_admin`，firewall 用 `fw_viewer/fw_operator/fw_admin`），
 * 该配置对所有人都不匹配 —— 导出/导入接口对任何人都 403。现改为按防火墙权限码校验。
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-15 支持设备维度
 */

import { registerGroupMetadata, registerSecureRoute } from '../../guard.js';
import {
  getActiveBlocks,
  getActiveWhitelist,
  setBlock,
  setBlockFp,
  setBlockDevice,
  setWhitelist,
  setWhitelistFp,
  setWhitelistDevice
} from '../../../app/firewall/dao/block-manager.js';
import { FIREWALL_PERMISSIONS } from '../../../app/firewall/permission/index.js';

/** 导入数组上限（一次请求最多处理多少条） */
const MAX_IMPORT_ITEMS = 1000;
/** 导入时未给出 duration 的兜底 TTL（秒） */
const DEFAULT_IMPORT_TTL = 86400;

/** 维度 → 封禁写入函数 */
const BLOCK_WRITERS = { ip: setBlock, fingerprint: setBlockFp, device: setBlockDevice };
/** 维度 → 白名单写入函数 */
const WHITELIST_WRITERS = { ip: setWhitelist, fingerprint: setWhitelistFp, device: setWhitelistDevice };

/** 各维度对应的标识字段名 */
const ID_FIELD = { ip: 'ip', fingerprint: 'fingerprint', device: 'deviceId' };

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
              deviceId: { type: 'string' },
              type: { type: 'string', enum: ['ip', 'fingerprint', 'device'] },
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
 * 从导入条目解析出「维度 + 标识 + TTL」
 *
 * `type` 缺省按 `ip` 处理（与历史导出数据兼容）；给出 type 但对应标识字段为空时
 * 才回退到另一个字段，避免「导出 block:dev:xxx 却被当成 IP 导入」这类静默错配。
 *
 * @param {object} item 导入条目
 * @returns {{dim:'ip'|'fingerprint'|'device', target:string|undefined, ttlSec:number}} 解析结果
 */
function resolveImportTarget(item) {
  const type = item.type || 'ip';
  const dim = Object.prototype.hasOwnProperty.call(ID_FIELD, type) ? type : 'ip';
  const own = item[ID_FIELD[dim]];
  // 兼容早期只有 ip/fingerprint 两个字段的条目：两者都填时以 type 指定的为准
  const fallback = dim === 'ip' ? item.fingerprint : item.ip;
  const target = own || fallback;
  const ttlSec = Number(item.duration) > 0 ? Math.ceil(Number(item.duration)) : DEFAULT_IMPORT_TTL;
  return { dim, target, ttlSec };
}

/**
 * 把活跃**封禁**条目映射成导出结构（三个维度共用）
 *
 * @param {object} entry 活跃封禁条目
 * @returns {object} 导出条目
 */
function toExportEntry(entry) {
  return {
    ip: entry.ip,
    fingerprint: entry.fingerprint,
    deviceId: entry.deviceId,
    type: entry.type || 'ip',
    reason: entry.reason || '',
    status: entry.status || 'BLOCKED',
    permanent: entry.permanent || false,
    // 必须把「剩余有效期」导出成导入端认识的 `duration`：
    // 旧实现不导出该字段，导入端便一律回落到兜底 TTL(86400)，
    // 「导出 → 导入」会把一条还剩 5 分钟的临时封禁放大成 24 小时。
    duration: entry.permanent ? null : entry.remainingSeconds,
    remainingSeconds: entry.remainingSeconds,
    expiresAt: entry.expiresAt ?? null,
    createdAt: entry.createdAt
  };
}

/**
 * 把活跃**白名单**条目映射成导出结构（白名单无 status/permanent 语义，不导出这两项）
 *
 * @param {object} entry 活跃白名单条目
 * @returns {object} 导出条目
 */
function toWhitelistExportEntry(entry) {
  return {
    ip: entry.ip,
    fingerprint: entry.fingerprint,
    deviceId: entry.deviceId,
    type: entry.type || 'ip',
    reason: entry.reason || '',
    duration: entry.remainingSeconds,
    remainingSeconds: entry.remainingSeconds,
    createdAt: entry.createdAt
  };
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
      const exported = blocks.map(toExportEntry);
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
      const exported = whitelist.map(toWhitelistExportEntry);
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
          const { dim, target, ttlSec } = resolveImportTarget(block);
          if (!target) throw new Error('缺少 ip / fingerprint / deviceId');
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
          await BLOCK_WRITERS[dim](target, meta);
          imported++;
        } catch (err) {
          // 逐条失败要留痕：旧实现只 catch{} 累加 skipped，运维无法知道是哪几条、
          // 为什么失败，只能整批重来。这里保留前 20 条原因。
          skipped++;
          if (failures.length < 20) {
            failures.push({ target: block.ip || block.fingerprint || block.deviceId || null, message: err.message });
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
          const { dim, target, ttlSec } = resolveImportTarget(item);
          if (!target) throw new Error('缺少 ip / fingerprint / deviceId');
          await WHITELIST_WRITERS[dim](target, ttlSec);
          imported++;
        } catch (err) {
          skipped++;
          if (failures.length < 20) {
            failures.push({ target: item.ip || item.fingerprint || item.deviceId || null, message: err.message });
          }
        }
      }

      return reply.result.success('导入完成', { imported, skipped, total: whitelist.length, failures });
    }
  });
}

export default registerExportRoutes;
