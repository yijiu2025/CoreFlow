/**
 * RetroWeb 任务表
 *
 * 一个任务 = 一个目标分子 + 它的整棵逆合成路线树。
 * 与浏览器时代的 `retroweb_sessions` 一一对应（原存 localStorage，上限 10 条）。
 *
 * 🔴 路由树**整棵序列化**存 `snapshot`（gzip 后写），不拆成 node / reaction 分表：
 *    与前端快照结构 1:1，迁移成本最低（见 docs/plan-node-backend.md §6.2）。
 *    代价是不能按"某个反应用在哪几步"做跨任务检索 —— 真需要时再加派生表。
 *
 * 🔴 `node_count / step_count / depth / scheme_count` 是**冗余列**：任务列表页要
 *    显示"做到哪了"并支持排序，若每次都解析 snapshot JSON，列表接口会被几 MB 的
 *    树拖垮。写快照时由 service 层同步维护，读取时不再解析。
 *
 * 🔴 `sig` 是内容签名（前端 `sessionSignature` 同一个值），两个用途：
 *    ① 判断"是否真的动了内容"（没动就不刷新 updated_at，避免列表跳位）；
 *    ② 乐观锁：PATCH 带 sig，服务端不一致则 409。
 *
 * 🔴 `paranoid: true`（软删）+ 软删任务**仍占配额**，否则"删了再建"能绕过上限。
 *
 * @since 2026-10-09
 */

/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {object} Task 模型
 */
const defineTask = (sequelize, DataTypes) => {
  const Task = sequelize.define(
    'Task',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '自增主键'
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '所属用户（IAM User.id）'
      },
      client_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '前端本地任务的 id（import 幂等键，保证同一份本地数据导两次不重复）'
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: '',
        comment: '任务名（默认取目标分子的简短标识）'
      },
      target: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
        comment: '目标分子 SMILES'
      },
      model: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '使用的逆合成模型 key'
      },
      status: {
        type: DataTypes.ENUM('running', 'incomplete', 'done'),
        allowNull: false,
        defaultValue: 'incomplete',
        comment: '与前端 SessionStatus 同枚举：running 进行中 / incomplete 未完成 / done 已完成'
      },
      node_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '冗余：路线树节点数（列表页排序/展示用，不解析 snapshot）'
      },
      step_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '冗余：已选定反应的步数'
      },
      depth: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '冗余：树的最大层级（根为 0）'
      },
      scheme_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '冗余：已保存的路线方案数'
      },
      sig: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: '内容签名：判重 + 乐观锁（前端 sessionSignature）'
      },
      snapshot: {
        type: DataTypes.BLOB('medium'),
        allowNull: true,
        comment: '整棵路线树 JSON，gzip 后存储（见 utils 层压缩约定）'
      },
      size_bytes: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: 'snapshot 原始字节数（配额统计；压缩后不再反映实际占用）'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '内容最后变化时间（签名未变则不刷新）'
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '软删时间（paranoid）；软删任务仍占配额'
      }
    },
    {
      tableName: 'retroweb_task',
      timestamps: true,
      underscored: true,
      paranoid: true,
      indexes: [
        { fields: ['user_id', 'updated_at'], name: 'idx_task_user_updated' },
        { fields: ['user_id', 'status'], name: 'idx_task_user_status' },
        { fields: ['user_id', 'target'], name: 'idx_task_user_target' },
        { fields: ['user_id', 'client_id'], name: 'idx_task_user_client' }
      ],
      comment: 'RetroWeb 任务（一个目标分子 + 整棵路线树）'
    }
  );

  Task.associate = models => {
    Task.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Task;
};

export default defineTask;
