/**
 * node-redis v5 命令名契约测试
 *
 * 背景：本项目用的是 node-redis v5，**只有驼峰方法名**
 * （`hSet` / `hGetAll` / `zAdd` / `pTTL` / `dbSize` / `sMembers` …），
 * 全小写写法（`hset` / `hgetall` / `dbsize`）在 v5 里是 `undefined`，
 * 调用即抛 `TypeError: xxx is not a function`。
 *
 * 这一类缺陷在本仓已出现过三次，每次都是「静默失效或运行期才炸」：
 *   1. firewall 的封禁索引 `fw:blocked:ips` 从未被写入（列表永远空，管理端也解不掉）
 *   2. `RedisStore.scan()` 传数字 cursor → 编码器直接抛错
 *   3. `scripts/lib/redis.js` 的 `client.dbsize()` → `redis status` 整条命令不可用
 *
 * 因此这里对「裸客户端」上的多词命令名做源码级拦截。
 * 注意 `store().hgetall(...)` 这类是**框架自己**的小写 store API（内部再映射到驼峰命令），
 * 不在拦截范围内 —— 判据是「接收者是不是一个裸客户端标识符」。
 *
 * @author yijiu2025
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SCAN_DIRS = ['src', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vitepress']);

/** 裸客户端的常见变量名 */
const CLIENT_IDS = ['client', 'raw', 'rawClient', 'redisClient', 'globalRedis', 'backupRedis', 'conn', 'connection'];

/** v5 里的多词命令：正确写法是驼峰，小写形态一律是 undefined */
const MULTI_WORD_COMMANDS = [
  'dbsize',
  'hset',
  'hget',
  'hgetall',
  'hdel',
  'hkeys',
  'hvals',
  'hexists',
  'hincrby',
  'sadd',
  'srem',
  'smembers',
  'sismember',
  'scard',
  'zadd',
  'zrem',
  'zcard',
  'zscore',
  'zrange',
  'zrevrange',
  'zrangebyscore',
  'zremrangebyscore',
  'pttl',
  'pexpire',
  'setex',
  'expireat',
  'incrby',
  'decrby',
  'getset',
  'lpush',
  'rpush',
  'lrange',
  'lrem',
  'llen'
];

const VIOLATION_RE = new RegExp(
  `\\b(${CLIENT_IDS.join('|')})\\s*\\.\\s*(${MULTI_WORD_COMMANDS.join('|')})\\s*\\(`,
  'g'
);

/** 找出文本中的裸客户端小写命令调用 */
function findViolations(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    // 跳过整行注释，避免文档/注释里列举错误写法时误报
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    VIOLATION_RE.lastIndex = 0;
    let m;
    while ((m = VIOLATION_RE.exec(line))) {
      hits.push({ line: i + 1, receiver: m[1], command: m[2] });
    }
  });

  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const FILES = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

describe('node-redis v5 命令名契约：裸客户端必须用驼峰方法名', () => {
  it('扫描范围有效（防路径写错导致空扫描假通过）', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES.map(rel)).toContain('scripts/lib/redis.js');
    expect(FILES.map(rel)).toContain('src/framework/redis/redis-store.js');
  });

  it('检测器有牙：能抓到历史上真实发生的三种违规写法', () => {
    // 样本用拼接构造，避免本文件自身被全仓扫描命中（自引用假阳性）——
    // 拼接后源码里不会出现「client 紧跟 . 紧跟 dbsize」这种连续字面量。
    const cases = [
      ['const [n] = await Promise.all([', 'client', '.', 'dbsize', '()]);'].join(''),
      ['await ', 'redisClient', '.', 'hset', '(key, f, v);'].join(''),
      ['await ', 'raw', '.', 'zrevrange', '(key, 0, 9);'].join('')
    ];

    for (const code of cases) {
      expect(findViolations(code)).toHaveLength(1);
    }
  });

  it('检测器不误伤：框架自己的小写 store API 与驼峰写法均放行', () => {
    expect(findViolations('await store().hgetall(hashRel);')).toHaveLength(0);
    expect(findViolations('await RedisStore.hset(prefix, key, f, v);')).toHaveLength(0);
    expect(findViolations('await client.hSet(key, field, value);')).toHaveLength(0);
    expect(findViolations('await client.dbSize();')).toHaveLength(0);
    expect(findViolations('const keys = await client.keys(pattern);')).toHaveLength(0);
  });

  it('仓库内不存在裸客户端上的小写多词命令', () => {
    const offenders = [];

    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      if (!/\.(?:dbsize|hgetall|hset|zadd|zrevrange|smembers|pttl)\s*\(/.test(src)) continue;

      for (const hit of findViolations(src)) {
        offenders.push(
          `${rel(file)}:${hit.line}  ${hit.receiver}.${hit.command}() —— v5 无此方法，应改为驼峰（如 hgetall → hGetAll、dbsize → dbSize）`
        );
      }
    }

    expect(offenders.join('\n')).toBe('');
  });
});
