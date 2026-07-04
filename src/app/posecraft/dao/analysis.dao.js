/**
 * PoseCraft 分析数据访问层
 */
import sequelize from '../../../db/index.js';

class AnalysisDao {
  getModel() {
    return sequelize.models.Analysis;
  }

  /**
   * 创建分析记录
   */
  async create(data) {
    const model = this.getModel();
    return await model.create(data);
  }

  /**
   * 查询用户的分析记录列表
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
   */
  async countByUser(userId) {
    const model = this.getModel();
    return await model.count({
      where: { user_id: userId }
    });
  }

  /**
   * 按类型统计用户的分析次数
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
