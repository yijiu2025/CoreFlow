/**
 * 超级管理员初始化脚本
 *
 * 用法：
 *   node scripts/setup-superadmin.js                          # 交互式输入
 *   node scripts/setup-superadmin.js --email admin@example.com
 *   node scripts/setup-superadmin.js --uid d102d02f-c338-4847-8cd8-71afb69b878a
 *
 * 功能：
 * 1. 确保数据库已迁移
 * 2. 创建 superadmin 角色（GLOBAL）
 * 3. 查找或创建目标用户（支持交互式输入）
 * 4. 授予 superadmin 角色
 * 5. 清除该用户的 Redis session
 */
import 'dotenv/config';
import crypto from 'crypto';
import readline from 'readline';
import sequelize from '../src/db/index.js';

const args = process.argv.slice(2);
const emailArg = args.includes('--email') ? args[args.indexOf('--email') + 1] : null;
const uidArg = args.includes('--uid') ? args[args.indexOf('--uid') + 1] : null;

/** 创建 readline 接口 */
function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/** 提示用户输入 */
function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    if (hidden) {
      // 隐藏输入（密码）
      process.stdout.write(question);
      let password = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
        } else if (char === '') {
          // Ctrl+C
          process.exit(0);
        } else if (char === '' || char === '\b') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => resolve(answer.trim()));
    }
  });
}

async function main() {
  console.log('🔧 超级管理员初始化脚本\n');

  // 1. 加载所有模型
  await import('../src/models/user/User.js');
  await import('../src/models/user/UserIdentity.js');
  await import('../src/models/iam/Role.js');
  await import('../src/models/iam/UserRole.js');

  const { User, UserIdentity, Role, UserRole } = sequelize.models;

  if (!User || !Role || !UserRole) {
    console.error('❌ 模型未加载，请先执行 npm run migrate');
    process.exit(1);
  }

  // 2. 同步模型
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

  // 4. 显示当前所有 superadmin
  const currentAdmins = await UserRole.findAll({
    where: { role_id: role.id, delete_version: 0 },
    include: [{ model: User, as: 'user', attributes: ['id', 'uid', 'username', 'email'] }]
  });

  if (currentAdmins.length > 0) {
    console.log('\n📋 当前超级管理员列表：');
    console.log('─'.repeat(60));
    currentAdmins.forEach((ur, i) => {
      const user = ur.user;
      console.log(`  ${i + 1}. ${user.username} (${user.email}) [ID: ${user.id}]`);
    });
    console.log('─'.repeat(60));
    console.log('');
  } else {
    console.log('\n📋 当前没有超级管理员\n');
  }

  // 5. 获取目标用户信息
  let email = emailArg || process.env.SUPERADMIN_EMAIL;
  let password = process.env.SUPERADMIN_PASSWORD;
  const rl = createRl();

  try {
    // 如果没有指定邮箱，交互式输入
    if (!email && !uidArg) {
      email = await ask(rl, '📧 请输入管理员邮箱: ');
      if (!email) {
        console.error('❌ 邮箱不能为空');
        process.exit(1);
      }
    }

    // 如果需要创建用户但没有密码，交互式输入
    let needPassword = !password && !uidArg;
    if (needPassword) {
      // 先检查用户是否已存在
      const existingUser = await User.findOne({ where: { email } });
      if (!existingUser) {
        password = await ask(rl, '🔑 请输入密码（至少6位）: ', true);
        if (!password || password.length < 6) {
          console.error('❌ 密码不能为空且至少6位');
          process.exit(1);
        }
        const password2 = await ask(rl, '🔑 请再次输入密码: ', true);
        if (password !== password2) {
          console.error('❌ 两次输入的密码不一致');
          process.exit(1);
        }
      }
    }

    // 6. 查找或创建用户
    let user;
    if (uidArg) {
      user = await User.findOne({ where: { uid: uidArg } });
    } else {
      user = await User.findOne({ where: { email } });

      if (!user && password) {
        console.log(`\n👤 用户 ${email} 不存在，正在自动创建...`);

        // 加密密码
        let hashedPassword;
        try {
          const bcrypt = await import('bcryptjs');
          hashedPassword = await bcrypt.default.hash(password, 12);
        } catch {
          hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
          console.warn('⚠️  bcryptjs 未安装，使用 SHA256 哈希（生产环境请安装 bcryptjs）');
        }

        user = await User.create({
          uid: crypto.randomUUID(),
          username: email.split('@')[0],
          email,
          status: 1,
          delete_version: 0
        });

        await UserIdentity.create({
          user_id: user.id,
          identity_type: 'password',
          identifier: email,
          credential: hashedPassword
        });

        console.log(`✅ 已创建用户: ${user.username} (${user.email}) [ID: ${user.id}]`);
      }
    }

    if (!user) {
      console.error('❌ 未找到用户。请确保用户已注册，或提供密码以自动创建。');
      process.exit(1);
    }

    console.log(`\n👤 目标用户: ${user.username} (${user.email}) [ID: ${user.id}]`);

    // 7. 检查是否已是 superadmin
    const existingRole = await UserRole.findOne({
      where: { user_id: user.id, role_id: role.id, delete_version: 0 }
    });

    if (existingRole) {
      console.log('ℹ️  该用户已是 superadmin，无需重复操作');
      process.exit(0);
    }

    // 8. 授予角色
    await UserRole.create({
      user_id: user.id,
      app_id: 'GLOBAL',
      role_id: role.id
    });
    console.log('✅ 已授予 superadmin 角色');

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
              if (session.userId === user.id || session.uid === user.uid) {
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

    console.log('\n🎉 初始化完成！');
    console.log('   该用户现在拥有系统全部权限。');
    console.log('   重新登录后，访问任意应用将自动获得该应用的管理员权限。');

  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('❌ 初始化失败:', err.message);
  process.exit(1);
}).finally(async () => {
  await sequelize.close();
});
