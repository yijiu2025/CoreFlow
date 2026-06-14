/**
 * 管理员管理命令模块
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getModels } from '../lib/db.js';
import { connectRedis, closeRedis, clearUserSessions } from '../lib/redis.js';
import { createRl, ask, confirm, closeRl } from '../lib/input.js';
import { printTable, printSuccess, printInfo, printWarning, printError, printLine } from '../lib/table.js';

/**
 * 列出所有超级管理员
 */
export async function listSuperadmins() {
  const { Role, UserRole, User } = getModels();

  const role = await Role.findOne({ where: { code: 'superadmin', app_id: 'GLOBAL' } });
  if (!role) {
    printInfo('superadmin 角色不存在');
    return;
  }

  const superadmins = await UserRole.findAll({
    where: { role_id: role.id, delete_version: 0 },
    include: [{ model: User, as: 'user', attributes: ['id', 'uid', 'username', 'email'] }]
  });

  if (superadmins.length === 0) {
    printInfo('当前没有超级管理员');
    return;
  }

  console.log('\n👑 超级管理员列表：');
  printTable(
    ['ID', '用户名', '邮箱'],
    superadmins.map((ur) => [ur.user.id, ur.user.username, ur.user.email])
  );
  console.log(`\n共 ${superadmins.length} 个超级管理员`);
}

/**
 * 初始化超级管理员
 */
export async function setupSuperadmin() {
  const { User, UserIdentity, Role, UserRole } = getModels();

  // 确保 superadmin 角色存在
  const [role, created] = await Role.findOrCreate({
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

  if (created) {
    printSuccess('创建 superadmin 角色');
  }

  // 显示当前管理员
  const currentAdmins = await UserRole.findAll({
    where: { role_id: role.id, delete_version: 0 },
    include: [{ model: User, as: 'user' }]
  });

  if (currentAdmins.length > 0) {
    console.log('\n当前超级管理员：');
    currentAdmins.forEach((ur, i) => {
      console.log(`  ${i + 1}. ${ur.user.username} (${ur.user.email})`);
    });
  }

  // 输入新管理员信息
  const rl = createRl();
  try {
    const email = await ask(rl, '\n📧 管理员邮箱: ');
    if (!email) {
      printError('邮箱不能为空');
      return;
    }

    let user = await User.findOne({ where: { email } });

    if (!user) {
      // 用户不存在，需要创建
      const password = await ask(rl, '🔑 密码（至少6位）: ', true);
      if (!password || password.length < 6) {
        printError('密码不能为空且至少6位');
        return;
      }

      const password2 = await ask(rl, '🔑 请再次输入密码: ', true);
      if (password !== password2) {
        printError('两次输入的密码不一致');
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 12);

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

      printSuccess(`创建用户: ${user.username} (${user.email})`);
    }

    // 检查是否已是管理员
    const existing = await UserRole.findOne({
      where: { user_id: user.id, role_id: role.id, delete_version: 0 }
    });

    if (existing) {
      printInfo(`用户 ${email} 已是超级管理员`);
      return;
    }

    // 授予角色
    await UserRole.create({
      user_id: user.id,
      app_id: 'GLOBAL',
      role_id: role.id
    });

    // 清除 session
    const redis = await connectRedis();
    if (redis) {
      const cleared = await clearUserSessions(redis, user.id, user.uid);
      await closeRedis(redis);
      if (cleared > 0) {
        printInfo(`已清除 ${cleared} 个旧 Session`);
      }
    }

    printSuccess(`已授予 ${email} 超级管理员权限`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 撤销超级管理员
 */
export async function revokeSuperadmin() {
  const { Role, UserRole, User } = getModels();

  const role = await Role.findOne({ where: { code: 'superadmin', app_id: 'GLOBAL' } });
  if (!role) {
    printError('superadmin 角色不存在');
    return;
  }

  const superadmins = await UserRole.findAll({
    where: { role_id: role.id, delete_version: 0 },
    include: [{ model: User, as: 'user' }]
  });

  if (superadmins.length === 0) {
    printInfo('当前没有超级管理员');
    return;
  }

  // 安全检查
  if (superadmins.length <= 1) {
    printError('这是系统中唯一的超级管理员！');
    printError('撤销后将无法管理任何应用权限。');
    printError('请先用 setup-superadmin 添加新管理员。');
    return;
  }

  // 显示列表
  console.log('\n当前超级管理员：');
  superadmins.forEach((ur, i) => {
    console.log(`  ${i + 1}. ${ur.user.username} (${ur.user.email}) [ID: ${ur.user.id}]`);
  });

  const rl = createRl();
  try {
    const input = await rl.question('\n请输入要撤销的序号或邮箱: ');

    let target;
    const index = parseInt(input, 10);
    if (!isNaN(index) && index >= 1 && index <= superadmins.length) {
      target = superadmins[index - 1];
    } else {
      target = superadmins.find((ur) => ur.user.email === input);
    }

    if (!target) {
      printError('未找到指定的超级管理员');
      return;
    }

    const ok = await confirm(rl, `确认撤销 ${target.user.email} 的超级管理员权限？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    await target.update({ delete_version: target.id });

    // 清除 session
    const redis = await connectRedis();
    if (redis) {
      const cleared = await clearUserSessions(redis, target.user.id, target.user.uid);
      await closeRedis(redis);
      if (cleared > 0) {
        printInfo(`已清除 ${cleared} 个旧 Session`);
      }
    }

    printSuccess(`已撤销 ${target.user.email} 的超级管理员权限`);
  } finally {
    closeRl(rl);
  }
}
