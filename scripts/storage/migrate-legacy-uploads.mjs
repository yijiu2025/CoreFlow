#!/usr/bin/env node
/**
 * 一次性迁移：把「两处历史遗留的上传目录」搬到现行布局，并修正数据库里的旧 URL
 *
 * ════════════════════════════════════════════════════════════════════
 * 搬什么（两处，成因不同）
 * ════════════════════════════════════════════════════════════════════
 *   ① public/uploads/<app>/…      早期布局（静态根下统一叫 uploads/）
 *        → public/<app>/…         现行布局（按 app 分层，见 framework/storage）
 *      ⚠️ avatars 归 user 应用：public/uploads/avatars/ → public/user/avatars/
 *
 *   ② src/public/uploads/…        **路径 bug 的产物**：preview.js 当年用
 *      `path.resolve(__dirname, '../../../public/uploads/...')`，从
 *      `src/app/posecraft/utils/` 数三级落在 `src/` 而不是仓库根 ⇒ 预览图写进了
 *      `src/public`，而静态服务读的是根 `public/` ⇒ 这些预览图一直是 404。
 *        → public/…                （去掉 `uploads/` 前缀，落到同一套布局）
 *
 * ════════════════════════════════════════════════════════════════════
 * 数据库里为什么要跟着改
 * ════════════════════════════════════════════════════════════════════
 * `posecraft_work.image_url` / `thumbnail_url`、`posecraft_template.*`、`user_user.avatar`
 * 里存的是**绝对路径字符串**（`/uploads/posecraft/x.jpg`）。文件搬走后不同步改，这些行
 * 就全变 404。所以本脚本把 `/uploads/avatars/` → `/user/avatars/`、
 * `/uploads/posecraft/` → `/posecraft/`。
 *
 * ════════════════════════════════════════════════════════════════════
 * 用法
 * ════════════════════════════════════════════════════════════════════
 *   node scripts/storage/migrate-legacy-uploads.mjs            # 预演（默认，不动任何东西）
 *   node scripts/storage/migrate-legacy-uploads.mjs --apply    # 真跑（搬文件 + 改 DB）
 *   node scripts/storage/migrate-legacy-uploads.mjs --apply --no-db   # 只搬文件
 *
 * 幂等：目标已存在则跳过；源目录搬空后自动清理空壳。回滚信息写在
 * `storage/migration-<时间戳>.json`（文件移动映射 + DB 改动前的原值）。
 *
 * @author yijiu2025
 * @since 2026-11-04
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_ROOT = path.join(REPO_ROOT, 'public');
const PRIVATE_ROOT = path.join(REPO_ROOT, 'storage');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const WITH_DB = !argv.includes('--no-db');

/** DB 里需要改写的列（表 → 列） */
const DB_COLUMNS = [
  ['posecraft_work', 'image_url'],
  ['posecraft_work', 'thumbnail_url'],
  ['posecraft_template', 'image_url'],
  ['posecraft_template', 'thumbnail_url'],
  ['user_user', 'avatar']
];

/** URL 前缀改名（顺序有意义：具体到泛指） */
const URL_REWRITES = [
  ['/uploads/avatars/', '/user/avatars/'],
  ['/uploads/posecraft/', '/posecraft/']
];

/** 迁移计划：{ from, to } */
const plan = [];

/**
 * 递归列出目录下所有文件（相对路径）
 *
 * @param {string} root 绝对目录
 * @param {string} [sub] 当前相对子路径
 * @returns {string[]} 相对路径数组
 */
function listFiles(root, sub = '') {
  const dir = path.join(root, sub);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, rel));
    else if (entry.isFile() && entry.name !== '.gitkeep') out.push(rel);
  }
  return out;
}

/** ① 根 public/uploads/<app>/ → public/<app>/（avatars 特殊归 user） */
function planLegacyUploads() {
  const legacy = path.join(PUBLIC_ROOT, 'uploads');
  for (const rel of listFiles(legacy)) {
    const [first, ...rest] = rel.split('/');
    const app = first === 'avatars' ? 'user' : first;
    const target = first === 'avatars' ? path.join('user', 'avatars', ...rest) : path.join(app, ...rest);
    plan.push({ from: path.join(legacy, ...rel.split('/')), to: path.join(PUBLIC_ROOT, target) });
  }
}

/** ② src/public/uploads/** → public/**（去掉 uploads/ 这一段） */
function planSrcPublic() {
  const bugged = path.join(REPO_ROOT, 'src', 'public');
  for (const rel of listFiles(bugged)) {
    const stripped = rel.startsWith('uploads/') ? rel.slice('uploads/'.length) : rel;
    plan.push({ from: path.join(bugged, ...rel.split('/')), to: path.join(PUBLIC_ROOT, ...stripped.split('/')) });
  }
}

/** 执行文件移动（跨设备时退化为 copy + unlink） */
function moveFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) return 'skip-exists';
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
  return 'moved';
}

/** 自底向上删空目录（保留 .gitkeep） */
function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
    const left = fs.readdirSync(dir);
    if (left.length === 0) fs.rmdirSync(dir);
  };
  walk(root);
}

/** 读 .env（只取 DB_*） */
function readEnv() {
  const file = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

/**
 * 改写 DB 里的旧 URL
 *
 * @returns {Promise<Array<{table: string, column: string, rows: number, before: object[]}>>}
 */
async function rewriteDb() {
  const env = readEnv();
  if (!env.DB_HOST) {
    console.log('⚠️  没有 .env / DB_HOST，跳过数据库改写');
    return [];
  }
  const mysql = (await import('mysql2/promise')).default;
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME
  });

  const report = [];
  try {
    for (const [table, column] of DB_COLUMNS) {
      const like = URL_REWRITES.map(([oldPrefix]) => `${column} LIKE '${oldPrefix}%'`).join(' OR ');
      const [rows] = await conn.query(`SELECT id, ${column} AS url FROM ${table} WHERE ${like}`);
      if (rows.length === 0) continue;
      report.push({ table, column, rows: rows.length, before: rows });

      if (APPLY) {
        for (const [oldPrefix, newPrefix] of URL_REWRITES) {
          await conn.query(`UPDATE ${table} SET ${column} = REPLACE(${column}, ?, ?) WHERE ${column} LIKE ?`, [
            oldPrefix,
            newPrefix,
            `${oldPrefix}%`
          ]);
        }
      }
    }
  } finally {
    await conn.end();
  }
  return report;
}

const mode = APPLY ? 'APPLY' : 'DRY-RUN';
console.log(`\n=== 迁移历史上传目录（${mode}）===\n`);

planLegacyUploads();
planSrcPublic();

if (plan.length === 0) {
  console.log('✅ 没有需要搬运的文件（两处遗留目录都为空或不存在）');
} else {
  let moved = 0;
  let skipped = 0;
  const journal = [];
  for (const { from, to } of plan) {
    const rel = path.relative(REPO_ROOT, from).replace(/\\/g, '/');
    const relTo = path.relative(REPO_ROOT, to).replace(/\\/g, '/');
    if (!APPLY) {
      console.log(`  ${rel}\n    → ${relTo}`);
      continue;
    }
    const result = moveFile(from, to);
    if (result === 'moved') moved++;
    else skipped++;
    journal.push({ from: rel, to: relTo, result });
  }
  if (APPLY) {
    console.log(`  文件：移动 ${moved}，跳过（目标已存在）${skipped}`);
    // 清空壳：src/public 整个删、public/uploads 自底向上清
    pruneEmptyDirs(path.join(REPO_ROOT, 'src', 'public'));
    pruneEmptyDirs(path.join(PUBLIC_ROOT, 'uploads'));
    for (const dir of [path.join(REPO_ROOT, 'src', 'public'), path.join(PUBLIC_ROOT, 'uploads')]) {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
    fs.mkdirSync(PRIVATE_ROOT, { recursive: true });
    const journalFile = path.join(PRIVATE_ROOT, `migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(journalFile, JSON.stringify({ at: new Date().toISOString(), moves: journal }, null, 2));
    console.log(`  回滚信息：${path.relative(REPO_ROOT, journalFile)}`);
  }
}

if (WITH_DB) {
  console.log('\n--- 数据库旧 URL ---');
  const report = await rewriteDb();
  if (report.length === 0) console.log('  没有需要改写的行');
  for (const { table, column, rows, before } of report) {
    console.log(`  ${table}.${column}: ${rows} 行${APPLY ? '（已改写）' : '（待改写）'}`);
    for (const r of before.slice(0, 3)) console.log(`      id=${r.id}  ${r.url}`);
    if (before.length > 3) console.log(`      … 另有 ${before.length - 3} 行`);
  }
} else {
  console.log('\n（--no-db：跳过数据库）');
}

if (!APPLY) console.log('\n预演结束。确认无误后加 --apply 真跑。\n');
else console.log('\n完成。\n');
