import Permission from '../../../models/iam/Permission.js';

class PermissionDao {
  /**
   * 同步应用权限列表 (增量更新)
   * @param {string} appId 应用ID
   * @param {Array} permissionList 权限定义列表
   */
  async syncAppPermissions(appId, permissionList) {
    console.log(
      `[PBAC] 正在同步应用 [${appId}] 的权限, 共 ${permissionList.length} 项`
    );

    for (const item of permissionList) {
      const { module, action, name } = item;

      // 使用 findOrCreate 实现幂等同步
      const [perm, created] = await Permission.findOrCreate({
        where: { appId, module, action },
        defaults: { name }
      });

      if (!created && perm.name !== name) {
        perm.name = name;
        await perm.save();
      }
    }

    return { success: true, count: permissionList.length };
  }

  /**
   * 获取某应用下所有可分配的权限 (用于后台展示)
   */
  async getAvailablePermissions(appId) {
    return await Permission.findAll({
      where: { appId }
    });
  }
}

export default new PermissionDao();
