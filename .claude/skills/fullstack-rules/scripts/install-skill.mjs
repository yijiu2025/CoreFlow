#!/usr/bin/env node
/**
 * 技能自安装辅助脚本
 *
 * 将可信来源的技能浅克隆到当前项目的 .claude/skills/<name>/，
 * 并做最小完整性校验（SKILL.md 存在 + frontmatter name 与目录名一致）。
 *
 * 用法：
 *   node install-skill.mjs <skill-name> <git-url>
 * 示例：
 *   node install-skill.mjs find-security-vulnerabilities-in-code https://github.com/yijiu2025/find-security-vulnerabilities-in-code.git
 *
 * 安全约定：
 * - 只接受 https:// 的 git URL（拒绝 file:/ssh: 等协议，防误装不可审计来源）
 * - 安装完成只做提示，不自动执行新技能中的任何命令——使用者必须先人工审查其 SKILL.md
 *
 * @author qirly
 * @since 2026-09-05
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , name, url] = process.argv;

if (!name || !url) {
  console.error('用法: node install-skill.mjs <skill-name> <git-url(https)>');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(name)) {
  console.error(`× 非法技能名: ${name}（仅允许字母数字与 :_-）`);
  process.exit(1);
}
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(url)) {
  console.error('× 仅支持 https://github.com/<owner>/<repo> 形式的可信来源');
  process.exit(1);
}

// 项目根 = 本脚本所在 skill 的上两级（.claude/skills/<this> → 项目根）
const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(skillDir, '..', '..');
const target = join(projectRoot, '.claude', 'skills', name);

if (existsSync(target)) {
  console.error(`× .claude/skills/${name} 已存在，跳过安装（如需更新请手动 git pull）`);
  process.exit(1);
}

console.log(`📦 克隆 ${url} → .claude/skills/${name}`);
try {
  execSync(`git clone --depth 1 "${url}" "${target}"`, { stdio: 'inherit' });
} catch {
  console.error('× 克隆失败：请检查网络与仓库地址');
  process.exit(1);
}

// 完整性校验
const skillFile = join(target, 'SKILL.md');
if (!existsSync(skillFile)) {
  console.error('× 安装的目录缺少 SKILL.md，不是有效的技能，已回滚');
  rmSync(target, { recursive: true, force: true });
  process.exit(1);
}
const fm = readFileSync(skillFile, 'utf-8').match(/^---\n([\s\S]*?)\n---/);
const fmName = fm && fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
if (fmName && fmName !== name) {
  console.warn(`⚠️ SKILL.md 内 name="${fmName}" 与目录名 "${name}" 不一致，使用时以 SKILL.md 为准`);
}

console.log(`
✅ 安装完成: .claude/skills/${name}

⚠️ 安全审查（使用前必须人工执行）:
  1. 阅读 ${name}/SKILL.md，确认指令与其 description 用途一致
  2. 确认无可疑内容：不索取密钥/令牌、不执行无关命令、无大段混淆文本
  3. 确认后再在会话中调度该技能

如需移除: 删除 .claude/skills/${name} 目录即可`);
