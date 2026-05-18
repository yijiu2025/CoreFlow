import { requestContext } from '../loader/registry/01-als.js';

class NotPermissionException extends Error {
  constructor(permission) {
    super(`无此权限: ${permission}`);
    this.name = 'NotPermissionException';
    this.code = 403;
  }
}

/**
 * 权限认证核心工具类 (对标 Java Sa-Token 的 StpUtil)
 * 依赖于 AsyncLocalStorage 实现静态上下文穿透
 */
export default class StpUtil {
  /**
   * 内部私有方法：获取当前线程的 request 实例
   */
  static _getRequest() {
    const req = requestContext.getStore();
    if (!req) {
      throw new Error('StpUtil 必须在 HTTP 请求上下文中调用');
    }
    return req;
  }

  /**
   * 内部私有方法：验证通配符正则匹配
   */
  static _isMatch(pattern, target) {
    if (pattern === target) return true;
    if (!pattern.includes('*')) return false;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(target);
  }

  /**
   * 获取：当前账号所拥有的权限集合
   * @returns {{ allows: string[], denies: string[] }}
   */
  static getPermissionList() {
    const req = this._getRequest();
    // 假设通过拦截器解析后，JWT 里的权限存放在 req.user.permissions 
    // 若不存在，默认返回空数组
    return req.user?.permissions || { allows: [], denies: [] };
  }

  /**
   * 判断：当前账号是否含有指定权限, 返回 true 或 false
   * @param {string} permission 权限标识
   * @returns {boolean}
   */
  static hasPermission(permission) {
    const { allows, denies } = this.getPermissionList();

    // 1. 最高优：如果命中 Deny，立刻返回 false
    if (denies.some(p => this._isMatch(p, permission))) {
      return false;
    }

    // 2. 匹配 Allow 通配符
    if (allows.some(p => this._isMatch(p, permission))) {
      return true;
    }

    return false;
  }

  /**
   * 校验：当前账号是否含有指定权限, 如果验证未通过，则抛出异常: NotPermissionException 
   * @param {string} permission 
   */
  static checkPermission(permission) {
    if (!this.hasPermission(permission)) {
      throw new NotPermissionException(permission);
    }
  }

  /**
   * 校验：当前账号是否含有指定权限 [指定多个，必须全部验证通过]
   * @param {...string} permissions 
   */
  static checkPermissionAnd(...permissions) {
    for (const p of permissions) {
      if (!this.hasPermission(p)) {
        throw new NotPermissionException(p);
      }
    }
  }

  /**
   * 校验：当前账号是否含有指定权限 [指定多个，只要其一验证通过即可]
   * @param {...string} permissions 
   */
  static checkPermissionOr(...permissions) {
    for (const p of permissions) {
      if (this.hasPermission(p)) {
        return; // 只要有一个通过就 OK
      }
    }
    // 全都没通过，抛出第一个权限异常做提示
    throw new NotPermissionException(permissions.join(' OR '));
  }
}
