/**
 * 软删除防 NULL 唯一约束穿透钩子工具函数
 *
 * 用于自动为开启了 delete_version 机制的 paranoid 模型挂载生命周期钩子，
 * 解决 MySQL 唯一索引与 NULL 值的冲突漏洞。
 */
export function registerDeleteVersionHooks(Model) {
  // 针对单条记录销毁，将 delete_version 设为该记录 ID
  Model.addHook('beforeDestroy', (instance) => {
    instance.delete_version = instance.id;
  });

  // 针对单条记录恢复，将 delete_version 恢复为 0 (代表活跃状态)
  Model.addHook('beforeRestore', (instance) => {
    instance.delete_version = 0;
  });

  // 防御批量操作：强制开启 individualHooks 选项，以确保触发单条记录的 beforeDestroy/beforeRestore 钩子
  Model.addHook('beforeBulkDestroy', (options) => {
    options.individualHooks = true;
  });

  Model.addHook('beforeBulkRestore', (options) => {
    options.individualHooks = true;
  });
}
