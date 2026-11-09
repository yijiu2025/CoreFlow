/**
 * 岗位数据访问层（sys_post / sys_user_post）
 *
 * 岗位与用户是多对多：删除岗位前必须确认无在岗成员，否则关联表会留下悬空 user_id。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';
import { QueryTypes } from 'sequelize';

class PostDao {
  /**
   * 分页查询岗位（含在岗人数）
   *
   * @param {object} params 查询参数
   * @param {number} [params.pageNum=1] 页码
   * @param {number} [params.pageSize=20] 每页条数
   * @param {string} [params.keyword=''] 名称 / 编码模糊搜索
   * @param {number|null} [params.status=null] 状态过滤
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async page({ pageNum = 1, pageSize = 20, keyword = '', status = null }) {
    const SysPost = getModel('console.SysPost');
    const { Op } = SysPost.sequelize.Sequelize;
    const where = {};
    if (keyword) {
      where[Op.or] = [{ post_name: { [Op.like]: `%${keyword}%` } }, { post_code: { [Op.like]: `%${keyword}%` } }];
    }
    if (status !== null && status !== undefined && status !== '') where.status = Number(status);

    const { rows, count } = await SysPost.findAndCountAll({
      where,
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      offset: (Number(pageNum) - 1) * Number(pageSize),
      limit: Number(pageSize),
      raw: true
    });

    const counts = await SysPost.sequelize.query('SELECT post_id, COUNT(*) AS c FROM sys_user_post GROUP BY post_id', {
      type: QueryTypes.SELECT
    });
    const countMap = new Map(counts.map(r => [Number(r.post_id), Number(r.c)]));

    return { rows: rows.map(r => ({ ...r, user_count: countMap.get(Number(r.id)) || 0 })), total: count };
  }

  /**
   * 全部启用岗位（下拉选项）
   *
   * @returns {Promise<Array<object>>} 岗位列表
   */
  async options() {
    return getModel('console.SysPost').findAll({
      where: { status: 1 },
      attributes: ['id', 'post_code', 'post_name'],
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    });
  }

  /**
   * 按 ID 查岗位
   *
   * @param {number} id 岗位 ID
   * @returns {Promise<object|null>} 岗位实例
   */
  async findById(id) {
    return getModel('console.SysPost').findByPk(id);
  }

  /**
   * 编码是否已被占用
   *
   * @param {string} postCode 岗位编码
   * @param {number} [excludeId=0] 排除的岗位 ID（编辑时传自身）
   * @returns {Promise<boolean>} 是否重复
   */
  async isCodeTaken(postCode, excludeId = 0) {
    const SysPost = getModel('console.SysPost');
    const { Op } = SysPost.sequelize.Sequelize;
    const row = await SysPost.findOne({ where: { post_code: postCode, id: { [Op.ne]: excludeId } } });
    return !!row;
  }

  /**
   * 创建岗位
   *
   * @param {object} payload 岗位字段
   * @returns {Promise<object>} 新建的岗位实例
   */
  async create(payload) {
    return getModel('console.SysPost').create(payload);
  }

  /**
   * 更新岗位
   *
   * @param {number} id 岗位 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async update(id, payload) {
    const [affected] = await getModel('console.SysPost').update(payload, { where: { id } });
    return affected > 0;
  }

  /**
   * 统计在岗成员数量（删除前校验）
   *
   * @param {number} id 岗位 ID
   * @returns {Promise<number>} 成员数量
   */
  async countUsers(id) {
    return getModel('console.SysUserPost').count({ where: { post_id: id } });
  }

  /**
   * 删除岗位（含关联记录）
   *
   * @param {number} id 岗位 ID
   * @returns {Promise<void>}
   */
  async remove(id) {
    const SysUserPost = getModel('console.SysUserPost');
    await SysUserPost.sequelize.transaction(async t => {
      await SysUserPost.destroy({ where: { post_id: id }, transaction: t });
      await getModel('console.SysPost').destroy({ where: { id }, transaction: t });
    });
  }

  /**
   * 某岗位下的用户列表
   *
   * @param {number} id 岗位 ID
   * @returns {Promise<Array<object>>} 用户列表
   */
  async users(id) {
    return getModel('console.SysUserPost').sequelize.query(
      `SELECT u.id, u.uid, u.username, u.email, u.avatar, u.status
         FROM sys_user_post up
         JOIN user_user u ON u.id = up.user_id
        WHERE up.post_id = :id AND u.deleted_at IS NULL
        ORDER BY u.id DESC`,
      { type: QueryTypes.SELECT, replacements: { id } }
    );
  }
}

const postDao = new PostDao();

export default postDao;
