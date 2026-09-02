/**
 * 临时脚本：列出所有用户（含软删除），用于清理测试账户
 * 运行后删除自身
 */
import { createApp } from './src/app.js';

async function main() {
  const app = await createApp();
  await app.ready();
  const { getModel, sequelize } = app.db;
  const User = getModel('User');

  const users = await User.findAll({
    attributes: ['id', 'uid', 'username', 'email', 'status', 'delete_version', 'createdAt'],
    order: [['createdAt', 'ASC']],
    paranoid: false // 含软删除
  });

  console.log(`\n=== 共 ${users.length} 个用户 ===`);
  for (const u of users) {
    const active = u.delete_version === 0 ? '✅活跃' : '🗑️已删';
    const keep = u.email === '241849626@qq.com' ? ' ← 保留' : '';
    console.log(
      `[${u.id}] ${active} uid=${u.uid} username=${u.username} email=${u.email || '(无)'} status=${u.status} created=${u.createdAt?.toISOString?.() || u.createdAt}${keep}`
    );
  }

  await app.close();
  process.exit(0);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
