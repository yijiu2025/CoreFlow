/**
 * 管理后台 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- admin stats     # 管理统计
 *   npm run cli -- admin users     # 用户统计
 *   npm run cli -- admin roles     # 角色统计
 */
import { getModels } from '../../../../scripts/lib/db.js';
import { printTable, printInfo, printLine } from '../../../../scripts/lib/table.js';

/**
 * 管理统计
 */
async function adminStats() {
  const { User, Role, UserRole } = getModels();

  const [userCount, roleCount, assignmentCount] = await Promise.all([
    User.count(),
    Role.count(),
    UserRole.count({ where: { delete_version: 0 } })
  ]);

  console.log('\n📊 管理后台统计：');
  printLine();
  console.log(`  用户总数:     ${userCount}`);
  console.log(`  角色总数:     ${roleCount}`);
  console.log(`  角色分配数:   ${assignmentCount}`);
  printLine();
}

/**
 * 用户统计
 */
async function userStats() {
  const { User } = getModels();

  const [total, active, disabled] = await Promise.all([
    User.count(),
    User.count({ where: { status: 1 } }),
    User.count({ where: { status: 0 } })
  ]);

  console.log('\n👥 用户统计：');
  printLine();
  console.log(`  总数:   ${total}`);
  console.log(`  正常:   ${active}`);
  console.log(`  禁用:   ${disabled}`);
  printLine();
}

/**
 * 角色统计
 */
async function roleStats() {
  const { Role, UserRole } = getModels();

  const roles = await Role.findAll({
    order: [['rank_level', 'DESC']]
  });

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

  console.log('\n🎭 角色统计：');
  printTable(
    ['ID', '编码', '应用', '名称', '权重', '用户数'],
    stats
  );
}

// 导出 CLI 插件配置
export default {
  command: 'iam',
  appName: 'admin',
  description: 'IAM 权限管理',
  subcommands: {
    'stats':  { description: '管理统计', handler: adminStats },
    'users':  { description: '用户统计', handler: userStats },
    'roles':  { description: '角色统计', handler: roleStats }
  }
};
