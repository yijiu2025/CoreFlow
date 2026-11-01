/**
 * 权限认证核心工具类
 *
 * 对标 Java Sa-Token 设计，提供静态方法调用的认证与权限校验能力。
 * 依赖 AsyncLocalStorage 实现请求级别的上下文穿透，无需手动传递 request 对象。
 *
 * 使用方式：
 * ```js
 * const uid = StpUtil.getLoginId();              // 获取当前用户 ID
 * StpUtil.check();                                 // 强制登录检查（未登录抛 401）
 * StpUtil.checkRole('admin');                      // 角色校验
 * StpUtil.hasPermission('user:read');             // 权限判断
 * StpUtil.checkPermission('user:write');          // 权限校验（不通过抛 403）
 * ```
 *
 * 依赖方向：本文件只依赖 `./request-context.js`（零依赖）。
 * **不依赖 `./index.js`**——否则会形成 `index.js ↔ StpUtil.js` 循环依赖，且让
 * "仅使用权限工具类" 的调用方连带拉起整条 auth 插件链（DB/Redis 建连）。
 * 也不静态依赖 `./session.js`（它同样会拉起 db/redis）：仅 `login()` 需要它，
 * 故在该方法内**惰性导入**。这样 `import StpUtil` 本身零副作用，
 * 单测/脚本可安全引入而不触发建连。详见 AUDIT-REPORT-2026-09-12.md 🟡-1。
 *
 * @author yijiu
 * @since 2026-07-13
 * @since 2026-09-14 改从 ./request-context.js 取 ALS 实例 + session.js 改惰性导入，
 *                    去掉对 index.js 的反向依赖（消除循环依赖与连带副作用）
 * @since 2026-11-01 对标 Sa-Token 补齐账号封禁（disable/阶梯）与二级认证（openSafe 系列）：
 *                    两者均为 async + 惰性导入 ban.js/safe.js，继续维持"import 本文件零副作用"
 */
import { requestContext } from './request-context.js';

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
class StpUtil {
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
    return StpUtil._getRequest().state?.user?.sub || StpUtil._getRequest().state?.user?.uid;
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
   * @param {boolean} [params.multiDevice] 是否允许多设备登录（true=不踢同类型旧会话，
   *   豁免 SESSION_SINGLE_DEVICE_TYPES 策略）
   * @param {string[]} [params.offlineSessionIds] 登录时主动下线的旧会话列表
   *   （MAX_SESSIONS_EXCEEDED 后前端勾选"下线哪些设备"的重试路径）
   * @returns {string} sessionId
   */
  static async login(params) {
    const req = StpUtil._getRequest();

    // 惰性导入 session.js：只有真正登录才需要它。静态导入会让"只是想用权限工具类"
    // 的调用方（单测、脚本）连带拉起 session.js → db/redis 建连与告警（🟡-1）。
    // 模块首次加载后走 ESM 缓存，后续调用无额外开销。
    const { createSession, detectDeviceType } = await import('../session/session.js');

    // 从请求中推断设备信息
    const userAgent = req.headers?.['user-agent'] || '';
    const deviceType = params.deviceType || detectDeviceType(userAgent);
    const ip = req.ip || req.socket?.remoteAddress || '';

    const { sessionId } = await createSession({
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
      multiDevice: params.multiDevice || false,
      offlineSessionIds: params.offlineSessionIds,
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
    // 缺字段按空集处理：权限对象形状不完整时应当"无权限"（fail-closed），
    // 而不是在这里抛 TypeError 变成 500 —— 后者会让鉴权失败伪装成服务端故障。
    const { allows = [], denies = [] } = StpUtil.getPermissionList() || {};

    // Deny 优先
    if (denies.some(p => StpUtil._isMatch(p, permission))) {
      return false;
    }

    // 匹配 Allow 通配符
    if (allows.some(p => StpUtil._isMatch(p, permission))) {
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

  // ==================== 账号封禁（对标 Sa-Token disable 系列） ====================
  // 目标账号由 loginId 显式指定（管理端操作他人，不取当前登录上下文）。
  // 语义与阶梯封禁详见 ./ban.js 头注：'login' 拦新登录、'access' 拦请求、TTL 到期自动解封。

  /** 惰性加载 ban.js（与 login() 惰性导入 session.js 同模式，维持 import 零副作用） */
  static async _ban() {
    return import('../security/ban.js');
  }

  /**
   * 封禁账号的指定服务
   * @param {number|string} loginId 目标用户 ID
   * @param {string} service 服务维度（'login'/'access'/业务自定义）
   * @param {number} time 封禁秒数；-1 = 永久
   * @param {object} [opts] { reason, level, operator }
   * @returns {Promise<object>} 封禁明细
   */
  static async disable(loginId, service, time, opts) {
    const { disable } = await StpUtil._ban();
    return disable(loginId, service, time, opts);
  }

  /**
   * 阶梯封禁：按等级处罚（level>=1，语义由业务定义）
   * @param {number|string} loginId 目标用户 ID
   * @param {string} service 服务维度
   * @param {number} level 封禁等级
   * @param {number} time 封禁秒数；-1 = 永久
   * @param {object} [opts] 同 disable
   */
  static async disableLevel(loginId, service, level, time, opts) {
    const { disableLevel } = await StpUtil._ban();
    return disableLevel(loginId, service, level, time, opts);
  }

  /**
   * 解封
   * @param {number|string} loginId 目标用户 ID
   * @param {...string} services 服务维度（至少一个）
   * @returns {Promise<number>} 实际解封的服务数
   */
  static async untieDisable(loginId, ...services) {
    const { untieDisable } = await StpUtil._ban();
    return untieDisable(loginId, ...services);
  }

  /**
   * 判断账号是否被封禁（不区分等级）
   * @param {number|string} loginId 目标用户 ID
   * @param {string} service 服务维度
   * @returns {Promise<boolean>}
   */
  static async isDisable(loginId, service) {
    const { isDisable } = await StpUtil._ban();
    return isDisable(loginId, service);
  }

  /**
   * 校验账号未被指定服务封禁，被封禁抛 403（code=ACCOUNT_BANNED）
   * @param {number|string} loginId 目标用户 ID
   * @param {...string} services 服务维度
   */
  static async checkDisable(loginId, ...services) {
    const { checkDisable } = await StpUtil._ban();
    return checkDisable(loginId, ...services);
  }

  /**
   * 获取剩余封禁时间
   * @returns {Promise<number>} -2=未封禁；-1=永久；其余=剩余秒数
   */
  static async getDisableTime(loginId, service) {
    const { getDisableTime } = await StpUtil._ban();
    return getDisableTime(loginId, service);
  }

  // ==================== 二级认证（对标 Sa-Token openSafe 系列） ====================
  // 操作对象是**当前请求的登录用户**（ALS 上下文），敏感路由经 createGuard 确保已登录。

  /** 惰性加载 safe.js */
  static async _safe() {
    return import('../security/safe.js');
  }

  /**
   * 开启二级认证时间窗（业务路由完成身份确认——重输密码/验证码——后调用）
   * @param {string} service 二级认证业务维度
   * @param {number} [safeTime=1800] 时间窗秒数
   * @returns {Promise<{openedAt:number, expireAt:number}>}
   * @throws {Error} 非登录上下文抛 401
   */
  static async openSafe(service, safeTime) {
    const { openSafe } = await StpUtil._safe();
    return openSafe(StpUtil.check().userId, service, safeTime);
  }

  /**
   * 是否处于二级认证时间窗内（当前用户）
   * @param {string} service 二级认证业务维度
   * @returns {Promise<boolean>}
   */
  static async isSafe(service) {
    const { isSafe } = await StpUtil._safe();
    return isSafe(StpUtil.check().userId, service);
  }

  /**
   * 校验二级认证（当前用户），未开启/已过期抛 403（code=SECOND_AUTH_REQUIRED）
   * @param {string} service 二级认证业务维度
   */
  static async checkSafe(service) {
    const { checkSafe } = await StpUtil._safe();
    return checkSafe(StpUtil.check().userId, service);
  }

  /**
   * 结束二级认证（当前用户，敏感操作完成后主动关闭）
   * @param {string} service 二级认证业务维度
   */
  static async closeSafe(service) {
    const { closeSafe } = await StpUtil._safe();
    return closeSafe(StpUtil.check().userId, service);
  }

  /**
   * 获取二级认证剩余时间（当前用户）
   * @returns {Promise<number>} -1=未开启；其余=剩余秒数
   */
  static async getSafeTime(service) {
    const { getSafeTime } = await StpUtil._safe();
    return getSafeTime(StpUtil.check().userId, service);
  }
}

export default StpUtil;
