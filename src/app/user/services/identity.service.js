/**
 * 第三方账号绑定服务
 *
 * 本期只做**查看与解绑**：绑定（OAuth 回调换 openid）需要各 provider 的授权流程，
 * 属于独立的接入工作，不在这一版伪造一个"点了就能绑"的入口。
 *
 * 解绑的安全边界比"删一行"多一条：如果该用户没有任何认证凭证（密码 / 短信等），
 * 且这是最后一条绑定，解绑后他将无法登录 —— 必须拒绝并说明。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import {
  listByUser,
  findByIdAndUser,
  removeRow,
  countByUser,
  countActiveCredentials
} from '../dao/identity-binding.js';

/**
 * 可绑定 provider 清单（本仓的唯一来源）
 *
 * oauth21 的 `oauth_clients` 是"本平台对外发布的 OAuth 客户端"，不是第三方 IdP 注册表；
 * 仓里目前没有 provider 常量，所以清单只能在这里声明一次，接口与页面都读它。
 * 接入某个 provider 时：把 `available` 置 true、补上绑定回调端点，再删除 reason。
 */
const PROVIDER_CATALOG = Object.freeze([
  {
    provider: 'wechat',
    label: '微信',
    available: false,
    reason: '需要在 OAuth 客户端里配置后才能绑定'
  },
  {
    provider: 'github',
    label: 'GitHub',
    available: false,
    reason: '需要在 OAuth 客户端里配置后才能绑定'
  },
  {
    provider: 'google',
    label: 'Google',
    available: false,
    reason: '需要在 OAuth 客户端里配置后才能绑定'
  },
  {
    provider: 'qq',
    label: 'QQ',
    available: false,
    reason: '需要在 OAuth 客户端里配置后才能绑定'
  },
  {
    provider: 'apple',
    label: 'Apple',
    available: false,
    reason: '需要在 OAuth 客户端里配置后才能绑定'
  }
]);

/**
 * 绑定服务错误
 *
 * 携带 HTTP 状态码，路由层只负责翻译，不重复写业务判断。
 */
class IdentityServiceError extends Error {
  /**
   * @param {string} message 面向用户的说明
   * @param {number} [statusCode=400] HTTP 状态码
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'IdentityServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * provider 显示名
 *
 * 库里可能有清单之外的 provider（历史数据 / 手工写入），别把内部标识直接当人名展示。
 *
 * @param {string} provider provider 标识
 * @returns {string} 显示名
 */
function providerLabel(provider) {
  return PROVIDER_CATALOG.find(item => item.provider === provider)?.label || provider;
}

/**
 * 第三方账号标识打码
 *
 * openid / sub 是平台侧唯一标识，完整展示既没有帮助又会把账号指纹摊在页面上；
 * 保留首尾各 4 位足够让用户确认"是我那个号"。
 *
 * @param {string} uid 第三方账号标识
 * @returns {string} 打码后的标识
 */
function maskProviderUid(uid) {
  const text = String(uid || '');
  if (!text) return '—';
  if (text.length <= 8) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 4)}****${text.slice(-4)}`;
}

/**
 * 绑定行 → 公开字段
 *
 * `provider_uid` 只以打码形式出现：解绑只需要行 id，完整标识没有必要下发。
 *
 * @param {object} row Sequelize 实例
 * @returns {object} 公开字段
 */
function toPublicRow(row) {
  return {
    id: Number(row.id),
    provider: row.provider,
    providerLabel: providerLabel(row.provider),
    displayName: row.display_name || null,
    account: maskProviderUid(row.provider_uid),
    boundAt: row.createdAt || row.created_at || null
  };
}

class IdentityService {
  /**
   * 当前用户的绑定列表 + 可绑定清单
   *
   * 已绑定的 provider 仍留在清单里并标 `bound: true`：前端据此置灰/隐藏"绑定"入口，
   * 不用自己拿两份数据求差集（两处判断迟早会不一致）。
   *
   * @param {number} userId 用户 ID（来自会话，不接受请求参数）
   * @returns {Promise<{identities: object[], providers: object[]}>} 绑定与候选
   */
  async list(userId) {
    const rows = await listByUser(userId);

    const bound = new Set(rows.map(row => row.provider));

    return {
      identities: rows.map(toPublicRow),
      providers: PROVIDER_CATALOG.map(item => ({
        provider: item.provider,
        label: item.label,
        available: item.available,
        reason: item.available ? null : item.reason,
        bound: bound.has(item.provider)
      }))
    };
  }

  /**
   * 解绑第三方账号
   *
   * 拒绝"解绑后无法登录"的情况：
   * - 该用户没有任何 `user_identity` 凭证（密码 / 短信都算登录方式）；
   * - 这是最后一条第三方绑定。
   * 满足两条时解绑等于把人锁在门外，返回 400 让他先去设置密码或绑定别的账号。
   *
   * @param {object} params 参数
   * @param {number} params.userId 用户 ID
   * @param {number} params.id 绑定行 ID
   * @returns {Promise<void>}
   * @throws {IdentityServiceError} 绑定不存在 / 不属于该用户 / 会移除唯一登录方式
   */
  async unbind({ userId, id }) {
    const row = await findByIdAndUser({ userId, id });
    if (!row) throw new IdentityServiceError('绑定记录不存在或已解绑', 404);

    const credentialCount = await countActiveCredentials(userId);
    const bindingCount = await countByUser(userId);

    if (credentialCount === 0 && bindingCount <= 1) {
      throw new IdentityServiceError('这是你当前唯一的登录方式，解绑后将无法登录；请先设置密码或绑定其他账号后再试');
    }

    await removeRow(row);
  }
}

const identityService = new IdentityService();

export { identityService, IdentityServiceError, PROVIDER_CATALOG };
export default identityService;
