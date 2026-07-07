export async function up({ queryInterface, Sequelize }) {
  // 1. 点赞表
  await queryInterface.createTable('posecraft_user_like', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '用户ID'
    },
    work_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '作品ID'
    },
    template_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '模板ID'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    deleted_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    delete_version: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0
    }
  });

  await queryInterface.addIndex('posecraft_user_like', ['user_id', 'work_id', 'delete_version'], {
    unique: true,
    name: 'uk_user_like_work'
  });

  await queryInterface.addIndex('posecraft_user_like', ['user_id', 'template_id', 'delete_version'], {
    unique: true,
    name: 'uk_user_like_template'
  });

  // 2. 收藏表
  await queryInterface.createTable('posecraft_user_collect', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '用户ID'
    },
    work_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '作品ID'
    },
    template_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '模板ID'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    deleted_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    delete_version: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0
    }
  });

  await queryInterface.addIndex('posecraft_user_collect', ['user_id', 'work_id', 'delete_version'], {
    unique: true,
    name: 'uk_user_collect_work'
  });

  await queryInterface.addIndex('posecraft_user_collect', ['user_id', 'template_id', 'delete_version'], {
    unique: true,
    name: 'uk_user_collect_template'
  });

  // 3. 历史记录表
  await queryInterface.createTable('posecraft_user_history', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '用户ID'
    },
    work_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '作品ID'
    },
    template_id: {
      type: Sequelize.BIGINT,
      allowNull: true,
      comment: '模板ID'
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false
    },
    deleted_at: {
      type: Sequelize.DATE,
      allowNull: true
    },
    delete_version: {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 0
    }
  });

  await queryInterface.addIndex('posecraft_user_history', ['user_id', 'created_at'], {
    name: 'idx_user_history_user_created'
  });
}

export async function down({ queryInterface, Sequelize }) {
  await queryInterface.dropTable('posecraft_user_history');
  await queryInterface.dropTable('posecraft_user_collect');
  await queryInterface.dropTable('posecraft_user_like');
}
