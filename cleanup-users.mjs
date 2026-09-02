/**
 * 临时脚本：清理测试账户（保留 241849626@qq.com）
 * 全部软删除：User + 关联表（UserRole/UserIdentity/UserSession/InlinePolicy/OauthApproval/OauthConsent 等）
 * 软删除后 delete_version=id，邮箱可重新注册（联合唯一索引不冲突）
 * 运行后删除自身
 */
import { createApp } from './src/app.js';
import { Op } from 'sequelize';
import { sequelize } from './src/framework/db/index.js';

const KEEP_EMAIL = '241849626@qq.com';

async function main() {
  const app = await createApp();
  await app.ready();
  const { getModel } = app.db;

  const User = getModel('User');
  const UserRole = getModel('UserRole');
  const UserIdentity = getModel('UserIdentity');
  const InlinePolicy = getModel('InlinePolicy');
  const OauthApproval = getModel('OauthApproval');
  const OauthConsent = getModel('OauthConsent');
  const OauthCode = getModel('OauthCode');
  const OauthToken = getModel('OauthToken');
  const UserSession = getModel('UserSession');
  const SessionToken = getModel('SessionToken');
  const SessionLog = getModel('SessionLog');

  // 1. 查出要删的用户（排除保留邮箱）
  const victims = await User.findAll({
    where: { email: { [Op.ne]: KEEP_EMAIL } },
    paranoid: false,
    attributes: ['id', 'uid', 'username', 'email']
  });

  if (victims.length === 0) {
    console.log('没有需要清理的测试用户');
    await app.close();
    process.exit(0);
  }

  const uids = victims.map(u => u.uid);
  const numericIds = victims.map(u => u.id);
  console.log(`\n将清理 ${victims.length} 个用户:`, victims.map(u => `${u.username}(${u.email})`).join(', '));

  const t = await sequelize.transaction();
  try {
    // 2. 关联表软删除/硬删除（无 delete_version 的表硬删，有软删除钩子的表软删）
    // OauthApproval/OauthConsent（无软删除，直接 destroy）
    if (OauthApproval) {
      const n = await OauthApproval.destroy({ where: { sub: { [Op.in]: uids } }, transaction: t });
      console.log(`  OauthApproval 删除 ${n} 条`);
    }
    if (OauthConsent) {
      const n = await OauthConsent.destroy({ where: { sub: { [Op.in]: uids } }, transaction: t });
      console.log(`  OauthConsent 删除 ${n} 条`);
    }
    if (OauthCode) {
      const n = await OauthCode.destroy({ where: { sub: { [Op.in]: uids } }, transaction: t });
      console.log(`  OauthCode 删除 ${n} 条`);
    }
    if (OauthToken) {
      const n = await OauthToken.destroy({ where: { sub: { [Op.in]: uids } }, transaction: t });
      console.log(`  OauthToken 删除 ${n} 条`);
    }
    // Session 系列（无 delete_version，硬删）
    if (SessionToken) {
      const n = await SessionToken.destroy({ where: { user_id: { [Op.in]: numericIds } }, transaction: t });
      console.log(`  SessionToken 删除 ${n} 条`);
    }
    if (SessionLog) {
      const n = await SessionLog.destroy({ where: { user_id: { [Op.in]: numericIds } }, transaction: t });
      console.log(`  SessionLog 删除 ${n} 条`);
    }
    if (UserSession) {
      const n = await UserSession.destroy({ where: { user_id: { [Op.in]: numericIds } }, transaction: t });
      console.log(`  UserSession 删除 ${n} 条`);
    }
    // IAM 表（注册了软删除钩子，禁止 force，走软删除）
    if (UserRole) {
      const n = await UserRole.destroy({ where: { user_id: { [Op.in]: numericIds } }, transaction: t });
      console.log(`  UserRole 软删除 ${n} 条`);
    }
    if (InlinePolicy) {
      const n = await InlinePolicy.destroy({ where: { user_id: { [Op.in]: numericIds } }, transaction: t });
      console.log(`  InlinePolicy 软删除 ${n} 条`);
    }
    if (UserIdentity) {
      const n = await UserIdentity.destroy({ where: { user_id: { [Op.in]: numericIds } }, transaction: t });
      console.log(`  UserIdentity 软删除 ${n} 条`);
    }

    // 3. User 主表软删除（注册了软删除钩子，禁止 force）
    const n = await User.destroy({ where: { id: { [Op.in]: numericIds } }, transaction: t });
    console.log(`  User 主表软删除 ${n} 条`);

    await t.commit();
    console.log('\n✅ 清理完成');
  } catch (err) {
    await t.rollback();
    console.error('\n❌ 清理失败:', err.message);
    console.error(err.stack);
    await app.close();
    process.exit(1);
  }

  // 4. 验证剩余活跃用户
  const remain = await User.findAll({
    attributes: ['id', 'username', 'email', 'status', 'delete_version'],
    paranoid: false
  });
  console.log(`\n=== 剩余 ${remain.length} 条用户记录 ===`);
  for (const u of remain) {
    const active = u.delete_version === 0 ? '✅活跃' : '🗑️已删';
    console.log(`  [${u.id}] ${active} ${u.username} <${u.email}> status=${u.status}`);
  }

  await app.close();
  process.exit(0);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
