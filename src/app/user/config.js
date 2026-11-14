/**
 * 用户应用配置
 *
 * 供 loader 扫描时读取，定义应用的基础元数据。
 * app_id 用于 PBAC 权限系统中的应用隔离和资源归属标识。
 *
 * 默认角色：**刻意不在这里声明** ——
 * 本应用的角色都挂在全局命名空间 `GLOBAL`（见 `permission/roles.js`），
 * 而在 `user` 命名空间下写 `default_role` 会指向一个不存在的角色，
 * 启动期审计报 error、授权时还会静默回落到最低职级。
 * GLOBAL 的默认角色由 `user_normal` 上的 `is_default: true` 确定。
 *
 * 也不要把这里的 app_id 改成 `GLOBAL`：登录会话里的 appId 仍是 `user`，
 * 权限命名空间映射只该在真有历史包袱时使用（如 console → admin）。
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
const userConfig = {
  app_id: 'user',
  name: '用户中心',
  description: '用户注册、登录、信息管理'
};

export default userConfig;
