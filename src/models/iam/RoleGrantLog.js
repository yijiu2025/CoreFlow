/**
 * 角色授权流水（iam_role_grant_log）
 *
 * 记「谁在什么时候把哪个角色授予/取消给哪个用户」。单独建表而不是塞进
 * `audit_logs.details`，原因有三：
 *   1. 这是**按用户查**的高频读（用户详情里的授权历史），JSON 里查要 JSON_EXTRACT，
 *      用不上索引；
 *   2. 授权/取消是**成对**的语义（grant / revoke），需要能按 action 过滤成两张清单；
 *   3. 快照字段（username / role_name / role_code / operator_name）要能在用户被删、
 *      角色被改名之后仍然读得懂 —— 历史记录不能靠 JOIN 现查。
 *
 * 🔴 只追加，不修改不删除：这是一条审计流水，任何「修正」都应再记一条 revoke，
 *    否则历史会自相矛盾。因此没有 paranoid、没有 updated_at。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
const defineRoleGrantLog = (sequelize, DataTypes) => {
  const RoleGrantLog = sequelize.define(
    'RoleGrantLog',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.BIGINT, allowNull: false, comment: '被授权的用户 ID' },
      username: { type: DataTypes.STRING(64), allowNull: false, comment: '被授权用户账号快照' },
      role_id: { type: DataTypes.BIGINT, allowNull: false, comment: '角色 ID' },
      role_code: { type: DataTypes.STRING(64), allowNull: false, comment: '角色编码快照' },
      role_name: { type: DataTypes.STRING(64), allowNull: false, comment: '角色名称快照（改名/删除后历史仍可读）' },
      action: { type: DataTypes.STRING(16), allowNull: false, comment: 'grant 授予 / revoke 取消' },
      operator_id: { type: DataTypes.BIGINT, allowNull: true, comment: '操作人用户 ID（系统自动时为空）' },
      operator_name: { type: DataTypes.STRING(64), allowNull: false, comment: '操作人账号快照' },
      app_id: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'GLOBAL', comment: '角色所属应用' },
      remark: { type: DataTypes.STRING(255), allowNull: true, comment: '来源说明（单条编辑 / 批量授权 / 新建指定）' }
    },
    {
      tableName: 'iam_role_grant_log',
      timestamps: true,
      updatedAt: false,
      indexes: [
        { name: 'idx_grant_log_user', fields: ['user_id', 'id'] },
        { name: 'idx_grant_log_created', fields: ['created_at'] }
      ],
      comment: '角色授权流水（只追加）'
    }
  );

  return RoleGrantLog;
};

export default defineRoleGrantLog;
