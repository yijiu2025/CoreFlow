/**
 * 业务参数数据访问层（sys_config）
 *
 * 🔴 只承载**业务参数**。运行期配置（`data/*.json`）不在本层：
 * 那套配置由 `framework/config/runtime.js` 按「显式写的优先、不合法才回落默认」维护，
 * 搬进数据库会绕过优先级规则，且没有事务保证。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';

class ConfigDao {
  /**
   * 参数分页
   *
   * @param {object} params 查询参数
   * @param {number} [params.pageNum=1] 页码
   * @param {number} [params.pageSize=50] 每页条数
   * @param {string} [params.keyword=''] 键 / 备注模糊搜索
   * @param {string} [params.type=''] 类型过滤（Y / N）
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async page({ pageNum = 1, pageSize = 50, keyword = '', type = '' }) {
    const SysConfig = getModel('console.SysConfig');
    const { Op } = SysConfig.sequelize.Sequelize;
    const where = {};
    if (keyword) {
      where[Op.or] = [{ config_key: { [Op.like]: `%${keyword}%` } }, { remark: { [Op.like]: `%${keyword}%` } }];
    }
    if (type) where.type = type;

    const { rows, count } = await SysConfig.findAndCountAll({
      where,
      order: [['config_key', 'ASC']],
      offset: (Number(pageNum) - 1) * Number(pageSize),
      limit: Number(pageSize),
      raw: true
    });
    return { rows, total: count };
  }

  /**
   * 按 ID 查参数
   *
   * @param {number} id 参数 ID
   * @returns {Promise<object|null>} 参数实例
   */
  async findById(id) {
    return getModel('console.SysConfig').findByPk(id);
  }

  /**
   * 参数键是否已被占用
   *
   * @param {string} configKey 参数键
   * @param {number} [excludeId=0] 排除的 ID
   * @returns {Promise<boolean>} 是否重复
   */
  async isKeyTaken(configKey, excludeId = 0) {
    const SysConfig = getModel('console.SysConfig');
    const { Op } = SysConfig.sequelize.Sequelize;
    const row = await SysConfig.findOne({ where: { config_key: configKey, id: { [Op.ne]: excludeId } } });
    return !!row;
  }

  /**
   * 创建参数
   *
   * @param {object} payload 参数字段
   * @returns {Promise<object>} 新建的参数实例
   */
  async create(payload) {
    return getModel('console.SysConfig').create(payload);
  }

  /**
   * 更新参数
   *
   * @param {number} id 参数 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async update(id, payload) {
    const [affected] = await getModel('console.SysConfig').update(payload, { where: { id } });
    return affected > 0;
  }

  /**
   * 删除参数（内置项由调用方拦截）
   *
   * @param {number} id 参数 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async remove(id) {
    const affected = await getModel('console.SysConfig').destroy({ where: { id } });
    return affected > 0;
  }
}

const configDao = new ConfigDao();

export default configDao;
