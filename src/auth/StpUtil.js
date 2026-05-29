// src/auth/StpUtil.js
// 权限认证核心工具类（合并 StpUtil + xToken）
// 对标 Java Sa-Token 的 StpUtil，依赖 AsyncLocalStorage 实现静态上下文穿透
import { requestContext } from './index.js';
import jwt from 'jsonwebtoken';

/**
 * 权限不足异常
 */
class NotPermissionException extends Error {
  constructor(permission) {
    super(`无此权限: ${permission}`);
    this.name = 'NotPermissionException';
    this.code = 403;
  }
}

/**
 * 认证 & 权限工具类
 * 在 HTTP 请求上下文中通过静态方法调用，无需手动传递 request 对象
 *
 * @example
 * // 获取当前登录用户 ID
 * const uid = StpUtil.getLoginId();
 *
 * // 检查权限（支持通配符 + Deny 优先）
 * StpUtil.checkPermission('user:admin:*');
 *
 * // 强制登录检查
 * const user = StpUtil.check();
 */
export default class StpUtil {
  // ==================== 内部工具方法 ====================

  /**
   * 获取当前请求的 request 对象
   * @returns {import('fastify').FastifyRequest}
   * @throws {Error} 在非请求上下文中调用时抛出
   */
  static _getRequest() {
    const req = requestContext.getStore();
    if (!req) {
      throw new Error('StpUtil 必须在 HTTP 请求上下文中调用');
    }
    return req;
  }

  /**
   * 通配符正则匹配（支持 * 通配符）
   * @param {string} pattern - 模式（如 'user:admin:*'）
   * @param {string} target - 目标字符串
   * @returns {boolean}
   */
  static _isMatch(pattern, target) {
    if (pattern === target) return true;
    if (!pattern.includes('*')) return false;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(target);
  }

  // ==================== 认证方法（原 xToken） ====================

  /**
   * 获取当前登录用户 ID
   * @returns {string|number|undefined}
   */
  static getLoginId() {
    return (
      StpUtil._getRequest().state?.user?.sub ||
      StpUtil._getRequest().state?.user?.uid
    );
  }

  /**
   * 强制登录检查：未登录则抛出 401 异常
   * @returns {object} 当前登录用户信息
   * @throws {Error} 未登录时抛出
   */
  static check() {
    const user = StpUtil._getRequest().state?.user;
    if (!user) {
      const err = new Error('请先登录');
      err.statusCode = 401;
      throw err;
    }
    return user;
  }

  /**
   * 登录助手：签发 JWT Token 并处理多端适配
   * @param {number|string} userId - 用户 ID
   * @param {object} payload - 额外载荷（如 appId, scope 等）
   * @param {object} options - 签发选项
   * @param {string} options.secret - JWT 密钥，默认使用 process.env.JWT_SECRET
   * @param {string} options.expiresIn - 过期时间，默认 '7d'
   * @returns {string} 签发的 JWT Token
   */
  static login(userId, payload = {}, options = {}) {
    const req = StpUtil._getRequest();
    const secret = options.secret || process.env.JWT_SECRET;
    const expiresIn = options.expiresIn || '7d';

    const token = jwt.sign(
      {
        uid: userId,
        sub: userId,
        ...payload,
        iat: Math.floor(Date.now() / 1000)
      },
      secret,
      { expiresIn }
    );

    // 浏览器端适配：注入 HttpOnly Cookie
    if (req.raw && req.server) {
      // Fastify 环境，通过 reply 设置 Cookie 需要在路由 handler 中调用
      // 此处返回 token，由调用方决定如何设置 Cookie
    }

    return token;
  }

  /**
   * 角色校验：当前用户是否拥有指定角色
   * @param {string} role - 角色标识
   * @throws {Error} 角色不匹配时抛出 403
   */
  static checkRole(role) {
    const user = StpUtil.check();
    const userRole = user.role || user.roles;
    if (Array.isArray(userRole)) {
      if (!userRole.includes(role)) {
        const err = new Error(`权限不足：需要角色 ${role}`);
        err.statusCode = 403;
        throw err;
      }
    } else if (userRole !== role) {
      const err = new Error(`权限不足：需要角色 ${role}`);
      err.statusCode = 403;
      throw err;
    }
  }

  // ==================== 权限方法（原 StpUtil） ====================

  /**
   * 获取当前账号所拥有的权限集合
   * @returns {{ allows: string[], denies: string[] }}
   */
  static getPermissionList() {
    const req = StpUtil._getRequest();
    return req.state?.user?.permissions || { allows: [], denies: [] };
  }

  /**
   * 判断当前账号是否含有指定权限（支持通配符 + Deny 优先）
   * @param {string} permission - 权限标识（如 'user:admin:*'）
   * @returns {boolean}
   */
  static hasPermission(permission) {
    const { allows, denies } = StpUtil.getPermissionList();

    // 最高优：如果命中 Deny，立刻返回 false
    if (denies.some((p) => StpUtil._isMatch(p, permission))) {
      return false;
    }

    // 匹配 Allow 通配符
    if (allows.some((p) => StpUtil._isMatch(p, permission))) {
      return true;
    }

    return false;
  }

  /**
   * 校验当前账号是否含有指定权限，未通过则抛出异常
   * @param {string} permission - 权限标识
   * @throws {NotPermissionException} 权限不足时抛出
   */
  static checkPermission(permission) {
    if (!StpUtil.hasPermission(permission)) {
      throw new NotPermissionException(permission);
    }
  }

  /**
   * 校验当前账号是否含有指定权限（AND 语义：全部通过）
   * @param {...string} permissions - 权限标识列表
   * @throws {NotPermissionException} 任一权限不足时抛出
   */
  static checkPermissionAnd(...permissions) {
    for (const p of permissions) {
      if (!StpUtil.hasPermission(p)) {
        throw new NotPermissionException(p);
      }
    }
  }

  /**
   * 校验当前账号是否含有指定权限（OR 语义：任一通过）
   * @param {...string} permissions - 权限标识列表
   * @throws {NotPermissionException} 全部权限不足时抛出
   */
  static checkPermissionOr(...permissions) {
    for (const p of permissions) {
      if (StpUtil.hasPermission(p)) {
        return;
      }
    }
    throw new NotPermissionException(permissions.join(' OR '));
  }
}
