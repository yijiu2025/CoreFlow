/**
 * RetroWeb 任务数据访问层
 *
 * 🔴 `getModel('retroweb.Task')` 带命名空间：模型在 `src/models/retroweb/` 下，
 *    不带前缀按名字找会拿到别的业务的同名模型（或 undefined）。
 *
 * 🔴 列表查询**只取元数据列**（`attributes` 排除 snapshot）：列表页要显示"做到哪了"，
 *    靠的是冗余的 node_count/step_count/depth/scheme_count，不需要把几 MB 的树拉出来。
 *    只有 `findById` 才带 snapshot。
 *
 * @since 2026-10-09
 */
import { getModel } from '../../../framework/db/index.js';
import { packSnapshot, unpackSnapshot, byteSizeOf } from '../utils/snapshot.js';

/** 列表用的轻量列（不含 snapshot） */
const META_ATTRS = [
  'id',
  'user_id',
  'name',
  'target',
  'model',
  'status',
  'node_count',
  'step_count',
  'depth',
  'scheme_count',
  'sig',
  'size_bytes',
  'created_at',
  'updated_at'
];

class TaskDao {
  getModel() {
    return getModel('retroweb.Task');
  }

  /**
   * 用户的任务列表（轻量）
   * @param {number} userId
   * @param {{status?: string, keyword?: string, limit?: number, offset?: number, sort?: string}} [options]
   * @returns {Promise<{rows: object[], count: number}>}
   */
  async findByUser(userId, options = {}) {
    const model = this.getModel();
    const where = { user_id: userId };

    if (options.status) where.status = options.status;

    // 关键词：名称 / SMILES。列表里做前缀式 LIKE 就够，别引入全文索引的复杂度。
    if (options.keyword) {
      const { Op } = await import('sequelize');
      const kw = `%${options.keyword}%`;
      where[Op.or] = [{ name: { [Op.like]: kw } }, { target: { [Op.like]: kw } }];
    }

    const order =
      options.sort === 'name'
        ? [
            ['name', 'ASC'],
            ['updated_at', 'DESC']
          ]
        : [['updated_at', 'DESC']];

    return await model.findAndCountAll({
      where,
      attributes: META_ATTRS,
      order,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0
    });
  }

  /** 任务数（含软删 —— 配额判定要用，见 quota.service.js） */
  async countByUser(userId) {
    return await this.getModel().count({ where: { user_id: userId }, paranoid: false });
  }

  /** 单条：元数据 + 解压后的快照 */
  async findById(id, userId) {
    const row = await this.getModel().findOne({ where: { id, user_id: userId } });
    if (!row) return null;
    const plain = row.get({ plain: true });
    return { ...plain, snapshot: unpackSnapshot(plain.snapshot) };
  }

  async create(data) {
    return await this.getModel().create(data);
  }

  /**
   * 写快照（同时刷新冗余统计列）
   * @param {number} id
   * @param {number} userId
   * @param {object} snapshot 整棵树对象
   * @param {{sig?: string, stats?: {node_count: number, step_count: number, depth: number, scheme_count: number}}} [meta]
   */
  async updateSnapshot(id, userId, snapshot, meta = {}) {
    const patch = {
      snapshot: packSnapshot(snapshot),
      size_bytes: byteSizeOf(snapshot)
    };
    if (meta.sig !== undefined) patch.sig = meta.sig;
    if (meta.stats) Object.assign(patch, meta.stats);

    const [affected] = await this.getModel().update(patch, { where: { id, user_id: userId } });
    return affected > 0;
  }

  /**
   * 乐观锁更新：sig 不匹配则不更新（返回 false，由路由转成 409）
   * @param {number} id
   * @param {number} userId
   * @param {object} patch 要改的字段
   * @param {string} expectedSig 客户端持有的签名
   */
  async updateIfMatch(id, userId, patch, expectedSig) {
    const where = { id, user_id: userId };
    if (expectedSig) where.sig = expectedSig;
    const [affected] = await this.getModel().update(patch, { where });
    return affected > 0;
  }

  async softDelete(id, userId) {
    const affected = await this.getModel().destroy({ where: { id, user_id: userId } });
    return affected > 0;
  }
}

const taskDao = new TaskDao();

export default taskDao;
