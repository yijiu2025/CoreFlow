/**
 * 角色菜单授权模型（sys_role_menu）
 *
 * 复合主键 `(role_id, menu_id)`；只表达「该角色在侧栏能看见哪些菜单」。
 * 接口级放行仍由 PBAC policy 判定（见 SysMenu 文件头说明）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysRoleMenu = (sequelize, DataTypes) => {
  const SysRoleMenu = sequelize.define(
    'SysRoleMenu',
    {
      role_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '角色 ID' },
      menu_id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, comment: '菜单 ID' }
    },
    {
      tableName: 'sys_role_menu',
      timestamps: true,
      comment: '角色与菜单授权关联表'
    }
  );

  return SysRoleMenu;
};

export default defineSysRoleMenu;
