/**
 * 封禁与白名单管理模块
 *
 * 提供 **IP / 请求指纹 / 设备 ID** 三个维度的封禁、白名单 CRUD 操作，以及请求入口的全局封禁检查。
 * 存储与降级策略统一由 `util/redis.js` 访问层负责（Redis 优先，Redis 不可用时自动走内存），
 * 本模块只保留**策略**：状态判定优先级、状态码映射、Retry-After 计算。
 *
 * 三个维度的分工（**这是理解本模块的关键**）：
 *   - `ip`          ：最粗，但永远可得。自动检测只封这一维度（成本最低、误伤可控）。
 *   - `fingerprint` ：`sha256(ip|ua|lang|enc)` 前 16 位 —— 输入含 IP，因此**换 IP 即变**，
 *                     改任一请求头也变。只能表达「这台机器 + 这个 IP + 这组请求头」。
 *   - `deviceId`    ：auth 结构化设备 ID（`WEB-DaBOSbNdSuc-8s4T`），**与 IP 无关** ——
 *                     本模块唯一能跨 IP 生效的身份。攻击者换个 IP 重来是常见手法，
 *                     自动封禁因此会**同时**写 IP 与设备两个维度（见 setBlockForSubject）。
 *
 * 存储结构（由访问层维护，key 布局与历史数据兼容）：
 *   - IP 封禁：       fw:block:{ip}          → JSON 元数据（临时封禁带 TTL，永久封禁无 TTL）
 *   - 指纹封禁：      fw:block:fp:{fp}       → JSON 元数据
 *   - 设备封禁：      fw:block:dev:{dev}     → JSON 元数据
 *   - 索引 Hash：     fw:blocked:ips / fw:blocked:fps / fw:blocked:devices
 *   - 白名单同构：    fw:whitelist:{ip|fp|dev} 与 fw:whitelisted:{ips|fps|devices}
 *
 * @author yijiu2025
 * @since 2026-08-17
 * @since 2026-09-15 新增设备维度（跨 IP 生效）与自动封禁的双维度镜像
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
 * 「这台机器 + 这个 IP + 这组请求头」，只能防「同一会话内切换 UA 试探」。
 * **要跨 IP 追踪请用设备维度**（`setBlockDevice`）—— 它才是与 IP 无关的身份。
 *
 * @param {string} fingerprint 请求指纹（SHA256 哈希的前 16 位）
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

// ============== 设备维度封禁 / 白名单操作 ==============

/**
 * 设置设备封禁（**跨 IP 生效**）
 *
 * 设备 ID 来自 auth 的结构化设备 ID 流程（`framework/auth/device.js`），与 IP 无关：
 * 同一台设备换网络后 ID 不变，因此这是唯一能拦住「换 IP 重来」的维度。
 *
 * @param {string} deviceId 结构化设备 ID（形如 WEB-DaBOSbNdSuc-8s4T）
 * @param {object} metadata 封禁元数据，同 setBlock
 * @returns {Promise<void>}
 */
async function setBlockDevice(deviceId, metadata) {
  await writeBlockEntry({ deviceId }, metadata);
}

/**
 * 移除设备封禁
 *
 * @param {string} deviceId 结构化设备 ID
 * @returns {Promise<void>}
 */
async function removeBlockDevice(deviceId) {
  await removeBlockEntry({ deviceId });
}

/**
 * 设置设备白名单（**跨 IP 生效**）
 *
 * 白名单优先级最高：设备被加白后，即使其 IP 段被自动封禁也会直接放行。
 *
 * @param {string} deviceId 结构化设备 ID
 * @param {number} durationSeconds 白名单持续时间（秒）
 * @returns {Promise<void>}
 */
async function setWhitelistDevice(deviceId, durationSeconds) {
  await writeWhitelistEntry({ deviceId }, normalizeDuration(durationSeconds));
}

/**
 * 移除设备白名单
 *
 * @param {string} deviceId 结构化设备 ID
 * @returns {Promise<void>}
 */
async function removeWhitelistDevice(deviceId) {
  await removeWhitelistEntry({ deviceId });
}

/**
 * 对一个「请求主体」同时写 IP 与设备两个维度的封禁
 *
 * 为什么必须两个都写：只封 IP 时，攻击者换一个出口 IP 就重来（家宽重播、移动网络、
 * 代理池成本都极低）。设备维度与 IP 无关，能把封禁延续到新 IP 上。
 *
 * 只在客户端**确实携带了校验通过的设备 ID** 时才写设备维度（调用方用
 * `getClientDeviceId` 取值）：拿不到就退回纯 IP 封禁，绝不拿服务端补发的临时 ID 当身份
 * —— 那种 ID 每请求都可能是新的，封了等于没封。
 *
 * 强度边界（诚实标注）：device_id 由客户端携带且不是凭证，清掉 localStorage 与 httpOnly
 * cookie 即可换一个新身份。因此这是**提高攻击成本**的措施，不是不可绕过的屏障；
 * IP 维度仍然保留，两个维度是叠加而不是替代关系。
 *
 * @param {{ip?:string, deviceId?:string}} subject 请求主体
 * @param {object} metadata 封禁元数据，同 setBlock
 * @returns {Promise<void>}
 */
async function setBlockForSubject(subject, metadata) {
  const ip = subject?.ip;
  const deviceId = subject?.deviceId;
  if (ip) await setBlock(ip, metadata);
  if (deviceId) await setBlockDevice(deviceId, metadata);
}

// 归一化有效期入参 `normalizeDuration` 直接自 `util/redis.js` 导入并对外 re-export：
// 保证「本模块暴露的 normalizeDuration」与「适配层实际用于计算 TTL 的实现」是同一个函数
// （两份内联副本会各改各的，历史上正是这类漂移掩盖过真实缺陷）。

// ============== 列表查询 ==============

/**
 * 把「同一维度的一组条目」摊平成对外记录
 *
 * @param {string} fieldName 该维度在记录里的字段名（'ip' | 'fingerprint' | 'deviceId'）
 * @param {string} type 该维度的类型标识（'ip' | 'fingerprint' | 'device'）
 * @param {Array<{field:string, meta:object}>} entries 访问层返回的条目
 * @param {number} now 当前毫秒时间戳
 * @returns {Array<object>} 展平后的记录
 */
function flattenDimension(fieldName, type, entries, now) {
  return entries.map(({ field, meta }) => ({
    [fieldName]: field,
    type,
    ...meta,
    remainingSeconds: remainingSeconds(meta, now)
  }));
}

/**
 * 获取所有活跃封禁记录（IP + 指纹 + 设备）
 * 返回结果排序：临时封禁在前（按剩余时间升序），永久封禁在后。
 *
 * @returns {Promise<Array>} 封禁记录列表，每项含 ip/fingerprint/deviceId 之一、type、remainingSeconds
 */
async function getActiveBlocks() {
  const { ip, fp, dev } = await listActive('block');
  const now = Date.now();
  const out = [
    ...flattenDimension('ip', 'ip', ip, now),
    ...flattenDimension('fingerprint', 'fingerprint', fp, now),
    ...flattenDimension('deviceId', 'device', dev, now)
  ];
  return out.sort((a, b) => {
    const ap = a.permanent ? 1 : 0;
    const bp = b.permanent ? 1 : 0;
    if (ap !== bp) return ap - bp; // 永久封禁排最后
    return (a.remainingSeconds ?? Infinity) - (b.remainingSeconds ?? Infinity);
  });
}

/**
 * 获取所有活跃白名单记录（IP + 指纹 + 设备）
 * 返回结果按剩余时间升序排序。
 *
 * @returns {Promise<Array>} 白名单记录列表，每项含 ip/fingerprint/deviceId 之一、type、remainingSeconds
 */
async function getActiveWhitelist() {
  const { ip, fp, dev } = await listActive('whitelist');
  const now = Date.now();
  const out = [
    ...flattenDimension('ip', 'ip', ip, now),
    ...flattenDimension('fingerprint', 'fingerprint', fp, now),
    ...flattenDimension('deviceId', 'device', dev, now)
  ];
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
 *   1. 设备 / 指纹 / IP 白名单 → 任一命中则直接放行
 *   2. 设备封禁 → 命中则拒绝（403/429）
 *   3. 指纹封禁 → 命中则拒绝（403/429）
 *   4. IP 封禁   → 命中则拒绝（403/429）
 *   5. 手动黑名单 → Redis 不可用时的兜底检查
 *
 * 维度顺序是「由精确到粗糙」：设备（与 IP 无关，跨网络稳定）> 指纹（含 IP）> IP。
 * 精确的维度命中时给出的处置更能说明问题（同一 IP 下多设备时尤其明显）。
 *
 * 性能：六类状态由访问层用**一次 Lua**取回（旧实现是 2~4 次串行 GET + TTL）。
 *
 * @param {string} ip 客户端 IP 地址
 * @param {string} [fingerprint] 请求指纹（可选）
 * @param {string} [deviceId] 设备 ID（可选；必须是客户端自报且校验通过的值）
 * @throws {Error} 被封禁时抛出异常，包含 statusCode 和 Retry-After 头
 * @returns {Promise<void>}
 */
const checkGlobalBlock = async (ip, fingerprint, deviceId) => {
  const { devWhitelisted, fpWhitelisted, ipWhitelisted, devBlock, fpBlock, ipBlock } = await readAccessState({
    ip,
    fingerprint,
    deviceId
  });

  if (devWhitelisted || fpWhitelisted || ipWhitelisted) return;

  if (devBlock) throw buildBlockError(devBlock);
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
  setBlockDevice,
  removeBlockDevice,
  setWhitelistDevice,
  removeWhitelistDevice,
  setBlockForSubject,
  getActiveBlocks,
  getActiveWhitelist,
  checkGlobalBlock,
  normalizeDuration
};
