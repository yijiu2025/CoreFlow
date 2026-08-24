/**
 * OAuth 2.1 scope 元数据注册表（系统级单一数据源）
 *
 * 每个 scope 声明：暴露哪些用户字段、默认人话描述、是否必选。
 * - 字段映射（fields）：签发 access_token / ID Token / userinfo 时按 scope ∩ fields 裁剪，
 *   避免"请求 email scope 却拿到 phone"之类的越权暴露。
 * - 描述（desc）：授权页展示给人看，而非裸 scope 字符串。
 * - 必选（required）：openid/profile 等基础 scope，授权页标注"必需"，不可取消勾选。
 *
 * 各 app 在自己的 config.js 的 oauth_client.scope_metadata 里可覆盖描述文案
 * （如 PoseCraft 把 email 描述成"用于向你发送作品审核通知"），
 * 字段映射仍以本注册表为准（避免各 app 重复定义字段、口径不一）。
 *
 * @author yijiu2025
 * @since 2026-08-24
 */

/**
 * 用户字段 → 取值方式（签发时按 fields 集合读取）
 * phone 特殊：AES 加密存储，scope=phone 当前只声明不下发解密手机号（预留）
 */
export const SCOPE_REGISTRY = {
  /** 基础登录凭证：仅用于身份认证，不下发任何用户字段 */
  openid: {
    fields: [],
    desc: '基础登录凭证，验证您的身份并维持登录状态',
    required: true
  },
  /** 公开个人信息：用户名、昵称、头像 */
  profile: {
    fields: ['username', 'name', 'avatar'],
    desc: '获取您的公开个人信息（用户名、昵称、头像）',
    required: true
  },
  /** 电子邮箱：用于系统通知 */
  email: {
    fields: ['email'],
    desc: '获取您的电子邮箱地址，用于发送系统通知'
  },
  /** 手机号码：AES 加密存储，当前只声明不下发 */
  phone: {
    fields: ['phone'],
    desc: '获取您的手机号码，用于身份验证与紧急联系',
    sensitive: true
  },
  /** 所属组织与角色：用于企业级应用的部门/角色信息 */
  groups: {
    fields: ['roles', 'departments'],
    desc: '读取您在系统中的所属组织与角色信息'
  },
  /** 离线访问：签发 refresh_token，允许在您离线时持续访问 */
  offline_access: {
    fields: [],
    desc: '在您离线时持续访问您的数据（签发刷新令牌）'
  }
};

/** 所有合法 scope id 白名单（客户端注册校验用） */
export const VALID_SCOPES = Object.keys(SCOPE_REGISTRY);

/** 必选 scope 集合（授权页不可取消勾选） */
export const REQUIRED_SCOPES = Object.entries(SCOPE_REGISTRY)
  .filter(([, v]) => v.required)
  .map(([k]) => k);

/**
 * 解析 scope 字符串为详情数组（按 registry 顺序、剔除未知）
 * @param {string} scopeStr 空格分隔的 scope 字符串
 * @param {object} [overrides] 各 scope 的描述覆盖（来自 oauth_clients.scope_metadata）
 * @returns {Array<{id, name, desc, fields, required, sensitive}>}
 */
export function resolveScopeDetails(scopeStr, overrides = {}) {
  if (!scopeStr) return [];
  const ids = scopeStr.split(/\s+/).filter(Boolean);
  return ids
    .filter(id => SCOPE_REGISTRY[id])
    .map(id => {
      const meta = SCOPE_REGISTRY[id];
      const override = overrides[id] || {};
      return {
        id,
        name: override.name || id,
        desc: override.desc || meta.desc,
        fields: meta.fields,
        required: !!meta.required,
        sensitive: !!meta.sensitive
      };
    });
}

/**
 * 计算请求 scope 在字段维度的并集（签发 token 时按此裁剪 user 字段）
 * phone 字段不加入（sensitive，当前不下发）
 * @param {string} scopeStr
 * @returns {string[]} 字段名集合
 */
export function resolveFieldSet(scopeStr) {
  if (!scopeStr) return [];
  const ids = scopeStr.split(/\s+/).filter(Boolean);
  const set = new Set();
  for (const id of ids) {
    const meta = SCOPE_REGISTRY[id];
    if (!meta) continue;
    if (meta.sensitive) continue; // phone 等敏感字段不下发
    meta.fields.forEach(f => set.add(f));
  }
  return [...set];
}

/**
 * 校验 scope 字符串是否全部在白名单内
 * @param {string} scopeStr
 * @returns {{valid: boolean, unknown: string[]}}
 */
export function validateScopes(scopeStr) {
  if (!scopeStr) return { valid: true, unknown: [] };
  const ids = scopeStr.split(/\s+/).filter(Boolean);
  const unknown = ids.filter(id => !SCOPE_REGISTRY[id]);
  return { valid: unknown.length === 0, unknown };
}

/**
 * 校验 requested ⊆ allowed（授权边界，防越权请求）
 * @param {string} requested 请求的 scope
 * @param {string} allowed 客户端注册的 scope
 * @returns {{valid: boolean, exceeded: string[]}}
 */
export function checkScopeSubset(requested, allowed) {
  const reqIds = (requested || '').split(/\s+/).filter(Boolean);
  const allowIds = (allowed || '').split(/\s+/).filter(Boolean);
  const exceeded = reqIds.filter(id => !allowIds.includes(id));
  return { valid: exceeded.length === 0, exceeded };
}
