/**
 * JWT Bearer 认证流程
 *
 * Bearer Token（Authorization 头）与 access_token Cookie 的验证与用户装配。
 * 认证优先级：Bearer Token > access_token Cookie > Session Cookie (sid)。
 *
 * 权限语义（单一来源）：签发端（app/oauth21/crypto/jwt.js）不把 roles/permissions
 * 嵌入 JWT（权限变更即时生效），这里永远走带指纹校验的缓存（permission/perm-cache.js）
 * 读实时快照，不读 payload claims。
 *
 * @author yijiu
 * @since 2026-07-13
 * @since 2026-11-01 自 auth/index.js 拆出（index.js 收敛为纯门面）
 */
import { verify } from '../jwt/index.js';
import { findUserByUid } from '../../../shared/user-dao.js';
import { getPermissions } from './permission/perm-cache.js';
import { resolvePermissionAppId } from '../../config/app-registry.js';
import { getStore } from '../../persistence/redis/index.js';
import { createLogger } from '../../support/log/index.js';
import { authJwtEnabled } from './session/session-config.js';

const log = createLogger('framework.auth.bearer-auth');

/**
 * 个人访问令牌（API Token）的解析器
 *
 * 与「按钮授权闸」同一套做法：令牌表（`user_api_tokens`）是**业务表**，而这里是框架层，
 * 不能反向依赖某个应用。未注册时（其它部署形态 / 单测）行为与以前完全一致 ——
 * 只认 JWT。
 *
 * 签名：`(plainToken) => Promise<user|null>`，null 表示「这不是有效令牌」，
 * 随后按认证失败处理。解析器自己负责写 `last_used_at`、查账号状态、装权限。
 */
let apiTokenAuth = null;

/**
 * 注册个人令牌解析器
 *
 * @param {((plain: string) => Promise<object|null>)|null} fn 解析函数
 * @returns {void}
 */
function registerApiTokenAuthenticator(fn) {
  apiTokenAuth = typeof fn === 'function' ? fn : null;
}

/**
 * 是否已注册个人令牌解析器
 *
 * @returns {boolean} 是否已注册
 */
function hasApiTokenAuthenticator() {
  return apiTokenAuth !== null;
}

/**
 * 清空解析器（**仅供测试**）
 *
 * @returns {void}
 */
function resetApiTokenAuthenticatorForTesting() {
  apiTokenAuth = null;
}

/** JWT 认证开关（唯一来源：src/config/auth_config.js 覆盖 → core 保底 false；不依赖 oauth21 应用层） */
const jwtEnabled = authJwtEnabled();

/**
 * 从 Bearer Token 解析用户信息
 *
 * 缓存通过 getStore 统一管理，自带超时保护、序列化和降级。
 *
 * @param {string} token - JWT access_token
 * @returns {Promise<object|null} 用户信息对象或 null（验证失败时）
 */
async function getUserFromToken(token) {
  try {
    const payload = await verify(token);
    if (!payload?.sub) return null;
    // 仅允许 access_token / client_token 作为 Bearer 认证凭证；
    // id_token / refresh_token 或缺失 token_type 的 token 不得用于 API 认证。
    if (payload.token_type !== 'access_token' && payload.token_type !== 'client_token') {
      log.warn('[Auth] 拒绝非 access/client token 作为 Bearer 凭证: token_type=%s', payload.token_type);
      return null;
    }
    log.debug('🔑 JWT 解析成功: sub=%s, aud=%s, token_type=%s', payload.sub, payload.aud, payload.token_type);

    // client_token：客户端凭证令牌（M2M），无用户上下文，直接返回客户端信息
    if (payload.token_type === 'client_token') {
      return {
        sub: payload.sub,
        userId: null,
        username: payload.sub,
        email: null,
        avatar: null,
        status: 1,
        roles: [],
        permissions: { allows: [], denies: [] },
        tokenType: 'client_token'
      };
    }

    // 1. 优先查用户缓存（30s TTL），避免每次请求打 DB
    //    缓存未命中才查库，兼顾性能与账号实时状态
    const userStore = getStore('user', { timeout: 3000 });
    let userData = null;
    try {
      userData = await userStore.get(String(payload.sub));
    } catch (err) {
      log.warn('[Auth] 用户缓存读取失败，降级到数据库:', err);
    }

    if (!userData) {
      log.debug('📦 用户缓存未命中，查 DB: userId=%s', payload.sub);
      userData = await findUserByUid(payload.sub); // payload.sub 是 uid（JWT 契约）
      if (!userData) return null;
      // 写入缓存（30 秒），账号禁用等状态变更 30s 内生效
      try {
        await userStore.set(String(payload.sub), userData, 30);
      } catch (err) {
        log.warn('[Auth] 用户缓存写入失败:', err);
      }
    } else {
      log.debug('📦 用户缓存命中: userId=%s, username=%s', userData.id, userData.username);
    }

    // 2. 检查账号状态（禁用则拒绝）
    if (userData.status === 0) {
      // warn：禁用账号的登录尝试是安全审计事件，生产环境需要可见
      log.warn('🚫 账号已禁用: userId=%s', userData.id);
      return null;
    }

    // 3. 权限加载：走带指纹校验的缓存（permission/perm-cache.js）
    //
    //    签发端不把权限嵌进 JWT（权限变更即时生效，不等 token 过期），
    //    所以这里永远从缓存/DB 读实时快照，不读 payload claims。
    //    ⚠️ 必须传数字主键（userData.id）：loadUserPermissions 按数字列 user_id
    //    查询，传 uid 字符串会查空 → JWT 用户权限恒为空。
    /*
     * 🔴 两处都不能省：
     *   1. `resolvePermissionAppId()`：角色住在**权限命名空间**里（console 是 `admin`），
     *      而 `aud` 是 OAuth 的 client_id（console）。不做映射 ⇒ 查 `app_id='console'`
     *      的角色恒为空 ⇒ 管理员用自己的 token 也是 0 权限（实测 15 条 admin:user:* 全丢）。
     *   2. `scopedCredential`：token 是受限凭证，不随 GLOBAL 角色获得通配 `*`
     *      （否则超管的一个 posecraft token 等于后台万能钥匙）。
     */
    const permAppId = resolvePermissionAppId(payload.aud || 'GLOBAL');
    const { roles, permissions } = await getPermissions(userData.id, permAppId, { scopedCredential: true });

    return {
      sub: userData.uid,
      uid: userData.uid,
      // 与 Session 路径（plugin.js）对齐：userId = 数字主键，uid/sub = 对外 UUID。
      // DAO 形状契约见 user-dao-shape.test.js（id = 数字，uid = UUID）。
      userId: userData.id,
      username: userData.username,
      email: userData.email,
      avatar: userData.avatar,
      status: userData.status,
      roles,
      permissions,
      /*
       * `appId` 存**登录应用**（aud），与会话路径同口径 —— guard 的会话归属校验要拿它
       * 跟"请求所属应用"比对，两边必须是同一个空间（否则 console 会话与 admin
       * 权限命名空间会互相误判）。
       *
       * 权限命名空间另走 `resolvePermissionAppId(appId)`，在 freshPermission 里解析，
       * 所以这里给 aud 不影响第 4 层选对命名空间。
       */
      appId: String(payload.aud || 'GLOBAL'),
      tokenType: 'bearer'
    };
  } catch (err) {
    // JWT 解析全程异常（verify 失败 / findUserByUid 抛错 / getPermissions 抛错）：
    // 返回 null 让调用方走"认证失败"分支，但记 warn 便于排障（原 catch {} 静默）
    log.warn('[Auth] getUserFromToken 异常:', err);
    return null;
  }
}

/**
 * Bearer 认证（Bearer Token + access_token Cookie）
 *
 * 两种凭证共用 `Authorization: Bearer`：
 *   · OAuth 的短期 JWT（`access_token` / `client_token`）—— 受 `jwtEnabled` 开关控制；
 *   · 个人访问令牌（用户中心签发）—— **不受** `jwtEnabled` 控制。
 *
 * 为什么个人令牌要独立于 `jwtEnabled`：那个开关表达的是"本部署是否接受 OAuth
 * 签发的 JWT"，与"用户能不能用自己签的令牌调接口"是两件事。捆在一起的表现是
 * 关掉 OAuth 的部署里个人令牌静默失效，而页面上还写着"可用"。
 *
 * @param {object} cookies 解析后的 cookies
 * @param {object} headers 请求头
 * @returns {Promise<object|null>} 认证成功的用户对象，或 null（未走 Bearer / 失败）
 */
async function authenticateByJwt(cookies, headers) {
  // 2a. Bearer Token（Header）
  const authHeader = headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    log.debug('🔑 检测到 Bearer Token: %s...', token.slice(0, 20));

    if (jwtEnabled) {
      const tokenUser = await getUserFromToken(token);
      if (tokenUser) {
        log.debug('✅ JWT 认证成功: userId=%s, username=%s', tokenUser.userId, tokenUser.username);
        return tokenUser;
      }
    }

    /*
     * 个人访问令牌（如 `nsk_...`）不是 JWT。对 JWT 通道而言它是"解析失败"，
     * 但那是**正常用法**，不能因此打"Token 无效"的告警 —— 否则审计日志里全是
     * 假告警，真爆破反而被淹掉。所以顺序是：先 JWT，再令牌，两次都落空才告警。
     *
     * 先判 JWT 的理由：它是短期的、带 `aud` 的会话凭证；顺序写死在代码里才可靠，
     * 不靠"两者不可能同时成立"这种推理。
     */
    if (apiTokenAuth) {
      try {
        const viaApiToken = await apiTokenAuth(token);
        if (viaApiToken) {
          log.debug('✅ 个人令牌认证成功: userId=%s', viaApiToken.userId);
          return viaApiToken;
        }
      } catch (err) {
        // 令牌解析出错（库抖动）按未认证处理：闸门的职责是"默认关"
        log.warn('[Auth] 个人令牌解析异常:', err);
      }
    }

    // warn：认证失败是安全审计事件（爆破/伪造 token 探测），生产环境需要可见
    log.warn('❌ Bearer 凭证无效（JWT 与个人令牌均未命中）');
  }

  // 2b. access_token Cookie —— 这条通道只承载 JWT，`jwtEnabled` 关掉时整段跳过
  if (!jwtEnabled) return null;
  if (cookies['access_token']) {
    const tokenUser = await getUserFromToken(cookies['access_token']);
    if (tokenUser) return tokenUser;
  }
  return null;
}

export {
  authenticateByJwt,
  registerApiTokenAuthenticator,
  hasApiTokenAuthenticator,
  resetApiTokenAuthenticatorForTesting
};
