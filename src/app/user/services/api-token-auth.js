/**
 * 个人访问令牌 → 认证用户
 *
 * 用户中心签发的令牌（`user_api_tokens`）在**框架认证层**被解析成和会话一样的
 * `request.state.user`，于是脚本 / CLI / 第三方工具可以用
 * `Authorization: Bearer <令牌>` 直接调用后台接口，不需要模拟登录。
 *
 * === 为什么权限是"用户本人 − GLOBAL 通配" ===
 * `scopedCredential: true` 与 JWT 那条路完全一致：令牌是**受限凭证**，不随 GLOBAL
 * 角色继承通配 `*`。否则超管随手签的一个令牌等于把后台万能钥匙复制到脚本里，
 * 而脚本最容易进仓库、进 CI 变量、进聊天记录。
 *
 * 令牌上的 `scopes`（profile / email）是 **OIDC 数据范围**，不是接口权限 ——
 * 它决定"能读到你哪些资料"，接口能不能调仍由 PBAC 判定。两者刻意不混：
 * 把 scope 当权限用，会让"只给了 profile 的令牌"连自己的令牌列表都读不到。
 *
 * === 权限命名空间为什么钉 `admin` ===
 * 令牌是在控制台「账号与安全」里创建的，用途就是后台接口 / 脚本。JWT 那条路靠
 * `aud` 决定命名空间，令牌没有 aud；钉 `admin` 与创建它的界面一致。
 * 共享系统（`/user/v1/*`、`/auth/*`）不做应用归属校验，所以这个值不会把它们挡掉。
 *
 * @author yijiu2025
 * @since 2026-11-22
 */
import tokenService from './token.service.js';
import userDao from '../dao/user.js';
import { getPermissions } from '../../../framework/security/auth/index.js';
import { createLogger } from '../../../framework/support/log/index.js';

const log = createLogger('app.user.api-token-auth');

/** 令牌所属的权限命名空间（见文件头） */
const TOKEN_PERMISSION_APP = 'admin';

/**
 * 用明文令牌装配认证用户
 *
 * 三种情况返回 null（都按"未认证"处理，交给调用方走失败分支）：
 * 令牌不存在 / 已吊销 / 已过期；账号不存在或已禁用；权限加载抛错。
 * 最后一种**刻意不降级放行** —— 库抖动期间把后台敞开比拒绝更糟。
 *
 * @param {string} plain 明文令牌
 * @returns {Promise<object|null>} 认证用户对象
 */
async function authenticateByApiToken(plain) {
  const hit = await tokenService.verify(plain);
  if (!hit?.userId) return null;

  const user = await userDao.findAuthById(hit.userId);
  if (!user) return null;
  if (Number(user.status) === 0) {
    log.warn(`🚫 [ApiToken] 账号已禁用，拒绝令牌认证: userId=${user.id}, tokenId=${hit.id}`);
    return null;
  }

  /*
   * 不预置 `roles = []`：`try` 成功时下面必然赋值，失败时直接 return ——
   * 预置的初值永远不会被读到（eslint 的 no-useless-assignment 会拦）。
   */
  let roles;
  let permissions = { allows: [], denies: [] };
  try {
    const loaded = await getPermissions(user.id, TOKEN_PERMISSION_APP, { scopedCredential: true });
    roles = Array.isArray(loaded?.roles) ? loaded.roles : [];
    permissions = loaded?.permissions || permissions;
  } catch (err) {
    log.error(`🚫 [ApiToken] 权限加载失败，拒绝令牌认证: userId=${user.id}`, err);
    return null;
  }

  return {
    sub: user.uid,
    uid: user.uid,
    userId: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
    roles,
    permissions,
    appId: TOKEN_PERMISSION_APP,
    /**
     * `api_token` 与 `bearer` 分开命名：两者都走 Bearer 头，但一个是 OAuth 的短期
     * JWT、一个是长期个人令牌，审计与排障时必须能一眼区分。守卫里判断"是否受限凭证"
     * 的地方要同时认这两个值。
     */
    tokenType: 'api_token',
    /** 本次认证用的令牌 ID 与作用域（审计 / 后续按 scope 裁剪字段用） */
    tokenId: hit.id,
    tokenScopes: hit.scopes
  };
}

export { authenticateByApiToken, TOKEN_PERMISSION_APP };
export default authenticateByApiToken;
