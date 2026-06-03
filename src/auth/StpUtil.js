// src/auth/StpUtil.js
// 权限认证核心工具类（对标 Java Sa-Token）
// 依赖 AsyncLocalStorage 实现静态上下文穿透
import { requestContext } from './index.js';
import { createSession, detectDeviceType } from './session.js';

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
 * const uid = StpUtil.getLoginId();
 * StpUtil.checkPermission('user:admin:*');
 * const user = StpUtil.check();
 */
export default class StpUtil {
  // ==================== 内部工具方法 ====================

  /**
   * 获取当前请求的 request 对象
   * @returns {import('fastify').FastifyRequest}
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
   * @param {string} pattern 模式（如 'user:admin:*'）
   * @param {string} target 目标字符串
   * @returns {boolean}
   */
  static _isMatch(pattern, target) {
    if (pattern === target) return true;
    if (!pattern.includes('*')) return false;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(target);
  }

  // ==================== 认证方法 ====================

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
   * 登录：创建 Session 并下发 Cookie
   * @param {object} params 登录参数
   * @param {number} params.userId 用户内部 ID
   * @param {string} params.uid 用户 UUID
   * @param {string} params.username 用户名
   * @param {string} params.email 邮箱
   * @param {string} params.avatar 头像
   * @param {number} params.status 用户状态
   * @param {string} params.appId 登录的应用 ID
   * @param {string} [params.deviceId] 设备标识
   * @param {string} [params.deviceType] 设备类型（browser/app/desktop/miniapp）
   * @param {boolean} [params.rememberMe] 是否长期登录
   * @returns {string} sessionId
   */
  static async login(params) {
    const req = StpUtil._getRequest();
    const redis = req.server.redis;

    // 从请求中推断设备信息
    const userAgent = req.headers?.['user-agent'] || '';
    const deviceType = params.deviceType || detectDeviceType(userAgent);
    const ip = req.ip || req.socket?.remoteAddress || '';

    const sessionId = await createSession({
      redis,
      userId: params.userId,
      uid: params.uid,
      username: params.username,
      email: params.email,
      avatar: params.avatar,
      status: params.status,
      appId: params.appId,
      ip,
      deviceId: params.deviceId || '',
      deviceType,
      userAgent,
      rememberMe: params.rememberMe || false,
      reply: req.raw?.reply || req.reply
    });

    return sessionId;
  }

  /**
   * 角色校验：当前用户是否拥有指定角色
   * @param {string} role 角色标识
   * @throws {Error} 角色不匹配时抛出 403
   */
  static checkRole(role) {
    const user = StpUtil.check();
    const userRoles = user.roles || [];
    if (!userRoles.includes(role)) {
      const err = new Error(`权限不足：需要角色 ${role}`);
      err.statusCode = 403;
      throw err;
    }
  }

  // ==================== 权限方法 ====================

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
   * @param {string} permission 权限标识（如 'user:admin:*'）
   * @returns {boolean}
   */
  static hasPermission(permission) {
    const { allows, denies } = StpUtil.getPermissionList();

    // Deny 优先
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
   * @param {string} permission 权限标识
   * @throws {NotPermissionException} 权限不足时抛出
   */
  static checkPermission(permission) {
    if (!StpUtil.hasPermission(permission)) {
      throw new NotPermissionException(permission);
    }
  }

  /**
   * 校验当前账号是否含有指定权限（AND 语义：全部通过）
   * @param {...string} permissions 权限标识列表
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
   * @param {...string} permissions 权限标识列表
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
