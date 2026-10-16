#!/usr/bin/env node
/**
 * 共享门禁分发器（distribute-ci）
 *
 * 把技能内的 canonical 共享门禁同步到各接入仓：
 *   1. 读取 assets/ci/ci-quality.yml，重盖 canonical-sha256 章（幂等）；
 *   2. 拷贝到 <仓>/.github/workflows/ci-quality.yml；
 *   3. 拷贝 assets/ci/ci-quality-check.mjs 到 <仓>/scripts/。
 *
 * 用法：
 *   node scripts/distribute-ci.mjs <仓库路径> [更多仓库路径...]
 *   node scripts/distribute-ci.mjs --check <仓库路径>...   # 只查不写
 *
 * 注意：只负责文件落地，不提交不推送 —— 每个仓需自行按支线流程提交
 *   （git-release-rules.md §3：支线 → PR → 合并 → 删支线）。
 *
 * @author yijiu2025
 * @since 2026-10-17
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL = join(SKILL_ROOT, 'assets', 'ci', 'ci-quality.yml');
const CHECK_SCRIPT = join(SKILL_ROOT, 'assets', 'ci', 'ci-quality-check.mjs');
const STAMP_RE = /^# canonical-sha256: [0-9a-f]{64}\n?/m;

/** 给 canonical 内容盖章：删旧章 → 对剩余内容哈希 → 末尾追加新章 */
function stamp(content) {
  const stripped = content.replace(/\r\n/g, '\n').replace(STAMP_RE, '');
  const hash = createHash('sha256').update(stripped, 'utf-8').digest('hex');
  const base = stripped.endsWith('\n') ? stripped : `${stripped}\n`;
  return `${base}# canonical-sha256: ${hash}\n`;
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const repos = args.filter((a) => !a.startsWith('--'));

if (repos.length === 0) {
  console.error('用法: node scripts/distribute-ci.mjs [--check] <仓库路径> [更多仓库路径...]');
  process.exit(1);
}

// 1. 盖 canonical 自身的章（assets 内的副本即分发内容的真身）
const raw = readFileSync(CANONICAL, 'utf-8');
const stamped = stamp(raw);
if (stamped !== raw.replace(/\r\n/g, '\n')) {
  writeFileSync(CANONICAL, stamped, 'utf-8');
  console.log('📌 canonical 已重盖 canonical-sha256 章（assets/ci/ci-quality.yml）');
} else {
  console.log('📌 canonical 章已是最新（assets/ci/ci-quality.yml）');
}

if (checkOnly) {
  console.log('🔍 --check 模式：只盖 canonical 章，不向仓库分发');
  process.exit(0);
}

// 2. 分发
let failed = 0;
for (const repo of repos) {
  const repoRoot = resolve(repo);
  if (!existsSync(repoRoot)) {
    console.error(`❌ 仓库路径不存在: ${repo}`);
    failed++;
    continue;
  }
  const wfDir = join(repoRoot, '.github', 'workflows');
  const scriptDir = join(repoRoot, 'scripts');
  mkdirSync(wfDir, { recursive: true });
  mkdirSync(scriptDir, { recursive: true });

  const wfTarget = join(wfDir, 'ci-quality.yml');
  const before = existsSync(wfTarget) ? readFileSync(wfTarget, 'utf-8') : '(不存在)';
  copyFileSync(CANONICAL, wfTarget);
  copyFileSync(CHECK_SCRIPT, join(scriptDir, 'ci-quality-check.mjs'));

  const state = before === stamped ? '已是最新' : before === '(不存在)' ? '新建' : '已更新';
  console.log(`✅ ${repoRoot}`);
  console.log(`   .github/workflows/ci-quality.yml  ${state}`);
  console.log(`   scripts/ci-quality-check.mjs       ${before === '(不存在)' ? '新建' : '已同步'}`);
}

if (failed > 0) process.exit(1);
console.log('\n下一步：进入各仓按支线流程提交推送（chore/ci-unify → PR → 合并 → 删支线）。');
