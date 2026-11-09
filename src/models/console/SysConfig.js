/**
 * 业务参数模型（sys_config）
 *
 * 🔴 只放**业务参数**。运行期配置（`data/*.json`）不在此表：
 * 那套配置有「用户显式写的优先，值不合法才回落默认」的优先级规则，
 * 由 `framework/config/runtime.js` 负责，搬进数据库会变成第二个真相。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysConfig = (sequelize, DataTypes) => {
  const SysConfig = sequelize.define(
    'SysConfig',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      config_key: { type: DataTypes.STRING(100), allowNull: false, comment: '参数键' },
      config_value: { type: DataTypes.TEXT, allowNull: true, comment: '参数值' },
      type: { type: DataTypes.CHAR(1), allowNull: false, defaultValue: 'N', comment: 'Y 内置 / N 业务' },
      builtin: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '是否内置（内置不可删）' },
      remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' }
    },
    {
      tableName: 'sys_config',
      timestamps: true,
      comment: '业务参数表'
    }
  );

  return SysConfig;
};

export default defineSysConfig;
