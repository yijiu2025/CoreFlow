/**
 * 审计链路冒烟：真实写库 → 读回 → 按 id 清理
 *
 * 只验证"能落库、能查回、字段完整"，不做业务调用（业务调用由 jest 覆盖）。
 * 跑法：node --env-file=.env scripts/audit-smoke.mjs
 *
 * @author yijiu2025
 * @since 2026-11-17
 */
import { logAuditEvent, getAuditLogs } from '../src/framework/security/auth/index.js';
import { getModel } from '../src/framework/persistence/db/index.js';
import { loadAllModels } from '../src/framework/persistence/db/models.js';

// 模型是惰性注册的：不先 loadAllModels，getModel('AuditLog') 会是 undefined
await loadAllModels();

const marker = `SMOKE-${Date.now()}`;

await logAuditEvent({
  type: 'USER_STATUS',
  userId: null,
  ip: '127.0.0.1',
  userAgent: 'audit-smoke',
  appId: 'console',
  details: {
    targetId: 999999,
    targetUsername: marker,
    from: 1,
    to: 0,
    verb: '冻结',
    changes: [{ field: 'status', from: '正常', to: '冻结' }]
  }
});

const rows = await getAuditLogs({ event: 'USER_STATUS', limit: 10 });
const hit = rows.find(row => JSON.stringify(row.details || '').includes(marker));

if (!hit) {
  console.log('❌ 写入后查不到记录');
  process.exit(1);
}

const detail = typeof hit.details === 'string' ? JSON.parse(hit.details) : hit.details;
console.log('✅ 写入并读回成功');
console.log('   event:', hit.event);
console.log('   app_id:', hit.app_id);
console.log('   ip:', hit.ip, '| ua:', hit.user_agent);
console.log('   details:', JSON.stringify(detail));
console.log('   changes 完整:', JSON.stringify(detail.changes));

const removed = await getModel('AuditLog').destroy({ where: { id: hit.id } });
console.log(removed === 1 ? `✅ 已清理测试记录 #${hit.id}` : `⚠️ 清理未生效 #${hit.id}`);
process.exit(0);
