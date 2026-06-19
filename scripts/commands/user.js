/**
 * 用户管理命令模块
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getModels } from '../lib/db.js';
import { connectRedis, closeRedis, clearUserSessions } from '../lib/redis.js';
import { createRl, ask, confirm, closeRl } from '../lib/input.js';
import { printTable, printSuccess, printInfo, printWarning, printError, printLine } from '../lib/table.js';

/**
 * 列出所有用户
 */
export async function listUsers() {
  const { User } = getModels();
  const users = await User.findAll({
    attributes: ['id', 'uid', 'username', 'email', 'status', 'created_at'],
    order: [['id', 'ASC']]
  });

  if (users.length === 0) {
    printInfo('暂无用户');
    return;
  }

  console.log('\n👥 用户列表：');
  printTable(
    ['ID', '用户名', '邮箱', '状态', '创建时间'],
    users.map((u) => [
      u.id,
      u.username,
      u.email,
      u.status === 1 ? '✅ 正常' : '❌ 禁用',
      new Date(u.created_at).toLocaleString('zh-CN')
    ])
  );
  console.log(`\n共 ${users.length} 个用户`);
}

/**
 * 创建用户
 */
export async function createUser() {
  const { User, UserIdentity } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 邮箱: ');
    if (!email) {
      printError('邮箱不能为空');
      return;
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      printError(`邮箱 ${email} 已被注册`);
      return;
    }

    const username = await ask(rl, '👤 用户名（留空使用邮箱前缀）: ') || email.split('@')[0];
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

    const user = await User.create({
      uid: crypto.randomUUID(),
      username,
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

    printSuccess(`用户创建成功: ${user.username} (${user.email}) [ID: ${user.id}]`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 重置用户密码（同时踢出所有登录）
 */
export async function resetPassword() {
  const { User, UserIdentity, SessionToken } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 请输入用户邮箱: ');
    const user = await User.findOne({ where: { email } });

    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    console.log(`👤 目标用户: ${user.username} (${user.email})`);

    const password = await ask(rl, '🔑 新密码（至少6位）: ', true);
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

    // 更新密码
    await UserIdentity.update(
      { credential: hashedPassword },
      { where: { user_id: user.id, identity_type: 'password' } }
    );
    printSuccess(`密码已重置: ${user.email}`);

    // 吊销数据库中所有 session token
    const revokedCount = await SessionToken.update(
      { revoked: true },
      { where: { user_id: user.id, revoked: false } }
    );
    if (revokedCount[0] > 0) {
      printInfo(`已吊销 ${revokedCount[0]} 个数据库 Token`);
    }

    // 清除 Redis 中所有 session
    const redis = await connectRedis();
    if (redis) {
      const cleared = await clearUserSessions(redis, user.id, user.uid);
      await closeRedis(redis);
      if (cleared > 0) {
        printInfo(`已清除 ${cleared} 个 Redis Session`);
      }
    }

    printSuccess(`用户 ${email} 已被踢出所有设备，需重新登录`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 禁用用户（同时踢出所有登录）
 */
export async function disableUser() {
  const { User, SessionToken } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 请输入要禁用的用户邮箱: ');
    const user = await User.findOne({ where: { email } });

    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    if (user.status !== 1) {
      printInfo(`用户 ${email} 已是禁用状态`);
      return;
    }

    const ok = await confirm(rl, `确认禁用用户 ${email}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    // 禁用用户
    await user.update({ status: 0 });

    // 吊销数据库中所有 session token
    const revokedCount = await SessionToken.update(
      { revoked: true },
      { where: { user_id: user.id, revoked: false } }
    );
    if (revokedCount[0] > 0) {
      printInfo(`已吊销 ${revokedCount[0]} 个 Token`);
    }

    // 清除 Redis 中所有 session
    const redis = await connectRedis();
    if (redis) {
      const cleared = await clearUserSessions(redis, user.id, user.uid);
      await closeRedis(redis);
      if (cleared > 0) {
        printInfo(`已清除 ${cleared} 个 Session`);
      }
    }

    printSuccess(`用户已禁用: ${email}（所有设备已踢出）`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 启用用户
 */
export async function enableUser() {
  const { User } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 请输入要启用的用户邮箱: ');
    const user = await User.findOne({ where: { email } });

    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    if (user.status === 1) {
      printInfo(`用户 ${email} 已是启用状态`);
      return;
    }

    await user.update({ status: 1 });
    printSuccess(`用户已启用: ${email}`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 查看用户详情
 */
export async function viewUser() {
  const { User, UserRole, Role } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 请输入用户邮箱: ');
    const user = await User.findOne({ where: { email } });

    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    // 查询用户角色
    const userRoles = await UserRole.findAll({
      where: { user_id: user.id, delete_version: 0 },
      include: [{ model: Role, as: 'role' }]
    });

    console.log('\n👤 用户详情：');
    printLine();
    console.log(`  ID:       ${user.id}`);
    console.log(`  UID:      ${user.uid}`);
    console.log(`  用户名:   ${user.username}`);
    console.log(`  邮箱:     ${user.email}`);
    console.log(`  状态:     ${user.status === 1 ? '✅ 正常' : '❌ 禁用'}`);
    console.log(`  创建时间: ${new Date(user.created_at).toLocaleString('zh-CN')}`);

    if (userRoles.length > 0) {
      console.log('\n  角色:');
      userRoles.forEach((ur) => {
        console.log(`    - ${ur.role.code} (${ur.role.name}, ${ur.role.app_id})`);
      });
    } else {
      console.log('\n  角色: 无');
    }

    printLine();
  } finally {
    closeRl(rl);
  }
}

/**
 * 删除用户（软删除，同时踢出所有登录）
 */
export async function deleteUser() {
  const { User, SessionToken } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 请输入要删除的用户邮箱: ');
    const user = await User.findOne({ where: { email } });

    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    printWarning(`即将删除用户: ${user.username} (${user.email})`);
    printWarning('此操作不可恢复！');

    const ok = await confirm(rl, '确认删除？');
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    // 吊销数据库中所有 session token
    await SessionToken.update(
      { revoked: true },
      { where: { user_id: user.id, revoked: false } }
    );

    // 清除 Redis 中所有 session
    const redis = await connectRedis();
    if (redis) {
      await clearUserSessions(redis, user.id, user.uid);
      await closeRedis(redis);
    }

    // 软删除用户
    await user.update({ delete_version: user.id });

    printSuccess(`用户已删除: ${email}（所有设备已踢出）`);
  } finally {
    closeRl(rl);
  }
}
