/**
 * 基线迁移：记录当前所有表结构
 * 说明：此迁移为基线文件，标记已有表结构的起始点。
 *       后续表结构变更请创建新的迁移文件，不再使用 sequelize.sync({ alter: true })。
 *       如需在新环境重建数据库，可先运行 sequelize.sync() 建表，再执行此迁移标记完成。
 */

export async function up({ queryInterface }) {
  // 基线迁移：仅记录当前版本，不执行任何操作
  // 所有表结构已通过 sequelize.sync() 在开发环境建立
  // 后续变更请创建新的迁移文件，例如：
  //   npx umzug migration:create --name add-xxx-column
  console.log(
    '✅ [Migration] 基线迁移已记录，后续表结构变更请使用迁移文件管理'
  );
}

export async function down({ queryInterface }) {
  // 基线迁移不可回滚
  console.log('⚠️ [Migration] 基线迁移不可回滚');
}
