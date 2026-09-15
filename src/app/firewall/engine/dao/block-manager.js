/**
 * 封禁与白名单管理模块
 *
 * 提供 IP 和指纹（fingerprint）双维度的封禁、白名单 CRUD 操作，以及请求入口的全局封禁检查。
 * 存储与降级策略统一由 `util/redis.js` 访问层负责（Redis 优先，Redis 不可用时自动走内存），
 * 本模块只保留**策略**：状态判定优先级、状态码映射、Retry-After 计算。
 *
 * 存储结构（由访问层维护，key 布局与历史数据兼容）：
 *   - IP 封禁：     fw:block:{ip}        → JSON 元数据（临时封禁带 TTL，永久封禁无 TTL）
 *   - IP 封禁索引： fw:blocked:ips       → Hash（ip → JSON）
 *   - IP 白名单：   fw:whitelist:{ip}    → '1'（带 TTL）
 *   - IP 白名单索引：fw:whitelisted:ips  → Hash（ip → JSON）
 *   - 指纹封禁：    fw:block:fp:{fp}     → JSON 元数据
 *   - 指纹封禁索引：fw:blocked:fps       → Hash（fp → JSON）
 *   - 指纹白名单：  fw:whitelist:fp:{fp} → '1'（带 TTL）
 *   - 指纹白名单索引：fw:whitelisted:fps → Hash（fp → JSON）
 *
 * @author yijiu2025
 * @since 2026-08-17
 */
import { getConfig } from '../../util/shared.js';
import {
  readAccessState,
  writeBlock as writeBlockEntry,
  removeBlock as removeBlockEntry,
  writeWhitelist as writeWhitelistEntry,
  removeWhitelist as removeWhitelistEntry,
  listActive,
  redisAvailable,
  normalizeDuration,
  PERMANENT_RETRY_AFTER
} from '../../util/redis.js';

// ============== IP 封禁操作 ==============

/**
 * 设置 IP 封禁
 *
 * @param {string} ip 要封禁的 IP 地址
 * @param {object} metadata 封禁元数据
 * @param {string} metadata.status 封禁状态标识，如 'BLOCKED'、'SCANNER'、'CHALLENGE'
 * @param {string} [metadata.source='auto'] 封禁来源：'auto'（自动检测）| 'manual'（手动）
 * @param {boolean} [metadata.permanent=false] 是否永久封禁
 * @param {number} metadata.expiresAt 封禁过期时间戳（毫秒），permanent=true 时忽略
 * @returns {Promise<void>}
 */
async function setBlock(ip, metadata) {
  await writeBlockEntry({ ip }, metadata);
}

/**
 * 移除 IP 封禁（同时清理封禁键与 Hash 索引）
 *
 * @param {string} ip 要解封的 IP 地址
 * @returns {Promise<void>}
 */
async function removeBlock(ip) {
  await removeBlockEntry({ ip });
}

// ============== IP 白名单操作 ==============

/**
 * 设置 IP 白名单
 * 白名单内的 IP 跳过所有封禁检查，用于保护可信来源。
 *
 * @param {string} ip 要加入白名单的 IP 地址
 * @param {number} durationSeconds 白名单持续时间（秒）
 * @returns {Promise<void>}
 */
async function setWhitelist(ip, durationSeconds) {
  await writeWhitelistEntry({ ip }, normalizeDuration(durationSeconds));
}

/**
 * 移除 IP 白名单
 *
 * @param {string} ip 要移除白名单的 IP 地址
 * @returns {Promise<void>}
 */
async function removeWhitelist(ip) {
  await removeWhitelistEntry({ ip });
}

// ============== 指纹封禁操作 ==============

/**
 * 设置指纹封禁
 * 指纹维度的封禁，用于识别并拦截特定设备/浏览器组合。
 *
 * ⚠️ 准确描述（旧注释写「同一攻击者更换 IP 后，指纹仍可追踪」，与实现不符）：
 * `generateFingerprint` 的输入是 `ip|user-agent|accept-language|accept-encoding`，
 * 因此**换 IP 指纹就变**，改任一请求头指纹也变。指纹封禁实际等价于
 * 「这台机器 + 这个 IP + 这组请求头」，只能防「同一会话内切换 UA 试探」，
 * 不能跨 IP 追踪。跨 IP 追踪需要与 IP 无关的设备指纹（尚未实现）。
 *
 * @param {string} fingerprint 设备指纹（SHA256 哈希的前 16 位）
 * @param {object} metadata 封禁元数据，同 setBlock
 * @returns {Promise<void>}
 */
async function setBlockFp(fingerprint, metadata) {
  await writeBlockEntry({ fingerprint }, metadata);
}

/**
 * 移除指纹封禁
 *
 * @param {string} fingerprint 设备指纹
 * @returns {Promise<void>}
 */
async function removeBlockFp(fingerprint) {
  await removeBlockEntry({ fingerprint });
}

// ============== 指纹白名单操作 ==============

/**
 * 设置指纹白名单
 * 指纹白名单优先级最高，命中后直接放行，不再检查 IP 封禁。
 *
 * @param {string} fingerprint 设备指纹
 * @param {number} durationSeconds 白名单持续时间（秒）
 * @returns {Promise<void>}
 */
async function setWhitelistFp(fingerprint, durationSeconds) {
  await writeWhitelistEntry({ fingerprint }, normalizeDuration(durationSeconds));
}

/**
 * 移除指纹白名单
 *
 * @param {string} fingerprint 设备指纹
 * @returns {Promise<void>}
 */
async function removeWhitelistFp(fingerprint) {
  await removeWhitelistEntry({ fingerprint });
}

// 归一化有效期入参 `normalizeDuration` 直接自 `util/redis.js` 导入并对外 re-export：
// 保证「本模块暴露的 normalizeDuration」与「适配层实际用于计算 TTL 的实现」是同一个函数
// （两份内联副本会各改各的，历史上正是这类漂移掩盖过真实缺陷）。

// ============== 列表查询 ==============

/**
 * 获取所有活跃封禁记录（IP + 指纹）
 * 返回结果排序：临时封禁在前（按剩余时间升序），永久封禁在后。
 *
 * @returns {Promise<Array>} 封禁记录列表，每项包含 ip/fingerprint、type、remainingSeconds 等字段
 */
async function getActiveBlocks() {
  const { ip, fp } = await listActive('block');
  const now = Date.now();
  const out = ip.map(({ field, meta }) => ({
    ip: field,
    type: 'ip',
    ...meta,
    remainingSeconds: remainingSeconds(meta, now)
  }));
  for (const { field, meta } of fp) {
    out.push({
      fingerprint: field,
      type: 'fingerprint',
      ...meta,
      remainingSeconds: remainingSeconds(meta, now)
    });
  }
  return out.sort((a, b) => {
    const ap = a.permanent ? 1 : 0;
    const bp = b.permanent ? 1 : 0;
    if (ap !== bp) return ap - bp; // 永久封禁排最后
    return (a.remainingSeconds ?? Infinity) - (b.remainingSeconds ?? Infinity);
  });
}

/**
 * 获取所有活跃白名单记录（IP + 指纹）
 * 返回结果按剩余时间升序排序。
 *
 * @returns {Promise<Array>} 白名单记录列表，每项包含 ip/fingerprint、type、remainingSeconds
 */
async function getActiveWhitelist() {
  const { ip, fp } = await listActive('whitelist');
  const now = Date.now();
  const out = ip.map(({ field, meta }) => ({
    ip: field,
    type: 'ip',
    remainingSeconds: remainingSeconds(meta, now)
  }));
  for (const { field, meta } of fp) {
    out.push({ fingerprint: field, type: 'fingerprint', remainingSeconds: remainingSeconds(meta, now) });
  }
  return out.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
}

/**
 * 计算剩余秒数（永久条目返回 null）
 *
 * @param {object} meta 条目元数据
 * @param {number} now 当前时间戳（毫秒）
 * @returns {number|null} 剩余秒数
 */
function remainingSeconds(meta, now) {
  if (meta.permanent) return null;
  return Math.max(0, Math.ceil((meta.expiresAt - now) / 1000));
}

// ============== 全局封禁检查 ==============

/**
 * 全局封禁状态检查（请求入口处调用）
 *
 * 检查优先级（从高到低）：
 *   1. 指纹白名单 → 命中则直接放行
 *   2. IP 白名单   → 命中则直接放行
 *   3. 指纹封禁   → 命中则拒绝（403/429）
 *   4. IP 封禁     → 命中则拒绝（403/429）
 *   5. 手动黑名单  → Redis 不可用时的兜底检查
 *
 * 指纹优先的意图：指纹维度可以表达「这台机器 + 这组请求头」，比单一 IP 粒度更细，
 * 便于对「同一 IP 下切换 UA 试探」的会话单独处置（注意：指纹含 IP，**不具备**跨 IP 追踪能力）。
 *
 * 性能：四类状态由访问层用**一次 Lua**取回（旧实现是 2~4 次串行 GET + TTL），
 * 请求热路径上的 Redis 往返从最多 4 次降到 1 次。
 *
 * @param {string} ip 客户端 IP 地址
 * @param {string} [fingerprint] 设备指纹（可选）
 * @throws {Error} 被封禁时抛出异常，包含 statusCode 和 Retry-After 头
 * @returns {Promise<void>}
 */
const checkGlobalBlock = async (ip, fingerprint) => {
  const { fpWhitelisted, ipWhitelisted, fpBlock, ipBlock } = await readAccessState({ ip, fingerprint });

  if (fpWhitelisted || ipWhitelisted) return;

  if (fpBlock) throw buildBlockError(fpBlock);
  if (ipBlock) throw buildBlockError(ipBlock);

  // Redis 不可用时用配置文件中的手动黑名单兜底（Redis 模式下手动名单已同步进 Redis）
  if (!redisAvailable()) {
    const settings = getConfig().defense;
    if (settings.manualBlacklistIps?.includes(ip)) {
      const err = new Error('Manually blocked');
      err.statusCode = 403;
      err.headers = { 'Retry-After': String(PERMANENT_RETRY_AFTER) };
      throw err;
    }
  }
};

/**
 * 由封禁状态构造拒绝错误（统一 403/429 与 Retry-After 语义）
 *
 * 三种状态的语义必须区分清楚（旧实现只特判了 `SCANNER`，导致 `CHALLENGE` 被当成硬封禁）：
 *   - `SCANNER`   → 403，硬封禁（扫描器不配拿到挑战机会）
 *   - `CHALLENGE` → **不是拒绝**，而是 `isChallenge = true`，调用方应展示挑战页，让用户自证后放行
 *   - 其余        → 429，临时封禁 + `Retry-After`
 *
 * 历史缺陷：`CHALLENGE` 落到 429 分支后，挑战页刚刚渲染出来，下一次请求就被自己的封禁拦掉，
 * 连 `challenge/verify` 也是 429 → 用户被硬封 30 分钟且永远无法自解。
 *
 * @param {{status:string, ttlSec:number}} block 封禁状态
 * @returns {Error} 带 statusCode / headers / isChallenge 的错误
 */
function buildBlockError(block) {
  const status = block?.status;

  if (status === 'CHALLENGE') {
    const err = new Error('Challenge required');
    err.statusCode = 200;
    err.isChallenge = true;
    err.headers = { 'Retry-After': String(block.ttlSec || 60) };
    return err;
  }

  const isScanner = status === 'SCANNER';
  const err = new Error(isScanner ? 'Scanner blocked' : 'Access temporary denied');
  err.statusCode = isScanner ? 403 : 429;
  err.headers = { 'Retry-After': String(block.ttlSec || 60) };
  return err;
}

export {
  setBlock,
  removeBlock,
  setWhitelist,
  removeWhitelist,
  setBlockFp,
  removeBlockFp,
  setWhitelistFp,
  removeWhitelistFp,
  getActiveBlocks,
  getActiveWhitelist,
  checkGlobalBlock,
  normalizeDuration
};
