/**
 * 守卫配置应用 (Guard Config)
 * 管理三级守卫系统的持久化配置：System → Group → API
 * 配置存储于数据库，启动时加载到内存，运行时热更新通过乐观锁保证原子性
 *
 * @author yijiu2025
 * @since 2026-07-22
 */
const guardConfig = {
  app_id: 'guard',
  name: '守卫配置',
  /**
   * 平台内置：不是可以授权给外部业务的应用
   *
   * 它的 `app_id` 是权限命名空间（`guard:*`），接口是安全运维入口 —— 出现在
   * 「应用管理」里会让人以为"这是个能给用户授权的业务系统"。标记后列表按
   * 「业务应用 / 平台内置」分组，内置项不许改准入与默认角色（它们是基础设施）。
   */
  builtin: true,
  description: '三级守卫系统配置的注册与持久化'
};

export default guardConfig;
