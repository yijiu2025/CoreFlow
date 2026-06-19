/**
 * 用户中心 CLI 插件入口
 *
 * 使用方式：
 *   npm run cli -- usercenter stats    # 用户统计
 *   npm run cli -- usercenter recent   # 最近注册
 */
import { getModels } from '../../../../scripts/lib/db.js';
import { printTable, printInfo, printLine } from '../../../../scripts/lib/table.js';

/**
 * 用户统计
 */
async function userStats() {
  const { User, UserIdentity } = getModels();

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
 * 最近注册用户
 */
async function recentUsers() {
  const { User } = getModels();

  const users = await User.findAll({
    order: [['created_at', 'DESC']],
    limit: 10
  });

  if (users.length === 0) {
    printInfo('暂无用户');
    return;
  }

  console.log('\n📋 最近注册用户：');
  printTable(
    ['ID', '用户名', '邮箱', '状态', '注册时间'],
    users.map((u) => [
      u.id,
      u.username,
      u.email,
      u.status === 1 ? '✅' : '❌',
      new Date(u.created_at).toLocaleString('zh-CN')
    ])
  );
}

// 导出 CLI 插件配置
export default {
  command: 'usercenter',
  appName: 'user',
  description: '用户中心',
  subcommands: {
    'stats':  { description: '用户统计',   handler: userStats },
    'recent': { description: '最近注册',   handler: recentUsers }
  }
};
