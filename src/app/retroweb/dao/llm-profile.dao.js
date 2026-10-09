/**
 * RetroWeb LLM 端点配置数据访问层
 *
 * 🔴 密钥三条铁律（都在这里收口，路由层别碰明文）：
 *    ① 落库前加密（utils/secret.js 对称加密）；
 *    ② 出接口只给掩码（`mask_key` 保尾部的口径，与前端一致）；
 *    ③ `owner='system'` 的条目根本不从本表出密钥（官方密钥在内存，见 official-llm.service）。
 *
 * 🔴 掩码规则：空串原样；太短（≤4）全打码；否则保留尾 4 位，前缀固定 `****`。
 *    不返回 key 的**数量**，避免泄露"配了几个 key"。
 *
 * @since 2026-10-09
 */
import { getModel } from '../../../framework/db/index.js';
import { encryptSecret, decryptSecret } from '../utils/secret.js';

/** 掩码：保尾部（与前端 mask_key 同口径），不暴露 key 数量 */
function maskKey(key) {
  if (!key) return '';
  const s = String(key);
  if (s.length <= 4) return '****';
  return '****' + s.slice(-4);
}

/**
 * 单条 profile → 出接口的安全形态（🔴 永不回传明文 / 数量）
 * @param {object} row 模型实例或 plain 对象
 * @returns {object}
 */
function toSafeProfile(row) {
  const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  const keys = decryptKeys(plain.keys_enc);
  return {
    id: plain.id,
    owner: plain.owner,
    name: plain.name,
    base_url: plain.base_url,
    model: plain.model,
    active: plain.active,
    max_tokens: plain.max_tokens,
    extra_json: plain.extra_json,
    // 🔴 只给掩码，不给数量、不给明文
    key_masked: keys.length ? maskKey(keys[0]) : '',
    created_at: plain.created_at,
    updated_at: plain.updated_at
  };
}

/** 解密 keys_enc → 明文数组（仅供后端内部，比如真正去调模型时用） */
function decryptKeys(keysEnc) {
  if (!keysEnc) return [];
  const dec = decryptSecret(keysEnc);
  return dec
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

class LlmProfileDao {
  getModel() {
    return getModel('retroweb.LlmProfile');
  }

  /** 用户自建的所有配置（安全形态） */
  async listByUser(userId) {
    const rows = await this.getModel().findAll({
      where: { user_id: userId, owner: 'user' },
      order: [['updated_at', 'DESC']]
    });
    return rows.map(toSafeProfile);
  }

  /**
   * 新建 / 更新用户自建配置。
   * @param {number} userId
   * @param {object} input { name, base_url, model, keys: string[], active, max_tokens, extra_json }
   * @param {number|null} id 有则更新
   * @returns {object} 安全形态
   */
  async upsert(userId, input, id = null) {
    const model = this.getModel();

    // 若设为激活，先清掉该用户其它 active（每用户最多一套生效）
    if (input.active) {
      await model.update({ active: false }, { where: { user_id: userId, owner: 'user' } });
    }

    const payload = {
      user_id: userId,
      owner: 'user',
      name: input.name ?? '默认',
      base_url: input.base_url ?? '',
      model: input.model ?? '',
      // 🔴 明文 → 逗号拼接 → 加密后才落库
      keys_enc: input.keys?.length ? encryptSecret(input.keys.join(',')) : null,
      active: !!input.active,
      max_tokens: input.max_tokens ?? null,
      extra_json: input.extra_json ?? null
    };

    let row;
    if (id) {
      await model.update(payload, { where: { id, user_id: userId } });
      row = await model.findOne({ where: { id, user_id: userId } });
    } else {
      row = await model.create(payload);
    }
    return toSafeProfile(row);
  }

  async remove(userId, id) {
    return await this.getModel().destroy({ where: { id, user_id: userId, owner: 'user' } });
  }

  /** 用户当前生效的一套（后端内部路由用，含解密后的明文 key） */
  async activeForUser(userId) {
    const row = await this.getModel().findOne({
      where: { user_id: userId, owner: 'user', active: true }
    });
    if (!row) return null;
    const plain = row.get({ plain: true });
    return { ...plain, keys: decryptKeys(plain.keys_enc) };
  }
}

const llmProfileDao = new LlmProfileDao();

export default llmProfileDao;
export { toSafeProfile, maskKey, decryptKeys };
