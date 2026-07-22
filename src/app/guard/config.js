/**
 * 守卫配置应用 (Guard Config)
 * 管理三级守卫系统的持久化配置：System → Group → API
 * 配置存储于数据库，启动时加载到内存，运行时热更新通过乐观锁保证原子性
 *
 * @author yijiu2025
 * @since 2026-07-22
 */
export default {
  app_id: 'guard',
  name: '守卫配置',
  description: '三级守卫系统配置的注册与持久化'
};
