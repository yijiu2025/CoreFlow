/**
 * 跨进程验收关卡 —— 聚合执行器
 *
 * 依次跑完 `scripts/verify/` 下的全部关卡，汇总退出码。
 * 单独跑某一关用 `npm run verify:lock` / `npm run verify:guard`。
 *
 * 聚合退出码的优先级是**危险程度**，不是顺序：
 *   2（回滚不完整，需人工介入）> 1（真回归）> 3（环境不可用）
 * 这样环境问题不会盖过真正的失败，也不会把失败误报成环境问题。
 *
 * 用法：npm run verify:all
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');

// 仅用于显示：各关卡自己加载 env 文件（它们读的是同一个变量）
const ENV_FILE = process.env.VERIFY_ENV_FILE || '.env';

/** 关卡清单：顺序即输出顺序。先跑不写库的，把风险高的放后面。 */
const GATES = [
  { name: 'E1 跨进程互斥（调度器锁）', file: 'lock-mutex.mjs' },
  { name: 'E2 守卫配置跨实例同步', file: 'guard-sync.mjs' }
];

const CODE_LABEL = {
  0: '✅ 通过',
  1: '❌ 断言失败',
  2: '🛑 回滚不完整',
  3: '⛔ 环境不可用'
};

/**
 * 执行一个关卡
 *
 * 刻意**不传 `--env-file`**：各关卡自己用 process.loadEnvFile 加载，
 * 这样命令行上的环境覆盖才能生效（`--env-file` 的取值不可被覆盖，
 * 且 `npm run` 会丢掉命令行变量）。
 *
 * @param {string} file 关卡文件名
 * @returns {Promise<number>} 子进程退出码
 */
function runGate(file) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(DIR, file)], { cwd: ROOT, stdio: 'inherit' });
    p.on('close', code => resolve(code ?? 1));
    p.on('error', e => {
      console.error(`⛔ 无法启动 ${file}：${e.message}`);
      resolve(3);
    });
  });
}

const results = [];
console.log(`env 文件: ${ENV_FILE}（用 VERIFY_ENV_FILE=... 可切换）`);
for (const gate of GATES) {
  console.log(`\n${'─'.repeat(64)}\n▶ ${gate.name}  (${gate.file})\n${'─'.repeat(64)}`);
  const code = await runGate(gate.file);
  results.push({ ...gate, code });
  console.log(`\n◀ ${gate.name} → ${CODE_LABEL[code] || `退出码 ${code}`}`);
}

console.log(`\n${'═'.repeat(64)}`);
console.log('汇总');
console.log('═'.repeat(64));
for (const r of results) {
  console.log(`  ${(CODE_LABEL[r.code] || `退出码 ${r.code}`).padEnd(14)} ${r.name}`);
}

const codes = results.map(r => r.code);
const failed = codes.filter(c => c === 2).length
  ? 2
  : codes.filter(c => c === 1).length
    ? 1
    : codes.filter(c => c === 3).length
      ? 3
      : 0;

console.log(
  failed === 0 ? '\n═══ 全部关卡通过 ═══' : `\n═══ 存在失败关卡：${CODE_LABEL[failed]}（退出码 ${failed}）═══`
);
process.exit(failed);
