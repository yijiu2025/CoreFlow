/**
 * 二级认证（framework/auth）
 *
 * 敏感操作"再次确认"机制，对标 Java Sa-Token 的 openSafe/checkSafe/closeSafe：
 * 用户完成一次身份确认（重输密码/短信验证码等，由业务路由自行实现校验）后调用
 * openSafe 开启 N 秒时间窗，窗口内的敏感路由（registerSecureRoute 声明 `safe` 字段）
 * 直接放行；窗口外 checkSafe 抛 SECOND_AUTH_REQUIRED(403)，前端弹确认框。
 *
 * 与人机验证（anomaly-detector）的分工：人机验证针对**环境异常**（换设备/换 IP），
 * 是被动风控；二级认证针对**敏感操作本身**（改密/解绑/支付），是主动确认。
 * 两者可叠加：高风险请求先过人机验证，敏感路由再过二级认证。
 *
 * Redis 设计：`<userId>:<service>` → { openedAt, expireAt }，TTL=时间窗秒数，
 * 到期自动关闭。Redis 故障 fail-closed（视为未开启）：二级认证是安全增强，
 * 故障时宁可让用户重新确认一次，不可静默放行敏感操作。
 *
 * 依赖方向：只依赖 redis/log/events，不 import session.js（无环）。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import { getStore } from '../../redis/index.js';
import { createLogger } from '../../log/index.js';
import { AUTH_EVENTS, emitAuthEvent } from '../audit/events.js';

const log = createLogger('framework.auth.safe');

/** 默认二级认证时间窗（秒）：30 分钟 */
const DEFAULT_SAFE_TIME = 1800;

/** auth:safe 命名空间实例（惰性初始化：import 本模块零 Redis 副作用） */
let _store = null;
function store() {
  if (!_store) _store = getStore('auth_safe');
  return _store;
}

function assertService(service) {
  if (!service || typeof service !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(service)) {
    throw new Error(`safe: service 维度无效: ${service}`);
  }
}

function assertUser(userId) {
  if (userId === undefined || userId === null || userId === '') {
    throw new Error('safe: userId 不能为空');
  }
}

/**
 * 开启二级认证时间窗（用户完成身份确认后由业务路由调用）
 * @param {number|string} userId 用户 ID
 * @param {string} service 二级认证业务维度（如 'change-password'/'bind-phone'）
 * @param {number} [safeTime=1800] 时间窗秒数
 * @returns {Promise<{openedAt:number, expireAt:number}>}
 */
async function openSafe(userId, service, safeTime = DEFAULT_SAFE_TIME) {
  assertUser(userId);
  assertService(service);
  const t = Number(safeTime);
  if (!Number.isFinite(t) || t <= 0) throw new Error(`safe: safeTime 必须为正数秒，收到 ${safeTime}`);

  const now = Date.now();
  const info = { openedAt: now, expireAt: now + t * 1000 };
  await store().set(`${userId}:${service}`, info, Math.ceil(t));
  emitAuthEvent(AUTH_EVENTS.SAFE_OPEN, { userId, service, expireAt: info.expireAt });
  log.info('🔓 [Safe] 开启二级认证: userId=%s, service=%s, safeTime=%ss', userId, service, t);
  return info;
}

/**
 * 读取认证窗信息（未开启返回 null）
 */
async function getSafeInfo(userId, service) {
  assertUser(userId);
  assertService(service);
  return store().get(`${userId}:${service}`);
}

/**
 * 是否处于二级认证时间窗内
 * @returns {Promise<boolean>}
 */
async function isSafe(userId, service) {
  try {
    const info = await getSafeInfo(userId, service);
    return !!(info && (info.expireAt === -1 || info.expireAt > Date.now()));
  } catch (err) {
    // fail-closed：读失败视为未开启（与文件头约定一致）
    log.warn(
      '[Safe] 认证窗读取失败（fail-closed 视为未开启）: userId=%s, service=%s, err=%s',
      userId,
      service,
      err?.message
    );
    return false;
  }
}

/**
 * 校验二级认证，未开启/已过期则抛 403（code=SECOND_AUTH_REQUIRED）
 * 前端收到后应引导用户完成身份确认，再调开启接口后重试
 * @throws {Error} code='SECOND_AUTH_REQUIRED'，details.service 供前端定位确认维度
 */
async function checkSafe(userId, service) {
  if (!(await isSafe(userId, service))) {
    const err = new Error(`该操作需要二次确认: ${service}`);
    err.code = 'SECOND_AUTH_REQUIRED';
    err.statusCode = 403;
    err.details = { service };
    throw err;
  }
}

/**
 * 结束二级认证（操作完成后主动关闭，缩短暴露窗；不等 TTL 自然过期）
 */
async function closeSafe(userId, service) {
  assertUser(userId);
  assertService(service);
  await store().delete(`${userId}:${service}`);
  emitAuthEvent(AUTH_EVENTS.SAFE_CLOSE, { userId, service });
  log.info('🔒 [Safe] 关闭二级认证: userId=%s, service=%s', userId, service);
}

/**
 * 获取剩余认证时间
 * @returns {Promise<number>} -1=未开启；其余=剩余秒数（向上取整）
 */
async function getSafeTime(userId, service) {
  const info = await getSafeInfo(userId, service);
  if (!info || (info.expireAt !== -1 && info.expireAt <= Date.now())) return -1;
  return Math.max(0, Math.ceil((info.expireAt - Date.now()) / 1000));
}

/**
 * 构造 Fastify preHandler：二级认证路由守卫
 *
 * 供 registerSecureRoute 的 `safe` 字段使用（注册为 preHandler 数组的第二环，
 * 排在 createGuard 之后 —— 守卫已确保 request.state.user 存在）。
 * 未登录用户理论上到不了这里（guard 已拦），仍做一次防御性检查。
 *
 * @param {string} service 二级认证业务维度
 * @returns {(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>}
 */
function createSafePreHandler(service) {
  assertService(service);
  return async (request, reply) => {
    const user = request.state?.user;
    if (!user?.userId) {
      const err = new Error('二级认证校验前必须先通过登录认证');
      err.code = 'SECOND_AUTH_REQUIRED';
      err.statusCode = 403;
      err.details = { service };
      throw err;
    }
    await checkSafe(user.userId, service);
  };
}

export { DEFAULT_SAFE_TIME, openSafe, isSafe, checkSafe, closeSafe, getSafeTime, getSafeInfo, createSafePreHandler };
