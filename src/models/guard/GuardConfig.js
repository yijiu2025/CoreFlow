/**
 * 守卫配置表 (Guard Config)
 * 每行一个系统，存储三级守卫系统的持久化配置（System → Group → API）
 * 启动时加载到内存合并为一个对象，运行时热更新按系统独立写入
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
      system_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: '系统标识（如 firewall, user）'
      },
      config: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
        comment: '该系统完整配置树 (JSON 字符串，DAO 层手动解析)'
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
      indexes: [{ fields: ['system_key'], unique: true }, { fields: ['version'] }]
    }
  );

  return GuardConfig;
};