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
   * 默认角色：**刻意不自动授予**
   *
   * `admin` 是管理后台的权限命名空间（登录应用是 `console`，见
   * `console/config.js` 的 `permission_app_id`）。它是封闭域：角色只能由管理员
   * 在后台手工分配，注册/授权不会带来任何管理能力。
   *
   * 写 `null` 而不是 `admin_viewer`：观察者持有全站读权限，一旦"授权即送"，
   * 任何注册用户点一下同意就能看到用户、部门、角色与日志。
   */
  default_role: null
};

export default adminConfig;
