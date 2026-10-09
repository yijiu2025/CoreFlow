/**
 * RetroWeb 用户设置数据访问层
 *
 * UserSettings 是 1:1 用户表，`settings` 是一段 JSON（字段语义由前端维护）。
 *
 * 🔴 但有一个字段后端**必须认得**：`llm_source`（LLM 调用用哪个来源）。
 *    `resolveLlmCreds` 要按它决定「走官方还是走用户自建」，所以不能把它
 *    埋在一坨前端自由的 JSON 里随便写 —— 这里给一个显式的读口。
 *
 * 🔴 与 LlmProfile 的分界：这里只放**无所谓泄露**的偏好；涉及密钥的一律走
 *    LlmProfile 的加密列，绝不塞进 settings JSON。
 *
 * @since 2026-10-09
 */
import { getModel } from '../../../framework/db/index.js';

/** 官方模型 id 前缀（与 official-llm.service.js 的 `official-${i}` 对齐） */
const OFFICIAL_SOURCE_ID = 'official';

/** 合法的 llm_source 取值 */
const VALID_SOURCES = ['user', 'official'];

/** 某字段是合法 llm_source 吗 */
function isSource(v) {
  return VALID_SOURCES.includes(v);
}

class SettingsDao {
  getModel() {
    return getModel('retroweb.UserSettings');
  }

  /** 解析 settings 列成对象（坏 JSON → 空对象） */
  static parse(raw) {
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }

  /**
   * 读某用户的 LLM 来源偏好。
   * @param {number} userId
   * @returns {Promise<'user' | 'official'>} 默认 'user'（自建优先）
   */
  async llmSource(userId) {
    const row = await this.getModel().findOne({ where: { user_id: userId } });
    const obj = SettingsDao.parse(row?.get ? row.get('settings') : null);
    return isSource(obj.llm_source) ? obj.llm_source : 'user';
  }

  /**
   * 写 LLM 来源偏好（其余 settings 字段原样保留）。
   * @param {number} userId
   * @param {'user' | 'official'} source
   */
  async setLlmSource(userId, source) {
    if (!isSource(source)) throw new Error('非法的 LLM 来源');
    const model = this.getModel();
    const row = await model.findOne({ where: { user_id: userId } });
    const obj = SettingsDao.parse(row?.get ? row.get('settings') : null);
    obj.llm_source = source;
    const payload = {
      user_id: userId,
      settings: JSON.stringify(obj)
    };
    if (row) {
      await model.update({ settings: payload.settings }, { where: { user_id: userId } });
    } else {
      await model.create(payload);
    }
    return source;
  }

  /**
   * 读整份设置（前端拉全部偏好用）。
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async get(userId) {
    const row = await this.getModel().findOne({ where: { user_id: userId } });
    return SettingsDao.parse(row?.get ? row.get('settings') : null);
  }

  /**
   * 写整份设置（前端保存偏好用；`llm_source` 会单独校验）。
   * @param {number} userId
   * @param {object} settings
   */
  async put(userId, settings) {
    const obj = settings && typeof settings === 'object' ? settings : {};
    // llm_source 若带上，必须是合法值，否则拒收（别把后端认的字面量污染掉）
    if ('llm_source' in obj && !isSource(obj.llm_source)) {
      throw new Error('非法的 LLM 来源');
    }
    const model = this.getModel();
    const row = await model.findOne({ where: { user_id: userId } });
    const payload = { user_id: userId, settings: JSON.stringify(obj) };
    if (row) {
      await model.update({ settings: payload.settings }, { where: { user_id: userId } });
    } else {
      await model.create(payload);
    }
    return obj;
  }
}

const settingsDao = new SettingsDao();

export default settingsDao;
export { isSource, OFFICIAL_SOURCE_ID };
