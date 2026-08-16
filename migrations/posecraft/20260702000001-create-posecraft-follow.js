export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('posecraft_follow', {
    id: {
      type: Sequelize.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    follower_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '关注者用户ID'
    },
    following_id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      comment: '被关注者用户ID'
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

  await queryInterface.addIndex('posecraft_follow', ['follower_id', 'following_id', 'delete_version'], {
    unique: true,
    name: 'uk_posecraft_follow'
  });

  await queryInterface.addIndex('posecraft_follow', ['following_id', 'delete_version'], {
    name: 'idx_posecraft_follow_following'
  });
}

export async function down({ queryInterface, Sequelize }) {
  await queryInterface.dropTable('posecraft_follow');
}
