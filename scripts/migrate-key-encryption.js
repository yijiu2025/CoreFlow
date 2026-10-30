/**
 * 私钥信封加密迁移脚本
 *
 * 把 `oauth_key_pairs.private_key` 里的历史明文 PEM 就地改成 AES-256-GCM 密文。
 *
 * 用法：
 *   node scripts/migrate-key-encryption.js --dry-run   # 只统计，不写库
 *   node scripts/migrate-key-encryption.js             # 执行迁移
 *   node scripts/migrate-key-encryption.js --verify    # 只校验是否已全部加密
 *
 * 前置：`KEY_ENCRYPTION_KEY`（32 字节 hex/base64）已配置，且**与其他实例一致**。
 * 多实例部署时先把 KEK 下发到所有实例、再跑本脚本 —— 顺序反了会出现
 * 「A 实例已能解密、B 实例还在读明文」的短暂混合态（代码本身兼容，但排障时会困惑）。
 *
 * 幂等：已是密文的行跳过；重复运行不会二次加密。
 * 安全：不存在「先删后写」的窗口 —— 每行一条 UPDATE，条件里带上原值，
 * 并发写入（比如迁移期间有实例建了新密钥）不会被覆盖。
 *
 * 退出码：0 成功 / 1 存在失败行 / 2 配置或环境不满足
 *
 * @author yijiu2025
 * @since 2026-10-30
 */
import 'dotenv/config';
import { DataTypes } from 'sequelize';
import sequelize from '../src/framework/db/index.js';
import defineKeyPair from '../src/models/key/KeyPair.js';
import { createLogger, logStdout } from '../src/framework/log/index.js';

const log = createLogger('scripts.migrate-key-encryption');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERIFY_ONLY = argv.includes('--verify');

/** 逐行迁移的失败上限：超过就停，避免把一次事故刷成几千行日志 */
const MAX_FAILURES = 20;

/**
 * 读取 keyring 配置并做基础校验（真正的解析在 envelope.js 里，这里只判断有没有配）
 * @returns {boolean} 是否可用
 */
function preflight() {
  if (!process.env.KEY_ENCRYPTION_KEY) {
    logStdout('⛔ 未配置 KEY_ENCRYPTION_KEY，无法加密私钥。');
    logStdout("   生成方式：node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    logStdout('   配好之后重新运行本脚本；未配置时服务仍以明文私钥运行（不推荐）。');
    return false;
  }
  return true;
}

async function main() {
  if (!preflight()) return 2;

  // 只实例化本脚本需要的模型，不启动整个 loader（脚本不该拉起 Redis/调度器）
  const KeyPair = defineKeyPair(sequelize, DataTypes);

  const rows = await KeyPair.findAll({ attributes: ['id', 'name', 'private_key'], order: [['id', 'ASC']] });
  if (rows.length === 0) {
    logStdout('ℹ️  oauth_key_pairs 为空，无需迁移');
    return 0;
  }

  // 延迟导入：模块顶层 import envelope 会在 preflight 之前读取 env
  const { seal, isSealed, open } = await import('../src/framework/keys/envelope.js');

  let plaintext = 0;
  let alreadySealed = 0;
  let migrated = 0;
  let failed = 0;
  const failures = [];

  for (const row of rows) {
    const value = row.private_key;

    if (isSealed(value)) {
      alreadySealed++;
      // 已加密的行也要能解开：否则说明 KEK 配错了（或用了别的实例的 KEK），
      // 这时迁移"成功"是最危险的结论 —— 服务下一个请求就会解密失败。
      try {
        open(value, row.name);
      } catch (err) {
        failed++;
        failures.push(`${row.name}: 已加密但解密失败 —— ${err.message}`);
      }
      continue;
    }

    plaintext++;
    if (VERIFY_ONLY) {
      failed++;
      failures.push(`${row.name}: 仍是明文`);
      continue;
    }
    if (DRY_RUN) continue;

    try {
      const sealed = seal(value, row.name);
      // CAS：只有原值没被别的实例改过才写回
      const [updated] = await KeyPair.update({ private_key: sealed }, { where: { id: row.id, private_key: value } });
      if (updated === 1) {
        migrated++;
      } else {
        // 迁移期间被并发改写：不算失败，下一轮（或下次运行）会处理
        log.warn(`[migrate-key-encryption] ${row.name} 在迁移期间被改动，跳过`);
      }
    } catch (err) {
      failed++;
      failures.push(`${row.name}: ${err.message}`);
      if (failures.length >= MAX_FAILURES) {
        logStdout(`⛔ 失败行已达 ${MAX_FAILURES}，中止（先修问题再重跑，脚本幂等）`);
        break;
      }
    }
  }

  logStdout('');
  logStdout(`总计 ${rows.length} 行：明文 ${plaintext} / 已加密 ${alreadySealed}`);
  if (DRY_RUN) logStdout('模式：--dry-run（未写入任何数据）');
  if (VERIFY_ONLY) logStdout('模式：--verify（只校验）');
  if (!DRY_RUN && !VERIFY_ONLY) logStdout(`已迁移 ${migrated} 行`);
  if (failed > 0) {
    logStdout(`❌ 失败 ${failed} 行：`);
    for (const f of failures) logStdout(`   - ${f}`);
    return 1;
  }

  logStdout('✅ 私钥全部为密文且可解密');
  return 0;
}

main()
  .then(async code => {
    await sequelize.close();
    process.exit(code);
  })
  .catch(async err => {
    log.error('❌ 迁移异常终止', err);
    try {
      await sequelize.close();
    } catch {
      /* 连接可能已断开 */
    }
    process.exit(1);
  });
