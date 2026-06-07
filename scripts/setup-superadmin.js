/**
 * 超级管理员初始化脚本
 *
 * 用法：
 *   node scripts/setup-superadmin.js
 *   node scripts/setup-superadmin.js --email admin@example.com
 *   node scripts/setup-superadmin.js --uid d102d02f-c338-4847-8cd8-71afb69b878a
 *
 * 功能：
 * 1. 确保数据库已迁移
 * 2. 创建 superadmin 角色（GLOBAL）
 * 3. 查找指定用户（默认第一个注册用户）
 * 4. 授予 superadmin 角色
 * 5. 清除该用户的 Redis session（强制重新登录获取新权限）
 */
import 'dotenv/config';
import sequelize from '../src/db/index.js';

const args = process.argv.slice(2);
const emailArg = args.includes('--email') ? args[args.indexOf('--email') + 1] : null;
const uidArg = args.includes('--uid') ? args[args.indexOf('--uid') + 1] : null;

async function main() {
  console.log('🔧 超级管理员初始化脚本\n');

  // 1. 加载所有模型
  await import('../src/models/user/User.js');
  await import('../src/models/iam/Role.js');
  await import('../src/models/iam/UserRole.js');

  const { User, Role, UserRole } = sequelize.models;

  if (!User || !Role || !UserRole) {
    console.error('❌ 模型未加载，请先执行 npm run migrate');
    process.exit(1);
  }

  // 2. 同步模型（确保表存在）
  await sequelize.sync();
  console.log('✅ 数据库连接成功\n');

  // 3. 创建 superadmin 角色
  const [role, roleCreated] = await Role.findOrCreate({
    where: { code: 'superadmin', app_id: 'GLOBAL' },
    defaults: {
      code: 'superadmin',
      app_id: 'GLOBAL',
      name: '超级管理员',
      rank_level: 99,
      description: '拥有系统全部权限的超级管理员',
      policy: {
        Version: '2026-06-06',
        Statement: [{ Effect: 'Allow', Action: ['*'] }]
      }
    }
  });

  if (roleCreated) {
    console.log(`✅ 创建 superadmin 角色 (ID: ${role.id})`);
  } else {
    console.log(`ℹ️  superadmin 角色已存在 (ID: ${role.id})`);
  }

  // 4. 查找目标用户
  let user;
  if (emailArg) {
    user = await User.findOne({ where: { email: emailArg } });
  } else if (uidArg) {
    user = await User.findOne({ where: { uid: uidArg } });
  } else {
    user = await User.findOne({ order: [['id', 'ASC']] });
  }

  if (!user) {
    console.error('❌ 未找到用户。请先注册一个账户，或使用 --email/--uid 指定。');
    console.error('   示例: npm run setup:admin -- --email admin@example.com');
    process.exit(1);
  }

  console.log(`👤 目标用户: ${user.username} (${user.email}) [ID: ${user.id}]`);

  // 5. 授予角色
  const [, assigned] = await UserRole.findOrCreate({
    where: { user_id: user.id, role_id: role.id, delete_version: 0 },
    defaults: {
      user_id: user.id,
      app_id: 'GLOBAL',
      role_id: role.id
    }
  });

  if (assigned) {
    console.log('✅ 已授予 superadmin 角色');
  } else {
    console.log('ℹ️  用户已拥有 superadmin 角色');
  }

  // 6. 清除 Redis session（强制重新登录获取新权限）
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

      // 查找并删除该用户的所有 session
      const keys = await redis.keys('session:*');
      let cleared = 0;
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          try {
            const session = JSON.parse(data);
            if (session.userId === user.id || session.uid === user.uid) {
              await redis.del(key);
              cleared++;
            }
          } catch {
            /* 非 JSON 格式的 key，跳过 */
          }
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

  console.log('');
  console.log('🎉 初始化完成！');
  console.log('   该用户现在拥有系统全部权限。');
  console.log('   重新登录后，访问任意应用将自动获得该应用的管理员权限。');
}

main().catch((err) => {
  console.error('❌ 初始化失败:', err.message);
  process.exit(1);
}).finally(async () => {
  await sequelize.close();
});
