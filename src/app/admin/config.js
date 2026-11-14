/**
 * 管理应用配置
 * 供 loader 扫描时读取
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
const adminConfig = {
  app_id: 'admin',
  name: '管理后台',
  description: 'IAM 权限管理、角色分配、用户管理',

  /**
   * 授权即送的默认角色（主口径）
   *
   * 管理后台的"普通档"是只读观察者：授权后能进来看，改东西要管理员另授。
   * 不要让默认角色落到 `admin_admin`(rank 80) —— 那样每个授权者都是管理员。
   */
  default_role: 'admin_viewer'
};

export default adminConfig;
