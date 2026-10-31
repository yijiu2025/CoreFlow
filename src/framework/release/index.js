/**
 * 发版决策的纯逻辑层 —— 不碰 git / 网络 / 文件系统，可直接测试。
 *
 * 宿主入口在 `scripts/release.mjs`（负责取提交、推 tag、调 API、发 npm）。
 * 逻辑放在 `src/` 而非 `scripts/` 的原因有两条：
 *   1. 约定要求 `src/` 不得 import `scripts/`（守卫 `no-scripts-import.test.js`），
 *      而 jest 只收集 `src/__tests__/**` —— 逻辑留在 scripts/ 下就等于无法被测试覆盖；
 *   2. `scripts/` 是可选宿主，不一定随部署安装，可复用代码应属于 `src/framework`。
 *
 * @author yijiu2025
 */

/** Conventional Commits 前缀：type(scope)!: subject */
const TYPE_RE = /^(feat|fix|perf|refactor|docs|test|chore|style|ci|build|revert)(?:\([^)]*\))?(!)?:\s*(.+)$/;

/** 说明文档里的分组标题 */
const SECTION_TITLES = {
  feat: '新功能',
  fix: '修复',
  perf: '性能',
  refactor: '重构',
  docs: '文档',
  test: '测试',
  build: '构建',
  ci: 'CI',
  style: '样式',
  chore: '杂项',
  revert: '回滚',
  other: '其他'
};

/** Release 说明对公网可见，先自查是否把修复细节写成了对外情报 */
const SENSITIVE_RE = /(漏洞|泄露|泄漏|未授权|越权|注入|绕过|CVE-\d|token|secret|password|密钥|凭证)/i;

/**
 * 破坏性变更只认 Conventional Commits 的 footer 形式（行首且带冒号）。
 * 不能退化成子串匹配 —— 否则 commit 正文里"提到"这个词（例如写发版规则本身）
 * 就会把自己判成破坏性变更，进而把 patch 误升成 major。
 */
const BREAKING_RE = /^BREAKING[ -]CHANGE:/m;

function parseSubject(subject) {
  const m = TYPE_RE.exec(subject);
  if (!m) return { type: 'other', bang: false, text: subject.trim() };
  return { type: m[1], bang: m[2] === '!', text: m[3].trim() };
}

/** 按提交类型分桶，并判定是否存在破坏性变更 */
function classify(commits) {
  const buckets = {};
  let breaking = false;

  for (const { subject = '', body = '' } of commits) {
    const parsed = parseSubject(subject);
    if (parsed.bang || BREAKING_RE.test(body)) breaking = true;
    (buckets[parsed.type] ||= []).push(subject.trim());
  }

  return { buckets, breaking };
}

/**
 * 决定版本递增档位；返回 null 表示"不该发版"。
 * 判据与 AGENTS.md / CLAUDE.md 的「Git 提交与发版」保持一致。
 */
function decideBump({ buckets = {}, breaking = false } = {}) {
  if (breaking) return 'major';
  if (buckets.feat?.length) return 'minor';
  if ((buckets.fix?.length ?? 0) + (buckets.perf?.length ?? 0) > 0) return 'patch';
  return null;
}

function bumpVersion(version, kind) {
  const [major, minor, patch] = String(version).replace(/^v/, '').split('.').map(Number);
  if (![major, minor, patch].every(Number.isFinite)) {
    throw new Error(`无法解析版本号：${version}`);
  }
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`未知的递增档位：${kind}`);
}

function compareSemver(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** 生成 Release 说明正文（中文分组 + 完整变更命令） */
function buildNotes({ from, to, buckets = {}, count }) {
  const summary = Object.entries(buckets)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, list]) => `${list.length} ${type}`)
    .join(' / ');

  const lines = [`自 \`${from || '仓库初始'}\` 起共 ${count} 个提交（${summary}）。`, ''];

  for (const [type, title] of Object.entries(SECTION_TITLES)) {
    const list = buckets[type];
    if (!list?.length) continue;
    lines.push(`### ${title}`, '');
    for (const subject of list) lines.push(`- ${parseSubject(subject).text}`);
    lines.push('');
  }

  lines.push('---', '', `完整变更：\`git log ${from || ''}..${to}\``);
  return lines.join('\n');
}

/** 挑出标题里含敏感表述的提交，供发版前人工确认 */
function findSensitive(commits) {
  return commits.map(c => c.subject).filter(subject => SENSITIVE_RE.test(subject));
}

/**
 * 把 CHANGELOG 顶部的「未发布（Unreleased）」区块提升为带版本号 + 日期的正式区块。
 *
 * 约定（见 git-release-rules.md 发布 checklist）：
 *   - 未发布区块的标题行固定是 `## 未发布（Unreleased）`；
 *   - 提升后变成 `## <version> — <date>`，**在它上面**重建一个空的未发布区块（保持幂等）；
 *   - 未发布区块为空时**不提升**（返回 { changed: false }，避免发一个只有空壳的版本）。
 *
 * ⚠️ 空区块必须放在**最新版本之上**，不能放在它下面。
 * 放在下面时，下一次发版会在原地提升那个占位块，于是新版本落到上一个版本下方，
 * CHANGELOG 变成 2.29.6 / 2.29.7 / 2.29.0 这种乱序（实测踩过两次：v2.29.6、v2.29.7）。
 * 正确形态永远是：`## 未发布` → 最新版本 → 次新版本 → …
 *
 * 纯函数：输入旧文本，输出新文本 + 是否变化，便于单测锁住行为。
 * 宿主（scripts/release.mjs / scripts/release-web.mjs）负责读文件、写文件与传日期。
 *
 * @param {string} text CHANGELOG 原文
 * @param {string} version 不带 v 的版本号，如 `2.6.1`
 * @param {string} date YYYY-MM-DD
 * @returns {{ text: string, changed: boolean, reason?: string }}
 */
function bumpChangelog(text, version, date) {
  const heading = '## 未发布（Unreleased）';
  const idx = text.indexOf(heading);
  if (idx === -1) {
    return { text, changed: false, reason: '未找到「未发布（Unreleased）」标题' };
  }

  const afterHeading = idx + heading.length;
  const nextHeading = text.indexOf('\n## ', afterHeading + 1);
  const bodyEnd = nextHeading === -1 ? text.length : nextHeading;

  // 未发布区块正文：标题行之后到下一个 ## 之前；去掉引文/空行后仍无内容即视为空
  const body = text.slice(afterHeading, bodyEnd).trim();
  if (!/\S/.test(body)) {
    return { text, changed: false, reason: '未发布区块为空，无可提升内容' };
  }

  const head = text.slice(0, idx);
  const tail = text.slice(bodyEnd);
  const newSection = `## ${version} — ${date}\n\n${body}\n`;
  // 重建的空未发布区块：只留标题，正文留空（保持幂等——下次提升前由人补内容）。
  const placeholder = `${heading}\n`;

  return {
    // 顺序是 placeholder → newSection：占位块永远在最上面，
    // 下次发版原地提升它时，新版本才落到旧版本之上（否则会一路往下沉）。
    text: `${head}${placeholder}\n${newSection}\n${tail}`,
    changed: true
  };
}

export {
  TYPE_RE,
  BREAKING_RE,
  SENSITIVE_RE,
  SECTION_TITLES,
  parseSubject,
  classify,
  decideBump,
  bumpVersion,
  compareSemver,
  buildNotes,
  findSensitive,
  bumpChangelog
};
