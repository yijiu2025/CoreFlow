/**
 * 撤销超级管理员脚本
 *
 * 用法：
 *   node scripts/revoke-superadmin.js                          # 交互式选择
 *   node scripts/revoke-superadmin.js --email user@example.com
 *   node scripts/revoke-superadmin.js --uid d102d02f-c338-4847-8cd8-71afb69b878a
 *   node scripts/revoke-superadmin.js --email user@example.com --force
 *
 * 安全机制：
 * 1. 显示当前所有 superadmin 列表
 * 2. 撤销前检查是否为最后一个 superadmin
 * 3. 默认需要确认，--force 可跳过
 * 4. 撤销后清除 Redis session
 */
import 'dotenv/config';
import readline from 'readline';
import sequelize from '../src/db/index.js';

const args = process.argv.slice(2);
const emailArg = args.includes('--email') ? args[args.indexOf('--email') + 1] : null;
const uidArg = args.includes('--uid') ? args[args.indexOf('--uid') + 1] : null;
const force = args.includes('--force');

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('🔧 撤销超级管理员脚本\n');

  // 1. 加载模型
  await import('../src/models/user/User.js');
  await import('../src/models/iam/Role.js');
  await import('../src/models/iam/UserRole.js');

  const { User, Role, UserRole } = sequelize.models;

  if (!User || !Role || !UserRole) {
    console.error('❌ 模型未加载，请先执行 npm run migrate');
    process.exit(1);
  }

  // 2. 查找 superadmin 角色
  const role = await Role.findOne({ where: { code: 'superadmin', app_id: 'GLOBAL' } });
  if (!role) {
    console.error('❌ superadmin 角色不存在，请先运行 npm run setup:admin');
    process.exit(1);
  }

  // 3. 查询所有 superadmin
  const superadmins = await UserRole.findAll({
    where: { role_id: role.id, delete_version: 0 },
    include: [{ model: User, as: 'user', attributes: ['id', 'uid', 'username', 'email'] }]
  });

  if (superadmins.length === 0) {
    console.log('ℹ️  当前没有超级管理员，无需操作');
    process.exit(0);
  }

  // 4. 显示列表
  console.log('📋 当前超级管理员列表：');
  console.log('─'.repeat(60));
  superadmins.forEach((ur, i) => {
    const user = ur.user;
    console.log(`  ${i + 1}. ${user.username} (${user.email}) [ID: ${user.id}]`);
  });
  console.log('─'.repeat(60));

  // 5. 安全检查：最后一个管理员
  if (superadmins.length <= 1) {
    console.error('\n⚠️  安全警告：这是系统中唯一的超级管理员！');
    console.error('   撤销后将无法管理任何应用权限。');
    console.error('   如需切换管理员，请先用 npm run setup:admin 添加新管理员。');
    process.exit(1);
  }

  // 6. 确定要撤销的用户
  let targetUserRole;
  let targetUser;

  if (emailArg || uidArg) {
    // 命令行指定
    targetUserRole = superadmins.find((ur) => {
      if (emailArg) return ur.user.email === emailArg;
      if (uidArg) return ur.user.uid === uidArg;
      return false;
    });
    targetUser = targetUserRole?.user;
  } else {
    // 交互式选择
    const rl = createRl();
    try {
      const input = await ask(rl, '\n请输入要撤销的序号或邮箱: ');

      // 尝试按序号
      const index = parseInt(input, 10);
      if (!isNaN(index) && index >= 1 && index <= superadmins.length) {
        targetUserRole = superadmins[index - 1];
        targetUser = targetUserRole.user;
      } else {
        // 按邮箱
        targetUserRole = superadmins.find((ur) => ur.user.email === input);
        targetUser = targetUserRole?.user;
      }
    } finally {
      rl.close();
    }
  }

  if (!targetUser || !targetUserRole) {
    console.error('❌ 未找到指定的超级管理员');
    process.exit(1);
  }

  // 7. 确认操作
  console.log(`\n👤 目标用户: ${targetUser.username} (${targetUser.email}) [ID: ${targetUser.id}]`);

  if (!force) {
    const rl = createRl();
    try {
      const ok = await ask(rl, `确认撤销 ${targetUser.email} 的 superadmin 权限？(y/N): `);
      if (ok.toLowerCase() !== 'y') {
        console.log('❌ 操作已取消');
        process.exit(0);
      }
    } finally {
      rl.close();
    }
  }

  // 8. 执行软删除
  await targetUserRole.update({ delete_version: targetUserRole.id });
  console.log('✅ 已撤销 superadmin 角色');

  // 9. 清除 Redis session
  try {
    const { createClient } = await import('redis');
    if (process.env.REDIS_ENABLED === 'true' && process.env.REDIS_HOST) {
      const redis = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379')
        },
        password: process.env.REDIS_PASSWORD || undefined
      });
      await redis.connect();

      const keys = await redis.keys('session:*');
      let cleared = 0;
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          try {
            const session = JSON.parse(data);
            if (session.userId === targetUser.id || session.uid === targetUser.uid) {
              await redis.del(key);
              cleared++;
            }
          } catch { /* 跳过 */ }
        }
      }
      await redis.quit();
      if (cleared > 0) {
        console.log(`🗑️  已清除 ${cleared} 个旧 Session`);
      }
    }
  } catch (err) {
    console.warn(`⚠️  清除 Session 失败（可忽略）: ${err.message}`);
  }

  console.log('\n🎉 操作完成！');
  console.log(`   ${targetUser.email} 已不再拥有 superadmin 权限。`);
  console.log('   该用户重新登录后，权限将立即生效。');
}

main().catch((err) => {
  console.error('❌ 操作失败:', err.message);
  process.exit(1);
}).finally(async () => {
  await sequelize.close();
});
