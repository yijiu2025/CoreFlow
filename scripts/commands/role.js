/**
 * 角色管理命令模块
 */
import { getModels } from '../lib/db.js';
import { connectRedis, closeRedis, clearUserSessions } from '../lib/redis.js';
import { createRl, ask, confirm, closeRl, select } from '../lib/input.js';
import { printTable, printSuccess, printInfo, printWarning, printError, printLine } from '../lib/table.js';

/**
 * 列出所有角色
 */
export async function listRoles() {
  const { Role } = getModels();
  const roles = await Role.findAll({
    attributes: ['id', 'code', 'app_id', 'name', 'rank_level', 'created_at'],
    order: [['rank_level', 'DESC']]
  });

  if (roles.length === 0) {
    printInfo('暂无角色');
    return;
  }

  console.log('\n🎭 角色列表：');
  printTable(
    ['ID', '编码', '应用', '名称', '权重', '创建时间'],
    roles.map((r) => [
      r.id,
      r.code,
      r.app_id,
      r.name,
      r.rank_level,
      new Date(r.created_at).toLocaleString('zh-CN')
    ])
  );
  console.log(`\n共 ${roles.length} 个角色`);
}

/**
 * 查看角色详情
 */
export async function viewRole() {
  const { Role, UserRole, User } = getModels();
  const rl = createRl();

  try {
    const roles = await Role.findAll({ order: [['rank_level', 'DESC']] });
    if (roles.length === 0) {
      printInfo('系统中没有角色');
      return;
    }

    const roleId = await select(
      rl,
      '请选择角色:',
      roles.map((r) => ({
        label: `${r.code} - ${r.name} (${r.app_id}, 权重:${r.rank_level})`,
        value: r.id
      }))
    );

    if (!roleId) return;

    const role = await Role.findByPk(roleId);
    const userRoles = await UserRole.findAll({
      where: { role_id: roleId, delete_version: 0 },
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'email'] }]
    });

    console.log('\n🎭 角色详情：');
    printLine();
    console.log(`  ID:     ${role.id}`);
    console.log(`  编码:   ${role.code}`);
    console.log(`  应用:   ${role.app_id}`);
    console.log(`  名称:   ${role.name}`);
    console.log(`  权重:   ${role.rank_level}`);
    console.log(`  描述:   ${role.description || '无'}`);

    if (userRoles.length > 0) {
      console.log(`\n  拥有此角色的用户 (${userRoles.length}):`);
      userRoles.forEach((ur) => {
        console.log(`    - ${ur.user.username} (${ur.user.email})`);
      });
    } else {
      console.log('\n  拥有此角色的用户: 无');
    }

    printLine();
  } finally {
    closeRl(rl);
  }
}

/**
 * 分配角色给用户
 */
export async function assignRole() {
  const { User, Role, UserRole } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 用户邮箱: ');
    const user = await User.findOne({ where: { email } });
    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    const roles = await Role.findAll({ order: [['rank_level', 'DESC']] });
    if (roles.length === 0) {
      printError('系统中没有角色');
      return;
    }

    const roleId = await select(
      rl,
      '请选择要分配的角色:',
      roles.map((r) => ({
        label: `${r.code} - ${r.name} (${r.app_id}, 权重:${r.rank_level})`,
        value: r.id
      }))
    );

    if (!roleId) return;

    const role = await Role.findByPk(roleId);

    // 检查是否已有
    const existing = await UserRole.findOne({
      where: { user_id: user.id, role_id: roleId, delete_version: 0 }
    });

    if (existing) {
      printInfo(`用户 ${email} 已拥有角色 ${role.code}`);
      return;
    }

    await UserRole.create({
      user_id: user.id,
      app_id: role.app_id,
      role_id: roleId
    });

    // 清除 session 让用户重新获取权限
    const redis = await connectRedis();
    if (redis) {
      const cleared = await clearUserSessions(redis, user.id, user.uid);
      await closeRedis(redis);
      if (cleared > 0) {
        printInfo(`已清除 ${cleared} 个 Session，用户需重新登录`);
      }
    }

    printSuccess(`已将角色 ${role.code} 分配给 ${email}`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 撤销用户角色
 */
export async function revokeRole() {
  const { User, Role, UserRole } = getModels();
  const rl = createRl();

  try {
    const email = await ask(rl, '📧 用户邮箱: ');
    const user = await User.findOne({ where: { email } });
    if (!user) {
      printError(`未找到用户: ${email}`);
      return;
    }

    // 查询用户的角色
    const userRoles = await UserRole.findAll({
      where: { user_id: user.id, delete_version: 0 },
      include: [{ model: Role, as: 'role' }]
    });

    if (userRoles.length === 0) {
      printInfo(`用户 ${email} 没有任何角色`);
      return;
    }

    const userRoleId = await select(
      rl,
      `用户 ${email} 的角色:`,
      userRoles.map((ur) => ({
        label: `${ur.role.code} - ${ur.role.name} (${ur.role.app_id})`,
        value: ur.id
      }))
    );

    if (!userRoleId) return;

    const userRole = userRoles.find((ur) => ur.id === userRoleId);

    const ok = await confirm(rl, `确认撤销角色 ${userRole.role.code}？`);
    if (!ok) {
      printWarning('操作已取消');
      return;
    }

    await userRole.update({ delete_version: userRole.id });

    // 清除 session
    const redis = await connectRedis();
    if (redis) {
      const cleared = await clearUserSessions(redis, user.id, user.uid);
      await closeRedis(redis);
      if (cleared > 0) {
        printInfo(`已清除 ${cleared} 个 Session`);
      }
    }

    printSuccess(`已撤销用户 ${email} 的角色 ${userRole.role.code}`);
  } finally {
    closeRl(rl);
  }
}

/**
 * 查看角色分配统计
 */
export async function roleStats() {
  const { Role, UserRole } = getModels();
  const roles = await Role.findAll({ order: [['rank_level', 'DESC']] });

  if (roles.length === 0) {
    printInfo('暂无角色');
    return;
  }

  const stats = [];
  for (const role of roles) {
    const count = await UserRole.count({
      where: { role_id: role.id, delete_version: 0 }
    });
    stats.push([role.id, role.code, role.app_id, role.name, role.rank_level, count]);
  }

  console.log('\n📊 角色统计：');
  printTable(
    ['ID', '编码', '应用', '名称', '权重', '用户数'],
    stats
  );
}
