/**
 * RetroWeb 算法任务表（异步 job）
 *
 * 为什么必须有这张表：Python 侧（retrochimera）把 job 存在**进程内 dict**
 * （`web/jobhub.py: _jobs`，上限 200 条，**重启即失**）。所以：
 *   · 前端不能只认 Python 的 job_id —— 服务一重启就永远查不到，只能无限转圈；
 *   · Node 侧必须自己记一份，并且能表达"上游已经不认这个 job 了" ⇒ `stale` 状态。
 *
 * 生命周期：
 *   queued → running → done / failed
 *                   ↘ stale（Python 返回 404 / 不可达 / 重启过）
 *
 * 🔴 `stale` 不是失败：结果可能算出来过但丢了。前端拿到它要提示
 *    "服务重启导致结果丢失，请重跑"，而不是显示报错或继续轮询。
 *
 * @since 2026-10-09
 */

/**
 * @param {object} sequelize - Sequelize 实例
 * @param {object} DataTypes - Sequelize 数据类型
 * @returns {object} Job 模型
 */
const defineJob = (sequelize, DataTypes) => {
  const Job = sequelize.define(
    'Job',
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
        comment: '提交者'
      },
      task_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '所属任务（可为 null：解析 / 绘制这类不挂任务的调用）'
      },
      kind: {
        type: DataTypes.STRING(32),
        allowNull: false,
        comment: 'predict 单步预测 / search 多步搜索 / analyze 工艺分析 / conditions 条件枚举 / followup 追问'
      },
      provider_job_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'Python 侧的 job id（用于回查上游；同步调用为空）'
      },
      status: {
        type: DataTypes.ENUM('queued', 'running', 'done', 'failed', 'stale'),
        allowNull: false,
        defaultValue: 'queued',
        comment: 'stale = 上游已不认这个 job（Python 重启/过期），需重跑而非继续等'
      },
      params_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '提交参数（脱敏后；不含密钥）'
      },
      progress_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '进度快照（层/节点/已用预算等，前端轮询展示）'
      },
      result_json: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '最终结果（done 时落库；流式结果在**结束后**才写，避免半截数据）'
      },
      error_text: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '失败原因（人话，直接展示）'
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      finished_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '终态时间（done/failed/stale）'
      }
    },
    {
      tableName: 'retroweb_job',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['user_id', 'status'], name: 'idx_job_user_status' },
        { fields: ['task_id'], name: 'idx_job_task' },
        { fields: ['provider_job_id'], name: 'idx_job_provider' }
      ],
      comment: 'RetroWeb 算法任务（Node 侧权威记录，含 stale 态）'
    }
  );

  Job.associate = models => {
    Job.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Job;
};

export default defineJob;
