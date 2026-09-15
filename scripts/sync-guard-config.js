/**
 * 守卫配置收敛脚本 —— 让「代码声明」重新生效
 *
 * 背景
 * ----
 * Guard 的配置有两个来源，运行时遵循「运维优先」：
 *   1. 代码声明：`src/api/**\/*.js`（`registerSystemMetadata` / `registerGroupMetadata`）
 *      与 `src/api/<system>/system.json`；
 *   2. 数据库：`guard_configs` 表，启动时用其中的运行时字段**覆盖**代码声明。
 *
 * 被 DB 覆盖的只有 4 个运行时字段：
 *   `enabled` / `requireLogin` / `allowIps` / `allowRoles`
 * （`requirePermission` 不在其中，永远以代码为准。）
 *
 * 于是出现一类「改了代码却不生效」的问题：代码里把某接口改成 `requireLogin: false`，
 * 只要 DB 里那行还留着 `requireLogin: true`，启动时就会被覆盖回去。
 *
 * 本脚本做一件事：把指定系统的这 4 个字段从 DB 行里**删除**（system / 每个 group /
 * 每个 api 三层都删）。删掉之后 DB 不再覆盖 → 代码声明成为唯一来源，行为可预期。
 * 下次守卫配置落库时会把这 4 个字段按代码值重新写回。
 *
 * ⚠️ 这会**丢弃该系统的运维侧运行时调整**（例如线上临时给某个接口加了 IP 白名单）。
 *    因此默认是 dry-run，必须显式 `--apply` 才写库。
 *
 * 用法
 * ----
 *   node --env-file=.env scripts/sync-guard-config.js firewall            # 预览
 *   node --env-file=.env scripts/sync-guard-config.js firewall --apply    # 实际写入
 *   node --env-file=.env scripts/sync-guard-config.js --list              # 列出所有系统
 *   node --env-file=.env scripts/sync-guard-config.js --all --apply       # 全部系统
 *
 * @author yijiu2025
 * @since 2026-09-15
 */
import 'dotenv/config';
import { loadAllModels, closeDb } from '../src/framework/db/models.js';
import { getModel } from '../src/framework/db/index.js';
import { createLogger, logStdout as stdout } from '../src/framework/log/index.js';

const log = createLogger('scripts.sync-guard-config');

/** 仅由代码声明、需要从 DB 中清除的运行时字段 */
const RUNTIME_FIELDS = ['enabled', 'requireLogin', 'allowIps', 'allowRoles'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const listOnly = args.includes('--list');
const all = args.includes('--all');
const systemArg = args.find(a => !a.startsWith('--')) || null;

/**
 * 从对象上删除运行时字段，返回被删掉的内容
 *
 * @param {object} node 配置节点（system / group / api）
 * @returns {object} 被删除的 { 字段: 原值 }
 */
function stripRuntimeFields(node) {
  const removed = {};
  for (const f of RUNTIME_FIELDS) {
    if (node && Object.prototype.hasOwnProperty.call(node, f)) {
      removed[f] = node[f];
      delete node[f];
    }
  }
  return removed;
}

/**
 * 对单个系统配置做卷积，返回变更清单
 *
 * @param {object} config 系统配置对象（会被原地修改）
 * @returns {Array<{path:string, removed:object}>} 变更清单
 */
function converge(config) {
  const changes = [];

  const sysRemoved = stripRuntimeFields(config);
  if (Object.keys(sysRemoved).length) changes.push({ path: '(system)', removed: sysRemoved });

  for (const [groupKey, group] of Object.entries(config.groups || {})) {
    const gRemoved = stripRuntimeFields(group);
    if (Object.keys(gRemoved).length) changes.push({ path: `groups.${groupKey}`, removed: gRemoved });

    for (const [apiKey, api] of Object.entries(group.apis || {})) {
      const aRemoved = stripRuntimeFields(api);
      if (Object.keys(aRemoved).length) changes.push({ path: `groups.${groupKey}.apis.${apiKey}`, removed: aRemoved });
    }
  }

  return changes;
}

async function main() {
  await loadAllModels();
  const GuardConfig = getModel('GuardConfig');
  const rows = await GuardConfig.findAll();

  if (listOnly) {
    stdout(`guard_configs 共 ${rows.length} 行：`);
    for (const r of rows) stdout(`  - ${r.system_key} (v${r.version})`);
    return;
  }

  if (!systemArg && !all) {
    stdout('用法：node --env-file=.env scripts/sync-guard-config.js <systemKey> [--apply]');
    stdout('      node --env-file=.env scripts/sync-guard-config.js --all --apply');
    stdout('      node --env-file=.env scripts/sync-guard-config.js --list');
    process.exitCode = 1;
    return;
  }

  const targets = rows.filter(r => (all ? true : r.system_key === systemArg));
  if (targets.length === 0) {
    stdout(`未找到系统 [${systemArg}]。可先用 --list 查看现有系统。`);
    process.exitCode = 1;
    return;
  }

  stdout(`模式：${apply ? '写入 (--apply)' : '预览 (dry-run)'}\n`);

  let touched = 0;
  for (const row of targets) {
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : { ...(row.config || {}) };
    const before = JSON.stringify(config);
    const changes = converge(config);

    if (changes.length === 0) {
      stdout(`[${row.system_key}] 无运行时字段需要清除（代码声明已是唯一来源）`);
      continue;
    }

    touched++;
    stdout(`[${row.system_key}] v${row.version} → 将清除 ${changes.length} 处运行时字段：`);
    for (const c of changes) stdout(`    · ${c.path}: ${JSON.stringify(c.removed)}`);

    if (apply && JSON.stringify(config) !== before) {
      // config 列是文本列，模型上有「不能是对象/数组」的校验 → 必须序列化后再写
      row.config = JSON.stringify(config);
      row.version = (row.version || 0) + 1;
      await row.save();
      log.info(`[sync-guard-config] ${row.system_key} 已收敛，version → v${row.version}`);
    }
  }

  stdout('');
  if (apply) {
    stdout(`✅ 已收敛 ${touched} 个系统。重启服务后代码声明即成为唯一来源。`);
  } else {
    stdout(`ℹ️  预览完成（${touched} 个系统待收敛）。确认无误后加 --apply 执行。`);
  }
}

main()
  .catch(err => {
    log.error('❌ sync-guard-config 执行失败', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
