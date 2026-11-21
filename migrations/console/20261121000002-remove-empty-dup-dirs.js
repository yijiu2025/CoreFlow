/**
 * 迁移：清理「空壳重复根目录」
 *
 * 线上库实测有两个顶级「系统管理」：id=2（path=NULL、挂了 5 个子菜单）与
 * id=19（path=''、icon=Circle、零子节点，2026-11-11 由菜单编辑器误存出来）。
 * 侧栏会照单全收 —— 于是导航里出现两个同名目录，点第二个是空的。
 *
 * 判据（四条同时成立才删，宁可漏删不可误删）：
 *   ① 顶级目录（parent_id = 0 / type = 'dir'）
 *   ② path 为空（NULL 或空串）—— 空目录不可能有自己的页面
 *   ③ 零子节点
 *   ④ 同名顶级目录里存在**有子节点**的那个（说明它是纯冗余，不是唯一入口）
 *
 * 幂等：条件不成立即什么都不做；`down()` 不重建（这是清理，不是结构变更）。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function up({ queryInterface }) {
  const [exists] = await queryInterface.sequelize.query('SHOW TABLES LIKE "sys_menu"');
  if (exists.length === 0) return;

  /* 找出「空壳且仍有同名兄弟有子节点」的顶级目录 */
  const [dups] = await queryInterface.sequelize.query(`
    SELECT m.id, m.name
      FROM sys_menu m
     WHERE m.parent_id = 0
       AND m.type = 'dir'
       AND (m.path IS NULL OR m.path = '')
       AND NOT EXISTS (SELECT 1 FROM sys_menu c WHERE c.parent_id = m.id)
       AND EXISTS (
             SELECT 1 FROM sys_menu sib
              WHERE sib.parent_id = 0
                AND sib.name = m.name
                AND sib.id <> m.id
                AND EXISTS (SELECT 1 FROM sys_menu c2 WHERE c2.parent_id = sib.id)
           )
  `);

  for (const row of dups) {
    /* 先清可能残留的授权关系（空目录通常没有，但外键顺序不能反） */
    await queryInterface.sequelize.query('DELETE FROM sys_role_menu WHERE menu_id = :id', {
      replacements: { id: Number(row.id) }
    });
    await queryInterface.sequelize.query('DELETE FROM sys_menu WHERE id = :id', {
      replacements: { id: Number(row.id) }
    });
  }
}

/**
 * 回滚：不做任何事
 *
 * 清理类迁移不留"反向重建"——被删的是空目录（无子节点、无页面），
 * 重建只会把脏数据放回去。
 *
 * @returns {Promise<void>}
 */
export async function down() {
  /* 有意为空 */
}
