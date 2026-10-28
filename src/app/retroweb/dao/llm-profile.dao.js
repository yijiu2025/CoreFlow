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

/**
 * 🔴 掩码合并：把前端回传的 `keys` 与库里**已有明文**合成一份可落库的明文。
 *
 * 为什么必须在这里做（而不是让前端绕过）：
 *   前端拿到的永远是 `toSafeProfile` 的**掩码**（`****ab3f`），它没有、也不该有明文。
 *   面板的既有约定是「元素含 `*` = 保留那把原 key，不含 `*` = 新增」（Python 侧
 *   `api_keys` 语义）。若把含 `*` 的串直接加密落库，真 key 会被**自己的掩码覆盖**、
 *   永久不可恢复（实测见 `.tmp-probe/verify-llm-profile-keyroundtrip.mjs`）。
 *   只有本层能用 `decryptKeys` 拿到旧明文把掩码换回去，所以修法只能落在这里。
 *
 * 规则（与 Python 侧 `llm_settings` 的掩码往返一致）：
 *   · 含 `*` = 掩码 ⇒ 依次用**旧明文**顶上；旧明文不够则该项**丢弃**
 *     （宁可少一把，也不要把掩码当 key 存进去）。
 *   · 不含 `*` = 明文新增 ⇒ 原样采用（重复的只留一次）。
 *   · `keys` 未传（undefined）⇒ **不动旧 key**（调用方只想改地址/模型名）。
 *
 * @param {string[]|undefined} incoming 前端回传的 keys
 * @param {string[]} existing 库里已有的明文
 * @returns {string[]} 要落库的明文
 */
function mergeKeys(incoming, existing) {
  if (incoming === undefined || incoming === null) return existing;
  if (!Array.isArray(incoming)) return existing;

  const out = [];
  let cursor = 0; // 旧明文游标：掩码按出现顺序依次对应旧 key
  const push = k => {
    const v = typeof k === 'string' ? k.trim() : '';
    if (v && !out.includes(v)) out.push(v);
  };

  for (const item of incoming) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (!v) continue;
    if (v.includes('*')) {
      // 掩码：用旧明文顶上；旧的用完就丢弃（绝不把掩码本身存进去）
      if (cursor < existing.length) push(existing[cursor]);
      cursor++;
    } else {
      push(v); // 明文新增
    }
  }
  return out;
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

    // 🔴 先取旧明文：掩码合并要用它把 `****ab3f` 换回真 key（见 mergeKeys 的说明）。
    //    必须在写 payload **之前**读 —— update 一旦落库，旧密文就没了。
    let existingKeys = [];
    if (id) {
      const old = await model.findOne({ where: { id, user_id: userId } });
      existingKeys = decryptKeys(old?.get ? old.get('keys_enc') : null);
    }
    const finalKeys = mergeKeys(input.keys, existingKeys);

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
      // 🔴 明文 → 逗号拼接 → 加密后才落库。finalKeys 已把掩码换回真 key。
      keys_enc: finalKeys.length ? encryptSecret(finalKeys.join(',')) : null,
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
export { toSafeProfile, maskKey, decryptKeys, mergeKeys };
