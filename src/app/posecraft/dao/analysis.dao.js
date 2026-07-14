/**
 * PoseCraft 分析数据访问层
 * 负责 AI 分析记录（姿态/人脸/手部/分割）的创建、查询与统计
 *
 * @author Claude
 * @since 2026-07-13
 */
import sequelize from '../../../db/index.js';

class AnalysisDao {
  /**
   * 获取 Analysis 模型
   * @returns {Model}
   */
  getModel() {
    return sequelize.models.Analysis;
  }

  /**
   * 创建分析记录
   * @param {object} data - 分析数据（user_id, image_url, analysis_type, result_data, processing_time, status）
   * @returns {Promise<Analysis>}
   */
  async create(data) {
    const model = this.getModel();
    return await model.create(data);
  }

  /**
   * 查询用户的分析记录列表
   * @param {number} userId - 用户 ID
   * @param {object} [options] - { analysis_type?, limit?, offset? }
   * @returns {Promise<Array<Analysis>>}
   */
  async findByUser(userId, options = {}) {
    const model = this.getModel();
    
    const where = { user_id: userId };
    if (options.analysis_type) {
      where.analysis_type = options.analysis_type;
    }

    return await model.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 20,
      offset: options.offset || 0
    });
  }

  /**
   * 统计用户的总分析次数
   * @param {number} userId - 用户 ID
   * @returns {Promise<number>}
   */
  async countByUser(userId) {
    const model = this.getModel();
    return await model.count({
      where: { user_id: userId }
    });
  }

  /**
   * 按类型统计用户的分析次数（GROUP BY analysis_type）
   * @param {number} userId - 用户 ID
   * @returns {Promise<Array<{type: string, count: number}>>}
   */
  async getStatsByType(userId) {
    const model = this.getModel();
    
    const stats = await model.findAll({
      where: { user_id: userId },
      attributes: [
        'analysis_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['analysis_type']
    });

    return stats.map(item => ({
      type: item.analysis_type,
      count: parseInt(item.getDataValue('count'))
    }));
  }
}

export default new AnalysisDao();
