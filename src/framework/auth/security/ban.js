/**
 * 账号封禁（framework/auth）
 *
 * service 维度 + 时限 + 阶梯等级的账号级封禁，对标 Java Sa-Token 的 disable/disableLevel：
 * - 与 User.status 的分工：status=0 是**全局永久硬禁用**（DB 权威，登录与既有会话全拦）；
 *   本模块是**可定时的细分维度软封禁**（如只封登录、只封访问、按等级阶梯处罚），
 *   Redis 原生 TTL 到期自动解封，适合临时处罚（违规禁言 7 天、风控限制 1 小时等）。
 * - 封禁语义与 Sa-Token 一致：封 'login' 只阻止**新登录**，既有会话不自动失效
 *   （需立即下线由管理端 kickUser 配合）；封 'access' 则在请求认证阶段拦截。
 *
 * Redis 设计：
 * - 明细键 `<userId>:<service>` → { level, reason, operator, bannedAt, expireAt }，
 *   TTL=封禁时长（永久封禁用 10 年 TTL 兜底，不用无 TTL 键——防 untie 丢失后永锁）。
 * - expireAt 存在值内（ms 时间戳），getDisableTime 直接计算剩余，无需额外 TTL 探测。
 * - 请求路径的未封禁负缓存（进程内 30s）：封禁操作主动失效本进程缓存；
 *   多进程部署下解封最迟 30s 生效（与 userStore 状态缓存同数量级，可接受）。
 * - Redis 故障 fail-open（视为未封禁 + warn）：此时会话系统本身已不可用，
 *   封禁检查不构成额外攻击面（与全仓 Redis 降级哲学一致）。
 *
 * 依赖方向：只依赖 redis/log/events，**不 import session.js**（createSession /
 * getSession 反向调用本模块，单向无环）。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import { getStore } from '../../redis/index.js';
import { createLogger } from '../../log/index.js';
import { AUTH_EVENTS, emitAuthEvent } from '../audit/events.js';

const log = createLogger('framework.auth.ban');

/** 内置封禁服务维度：登录（createSession 前置校验） */
const BAN_SERVICE_LOGIN = 'login';
/** 内置封禁服务维度：API 访问（getSession 请求级校验） */
const BAN_SERVICE_ACCESS = 'access';

/** 永久封禁的 expireAt 哨兵值 */
const PERMANENT = -1;
/** 永久封禁的 Redis TTL 兜底（10 年）：不用无 TTL 键，防 untie 丢失后永锁 */
const PERMANENT_TTL = 10 * 365 * 24 * 60 * 60;
/** 请求路径"未封禁"负缓存时长（秒） */
const NEGATIVE_CACHE_TTL = 30;

/** auth:ban 命名空间实例（惰性初始化：import 本模块零 Redis 副作用） */
let _store = null;
function store() {
  if (!_store) _store = getStore('auth_ban');
  return _store;
}

/** 未封禁负缓存：`userId:service` → 缓存到期 ms（进程内） */
const notBannedCache = new Map();

/** service 维度合法性：防调用方把任意字符串当 service 撑爆键空间 */
function assertService(service) {
  if (!service || typeof service !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(service)) {
    throw new Error(`ban: service 维度无效: ${service}`);
  }
}

/** 失效某用户的负缓存（disable/untie 时调用） */
function invalidateCache(userId) {
  const prefix = `${userId}:`;
  for (const key of notBannedCache.keys()) {
    if (key.startsWith(prefix)) notBannedCache.delete(key);
  }
}

/**
 * 读取封禁明细（未封禁返回 null）
 * @param {number|string} userId 用户 ID
 * @param {string} service 服务维度
 * @returns {Promise<{level:number, reason:string, operator:*, bannedAt:number, expireAt:number}|null>}
 */
async function getBanInfo(userId, service) {
  assertService(service);
  try {
    return await store().get(`${userId}:${service}`);
  } catch (err) {
    log.warn(
      '[Ban] 封禁明细读取失败（fail-open 视为未封禁）: userId=%s, service=%s, err=%s',
      userId,
      service,
      err?.message
    );
    return null;
  }
}

/**
 * 封禁账号的指定服务
 * @param {number|string} userId 用户 ID
 * @param {string} service 服务维度（'login'/'access'/业务自定义如 'comment'）
 * @param {number} time 封禁秒数；-1 = 永久；<=0 且非 -1 视为参数错误
 * @param {object} [opts]
 * @param {string} [opts.reason=''] 处罚原因（进审计/管理端展示）
 * @param {number} [opts.level=0] 封禁等级（阶梯封禁用，0=普通封禁）
 * @param {*} [opts.operator=null] 操作者（管理端调用时传管理员标识）
 * @returns {Promise<object>} 写入的封禁明细
 */
async function disable(userId, service, time, { reason = '', level = 0, operator = null } = {}) {
  assertService(service);
  if (!Number.isFinite(Number(time))) throw new Error(`ban: time 必须是秒数或 -1，收到 ${time}`);
  const t = Number(time);
  if (t !== PERMANENT && t <= 0) throw new Error(`ban: time 必须为正数秒或 -1（永久），收到 ${time}`);

  const now = Date.now();
  const info = {
    level: Number(level) || 0,
    reason,
    operator,
    bannedAt: now,
    expireAt: t === PERMANENT ? PERMANENT : now + t * 1000
  };
  await store().set(`${userId}:${service}`, info, t === PERMANENT ? PERMANENT_TTL : t);
  invalidateCache(userId);
  emitAuthEvent(AUTH_EVENTS.ACCOUNT_BAN, { userId, service, ...info });
  log.warn(
    '⛔ [Ban] 账号封禁: userId=%s, service=%s, time=%s, level=%s, reason=%s',
    userId,
    service,
    t,
    info.level,
    reason
  );
  return info;
}

/**
 * 阶梯封禁：按等级处罚（等级语义由业务定义，如 1=禁言1天 2=禁言7天 3=永封）
 * @param {number|string} userId 用户 ID
 * @param {string} service 服务维度
 * @param {number} level 封禁等级（>=1）
 * @param {number} time 封禁秒数（-1 = 永久）
 * @param {object} [opts] 同 disable
 */
async function disableLevel(userId, service, level, time, opts = {}) {
  if (!Number.isInteger(Number(level)) || Number(level) < 1) {
    throw new Error(`ban: 阶梯封禁 level 必须为 >=1 的整数，收到 ${level}`);
  }
  return disable(userId, service, time, { ...opts, level: Number(level) });
}

/**
 * 解封
 * @param {number|string} userId 用户 ID
 * @param {...string} services 要解封的服务维度（变参；不传=抛错防误全解）
 * @returns {Promise<number>} 实际解封的服务数
 */
async function untieDisable(userId, ...services) {
  if (services.length === 0) throw new Error('ban: untieDisable 必须指定至少一个 service');
  let n = 0;
  for (const service of services) {
    assertService(service);
    try {
      await store().delete(`${userId}:${service}`);
      n++;
    } catch (err) {
      log.warn('[Ban] 解封失败: userId=%s, service=%s, err=%s', userId, service, err?.message);
    }
  }
  invalidateCache(userId);
  emitAuthEvent(AUTH_EVENTS.ACCOUNT_UNTIE, { userId, services });
  log.warn('✅ [Ban] 账号解封: userId=%s, services=%j', userId, services);
  return n;
}

/**
 * 是否被封禁（不区分等级）
 * @returns {Promise<boolean>}
 */
async function isDisable(userId, service) {
  return (await getBanInfo(userId, service)) !== null;
}

/**
 * 获取剩余封禁时间
 * @returns {Promise<number>} -2=未封禁；-1=永久；其余=剩余秒数（向上取整）
 */
async function getDisableTime(userId, service) {
  const info = await getBanInfo(userId, service);
  if (!info) return -2;
  if (info.expireAt === PERMANENT) return PERMANENT;
  return Math.max(0, Math.ceil((info.expireAt - Date.now()) / 1000));
}

/**
 * 获取封禁等级
 * @returns {Promise<number>} -1=未封禁；其余=当前等级
 */
async function getDisableLevel(userId, service) {
  const info = await getBanInfo(userId, service);
  return info ? info.level : -1;
}

/**
 * 构造封禁错误（code 供调用方分支判定，message 仅给人看）
 */
function banError(code, message, detail) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = 403;
  err.details = detail;
  return err;
}

/**
 * 校验未被封禁，被封禁抛 403（code=ACCOUNT_BANNED）
 * @param {...string} services 逐一校验的服务维度
 * @throws {Error} code='ACCOUNT_BANNED'，details 含首个命中的 service/level/剩余时间
 */
async function checkDisable(userId, ...services) {
  for (const service of services) {
    const info = await getBanInfo(userId, service);
    if (!info) {
      // 未封禁：登记负缓存（请求路径热读，30s 内不再打 Redis）
      notBannedCache.set(`${userId}:${service}`, Date.now() + NEGATIVE_CACHE_TTL * 1000);
      continue;
    }
    throw banError('ACCOUNT_BANNED', `账号已被封禁: ${service}`, {
      service,
      level: info.level,
      reason: info.reason,
      expireAt: info.expireAt,
      remaining: info.expireAt === PERMANENT ? PERMANENT : Math.ceil((info.expireAt - Date.now()) / 1000)
    });
  }
}

/**
 * 校验封禁等级是否达到指定级别，达到则抛 403（code=ACCOUNT_BAN_LEVEL）
 * @param {number} level 要求的等级阈值（当前等级 >= 阈值即触发）
 */
async function checkDisableLevel(userId, service, level) {
  const info = await getBanInfo(userId, service);
  if (info && Number.isInteger(Number(level)) && info.level >= Number(level)) {
    throw banError('ACCOUNT_BAN_LEVEL', `账号封禁等级不足: ${service}`, {
      service,
      level: info.level,
      required: Number(level)
    });
  }
}

/**
 * 判断封禁等级是否达到指定级别
 * @returns {Promise<boolean>}
 */
async function isDisableLevel(userId, service, level) {
  const info = await getBanInfo(userId, service);
  return !!(info && Number.isInteger(Number(level)) && info.level >= Number(level));
}

export {
  BAN_SERVICE_LOGIN,
  BAN_SERVICE_ACCESS,
  disable,
  disableLevel,
  untieDisable,
  isDisable,
  checkDisable,
  getDisableTime,
  getDisableLevel,
  checkDisableLevel,
  isDisableLevel
};
