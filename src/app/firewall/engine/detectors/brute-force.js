/**
 * 登录暴力破解检测
 * 账号维度 + IP 维度双重防护，触发后锁定账号并挑战 IP
 *
 * 优化点：旧实现用 `redisClient.pipeline()`（ioredis API，node-redis 下不存在）清计数、
 * 用 `eval(script, 1, key, arg)`（v5 已改为 `eval(script, { keys, arguments })`）计数，
 * 两处在真实 Redis 上都会抛错 —— 登录失败计数实际处于**完全失效**状态。
 * 现在统一走访问层：`bumpCounter`（单 Lua 原子 INCR+EXPIRE）/ `removeCounters` / `setFlag`。
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getConfig } from '../../util/shared.js';
import { readAccessState, bumpCounter, removeCounters, setFlag, hasFlag, rel } from '../../util/redis.js';
import { setBlockForSubject } from '../../dao/block-manager.js';
import { notifyAttack } from '../auto-responder.js';
import { createLogger } from '../../../../framework/log/index.js';

const log = createLogger('app.firewall.engine.detectors.brute-force');

// 不再在日志里硬编码 ANSI 颜色：这些字符串会原样落进 logs/ 的 .log 文件，
// 污染归档与 grep 结果。控制台着色交给终端/CLI 层处理。

/**
 * 登录暴力破解检测
 *
 * 命中后写的是「IP + 设备」两个维度（`setBlockForSubject`）：只封 IP 时攻击者换个出口
 * 就重来，而爆破是典型的自动化攻击 —— 它会带着同一个设备 ID 换 IP 继续。
 *
 * @param {string} ip 客户端 IP
 * @param {string} [username] 尝试登录的账号
 * @param {boolean} success 本次登录是否成功（成功则清零失败计数）
 * @param {string|null} [deviceId] 设备 ID（客户端未携带合法值时传 null）
 * @returns {Promise<void>}
 */
const checkLoginBruteForce = async (ip, username, success, deviceId = null) => {
  const settings = getConfig().defense;
  if (!settings.enableBruteForce) return;

  const bruteLimit = settings.bruteLimit || 5;
  const bruteWindow = settings.bruteWindow || 300;
  const accountLockTime = settings.accountLockTime || 900;
  const ipBlockTime = settings.ipBlockTime || 600;
  const ipLimit = settings.bruteIpLimit || 10;

  if (success) {
    await removeCounters([rel.bruteIp(ip), ...(username ? [rel.bruteUser(username)] : [])]);
    return;
  }

  const subject = { ip, deviceId: settings.enableDeviceBlock === false ? null : deviceId };

  // 已被封禁则不再累计（避免被封禁期间继续刷新计数）
  const state = await readAccessState({ ip, fingerprint: null, deviceId: subject.deviceId });
  if (state.ipBlock || state.devBlock) return;

  const [ipCount, userCount] = await Promise.all([
    bumpCounter(rel.bruteIp(ip), bruteWindow),
    username ? bumpCounter(rel.bruteUser(username), bruteWindow) : Promise.resolve(0)
  ]);

  const now = Date.now();

  if (ipCount >= ipLimit) {
    await setBlockForSubject(subject, {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      createdAt: now,
      expiresAt: now + ipBlockTime * 1000
    });
    log.warn(`⚠️ [Firewall] 暴力破解(IP): ${ip} 失败 ${ipCount}次, 挑战 ${ipBlockTime}秒`);
    await notifyAttack(ip, 'brute_force', { scope: 'ip', ipCount, blockedSeconds: ipBlockTime });
    return;
  }

  if (username && userCount >= bruteLimit) {
    await setFlag(rel.accountLock(username), accountLockTime);
    // 锁定后立刻清空该账号的失败计数：否则计数持续处于「已超限」状态，
    // 攻击者每发一次失败请求都会重新 setFlag → 锁定被无限续期，
    // 一个已知账号可以被低成本地永久锁死（DoS）。清空后必须重新攒够 bruteLimit 次。
    await removeCounters([rel.bruteUser(username)]);
    await setBlockForSubject(subject, {
      status: 'CHALLENGE',
      source: 'auto',
      permanent: false,
      createdAt: now,
      expiresAt: now + ipBlockTime * 1000
    });
    log.warn(
      `⚠️ [Firewall] 暴力破解(账号): ${username} 失败 ${userCount}次, ` +
        `锁定 ${accountLockTime}秒, IP ${ip} 挑战 ${ipBlockTime}秒`
    );
    await notifyAttack(ip, 'brute_force', {
      scope: 'account',
      username,
      userCount,
      accountLockSeconds: accountLockTime,
      blockedSeconds: ipBlockTime
    });
  }
};

/**
 * 账号是否处于锁定状态
 *
 * @param {string} username 账号
 * @returns {Promise<boolean>} 是否锁定
 */
const isAccountLocked = async username => {
  if (!username) return false;
  return hasFlag(rel.accountLock(username));
};

export { checkLoginBruteForce, isAccountLocked };
