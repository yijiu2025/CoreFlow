/**
 * 菜单 / 按钮模型（sys_menu）
 *
 * 菜单树是本仓「看得见什么」的唯一来源：`type=dir` 目录、`type=menu` 页面、
 * `type=btn` 按钮。按钮必须带 `permission` 权限码，否则前后端都无从判定。
 *
 * 🔴 本表**不承载接口放行**：接口鉴权走 PBAC policy（`requirePermission`）。
 *    把菜单授权当成接口权限，会让「侧栏可见」与「接口可调」两套语义互相污染。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
const defineSysMenu = (sequelize, DataTypes) => {
  const SysMenu = sequelize.define(
    'SysMenu',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      parent_id: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '上级菜单，0 为根' },
      name: { type: DataTypes.STRING(50), allowNull: false, comment: '菜单名称' },
      type: {
        type: DataTypes.ENUM('dir', 'menu', 'btn'),
        allowNull: false,
        defaultValue: 'menu',
        comment: '目录 / 页面 / 按钮'
      },
      icon: { type: DataTypes.STRING(64), allowNull: true, comment: '图标名（lucide）' },
      path: { type: DataTypes.STRING(200), allowNull: true, comment: '前端路由' },
      component: { type: DataTypes.STRING(200), allowNull: true, comment: '视图键' },
      permission: { type: DataTypes.STRING(100), allowNull: true, comment: '权限码' },
      sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
      visible: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '侧栏是否可见' },
      status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' }
    },
    {
      tableName: 'sys_menu',
      timestamps: true,
      comment: '菜单与按钮权限表'
    }
  );

  return SysMenu;
};

export default defineSysMenu;
