import { sequelize } from '../../db/index.js';
import Logger from '../../log/index.js';
import { roleRegistry } from '../../utils/PbacRegistry.js';

/**
 * 集中执行由 defineRoles() 收集到的所有 PBAC 基础角色
 */
export default async (app) => {
  const { Role } = sequelize.models;
  if (!Role) return;

  if (roleRegistry.length === 0) {
    Logger.info('ℹ️ [PBAC] 暂无通过 defineRoles 注册的基础角色');
    return;
  }

  try {
    let successCount = 0;
    for (const roleDef of roleRegistry) {
      const [role, created] = await Role.findOrCreate({
        where: { code: roleDef.code, app_id: roleDef.app_id },
        defaults: roleDef
      });

      // 如果需要每次重启强制覆盖权限，请解除下方注释
      // if (!created) {
      //   role.policy = roleDef.policy;
      //   await role.save();
      // }
      successCount++;
    }
    Logger.info(`✅ [PBAC] 集中注册器已将内存中的 ${successCount} 个角色同步至数据库`);
  } catch (error) {
    Logger.error('❌ [PBAC] 集中同步数据库失败:', error);
  }
};
