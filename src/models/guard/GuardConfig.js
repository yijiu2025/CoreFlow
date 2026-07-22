/**
 * 守卫配置表 (Guard Config)
 * 存储三级守卫系统的持久化配置（System → Group → API）
 * 启动时加载到内存，运行时热更新通过版本号实现乐观锁
 *
 * @author yijiu2025
 * @since 2026-07-22
 */

export default (sequelize, DataTypes) => {
  const GuardConfig = sequelize.define(
    'GuardConfig',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
      },
      configs: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: '完整守卫配置树 (System → Group → API)'
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '乐观锁版本号，每次写入递增'
      }
    },
    {
      tableName: 'guard_configs',
      timestamps: true,
      indexes: [{ fields: ['version'] }]
    }
  );

  return GuardConfig;
};
