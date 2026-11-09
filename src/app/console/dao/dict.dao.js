/**
 * 字典数据访问层（sys_dict_type / sys_dict_data）
 *
 * 约束：
 * - `dict_type` 是业务代码引用的稳定标识，创建后不可修改；
 * - 同一类型下只允许一个默认项，设新默认时自动清掉旧默认（同一事务内）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { getModel } from '../../../framework/persistence/db/index.js';

class DictDao {
  /**
   * 字典类型分页（含项数）
   *
   * @param {object} params 查询参数
   * @param {number} [params.pageNum=1] 页码
   * @param {number} [params.pageSize=20] 每页条数
   * @param {string} [params.keyword=''] 名称 / 标识模糊搜索
   * @returns {Promise<{rows: Array<object>, total: number}>} 分页结果
   */
  async pageTypes({ pageNum = 1, pageSize = 20, keyword = '' }) {
    const SysDictType = getModel('console.SysDictType');
    const { Op } = SysDictType.sequelize.Sequelize;
    const where = keyword
      ? { [Op.or]: [{ dict_name: { [Op.like]: `%${keyword}%` } }, { dict_type: { [Op.like]: `%${keyword}%` } }] }
      : {};

    const { rows, count } = await SysDictType.findAndCountAll({
      where,
      order: [['id', 'ASC']],
      offset: (Number(pageNum) - 1) * Number(pageSize),
      limit: Number(pageSize),
      raw: true
    });

    const counts = await getModel('console.SysDictData').findAll({
      attributes: [
        'dict_type',
        [
          getModel('console.SysDictData').sequelize.fn('COUNT', getModel('console.SysDictData').sequelize.col('id')),
          'c'
        ]
      ],
      group: ['dict_type'],
      raw: true
    });
    const countMap = new Map(counts.map(r => [r.dict_type, Number(r.c)]));

    return { rows: rows.map(r => ({ ...r, item_count: countMap.get(r.dict_type) || 0 })), total: count };
  }

  /**
   * 某类型下的全部字典项（含停用项，管理端使用）
   *
   * @param {string} dictType 字典标识
   * @returns {Promise<Array<object>>} 字典项列表
   */
  async listData(dictType) {
    return getModel('console.SysDictData').findAll({
      where: { dict_type: dictType },
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    });
  }

  /**
   * 某类型下的启用项（业务下拉使用）
   *
   * @param {string} dictType 字典标识
   * @returns {Promise<Array<object>>} 字典项列表
   */
  async options(dictType) {
    return getModel('console.SysDictData').findAll({
      where: { dict_type: dictType, status: 1 },
      attributes: ['label', 'value', 'tone', 'is_default', 'sort'],
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC']
      ],
      raw: true
    });
  }

  /**
   * 类型是否存在
   *
   * @param {string} dictType 字典标识
   * @param {number} [excludeId=0] 排除的类型 ID
   * @returns {Promise<boolean>} 是否重复
   */
  async isTypeTaken(dictType, excludeId = 0) {
    const SysDictType = getModel('console.SysDictType');
    const { Op } = SysDictType.sequelize.Sequelize;
    const row = await SysDictType.findOne({ where: { dict_type: dictType, id: { [Op.ne]: excludeId } } });
    return !!row;
  }

  /**
   * 创建字典类型
   *
   * @param {object} payload 类型字段
   * @returns {Promise<object>} 新建的类型实例
   */
  async createType(payload) {
    return getModel('console.SysDictType').create(payload);
  }

  /**
   * 更新字典类型（dict_type 不可改，由调用方剔除）
   *
   * @param {number} id 类型 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async updateType(id, payload) {
    const [affected] = await getModel('console.SysDictType').update(payload, { where: { id } });
    return affected > 0;
  }

  /**
   * 删除字典类型（连同其字典项）
   *
   * @param {number} id 类型 ID
   * @returns {Promise<void>}
   */
  async removeType(id) {
    const SysDictType = getModel('console.SysDictType');
    const type = await SysDictType.findByPk(id);
    if (!type) return;
    await SysDictType.sequelize.transaction(async t => {
      await getModel('console.SysDictData').destroy({ where: { dict_type: type.dict_type }, transaction: t });
      await SysDictType.destroy({ where: { id }, transaction: t });
    });
  }

  /**
   * 创建字典项（默认项唯一性在事务内保证）
   *
   * @param {object} payload 字典项字段
   * @returns {Promise<object>} 新建的字典项实例
   */
  async createData(payload) {
    const SysDictData = getModel('console.SysDictData');
    return SysDictData.sequelize.transaction(async t => {
      if (payload.is_default) {
        await SysDictData.update({ is_default: 0 }, { where: { dict_type: payload.dict_type }, transaction: t });
      }
      return SysDictData.create(payload, { transaction: t });
    });
  }

  /**
   * 更新字典项
   *
   * @param {number} id 字典项 ID
   * @param {object} payload 待更新字段
   * @returns {Promise<boolean>} 是否命中记录
   */
  async updateData(id, payload) {
    const SysDictData = getModel('console.SysDictData');
    return SysDictData.sequelize.transaction(async t => {
      const item = await SysDictData.findByPk(id, { transaction: t });
      if (!item) return false;
      if (payload.is_default) {
        await SysDictData.update({ is_default: 0 }, { where: { dict_type: item.dict_type }, transaction: t });
      }
      await SysDictData.update(payload, { where: { id }, transaction: t });
      return true;
    });
  }

  /**
   * 删除字典项
   *
   * @param {number} id 字典项 ID
   * @returns {Promise<boolean>} 是否命中记录
   */
  async removeData(id) {
    const affected = await getModel('console.SysDictData').destroy({ where: { id } });
    return affected > 0;
  }

  /**
   * 字典标识是否已存在（创建字典项前校验）
   *
   * @param {string} dictType 字典标识
   * @returns {Promise<boolean>} 是否存在
   */
  async typeExists(dictType) {
    const row = await getModel('console.SysDictType').findOne({ where: { dict_type: dictType } });
    return !!row;
  }
}

const dictDao = new DictDao();

export default dictDao;
