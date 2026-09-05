#!/usr/bin/env node
/**
 * fullstack-rules 技能自检脚本（doctor）
 *
 * 校验技能文档的健康度，防止随代码库演进而腐化：
 * 1. 链接检查 —— 所有 .md 内的相对链接目标必须存在
 * 2. 禁用模式 —— 旧路径（src/db|redis|auth 直连）、虚构配置项、裸 sequelize.models
 * 3. 结构约束 —— SKILL.md 行数上限、frontmatter 必需字段、必载文件存在
 *
 * 运行：node .claude/skills/fullstack-rules/scripts/doctor.mjs
 * 退出码：0=全部通过，1=存在问题（AI 修改 skill 后必须跑一次）
 *
 * @author yijiu2025
 * @since 2026-09-05
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const checks = [];

/** 递归收集 .md 文件（跳过 assets 内 kx-lang 文档与 .git） */
function collectMarkdown(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectMarkdown(full, out);
    } else if (name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/* ── 1. 链接检查 ── */
const mdFiles = collectMarkdown(SKILL_ROOT).filter(f => !f.includes(`${SKILL_ROOT}/assets/project-template/kt/kx-lang`));
const scriptFiles = [join(SKILL_ROOT, 'scripts', 'doctor.mjs'), join(SKILL_ROOT, 'scripts', 'install-skill.mjs')];
let linkCount = 0;
const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
for (const file of mdFiles) {
  const content = readFileSync(file, 'utf-8');
  const relDir = dirname(file);
  for (const match of content.matchAll(linkRe)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    linkCount++;
    const resolved = resolve(relDir, target.split('#')[0]);
    if (!existsSync(resolved)) {
      problems.push(`断链: ${relative(SKILL_ROOT, file)} → ${target}`);
    }
  }
}
checks.push(`链接检查: ${mdFiles.length} 个文档 / ${linkCount} 个相对链接`);

/* ── 2. 禁用模式（旧路径与已证伪的写法）── */
const FORBIDDEN = [
  { re: /`?src\/(db|redis|auth)\//g, reason: '旧路径（实际在 src/framework/ 下）' },
  { re: /setupFilesAfterSetup/g, reason: '虚构的 Jest 配置项（正确为 setupFilesAfterEnv，且仓库未使用）' },
  { re: /sequelize\.models\./g, reason: '违反 getModel 铁律' },
  { re: /product-designer/g, reason: '引用不存在的技能' }
];
let scannedFiles = 0;
for (const file of [...mdFiles, ...scriptFiles]) {
  const rel = relative(SKILL_ROOT, file).split(sep).join('/');
  // kx-lang 内部文档不受本仓库路径规范约束；CHANGELOG 是历史记录，合法提及已移除的旧内容；
  // doctor.mjs 自身的 FORBIDDEN 字面量是检测规则，跳过自指扫描（Windows 分隔符已归一为 /）
  if (
    rel.includes('assets/project-template/kt/kx-lang') ||
    rel === 'CHANGELOG.md' ||
    rel === 'scripts/doctor.mjs'
  ) continue;
  const content = readFileSync(file, 'utf-8');
  scannedFiles++;
  for (const { re, reason } of FORBIDDEN) {
    const matches = [...content.matchAll(re)];
    // 放行"禁用说明"类文字（紧跟"禁止""不要"等否定上下文的行）
    for (const m of matches) {
      const lineStart = content.lastIndexOf('\n', m.index) + 1;
      const line = content.slice(lineStart, content.indexOf('\n', m.index) + 1 || undefined);
      if (/禁止|不要|不能|不得|直接取|直取|错误/.test(line)) continue;
      problems.push(`禁用模式: ${rel} 出现 "${m[0]}"（${reason}）`);
    }
  }
}
checks.push(`禁用模式: 扫描 ${scannedFiles} 个文档（kx-lang 外部文档豁免）`);

/* ── 3. 结构约束 ── */
const skillPath = join(SKILL_ROOT, 'SKILL.md');
const skillContent = readFileSync(skillPath, 'utf-8');
const skillLines = skillContent.split('\n').length;
if (skillLines > 160) {
  problems.push(`SKILL.md ${skillLines} 行，超过 160 行上限（低频内容应下沉 references/）`);
}
checks.push(`SKILL.md 行数: ${skillLines} / 160`);

const fm = skillContent.match(/^---\n([\s\S]*?)\n---/);
if (!fm) {
  problems.push('SKILL.md 缺少 frontmatter');
} else {
  for (const field of ['name:', 'version:', 'description:', 'whenToUse:']) {
    if (!fm[1].includes(field)) problems.push(`SKILL.md frontmatter 缺少 ${field.replace(':', '')}`);
  }
}
checks.push('frontmatter 完整性');

/* ── 4. 关键文件存在 ── */
const REQUIRED = [
  'SKILL.md',
  'references/kx.md',
  'references/requirement-intake.md',
  'references/anti-patterns.md',
  'references/pitfalls.md',
  'references/workflows.md',
  'references/toolbox.md',
  'references/orchestration.md',
  'scripts/doctor.mjs',
  'scripts/install-skill.mjs',
  'scripts/kx-validate.mjs',
  'references/note.md',
  'references/naming-convention.md',
  'references/testing.md',
  'references/security.md',
  'references/git-patterns.md',
  'references/code-review.md',
  'references/backend/main.md',
  'references/backend/redis.md',
  'references/backend/nodejs/nodejs-fastify.md',
  'references/frontend/main.md',
  'references/frontend/web/vue.md',
  'assets/project-template/kt/kx-lang/SPEC.md',
  'assets/project-template/kt/kx-lang/example.kx'
];
for (const rel of REQUIRED) {
  if (!existsSync(join(SKILL_ROOT, rel))) problems.push(`关键文件缺失: ${rel}`);
}
checks.push(`关键文件: ${REQUIRED.length} 个必需文件`);

/* ── 报告 ── */
console.log('🔍 [fullstack-rules] 技能自检（doctor）\n');
for (const c of checks) console.log(`  · ${c}`);
console.log('');

if (problems.length) {
  console.log(`❌ 发现 ${problems.length} 个问题:\n`);
  for (const p of problems) console.log(`  × ${p}`);
  console.log('\n请修复后重新运行本脚本。');
  process.exit(1);
} else {
  console.log('✅ 全部检查通过，技能文档健康。');
}
