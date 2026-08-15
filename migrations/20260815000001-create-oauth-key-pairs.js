/**
 * 迁移：创建密钥对表
 * 存储 RSA 密钥对（私钥加密存储），支持按名称查询和轮转。
 * 幂等设计：表已存在时跳过
 */

export async function up({ queryInterface, Sequelize }) {
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some(t => Object.values(t)[0] === tableName);
    if (!exists) await queryInterface.createTable(tableName, columns);
  }

  await createTableIfNotExists('oauth_key_pairs', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: Sequelize.STRING(64), allowNull: false, comment: '密钥对名称，如 oauth21-key-1' },
    algorithm: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'RS256', comment: '签名算法' },
    private_key: { type: Sequelize.TEXT, allowNull: false, comment: '私钥 PEM（PKCS#8 格式）' },
    public_key: { type: Sequelize.TEXT, allowNull: false, comment: '公钥 PEM（SPKI 格式）' },
    jwk: { type: Sequelize.TEXT, allowNull: true, comment: 'JWK 格式公钥（JSON 字符串）' },
    active: { type: Sequelize.BOOLEAN, defaultValue: true, comment: '是否启用' },
    remark: { type: Sequelize.STRING(255), allowNull: true, comment: '备注' },
    created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
  });

  // 添加唯一索引
  try {
    await queryInterface.addIndex('oauth_key_pairs', ['name'], { unique: true });
  } catch (err) {
    if (!err.message.includes('Duplicate key name')) throw err;
  }
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('oauth_key_pairs');
}