/**
 * 清理注册测试用户数据脚本
 *
 * 按依赖顺序删除指定邮箱的注册数据：
 *   MySQL: iam_user_role / user_identity / session_tokens / session_logs / session_user_session / user_user
 *   Redis: 邮箱相关的验证码、注册审计日志等残留 key
 *
 * 用法：
 *   node scripts/cleanup-test-user.js <email1> [email2 ...]          # 实际执行删除
 *   node scripts/cleanup-test-user.js <email> --dry-run              # 只预览要删的行/key，不实际删除
 *
 * 示例：
 *   node scripts/cleanup-test-user.js 2037484581@qq.com 2270105975@qq.com
 *   node scripts/cleanup-test-user.js 2037484581@qq.com --dry-run
 *
 * @author yijiu2025
 * @since 2026-08-23
 */
import 'dotenv/config';
import sequelize, { getModel } from '../src/framework/db/index.js';
import { createClient } from 'redis';

/** ANSI 颜色（对齐项目日志规范） */
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

/**
 * 执行查询，返回结果数组（兼容 sequelize v6 + mysql2 的 [results, metadata] 返回结构）
 */
async function query(sql, replacements) {
  const [results] = await sequelize.query(sql, { replacements });
  return results;
}

/**
 * 执行写/删，返回受影响行数
 */
async function exec(sql, replacements) {
  const [result] = await sequelize.query(sql, { replacements });
  // mysql2: result.affectedRows；其他驱动可能是数组或对象
  return result?.affectedRows ?? 0;
}

/** 要清理的表（按依赖顺序：子表在前，主表在后） */
const TABLES_BY_USER_ID = [
  { table: 'iam_user_role', col: 'user_id', label: '用户角色关联' },
  { table: 'user_identity', col: 'user_id', label: '登录凭证(密码hash)' },
  { table: 'session_tokens', col: 'user_id', label: 'session token' },
  { table: 'session_logs', col: 'user_id', label: 'session 日志' },
  { table: 'session_user_session', col: 'user_id', label: '用户 session' }
];
const MAIN_TABLE = { table: 'user_user', col: 'email', label: '用户主表' };

/**
 * 解析命令行参数：邮箱列表 + --dry-run 标志
 */
function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const emails = argv
    .slice(2)
    .filter(a => !a.startsWith('--'))
    .filter(a => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)); // 简单邮箱格式校验
  return { emails, dryRun };
}

/**
 * 查找用户主记录（按邮箱）
 */
async function findUsers(emails) {
  const placeholders = emails.map(() => '?').join(',');
  const rows = await query(
    `SELECT id, username, email, created_at FROM ${MAIN_TABLE.table} WHERE email IN (${placeholders})`,
    emails
  );
  return rows;
}

/**
 * 查询某用户在各关联表的待删行数（预览用）
 */
async function countRelated(userId) {
  const counts = {};
  for (const { table, col } of TABLES_BY_USER_ID) {
    try {
      const rows = await query(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${col} = ?`, [userId]);
      counts[table] = rows?.[0]?.cnt ?? 0;
    } catch (e) {
      counts[table] = -1;
    }
  }
  return counts;
}

/**
 * 删除某用户在各关联表的数据
 */
async function deleteRelated(userId) {
  const deleted = {};
  for (const { table, col } of TABLES_BY_USER_ID) {
    try {
      deleted[table] = await exec(`DELETE FROM ${table} WHERE ${col} = ?`, [userId]);
    } catch (e) {
      deleted[table] = `err: ${e.message}`;
    }
  }
  return deleted;
}

/**
 * 连接 Redis（脚本独立运行，不走 Fastify 插件）
 */
async function getRedisClient() {
  if (process.env.REDIS_ENABLED !== 'true') return null;
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT) || 6379;
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = Number(process.env.REDIS_DB) || 0;

  const client = createClient({ socket: { host, port }, password, database: db });
  client.on('error', err => console.warn(`⚠️ [Redis] ${C.yellow}连接错误: ${err.message}${C.reset}`));
  await client.connect();
  return client;
}

/**
 * 扫描并删除邮箱相关的 Redis key（先 scan 展示，再删）
 * 加超时保护：scan 最多 8s，避免 keyspace 过大卡死脚本
 */
async function cleanupRedis(redis, emails, dryRun) {
  const found = [];
  const SCAN_TIMEOUT = 8_000;
  const deadline = Date.now() + SCAN_TIMEOUT;

  outer: for (const email of emails) {
    const localPart = email.split('@')[0];
    const patterns = [`*${email}*`, `*${localPart}*`];
    const seen = new Set();
    for (const pattern of patterns) {
      for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 500 })) {
        if (Date.now() > deadline) {
          console.warn(`${C.yellow}⚠️ Redis scan 超时（${SCAN_TIMEOUT / 1000}s），已扫描到的 key 继续处理${C.reset}`);
          break outer;
        }
        if (!seen.has(key)) {
          seen.add(key);
          found.push(key);
        }
      }
    }
  }

  if (found.length === 0) {
    console.log(`${C.dim}🧹 Redis 无邮箱相关残留 key${C.reset}`);
    return 0;
  }

  console.log(`${C.cyan}📦 Redis 发现 ${found.length} 个相关 key：${C.reset}`);
  for (const k of found) {
    const display = k && k.toString ? k.toString() : String(k);
    console.log(`   ${C.dim}-${C.reset} ${JSON.stringify(display)}`);
  }

  if (dryRun) {
    console.log(`${C.yellow}（dry-run 模式，不实际删除 Redis key）${C.reset}`);
    return found.length;
  }

  // 批量删除（key 可能含二进制，统一转字符串）
  const keysToDelete = found.map(k => k && k.toString ? k.toString() : String(k));
  await redis.del(keysToDelete);
  console.log(`${C.green}✅ 已删除 ${keysToDelete.length} 个 Redis key${C.reset}`);
  return keysToDelete.length;
}

/**
 * 主流程
 */
async function main() {
  const { emails, dryRun } = parseArgs(process.argv);

  if (emails.length === 0) {
    console.log(`${C.red}用法: node scripts/cleanup-test-user.js <email1> [email2 ...] [--dry-run]${C.reset}`);
    console.log(`${C.dim}示例: node scripts/cleanup-test-user.js test@example.com --dry-run${C.reset}`);
    process.exit(1);
  }

  console.log(`${C.cyan}🧹 清理注册测试数据${C.reset} ${dryRun ? `${C.yellow}[dry-run 预览模式]${C.reset}` : ''}`);
  console.log(`${C.dim}目标邮箱: ${emails.join(', ')}${C.reset}\n`);

  // 1. 查用户
  const users = await findUsers(emails);
  if (users.length === 0) {
    console.log(`${C.yellow}⚠️ user_user 表中未找到这些邮箱的用户（可能已删除或未注册成功）${C.reset}`);
  } else {
    console.log(`${C.cyan}👥 找到 ${users.length} 个用户：${C.reset}`);
    for (const u of users) {
      console.log(`   ${C.green}-${C.reset} id=${u.id}  ${u.email}  (${u.username || '-'})  注册于 ${u.created_at}`);
    }
  }

  // 2. 预览关联表行数
  if (users.length > 0) {
    console.log(`\n${C.cyan}📊 关联数据预览：${C.reset}`);
    for (const u of users) {
      const counts = await countRelated(u.id);
      console.log(`   ${C.green}-${C.reset} 用户 ${u.email} (id=${u.id}):`);
      for (const { table, label } of TABLES_BY_USER_ID) {
        const c = counts[table];
        const cStr = c < 0 ? `${C.red}表不存在${C.reset}` : `${c} 行`;
        console.log(`      ${C.dim}${label} (${table}): ${cStr}${C.reset}`);
      }
    }
  }

  if (dryRun) {
    console.log(`\n${C.yellow}dry-run 模式：以上为待删数据预览，未实际删除。去掉 --dry-run 执行删除。${C.reset}`);
  } else if (users.length > 0) {
    // 3. 实际删除
    console.log(`\n${C.cyan}🗑️  开始删除...${C.reset}`);
    let totalDeleted = 0;
    for (const u of users) {
      const deleted = await deleteRelated(u.id);
      let userTotal = 0;
      for (const { table, label } of TABLES_BY_USER_ID) {
        const d = deleted[table];
        if (typeof d === 'number') userTotal += d;
        console.log(`   ${C.green}-${C.reset} ${u.email} → ${label} (${table}): 删除 ${d} 行`);
      }
      // 删主表
      try {
        const cnt = await exec(`DELETE FROM ${MAIN_TABLE.table} WHERE id = ?`, [u.id]);
        console.log(`   ${C.green}-${C.reset} ${u.email} → ${MAIN_TABLE.label} (${MAIN_TABLE.table}): 删除 ${cnt} 行`);
        userTotal += cnt;
      } catch (e) {
        console.log(`   ${C.red}-${C.reset} ${u.email} → ${MAIN_TABLE.table} 删除失败: ${e.message}`);
      }
      totalDeleted += userTotal;
      console.log(`   ${C.dim}小计: ${userTotal} 行${C.reset}\n`);
    }
    console.log(`${C.green}✅ MySQL 共删除 ${totalDeleted} 行${C.reset}`);
  }

  // 4. 清 Redis
  const redis = await getRedisClient();
  if (redis) {
    console.log(`\n${C.cyan}🧹 清理 Redis 残留...${C.reset}`);
    await cleanupRedis(redis, emails, dryRun);
    await redis.quit();
  } else {
    console.log(`\n${C.dim}🧹 REDIS_ENABLED 非 true，跳过 Redis 清理${C.reset}`);
  }

  console.log(`\n${C.green}✅ 清理完成${C.reset}`);
}

main()
  .catch(err => {
    console.error(`${C.red}❌ 执行出错: ${err.message}${C.reset}`);
    console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
