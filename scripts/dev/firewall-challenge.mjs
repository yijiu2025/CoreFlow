/**
 * 防火墙拦截态「手工造」工具（仅开发/联调用）
 *
 * 为什么需要它：**回环地址（127.0.0.1 / ::1）不再被扫描陷阱自动封禁**（开发期自伤，
 * 见 scan-trap.js 的 LOOPBACK_PREFIXES），而 Bot 挑战的默认阈值（无 UA 10 次 / 浏览器
 * 120 次每 60s）在本地很难稳定复现。想验证挑战页、428、429、403 这几条分支时，
 * 直接给 Redis 写一条封禁记录是最快、最可重复的方式。
 *
 * 用法：
 *   node scripts/dev/firewall-challenge.mjs arm                             # 造 CHALLENGE（默认 300s，127.0.0.1 + ::1）
 *   node scripts/dev/firewall-challenge.mjs arm --status BLOCKED --ttl 60  # 造临时封禁（→ 429）
 *   node scripts/dev/firewall-challenge.mjs arm --status SCANNER            # 造扫描器封禁（→ 403）
 *   node scripts/dev/firewall-challenge.mjs clear                           # 清干净
 *   node scripts/dev/firewall-challenge.mjs status                          # 看当前状态
 *
 * 选项：--ip <addr>（可重复）--status CHALLENGE|BLOCKED|SCANNER --ttl <秒> --permanent
 *
 * ⚠️ 会直接写 .env 里那台 Redis。只在开发/联调环境跑，别指向生产。
 *
 * @author yijiu2025
 * @since 2026-11-03
 */
import 'dotenv/config';
import { createClient } from 'redis';

const DEFAULT_IPS = ['127.0.0.1', '::1'];
const VALID_STATUS = ['CHALLENGE', 'BLOCKED', 'SCANNER'];

/**
 * 解析命令行参数
 *
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{mode: string, ips: string[], status: string, ttl: number, permanent: boolean}}
 */
function parseArgs(argv) {
  const mode = argv[0] || 'status';
  const ips = [];
  let status = 'CHALLENGE';
  let ttl = 300;
  let permanent = false;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ip') ips.push(argv[++i]);
    else if (arg === '--status') status = String(argv[++i] || '').toUpperCase();
    else if (arg === '--ttl') ttl = Number(argv[++i]);
    else if (arg === '--permanent') permanent = true;
  }

  if (!['arm', 'clear', 'status'].includes(mode)) {
    throw new Error(`未知模式: ${mode}（可用 arm / clear / status）`);
  }
  if (mode === 'arm' && !VALID_STATUS.includes(status)) {
    throw new Error(`--status 只能是 ${VALID_STATUS.join(' / ')}`);
  }
  return { mode, ips: ips.length ? ips : DEFAULT_IPS, status, ttl, permanent };
}

/**
 * 由 .env 拼 Redis 连接串（与框架 utils 同一套变量）
 *
 * @returns {string} redis:// URL
 */
function redisUrl() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || '6379';
  const pass = process.env.REDIS_PASSWORD ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@` : '';
  return `redis://${pass}${host}:${port}`;
}

const { mode, ips, status, ttl, permanent } = parseArgs(process.argv.slice(2));
const client = createClient({ url: redisUrl() });
client.on('error', err => {
  console.error('Redis 错误:', err.message);
  process.exitCode = 1;
});

await client.connect();

/** 索引 Hash（面板/CLI 列举封禁用的那份，必须同写，否则列表里看不到） */
const INDEX_KEY = 'fw:blocked:ips';

if (mode === 'arm') {
  const now = Date.now();
  const meta = JSON.stringify({
    status,
    source: 'manual',
    permanent,
    createdAt: now,
    expiresAt: permanent ? null : now + ttl * 1000
  });

  for (const ip of ips) {
    const key = `fw:block:${ip}`;
    if (permanent) await client.set(key, meta);
    else await client.set(key, meta, { EX: Math.max(1, Math.round(ttl)) });
    await client.hSet(INDEX_KEY, ip, meta);
    // 清掉陷阱计数，避免解封后第一条 404 立刻又触发
    await client.del(`fw:trap:${ip}`);
  }

  // 清空已签发的通过令牌：否则浏览器里 30 分钟有效的 fw_verified cookie 会直接放行，
  // 你会以为"没生效"
  const passes = await client.keys('fw:pass:*');
  if (passes.length) await client.del(passes);

  console.log(`✅ 已写入 ${status}${permanent ? '（永久）' : `（${ttl}s）`} → ${ips.join(', ')}`);
  console.log(`   同时清理了 ${passes.length} 个通过令牌（fw:pass:*）`);
  console.log('   预期响应：CHALLENGE → 428 + X-Firewall-Challenge（文档请求 302 到挑战页）');
  console.log('             BLOCKED   → 429 + Retry-After');
  console.log('             SCANNER   → 403');
  console.log('   清理：node scripts/dev/firewall-challenge.mjs clear');
} else if (mode === 'clear') {
  for (const ip of ips) {
    await client.del([`fw:block:${ip}`, `fw:trap:${ip}`]);
    await client.hDel(INDEX_KEY, ip);
  }
  const passes = await client.keys('fw:pass:*');
  if (passes.length) await client.del(passes);
  console.log(`🧹 已清理 ${ips.join(', ')} 的封禁 + 陷阱计数 + ${passes.length} 个通过令牌`);
} else {
  for (const ip of ips) {
    const raw = await client.get(`fw:block:${ip}`);
    const ttlLeft = await client.ttl(`fw:block:${ip}`);
    const trap = await client.get(`fw:trap:${ip}`);
    console.log(
      raw
        ? `${ip} → ${raw}  (TTL ${ttlLeft}s)  trap=${trap || 0}`
        : `${ip} → 无封禁  trap=${trap || 0}`
    );
  }
  const passes = await client.keys('fw:pass:*');
  console.log(`通过令牌（fw:pass:*）: ${passes.length} 个`);
}

await client.quit();
