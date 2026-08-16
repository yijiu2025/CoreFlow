export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('user_user', 'gender', {
    type: Sequelize.TINYINT,
    allowNull: true,
    defaultValue: 0,
    comment: '性别 (1:男, 2:女, 0:保密)'
  });
  await queryInterface.addColumn('user_user', 'age', {
    type: Sequelize.TINYINT,
    allowNull: true,
    comment: '年龄'
  });
  await queryInterface.addColumn('user_user', 'city', {
    type: Sequelize.STRING(100),
    allowNull: true,
    comment: '城市/地区'
  });
  await queryInterface.addColumn('user_user', 'bio', {
    type: Sequelize.TEXT,
    allowNull: true,
    comment: '个人简介'
  });
  await queryInterface.addColumn('user_user', 'personal_id', {
    type: Sequelize.STRING(50),
    allowNull: true,
    comment: '个人ID'
  });
}

export async function down({ queryInterface, Sequelize }) {
  await queryInterface.removeColumn('user_user', 'gender');
  await queryInterface.removeColumn('user_user', 'age');
  await queryInterface.removeColumn('user_user', 'city');
  await queryInterface.removeColumn('user_user', 'bio');
  await queryInterface.removeColumn('user_user', 'personal_id');
}
