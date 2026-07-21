/**
 * 迁移：创建股票分析系统相关表
 * 包含：stick_stock, stick_position, stick_trade, stick_analysis, stick_journal
 * 幂等设计：表已存在时跳过创建
 *
 * @author <作者>
 * @since 2026-07-20
 */

export async function up({ queryInterface, Sequelize }) {
  // 辅助函数：幂等建表
  async function createTableIfNotExists(tableName, columns, options = {}) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some((t) => Object.values(t)[0] === tableName);
    if (!exists) {
      await queryInterface.createTable(tableName, columns, options);
    }
  }

  async function addIndexIfNotExists(tableName, columns, options = {}) {
    try {
      await queryInterface.addIndex(tableName, columns, options);
    } catch (err) {
      // 索引已存在时忽略
      if (!err.message.includes('Duplicate key name')) throw err;
    }
  }

  // 1. stick_stock - 股票基础信息表
  await createTableIfNotExists('stick_stock', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    uid: { type: Sequelize.STRING(36), allowNull: false, unique: true, comment: 'UUID' },
    code: { type: Sequelize.STRING(10), allowNull: false, comment: '股票代码' },
    name: { type: Sequelize.STRING(50), allowNull: false, comment: '股票名称' },
    market: { type: Sequelize.TINYINT, defaultValue: 1, comment: '市场：1=沪市 2=深市 3=港市 4=美股' },
    industry: { type: Sequelize.STRING(50), comment: '所属行业' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('stick_stock', ['code'], { name: 'idx_stock_code' });
  await addIndexIfNotExists('stick_stock', ['market'], { name: 'idx_stock_market' });

  // 2. stick_position - 持仓记录表
  await createTableIfNotExists('stick_position', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    uid: { type: Sequelize.STRING(36), allowNull: false, unique: true, comment: 'UUID' },
    stock_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联股票' },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联用户' },
    quantity: { type: Sequelize.INTEGER, defaultValue: 0, comment: '持有数量' },
    avg_cost: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0, comment: '平均成本价' },
    total_cost: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0, comment: '总投入金额' },
    status: { type: Sequelize.TINYINT, defaultValue: 1, comment: '1=持有 0=已清仓' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('stick_position', ['stock_id'], { name: 'idx_position_stock' });
  await addIndexIfNotExists('stick_position', ['user_id'], { name: 'idx_position_user' });
  await addIndexIfNotExists('stick_position', ['status'], { name: 'idx_position_status' });

  // 3. stick_trade - 交易记录表
  await createTableIfNotExists('stick_trade', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    uid: { type: Sequelize.STRING(36), allowNull: false, unique: true, comment: 'UUID' },
    stock_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联股票' },
    position_id: { type: Sequelize.BIGINT, comment: '关联持仓' },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联用户' },
    type: { type: Sequelize.TINYINT, allowNull: false, comment: '1=买入 2=卖出' },
    price: { type: Sequelize.DECIMAL(10, 2), allowNull: false, comment: '成交价格' },
    quantity: { type: Sequelize.INTEGER, allowNull: false, comment: '成交数量' },
    amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, comment: '成交金额' },
    fee: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0, comment: '手续费' },
    trade_date: { type: Sequelize.DATEONLY, allowNull: false, comment: '交易日期' },
    note: { type: Sequelize.TEXT, comment: '备注' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('stick_trade', ['stock_id'], { name: 'idx_trade_stock' });
  await addIndexIfNotExists('stick_trade', ['position_id'], { name: 'idx_trade_position' });
  await addIndexIfNotExists('stick_trade', ['user_id'], { name: 'idx_trade_user' });
  await addIndexIfNotExists('stick_trade', ['type'], { name: 'idx_trade_type' });
  await addIndexIfNotExists('stick_trade', ['trade_date'], { name: 'idx_trade_date' });

  // 4. stick_analysis - AI 分析结果表
  await createTableIfNotExists('stick_analysis', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    uid: { type: Sequelize.STRING(36), allowNull: false, unique: true, comment: 'UUID' },
    stock_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联股票' },
    current_price: { type: Sequelize.DECIMAL(10, 2), comment: '分析时价格' },
    ma5: { type: Sequelize.DECIMAL(10, 2), comment: '5日均线' },
    ma10: { type: Sequelize.DECIMAL(10, 2), comment: '10日均线' },
    ma20: { type: Sequelize.DECIMAL(10, 2), comment: '20日均线' },
    macd: { type: Sequelize.DECIMAL(10, 4), comment: 'MACD 值' },
    rsi: { type: Sequelize.DECIMAL(10, 2), comment: 'RSI 值' },
    suggestion: { type: Sequelize.TINYINT, comment: '1=强烈买入 2=买入 3=持有 4=卖出 5=强烈卖出' },
    reason: { type: Sequelize.TEXT, comment: '建议理由' },
    confidence: { type: Sequelize.DECIMAL(3, 2), comment: '置信度 (0-1)' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('stick_analysis', ['stock_id'], { name: 'idx_analysis_stock' });
  await addIndexIfNotExists('stick_analysis', ['suggestion'], { name: 'idx_analysis_suggestion' });
  await addIndexIfNotExists('stick_analysis', ['created_at'], { name: 'idx_analysis_created' });

  // 5. stick_journal - 交易日志表
  await createTableIfNotExists('stick_journal', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    uid: { type: Sequelize.STRING(36), allowNull: false, unique: true, comment: 'UUID' },
    stock_id: { type: Sequelize.BIGINT, comment: '关联股票' },
    user_id: { type: Sequelize.BIGINT, allowNull: false, comment: '关联用户' },
    title: { type: Sequelize.STRING(100), allowNull: false, comment: '日志标题' },
    content: { type: Sequelize.TEXT, comment: '日志内容' },
    mood: { type: Sequelize.TINYINT, defaultValue: 2, comment: '1=乐观 2=中性 3=悲观' },
    lesson: { type: Sequelize.TEXT, comment: '学到的经验' },
    delete_version: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '软删除版本标志' },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    deleted_at: { type: Sequelize.DATE, allowNull: true }
  });

  await addIndexIfNotExists('stick_journal', ['stock_id'], { name: 'idx_journal_stock' });
  await addIndexIfNotExists('stick_journal', ['user_id'], { name: 'idx_journal_user' });
  await addIndexIfNotExists('stick_journal', ['mood'], { name: 'idx_journal_mood' });
  await addIndexIfNotExists('stick_journal', ['created_at'], { name: 'idx_journal_created' });

  console.log('✅ [Migration] 股票分析系统表创建完成');
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('stick_journal');
  await queryInterface.dropTable('stick_analysis');
  await queryInterface.dropTable('stick_trade');
  await queryInterface.dropTable('stick_position');
  await queryInterface.dropTable('stick_stock');
}
