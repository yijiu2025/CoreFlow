/**
 * 软删除防 NULL 唯一约束穿透钩子工具函数
 *
 * 用于自动为开启了 delete_version 机制的 paranoid 模型挂载生命周期钩子，
 * 解决 MySQL 唯一索引与 NULL 值的冲突漏洞。
 *
 * 调用链：模型定义时调用 → 注册 Sequelize 生命周期钩子 → 每次 delete/restore 时触发
 *
 * @author yijiu2025
 * @since 2026-07-22
 */
export function registerDeleteVersionHooks(Model) {
  // 1. 硬删除保护：禁止 force: true 绕过软删除
  Model.addHook('beforeDestroy', (instance, options) => {
    if (options.force) {
      throw new Error(`[软删除] 禁止硬删除，请使用软删除。模型: ${Model.name}, id: ${instance.id}`);
    }
    instance.delete_version = instance.id;
  });

  // 2. 恢复时检查：禁止重复恢复
  Model.addHook('beforeRestore', async instance => {
    if (instance.delete_version === 0) {
      throw new Error(`[软删除] 记录未删除，禁止重复恢复。模型: ${Model.name}, id: ${instance.id}`);
    }
    instance.delete_version = 0;
  });

  // 3. 防止误改 delete_version：禁止手动修改软删除标记
  Model.addHook('beforeUpdate', instance => {
    if (
      instance.changed('delete_version') &&
      instance.delete_version !== 0 &&
      instance.delete_version !== instance.id
    ) {
      throw new Error(`[软删除] 禁止手动修改 delete_version。模型: ${Model.name}, id: ${instance.id}`);
    }
  });

  // 4. 批量删除保护：禁止无 where 条件的 destroy
  Model.addHook('beforeBulkDestroy', options => {
    if (!options.where || Object.keys(options.where).length === 0) {
      throw new Error(`[软删除] 禁止无 where 条件的批量 destroy。模型: ${Model.name}`);
    }
    options.individualHooks = true;
  });

  Model.addHook('beforeBulkRestore', options => {
    if (!options.where || Object.keys(options.where).length === 0) {
      throw new Error(`[软删除] 禁止无 where 条件的批量 restore。模型: ${Model.name}`);
    }
    options.individualHooks = true;
  });
}
