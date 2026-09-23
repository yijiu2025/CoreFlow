#!/usr/bin/env node
/**
 * 按提交类型自动发布 —— 覆盖三条通道：git tag / GitHub Release / npm(packages/log)
 *
 * 用法：
 *   node scripts/release.mjs              # 预览：只输出决策，不做任何写操作
 *   node scripts/release.mjs --apply      # 执行
 *   node scripts/release.mjs --from v2.5.0  # 指定起算点（复盘/补发用，默认取最近 tag）
 *
 * 判据（权威描述见 AGENTS.md / CLAUDE.md 的「Git 提交与发版」）：
 *   含破坏性变更 → major；含 feat → minor；仅 fix/perf → patch；其余 → 不发版
 *
 * 本文件只做宿主职责（取提交、推 tag、调 API、发 npm）；
 * 决策逻辑在 `src/framework/release/index.js`，有独立测试覆盖。
 *
 * 默认 dry-run：本脚本会做三件不可逆的事（推 tag、建公开 Release、npm 发布），
 * 一律先预览再执行。
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classify,
  decideBump,
  bumpVersion,
  compareSemver,
  buildNotes,
  findSensitive
} from '../src/framework/release/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PKG_DIR = path.join(ROOT, 'packages', 'log');
const FIX_REFS_TOOL = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.workbuddy',
  'tools',
  'fix-packed-refs.mjs'
);
const APPLY = process.argv.includes('--apply');
/** 工作区有并行任务留下的未提交改动时，用 `--allow-dirty` 明确表示"本次要发的内容已提交" */
const ALLOW_DIRTY = process.argv.includes('--allow-dirty');

/** `--from <ref>` 显式指定起算点：用于复盘/补发（默认取最近 tag） */
const FROM_OVERRIDE = (() => {
  const i = process.argv.indexOf('--from');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();

/* ---------- 同步执行子进程 ---------- */

/**
 * 取回子进程输出的中转文件
 *
 * 本机环境下「同步 + 管道」这条路径恒定失败（见 run 的说明），输出只能经文件取回。
 * 调用是单线程串行的，所以复用同一组文件；进程退出时清理，清不掉也无所谓（系统临时目录会回收）。
 */
const TMP_DIR = mkdtempSync(path.join(os.tmpdir(), 'coreflow-release-'));
const STDOUT_FILE = path.join(TMP_DIR, 'stdout.log');
const STDERR_FILE = path.join(TMP_DIR, 'stderr.log');
const STDIN_FILE = path.join(TMP_DIR, 'stdin.txt');

process.on('exit', () => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不是错误 */
  }
});

/**
 * 同步执行子进程并取回输出
 *
 * ⚠️ **刻意不用 `execFileSync` / `execSync`**：本机环境下「同步 + 管道」这条路径恒定失败 ——
 * 对任何可执行文件（含 `git`、`node`、`cmd.exe`）都抛 `EBUSY`（errno -4082），
 * 换 node 版本、加 `shell: true`、脱离沙箱都一样；而**异步 spawn 与 `stdio: 'inherit'` 正常**，
 * 说明不是脚本本身的问题。实测可靠的是 `spawnSync` 配**文件型 stdio**：
 * 把 stdout / stderr 落到临时文件再读回，语义与管道等价。
 *
 * 失败（spawn 报错或退出码非 0）时抛异常，并把输出挂在 `err.stdout` / `err.stderr` 上
 * —— `tryRun` 依赖这个约定判断成败。
 *
 * @param {string} cmd 可执行文件
 * @param {string[]} args 参数列表
 * @param {{ cwd?: string, timeout?: number, shell?: boolean, input?: string }} [opts]
 *        `input` 经临时文件作为 stdin 传入（`git credential fill` 需要）
 * @returns {string} stdout（已 trim）
 */
function run(cmd, args, opts = {}) {
  const outFd = openSync(STDOUT_FILE, 'w');
  const errFd = openSync(STDERR_FILE, 'w');
  let inFd = 'ignore';
  if (opts.input !== undefined) {
    writeFileSync(STDIN_FILE, opts.input);
    inFd = openSync(STDIN_FILE, 'r');
  }

  let result;
  try {
    result = spawnSync(cmd, args, {
      cwd: opts.cwd || ROOT,
      timeout: opts.timeout ?? 600000,
      // Windows 上 npm 实为 npm.cmd：shell:false 会 ENOENT、直接指定 npm.cmd 会 EINVAL
      shell: opts.shell ?? false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: [inFd, outFd, errFd]
    });
  } finally {
    closeSync(outFd);
    closeSync(errFd);
    if (typeof inFd === 'number') closeSync(inFd);
  }

  const stdout = readFileSync(STDOUT_FILE, 'utf8');
  const stderr = readFileSync(STDERR_FILE, 'utf8');

  if (result.error) {
    result.error.stdout = stdout;
    result.error.stderr = stderr;
    throw result.error;
  }
  if (result.status !== 0) {
    const err = new Error(`命令失败（退出码 ${result.status}）：${cmd} ${args.join(' ')}`);
    err.stdout = stdout;
    err.stderr = stderr;
    err.status = result.status;
    throw err;
  }
  return stdout.trim();
}

function tryRun(cmd, args, opts = {}) {
  try {
    return { ok: true, out: run(cmd, args, opts) };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const git = (...args) => run('git', args);
const gitTry = (...args) => tryRun('git', args);
const log = (line = '') => process.stdout.write(`${line}\n`);

/* ---------- 读取仓库状态 ---------- */

function latestTag() {
  const r = gitTry('describe', '--tags', '--abbrev=0');
  return r.ok ? r.out.split('\n').pop().trim() : null;
}

function collectCommitsBetween(from, to = 'HEAD') {
  const range = from ? `${from}..${to}` : to;
  return git('log', range, '--format=%s%x00%b%x01')
    .split('\x01')
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => {
      const [subject, body = ''] = chunk.split('\x00');
      return { subject: subject.trim(), body };
    });
}

/** 上一个 tag（按创建时间取相邻），补建 Release 时用它划定变更区间 */
function previousTag(tag) {
  const r = gitTry('tag', '--sort=-creatordate');
  if (!r.ok) return null;
  const tags = r.out
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const i = tags.indexOf(tag);
  return i >= 0 && i + 1 < tags.length ? tags[i + 1] : null;
}

function remoteSlug() {
  const r = gitTry('remote', 'get-url', 'origin');
  if (!r.ok) return null;
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(r.out.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

/* ---------- GitHub 通道 ---------- */

/** GCM 里存有 GitHub 凭据时可直接调 API，无需 gh CLI */
function readGithubToken() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    const out = run('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      // ⚠️ 超时不能省：本机 `git credential fill` 有永久挂住的历史（credential.helper 首项是
      // helper-selector），没有超时会让整个发版卡死在这里。
      timeout: 30000,
      cwd: ROOT
    });
    return (
      Object.fromEntries(
        out
          .split('\n')
          .filter(Boolean)
          .map(line => {
            const i = line.indexOf('=');
            return [line.slice(0, i), line.slice(i + 1)];
          })
      ).password || null
    );
  } catch {
    return null;
  }
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'coreflow-release',
    'Content-Type': 'application/json'
  };
}

/** 本机网络对 GitHub 不稳定（git push 都常耗时数分钟），网络类错误要重试而不是直接失败 */
async function fetchWithRetry(url, options, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const waitMs = 1000 * 2 ** (i - 1);
        log(
          `  ⚠ 网络请求失败（第 ${i}/${attempts} 次）：${err.cause?.code || err.message}，${waitMs / 1000}s 后重试`
        );
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastErr;
}

async function apiGetRelease({ owner, repo, tag, token }) {
  try {
    const res = await fetchWithRetry(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
      headers: ghHeaders(token)
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null; // 查不到就按"没有"处理，由后续创建步骤决定
  }
}

async function apiCreateRelease({ owner, repo, tag, body, token }) {
  try {
    const res = await fetchWithRetry(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ tag_name: tag, name: tag, body, draft: false, prerelease: false })
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch (err) {
    // 网络层失败不抛：tag 可能已推送成功，此处崩溃会让"已完成的部分"也被当成失败
    return { status: 0, error: err.cause?.code || err.message };
  }
}

/* ---------- npm 通道（packages/log，独立 git 仓库） ---------- */

/** 走 registry 的 HTTP 接口而非 npm CLI：Windows 下 execFileSync('npm') 会 ENOENT，
 *  且 CLI 在 workspaces 下会混入干扰性警告。仅用于读取线上版本。 */
async function latestPublished(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`, {
      headers: { 'User-Agent': 'coreflow-release' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.version || null;
  } catch {
    return null;
  }
}

async function npmState() {
  if (!existsSync(LOG_PKG_DIR)) return null;
  const pkg = JSON.parse(readFileSync(path.join(LOG_PKG_DIR, 'package.json'), 'utf8'));
  const remote = await latestPublished(pkg.name);
  const dirty = tryRun('git', ['status', '--porcelain'], { cwd: LOG_PKG_DIR }).out;
  return { name: pkg.name, local: pkg.version, remote, dirty };
}

/* ---------- 补齐：修复 tag 与 Release 的漂移 ---------- */

/**
 * tag 已推送但 Release 没建成（网络中断、token 失效等）会让两者永久漂移。
 * 重跑脚本时若只判断"有无新提交"就会直接返回，再也补不上 —— 所以这里单独兜一次。
 */
async function syncReleaseIfMissing({ tag, slug, token }) {
  if (!tag || !slug || !token) return;
  if (await apiGetRelease({ owner: slug.owner, repo: slug.repo, tag, token })) return;

  const prev = previousTag(tag);
  const between = collectCommitsBetween(prev, tag);
  const { buckets } = classify(between);
  const notes = buildNotes({ from: prev, to: tag, buckets, count: between.length });

  log('');
  log(`→ ${tag} 缺 Release（tag 已推、Release 未建）`);
  if (!APPLY) {
    log('   （预览模式）加 --apply 可补建');
    return;
  }

  const res = await apiCreateRelease({ owner: slug.owner, repo: slug.repo, tag, body: notes, token });
  if (res.status === 201) log(`  ✓ Release 已补建：${res.json.html_url}`);
  else log(`  ✗ 补建失败（${res.status === 0 ? `网络错误 ${res.error}` : `HTTP ${res.status}`}）`);
}

/* ---------- 主流程 ---------- */

async function main() {
  log(`\n═══ 发版决策${APPLY ? '（执行模式）' : '（预览模式 · 加 --apply 才会真正执行）'} ═══\n`);

  // 1) 前置检查
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') {
    log(`✗ 当前在 ${branch} 分支，发版只允许在 main 上进行`);
    process.exitCode = 1;
    return;
  }

  const porcelain = git('status', '--porcelain')
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.includes('phonecopy'));
  if (porcelain.length) {
    if (APPLY && !ALLOW_DIRTY) {
      log('✗ 工作区有未提交改动，发版前应先提交（避免把该发的内容漏在版本之外）：');
      for (const line of porcelain) log(`    ${line}`);
      log('  若这些改动属于并行任务、本次要发的内容已提交，可加 --allow-dirty 继续');
      process.exitCode = 1;
      return;
    }
    const flag = APPLY && ALLOW_DIRTY ? '（已用 --allow-dirty 放行）' : '';
    log(`⚠ 工作区有 ${porcelain.length} 项未提交改动${flag}：`);
    for (const line of porcelain.slice(0, 8)) log(`    ${line}`);
    if (porcelain.length > 8) log(`    …另有 ${porcelain.length - 8} 项`);
  } else {
    log(`✓ 分支 ${branch}，工作区干净`);
  }

  // 2) 判定该不该发、发什么版本
  const from = FROM_OVERRIDE || latestTag();
  if (FROM_OVERRIDE && !gitTry('rev-parse', '-q', '--verify', `${FROM_OVERRIDE}^{commit}`).ok) {
    log(`✗ --from ${FROM_OVERRIDE} 不是有效 ref`);
    process.exitCode = 1;
    return;
  }

  const slug = remoteSlug();
  const token = readGithubToken();

  const commits = collectCommitsBetween(from);
  if (!commits.length) {
    log(`✓ 自 ${from ?? '初始'} 以来无新提交 → 无需发版`);
    await syncReleaseIfMissing({ tag: from, slug, token });
    return;
  }

  const { buckets, breaking } = classify(commits);
  const kind = decideBump({ buckets, breaking });
  const summary = Object.entries(buckets)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, list]) => `${list.length} ${type}`)
    .join(' / ');
  log(`  自 ${from ?? '初始'} 起 ${commits.length} 个提交（${summary}）`);

  if (!kind) {
    log('✓ 提交类型只有 chore/docs/test/style/ci/refactor → 按规则不发版');
    return;
  }

  const next = bumpVersion(from || '0.0.0', kind);
  const tag = `v${next}`;
  log(`→ 判定：${kind} 递增，${from ?? '(无)'} → ${tag}`);

  if (gitTry('rev-parse', '-q', '--verify', `refs/tags/${tag}`).ok) {
    if (APPLY) {
      log(`✗ tag ${tag} 已存在，请先确认版本号`);
      process.exitCode = 1;
      return;
    }
    log(`⚠ tag ${tag} 已存在 —— 预览仍继续，执行时会被拒绝`);
  }

  const notes = buildNotes({ from, to: tag, buckets, count: commits.length });
  // 先查后建：422 只说明"校验没过"，原因可能是别的字段，不能拿它当"已存在"的判据
  const existingRelease =
    slug && token ? await apiGetRelease({ owner: slug.owner, repo: slug.repo, tag, token }) : null;
  const npm = await npmState();

  log('');
  log('── 通道 1/3：git tag ───────────────');
  log(`   ${APPLY ? '打' : '将打'} annotated tag ${tag}（当前 HEAD ${git('rev-parse', '--short', 'HEAD')}）`);

  log('── 通道 2/3：GitHub Release ────────');
  if (!slug) log('   ✗ 无法从 origin 解析 GitHub 仓库 → 跳过');
  else if (!token) log('   ✗ 无可用 GitHub 凭据 → 跳过（先执行一次 git push 让 GCM 缓存凭据即可）');
  else if (existingRelease) log(`   ✓ ${tag} 已有 Release → 跳过（${existingRelease.html_url}）`);
  else log(`   ${APPLY ? '创建' : '将创建'} ${slug.owner}/${slug.repo} 的 Release（说明 ${notes.split('\n').length} 行）`);

  const hits = findSensitive(commits);
  if (hits.length) {
    log('');
    log('   ⚠ 以下提交标题含敏感表述，而 Release 说明对公网可见，请先确认是否适合原文外发：');
    for (const subject of hits) log(`      · ${subject}`);
  }

  log('── 通道 3/3：npm（packages/log）────');
  let npmPublish = false;
  if (!npm) {
    log('   ✗ packages/log 不存在 → 跳过');
  } else if (!npm.remote) {
    log(`   ? 查不到 ${npm.name} 的线上版本 → 跳过，请手动确认`);
  } else if (npm.dirty) {
    log('   ✗ packages/log 工作区不干净 → 跳过（该仓库是独立 git 仓库，需先在其内部提交）');
  } else if (compareSemver(npm.local, npm.remote) > 0) {
    npmPublish = true;
    log(`   ${APPLY ? '发布' : '将发布'} ${npm.name}@${npm.local}（线上 ${npm.remote}）`);
  } else {
    log(`   ✓ ${npm.name} 本地 ${npm.local} 与线上 ${npm.remote} 一致 → 无需发布`);
  }

  if (!APPLY) {
    log('');
    log('预览结束。确认无误后执行：node scripts/release.mjs --apply');
    return;
  }

  // 3) 通道 1：tag + push
  log('');
  log('执行中…');
  git('tag', '-a', tag, '-m', notes);
  log(`  ✓ 已创建 tag ${tag}`);

  log('  推送中（本机 push 可能耗时数分钟且全程无输出，属已知现象）…');
  const push = tryRun('git', ['push', 'origin', 'main', tag], { timeout: 900000 });
  if (!push.ok) log(`  ⚠ push 返回非零：${push.out.split('\n').filter(Boolean).slice(-2).join(' | ')}`);

  // 无论退出码如何，一律以远端实际状态为准（本机出现过"零输出假成功"）
  const remoteSha = gitTry('ls-remote', 'origin', 'main').out.split('\t')[0];
  const localSha = git('rev-parse', 'HEAD');
  if (remoteSha !== localSha) {
    log(`  ✗ 推送后远端 main=${remoteSha || '(空)'} 与本地 ${localSha} 不一致`);
    log('    本机 push 偶发"零输出假成功"，请重试后核对 git ls-remote origin main');
  } else {
    log(`  ✓ 远端 main 已更新至 ${remoteSha.slice(0, 8)}`);
    const tagOnRemote = gitTry('ls-remote', '--tags', 'origin', tag).out;
    log(tagOnRemote.includes(tag) ? `  ✓ tag ${tag} 已在远端` : `  ✗ tag ${tag} 未出现在远端，需重推`);

    // 本机 git 不写松散 ref，packed-refs 需同步修正，否则 git status 长期谎报 ahead
    if (existsSync(FIX_REFS_TOOL)) {
      const fix = tryRun('node', [FIX_REFS_TOOL, remoteSha]);
      log(fix.ok ? '  ✓ packed-refs 已同步' : `  ⚠ packed-refs 修正失败：${fix.out.split('\n')[0]}`);
    }
  }

  // 4) 通道 2：Release
  if (slug && token && !existingRelease) {
    const res = await apiCreateRelease({ owner: slug.owner, repo: slug.repo, tag, body: notes, token });
    if (res.status === 201) log(`  ✓ Release 已创建：${res.json.html_url}`);
    else if (res.status === 0) log(`  ✗ Release 创建失败（网络错误 ${res.error}）→ 重跑本脚本可补建`);
    else log(`  ✗ Release 创建失败（HTTP ${res.status}）：${res.json?.message ?? ''}`);
  } else if (existingRelease) {
    log(`  · Release ${tag} 已存在，跳过`);
  }

  // 5) 通道 3：npm
  if (npmPublish) {
    const pub = tryRun('npm', ['publish', '--access', 'public'], { cwd: LOG_PKG_DIR, timeout: 600000, shell: true });
    log(
      pub.ok
        ? `  ✓ 已发布 ${npm.name}@${npm.local}`
        : `  ✗ 发布失败：${pub.out.split('\n').filter(Boolean).slice(-3).join(' | ')}`
    );
    if (pub.ok) {
      // 回读 registry 确认，不信任退出码（本机 git 已有"零输出假成功"前例）
      const online = await latestPublished(npm.name);
      log(online === npm.local ? `  ✓ 线上已确认 ${online}` : `  ⚠ 线上版本为 ${online ?? '未知'}，请复查`);
    }
  }

  log('');
  log('═══ 发版流程结束 ═══\n');
}

// 仅在被直接执行时跑主流程；被 import（单元测试）时不产生任何副作用
const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await main();
