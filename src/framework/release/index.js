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
  findSensitive
};
