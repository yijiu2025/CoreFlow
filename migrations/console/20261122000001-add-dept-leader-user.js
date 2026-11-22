/**
 * 迁移：部门负责人与用户**一对一绑定**
 *
 * 背景：`sys_dept.leader` 一直是 `varchar(50)`，存的是人写进去的字符串（历史数据里既有真名
 * 也有登录名）。后果是：
 *   · 同一个人改了用户名，部门上的负责人还停在旧文字；
 *   · 无法反查"张三负责哪几个部门"（只能 `LIKE '%张三%'`，重名就全中）；
 *   · 停用/离职的人仍显示为负责人，没有任何警示依据。
 *
 * 新增 `leader_user_id` 存**用户主键**，`leader` 继续保留为**显示快照**（保存时按所选用户
 * 的 username 回写）。这样：
 *   · 绑定关系是硬的（可索引、可反查）；
 *   · 旧的纯文本值仍能显示，不需要一次性清洗；
 *   · 后台读列表时不用 JOIN（快照就在同一行）。
 *
 * 幂等：列已存在时跳过。
 */
export async function up({ queryInterface }) {
  const [cols] = await queryInterface.sequelize.query('SHOW COLUMNS FROM sys_dept LIKE ?', {
    replacements: ['leader_user_id']
  });
  if (cols.length > 0) return;

  await queryInterface.sequelize.query(`
    ALTER TABLE sys_dept
      ADD COLUMN leader_user_id BIGINT UNSIGNED NULL COMMENT '负责人用户主键（NULL = 未绑定，仅有人名）',
      ADD INDEX idx_dept_leader_user (leader_user_id)
  `);
}

export async function down({ queryInterface }) {
  const [cols] = await queryInterface.sequelize.query('SHOW COLUMNS FROM sys_dept LIKE ?', {
    replacements: ['leader_user_id']
  });
  if (cols.length === 0) return;
  await queryInterface.sequelize.query('ALTER TABLE sys_dept DROP COLUMN leader_user_id');
}
