/**
 * 防火墙只读监控接口
 *
 * GET /admin/console/v1/firewall/summary    —— 流量与拦截汇总
 * GET /admin/console/v1/firewall/blocks     —— 生效中的封禁名单（分页）
 * GET /admin/console/v1/firewall/whitelist  —— 生效中的白名单
 *
 * 只读：写操作（加黑 / 解封 / 改策略）由防火墙配置接口承担，
 * 这里不复制一套写入口，避免两处策略状态不一致。
 *
 * ── 数据来源（2026-11-21 调整）──
 * 汇总原先取自 `app/firewall/data/store.js`（面板应用的遥测实现）。面板被卸载后
 * 这条 import 直接让整个 API 加载器失败（连坐整个 `/admin/console` 目录）。
 * 现在汇总改读 framework 自带的遥测存储（`framework/ingress/firewall/telemetry/store.js`）：
 * 记录本来就在防护核心里产生，计数器跟核心同层才不会被「装不装面板」左右。
 *
 * 封禁 / 白名单来自 `framework/ingress/firewall/block-manager.js`，本就是框架能力。
 * 这里额外做一层**视图归一**：底层按维度给出 `ip / fingerprint / deviceId`，
 * 而管理前端只认 `kind`（维度）+ `value`（对象），归一放在接口层，前端就不必
 * 认识后端的三种维度字段（也避免每加一个维度就要改一次页面）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 * @since 2026-11-21 汇总改读 framework 遥测；封禁记录归一为 kind/value
 */
import { registerGroupMetadata, registerSecureRoute } from '../../../guard.js';
import { ADMIN_PERMISSIONS } from '../../../../app/admin/permission/index.js';
import { getSummary } from '../../../../framework/ingress/firewall/telemetry/store.js';
import { getActiveBlocks, getActiveWhitelist } from '../../../../framework/ingress/firewall/block-manager.js';
import { withFail } from '../../../../app/admin/console/utils/respond.js';

/**
 * 把底层维度记录归一成前端视图
 *
 * 底层形状（block-manager 的 flattenDimension）：
 *   `{ ip|fingerprint|deviceId, type, status, permanent, createdAt(ms), expiresAt, remainingSeconds }`
 * 视图形状：`{ id, kind, value, reason, remainingSeconds, createdAt(ISO) }`
 *
 * `createdAt` 统一成 ISO 字符串：底层存的是毫秒时间戳，前端 `new Date(String(ms))`
 * 在多数运行时会得到 Invalid Date（数字串不是合法日期格式），表现为整列都是「—」。
 *
 * @param {object} row 底层记录
 * @returns {object} 视图记录
 */
function toBlockView(row) {
  const value = row.ip ?? row.fingerprint ?? row.deviceId ?? '';
  const kind = row.type || (row.ip ? 'ip' : row.fingerprint ? 'fingerprint' : 'device');
  const createdAt = Number.isFinite(row.createdAt) ? new Date(row.createdAt).toISOString() : null;

  return {
    // id 只用于列表 key：同一维度同一对象在一屏内唯一即可
    id: `${kind}:${value}`,
    kind,
    value: String(value),
    reason: row.reason || row.status || '—',
    permanent: Boolean(row.permanent),
    remainingSeconds: row.permanent ? null : (row.remainingSeconds ?? null),
    createdAt
  };
}

async function registerConsoleFirewallRoutes(fastify) {
  registerGroupMetadata({
    name: 'consoleFirewall',
    alias: '管理后台防火墙监控',
    description: '防火墙汇总、封禁名单、白名单（只读）',
    prefix: '/console/v1',
    enabled: true,
    requireLogin: true
  });

  registerSecureRoute(fastify, {
    name: 'consoleFirewallSummary',
    alias: '防火墙汇总',
    method: 'GET',
    url: '/firewall/summary',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.FIREWALL.READ,
    handler: withFail(async (request, reply) => {
      // 同步方法：计数器与环形缓冲都在内存里，不需要 await
      return reply.result.success('获取成功', getSummary());
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleFirewallBlocks',
    alias: '封禁名单',
    method: 'GET',
    url: '/firewall/blocks',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.FIREWALL.READ,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          pageNum: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200, default: 20 }
        }
      }
    },
    handler: withFail(async (request, reply) => {
      const { pageNum = 1, pageSize = 20 } = request.query;
      const all = (await getActiveBlocks()).map(toBlockView);
      const start = (Number(pageNum) - 1) * Number(pageSize);
      return reply.result.success('获取成功', {
        rows: all.slice(start, start + Number(pageSize)),
        total: all.length,
        pageNum: Number(pageNum),
        pageSize: Number(pageSize)
      });
    })
  });

  registerSecureRoute(fastify, {
    name: 'consoleFirewallWhitelist',
    alias: '白名单',
    method: 'GET',
    url: '/firewall/whitelist',
    requireLogin: true,
    requirePermission: ADMIN_PERMISSIONS.FIREWALL.READ,
    handler: withFail(async (request, reply) => {
      const rows = (await getActiveWhitelist()).map(toBlockView);
      return reply.result.success('获取成功', rows);
    })
  });
}

export default registerConsoleFirewallRoutes;

// 纯视图函数对外导出：管理前端的列（kind / value / createdAt）就是靠它对齐的，
// 单独可测比"起一个带鉴权的真服务"便宜（见 __tests__/api/console-firewall-view.test.js）。
export { toBlockView };
