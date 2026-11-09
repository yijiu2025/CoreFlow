/**
 * 迁移：创建 Console 管理后台系统表
 *
 * 包含 8 张表：
 *   sys_menu / sys_role_menu / sys_dept / sys_post / sys_user_post
 *   sys_dict_type / sys_dict_data / sys_config
 *
 * 另对既有表 user_user 增列 dept_id（可空新增列，对存量数据零影响，不加外键）。
 *
 * 幂等设计：表 / 索引 / 列已存在时跳过，可重复执行。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @param {object} ctx.Sequelize Sequelize 构造器
 * @returns {Promise<void>}
 */
export async function up({ queryInterface, Sequelize }) {
  /**
   * 表不存在时才创建
   *
   * @param {string} tableName 表名
   * @param {object} columns 列定义
   * @returns {Promise<void>}
   */
  async function createTableIfNotExists(tableName, columns) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    const exists = tables.some(t => Object.values(t)[0] === tableName);
    if (!exists) {
      await queryInterface.createTable(tableName, columns, {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      });
    }
  }

  /**
   * 索引不存在时才创建
   *
   * @param {string} tableName 表名
   * @param {string[]} fields 索引字段
   * @param {object} [options] 索引选项
   * @returns {Promise<void>}
   */
  async function addIndexIfNotExists(tableName, fields, options = {}) {
    try {
      await queryInterface.addIndex(tableName, fields, options);
    } catch (err) {
      if (!String(err?.message || '').includes('Duplicate key name')) throw err;
    }
  }

  /**
   * 列不存在时才添加（用于既有表增列）
   *
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @param {object} definition 列定义
   * @returns {Promise<void>}
   */
  async function addColumnIfNotExists(tableName, columnName, definition) {
    const desc = await queryInterface.describeTable(tableName);
    if (!desc[columnName]) {
      await queryInterface.addColumn(tableName, columnName, definition);
    }
  }

  /** 审计时间列（与既有表保持一致的物理默认值，避免应用层写入 NULL） */
  const auditColumns = {
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      comment: '创建时间'
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      comment: '更新时间'
    }
  };

  // 1. sys_menu —— 菜单 / 按钮
  await createTableIfNotExists('sys_menu', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    parent_id: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '上级菜单，0 为根' },
    name: { type: Sequelize.STRING(50), allowNull: false, comment: '菜单名称' },
    type: {
      type: Sequelize.ENUM('dir', 'menu', 'btn'),
      allowNull: false,
      defaultValue: 'menu',
      comment: '目录/页面/按钮'
    },
    icon: { type: Sequelize.STRING(64), allowNull: true, comment: '图标名（lucide）' },
    path: { type: Sequelize.STRING(200), allowNull: true, comment: '前端路由' },
    component: { type: Sequelize.STRING(200), allowNull: true, comment: '视图键' },
    permission: { type: Sequelize.STRING(100), allowNull: true, comment: '权限码' },
    sort: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
    visible: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1, comment: '侧栏是否可见' },
    status: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_menu', ['parent_id'], { name: 'idx_menu_parent' });
  await addIndexIfNotExists('sys_menu', ['type', 'status'], { name: 'idx_menu_type_status' });
  await addIndexIfNotExists('sys_menu', ['permission'], { name: 'idx_menu_permission' });

  // 2. sys_role_menu —— 角色菜单授权（只决定可见性）
  await createTableIfNotExists('sys_role_menu', {
    role_id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, comment: '角色 ID' },
    menu_id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, comment: '菜单 ID' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_role_menu', ['menu_id'], { name: 'idx_role_menu_menu' });

  // 3. sys_dept —— 部门
  await createTableIfNotExists('sys_dept', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    parent_id: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0, comment: '上级部门，0 为根' },
    ancestors: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '0', comment: '上级链，如 0,1,3' },
    name: { type: Sequelize.STRING(50), allowNull: false, comment: '部门名称' },
    leader: { type: Sequelize.STRING(50), allowNull: true, comment: '负责人' },
    phone: { type: Sequelize.STRING(20), allowNull: true, comment: '联系电话' },
    email: { type: Sequelize.STRING(100), allowNull: true, comment: '邮箱' },
    sort: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
    status: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_dept', ['parent_id'], { name: 'idx_dept_parent' });
  await addIndexIfNotExists('sys_dept', ['ancestors'], { name: 'idx_dept_ancestors' });

  // 4. sys_post —— 岗位
  await createTableIfNotExists('sys_post', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    post_code: { type: Sequelize.STRING(50), allowNull: false, comment: '岗位编码' },
    post_name: { type: Sequelize.STRING(50), allowNull: false, comment: '岗位名称' },
    sort: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
    status: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
    remark: { type: Sequelize.STRING(255), allowNull: true, comment: '备注' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_post', ['post_code'], { unique: true, name: 'uk_post_code' });

  // 5. sys_user_post —— 用户岗位
  await createTableIfNotExists('sys_user_post', {
    user_id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, comment: '用户内部 ID' },
    post_id: { type: Sequelize.BIGINT, primaryKey: true, allowNull: false, comment: '岗位 ID' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_user_post', ['post_id'], { name: 'idx_user_post_post' });

  // 6. sys_dict_type —— 字典类型
  await createTableIfNotExists('sys_dict_type', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    dict_name: { type: Sequelize.STRING(100), allowNull: false, comment: '字典名称' },
    dict_type: { type: Sequelize.STRING(100), allowNull: false, comment: '字典标识' },
    status: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
    remark: { type: Sequelize.STRING(255), allowNull: true, comment: '备注' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_dict_type', ['dict_type'], { unique: true, name: 'uk_dict_type' });

  // 7. sys_dict_data —— 字典项
  await createTableIfNotExists('sys_dict_data', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    dict_type: { type: Sequelize.STRING(100), allowNull: false, comment: '所属字典标识' },
    label: { type: Sequelize.STRING(100), allowNull: false, comment: '显示文本' },
    value: { type: Sequelize.STRING(100), allowNull: false, comment: '存储值' },
    sort: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, comment: '排序' },
    status: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 1, comment: '1 启用 / 0 停用' },
    tone: { type: Sequelize.STRING(20), allowNull: true, comment: '前端标签色调 cat-1~cat-5' },
    is_default: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0, comment: '是否默认项' },
    remark: { type: Sequelize.STRING(255), allowNull: true, comment: '备注' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_dict_data', ['dict_type', 'value'], { unique: true, name: 'uk_dict_data_type_value' });
  await addIndexIfNotExists('sys_dict_data', ['dict_type', 'sort'], { name: 'idx_dict_data_type_sort' });

  // 8. sys_config —— 业务参数（运行期配置仍归 data/*.json）
  await createTableIfNotExists('sys_config', {
    id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
    config_key: { type: Sequelize.STRING(100), allowNull: false, comment: '参数键' },
    config_value: { type: Sequelize.TEXT, allowNull: true, comment: '参数值' },
    type: { type: Sequelize.CHAR(1), allowNull: false, defaultValue: 'N', comment: 'Y 内置 / N 业务' },
    builtin: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0, comment: '是否内置' },
    remark: { type: Sequelize.STRING(255), allowNull: true, comment: '备注' },
    ...auditColumns
  });
  await addIndexIfNotExists('sys_config', ['config_key'], { unique: true, name: 'uk_config_key' });

  // 9. 既有表增列：user_user.dept_id
  await addColumnIfNotExists('user_user', 'dept_id', {
    type: Sequelize.BIGINT,
    allowNull: true,
    comment: '所属部门 ID（sys_dept.id）'
  });
  await addIndexIfNotExists('user_user', ['dept_id'], { name: 'idx_user_dept' });
}

/**
 * 回滚：删除本次新增的表与列
 *
 * 只删本次迁移创建的对象；user_user.dept_id 一并移除（该列仅由本模块使用）。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  /**
   * 表存在时才删除
   *
   * @param {string} tableName 表名
   * @returns {Promise<void>}
   */
  async function dropTableIfExists(tableName) {
    const [tables] = await queryInterface.sequelize.query('SHOW TABLES');
    if (tables.some(t => Object.values(t)[0] === tableName)) {
      await queryInterface.dropTable(tableName);
    }
  }

  await dropTableIfExists('sys_config');
  await dropTableIfExists('sys_dict_data');
  await dropTableIfExists('sys_dict_type');
  await dropTableIfExists('sys_user_post');
  await dropTableIfExists('sys_post');
  await dropTableIfExists('sys_dept');
  await dropTableIfExists('sys_role_menu');
  await dropTableIfExists('sys_menu');

  const desc = await queryInterface.describeTable('user_user');
  if (desc.dept_id) {
    await queryInterface.removeIndex('user_user', 'idx_user_dept').catch(() => {});
    await queryInterface.removeColumn('user_user', 'dept_id');
  }
}
