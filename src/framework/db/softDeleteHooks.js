/**
 * 软删除防 NULL 唯一约束穿透钩子工具函数
 *
 * 用于自动为开启了 delete_version 机制的 paranoid 模型挂载生命周期钩子，
 * 解决 MySQL 唯一索引与 NULL 值的冲突漏洞。
 *
 * 调用链：模型定义时调用 → 注册 Sequelize 生命周期钩子 → 每次 delete/restore 时触发
 *
 * @param {object} Model - Sequelize 模型
 * @param {object} [options] - 配置选项
 * @param {string} [options.field='delete_version'] - 软删除标记字段名
 * @param {boolean} [options.checkConflict=false] - 恢复时是否检查唯一约束冲突
 * @author yijiu2025
 * @since 2026-07-22
 */
export function registerDeleteVersionHooks(Model, options = {}) {
  const { field = 'delete_version', checkConflict = false } = options;

  // 1. 硬删除保护：禁止 force: true 绕过软删除
  Model.addHook('beforeDestroy', (instance, opts) => {
    if (opts.force) {
      throw new Error(`[软删除] 禁止硬删除，请使用软删除。模型: ${Model.name}, id: ${instance.id}`);
    }
    instance[field] = instance.id;
  });

  // 2. 恢复时检查：禁止重复恢复 + 可选唯一约束冲突预检
  Model.addHook('beforeRestore', async instance => {
    if (instance[field] === 0) {
      throw new Error(`[软删除] 记录未删除，禁止重复恢复。模型: ${Model.name}, id: ${instance.id}`);
    }

    // 可选：唯一约束冲突预检
    if (checkConflict) {
      const conflict = await _findConflict(Model, instance, field);
      if (conflict) {
        throw new Error(
          `[软删除] 恢复失败：唯一字段已被其他记录占用。模型: ${Model.name}, id: ${instance.id}, 冲突: ${JSON.stringify(conflict)}`
        );
      }
    }

    instance[field] = 0;
  });

  // 3. 防止误改 delete_version：禁止手动修改软删除标记
  Model.addHook('beforeUpdate', instance => {
    if (instance.changed(field) && instance[field] !== 0 && instance[field] !== instance.id) {
      throw new Error(`[软删除] 禁止手动修改 ${field}。模型: ${Model.name}, id: ${instance.id}`);
    }
  });

  // 4. 批量删除保护：禁止无 where 条件的 destroy
  Model.addHook('beforeBulkDestroy', opts => {
    if (!opts.where || Object.keys(opts.where).length === 0) {
      throw new Error(`[软删除] 禁止无 where 条件的批量 destroy。模型: ${Model.name}`);
    }
    opts.individualHooks = true;
  });

  Model.addHook('beforeBulkRestore', opts => {
    if (!opts.where || Object.keys(opts.where).length === 0) {
      throw new Error(`[软删除] 禁止无 where 条件的批量 restore。模型: ${Model.name}`);
    }
    opts.individualHooks = true;
  });
}

/**
 * 查询唯一约束冲突：检查是否有活跃记录（field=0）与待恢复记录的唯一索引字段值相同
 * 从模型定义的 indexes 中提取唯一索引，自动排除主键和 field 字段
 * @param {object} Model - Sequelize 模型
 * @param {object} instance - 待恢复的实例
 * @param {string} field - 软删除标记字段名
 * @returns {Promise<object|null>} 冲突记录，无冲突返回 null
 */
async function _findConflict(Model, instance, field) {
  const indexes = Model.options.indexes || [];
  const tableName = Model.tableName;

  for (const idx of indexes) {
    if (!idx.unique) continue;
    const fields = Array.isArray(idx.fields) ? idx.fields : [idx.fields];
    // 排除只包含主键和软删除字段的唯一索引
    const nonKeyFields = fields.filter(f => f !== 'id' && f !== field);
    if (nonKeyFields.length === 0) continue;

    // 构建查询条件：待恢复记录的这些字段值 + 活跃状态
    const where = {};
    let hasValue = false;
    for (const f of nonKeyFields) {
      const val = instance[f];
      if (val !== undefined && val !== null) {
        where[f] = val;
        hasValue = true;
      }
    }
    if (!hasValue) continue;
    where[field] = 0; // 只查活跃记录

    // 排除自身
    if (instance.id) {
      where.id = { [Model.sequelize.Op.ne]: instance.id };
    }

    const found = await Model.findOne({ where, paranoid: false });
    if (found) {
      return { table: tableName, fields: nonKeyFields, existingId: found.id };
    }
  }
  return null;
}
