/**
 * 通知中心数据访问层
 *
 * 为什么单独一个 DAO 而不是塞进 `notice.js`：`notice.js` 是**发信配置**的存量入口
 * （SMTP / 旧模板 / 旧通道），被 framework 的 email service 动态依赖；本文件是
 * "通知中心"这批新表的唯一查询出口。分开后删掉通知中心不影响存量发信链路。
 *
 * 约定：本文件只做数据访问，不校验业务规则（事件/渠道合法性在 service 里判）——
 * DAO 里做校验会让"未知渠道"和"库里没数据"混成同一个错误。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import { Op } from 'sequelize';
import { getModel } from '../../../framework/persistence/db/index.js';

/** 日志分页上限：超过 200 的页大小只会拖慢面板，没有业务价值 */
const MAX_PAGE_SIZE = 200;

class NoticeCenterDao {
  /* ── 模板 ────────────────────────────────────────────────── */

  /**
   * 模板列表
   *
   * @param {object} [options] 过滤条件
   * @param {string} [options.channel] 渠道 id
   * @returns {Promise<Array>} 模板行（按 id 升序，先建的在上面）
   */
  async listTemplates({ channel } = {}) {
    const NoticeTemplate = getModel('notice.NoticeTemplate');
    const where = {};
    if (channel) where.channel = channel;
    return NoticeTemplate.findAll({ where, order: [['id', 'ASC']] });
  }

  /**
   * 按主键取模板
   *
   * @param {number} id 模板 id
   * @returns {Promise<object|null>}
   */
  async findTemplate(id) {
    const NoticeTemplate = getModel('notice.NoticeTemplate');
    return NoticeTemplate.findByPk(id);
  }

  /**
   * 按编码取模板（用于唯一性预检）
   *
   * @param {string} code 模板编码
   * @returns {Promise<object|null>}
   */
  async findTemplateByCode(code) {
    const NoticeTemplate = getModel('notice.NoticeTemplate');
    return NoticeTemplate.findOne({ where: { code } });
  }

  /**
   * 取某事件在某渠道下启用中的模板
   *
   * 允许两种编码：`<eventCode>`（最常用）与 `<eventCode>.<channel>`（多渠道并存时）。
   * 用集合查询而不是 LIKE：模板编码是管理员输入，LIKE 前缀匹配会把
   * `user.created_v2` 这种无关模板也捞进来。
   *
   * @param {string} eventCode 事件 code
   * @param {string} channel 渠道 id
   * @returns {Promise<object|null>}
   */
  async findEnabledTemplate(eventCode, channel) {
    const NoticeTemplate = getModel('notice.NoticeTemplate');
    const exactCode = String(eventCode);
    const suffixedCode = `${eventCode}.${channel}`;
    return NoticeTemplate.findOne({
      where: {
        channel,
        enabled: true,
        code: { [Op.in]: [exactCode, suffixedCode] }
      },
      // 精确编码优先：`user.created` 比 `user.created.email` 更"专属这个事件"
      order: [
        ['code', 'ASC'],
        ['id', 'ASC']
      ]
    });
  }

  /**
   * 新建模板
   *
   * @param {object} payload 已校验的字段
   * @returns {Promise<object>}
   */
  async createTemplate(payload) {
    const NoticeTemplate = getModel('notice.NoticeTemplate');
    return NoticeTemplate.create(payload);
  }

  /**
   * 更新模板
   *
   * @param {object} template 模板实例
   * @param {object} payload 已校验的字段
   * @returns {Promise<object>}
   */
  async updateTemplate(template, payload) {
    return template.update(payload);
  }

  /**
   * 删除模板
   *
   * @param {object} template 模板实例
   * @returns {Promise<void>}
   */
  async removeTemplate(template) {
    await template.destroy();
  }

  /* ── 全局订阅 ────────────────────────────────────────────── */

  /**
   * 全局订阅行（可按事件过滤）
   *
   * @param {string} [eventCode] 事件 code
   * @returns {Promise<Array>}
   */
  async listSubscriptions(eventCode) {
    const NoticeEventSubscription = getModel('notice.NoticeEventSubscription');
    const where = {};
    if (eventCode) where.eventCode = eventCode;
    return NoticeEventSubscription.findAll({ where, order: [['id', 'ASC']] });
  }

  /**
   * 写入一条全局订阅（存在则更新）
   *
   * @param {string} eventCode 事件 code
   * @param {string} channel 渠道 id
   * @param {boolean} enabled 是否开启
   * @returns {Promise<Array>} upsert 返回值
   */
  async saveSubscription(eventCode, channel, enabled) {
    const NoticeEventSubscription = getModel('notice.NoticeEventSubscription');
    return NoticeEventSubscription.upsert({ eventCode, channel, enabled });
  }

  /* ── 个人偏好 ────────────────────────────────────────────── */

  /**
   * 某用户的个人偏好
   *
   * @param {number} userId 用户数字主键
   * @param {string} [eventCode] 事件 code
   * @returns {Promise<Array>}
   */
  async listPreferences(userId, eventCode) {
    const NoticeUserPreference = getModel('notice.NoticeUserPreference');
    const where = { userId };
    if (eventCode) where.eventCode = eventCode;
    return NoticeUserPreference.findAll({ where, order: [['id', 'ASC']] });
  }

  /**
   * 批量写入个人偏好（逐条 upsert）
   *
   * 为什么不用 bulkCreate + updateOnDuplicate：这里最多几十行，逐条 upsert 的
   * 开销可以忽略，但能保证"每行都走模型的字段映射与默认值"，不会因为将来
   * `updateOnDuplicate` 的字段清单漏写而静默丢列。
   *
   * @param {Array<{userId:number,eventCode:string,channel:string,enabled:boolean,quietFrom:string|null,quietTo:string|null}>} rows 待写行
   * @returns {Promise<number>} 写入行数
   */
  async savePreferences(rows) {
    const NoticeUserPreference = getModel('notice.NoticeUserPreference');
    for (const row of rows) {
      await NoticeUserPreference.upsert(row);
    }
    return rows.length;
  }

  /* ── 投递日志 ────────────────────────────────────────────── */

  /**
   * 写一条投递日志
   *
   * @param {object} payload 日志字段
   * @returns {Promise<object>}
   */
  async createDeliveryLog(payload) {
    const NoticeDeliveryLog = getModel('notice.NoticeDeliveryLog');
    return NoticeDeliveryLog.create(payload);
  }

  /**
   * 投递日志分页（按时间倒序）
   *
   * @param {object} query 查询条件
   * @param {string} [query.status] sent | failed
   * @param {number} [query.pageNum] 页码（1 起）
   * @param {number} [query.pageSize] 页大小
   * @returns {Promise<{rows: Array, total: number}>}
   */
  async pageDeliveryLogs({ status, pageNum = 1, pageSize = 20 } = {}) {
    const NoticeDeliveryLog = getModel('notice.NoticeDeliveryLog');
    const where = {};
    if (status) where.status = status;
    const size = Math.min(Math.max(Number(pageSize) || 20, 1), MAX_PAGE_SIZE);
    const page = Math.max(Number(pageNum) || 1, 1);
    const { rows, count } = await NoticeDeliveryLog.findAndCountAll({
      where,
      limit: size,
      offset: (page - 1) * size,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC']
      ]
    });
    return { rows, total: count };
  }

  /* ── 用户联系方式 ────────────────────────────────────────── */

  /**
   * 批量取接收人联系方式
   *
   * 只取发送需要的三列：投递链路没有理由把用户其他资料读进内存。
   * 用户表是 paranoid（软删除），findAll 默认排除已注销账号 —— 给注销用户发信
   * 正是要避免的事。
   *
   * @param {number[]} userIds 用户数字主键
   * @returns {Promise<Array<{id:number,email:string|null,username:string|null}>>}
   */
  async findUserContacts(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const User = getModel('User');
    return User.findAll({ where: { id: userIds }, attributes: ['id', 'email', 'username'] });
  }
}

const noticeCenterDao = new NoticeCenterDao();

export default noticeCenterDao;
