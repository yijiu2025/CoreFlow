/**
 * IP 地址判据（规范化 + CIDR / 通配符 / IPv6 匹配）
 *
 * 为什么住在 `framework/ingress/net/`（2026-11-09 从 `utils/` 迁入）：
 * 它的两个消费方（`api/guard.js` 的 allowIps、防火墙的封禁/挑战）都在**接入边界**上，
 * 而且它是全仓唯一会写诊断日志的"工具"——`utils/` 是零依赖叶子层，不能反向依赖
 * `framework/support/log`。放到 ingress 下，`utils` 的门面才能保持纯净（可被任何层 import），
 * 这条不变量由 `__tests__/conventions/utils-entry.test.js` 守着。
 *
 * 它判的是一条只能由服务端决定的边界：`request.ip` 已经被 `trustProxy` 影响过
 * （见 `utils/proxy-trust.js`），这里再把它与白名单/CIDR 规则比对。
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
import net from 'node:net';
import { createLogger } from '../../support/log/index.js';

const log = createLogger('framework.ingress.net.ip');

/**
 * 非法规则只在**第一次**出现时记一条日志
 *
 * 为什么需要：`isIpMatch` 在守卫与防火墙的逐请求热路径上，配置里写错一条 CIDR
 * （如 `192.168.1.0/99`）会让每个请求都打一条 error —— 5 分钟内就能把日志刷满，
 * 真正的问题反而被淹掉。用例集合本身就是有限配置，记一次足够定位。
 */
const BAD_RULE_WARN_LIMIT = 64;
const warnedBadRules = new Set();

/**
 * @param {string} rule 原始规则串
 * @param {Error} [err] addSubnet 抛出的原始错误
 */
function warnBadRule(rule, err) {
  if (warnedBadRules.has(rule) || warnedBadRules.size >= BAD_RULE_WARN_LIMIT) return;
  warnedBadRules.add(rule);
  log.error(`[IP] 非法 CIDR 规则，已按「恒不匹配」处理: "${rule}"${err ? `（${err.message}）` : ''}`);
}

/**
 * 规范化 IP 地址，主要是处理并消除 IPv4-mapped IPv6 前缀 (例如 "::ffff:192.168.1.1" -> "192.168.1.1")
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  if (typeof ip !== 'string') return '';
  let clean = ip.trim();
  if (clean.startsWith('::ffff:')) {
    clean = clean.substring(7);
  }
  return clean;
}

/**
 * CIDR 规则的 BlockList 缓存
 *
 * 为什么缓存：`isIpMatch` 位于守卫与防火墙的**热路径**上（每个请求都会过），
 * 原实现对每次调用都 `new net.BlockList()` + `addSubnet()` —— 逐请求分配对象，
 * 在高 QPS 下是纯浪费的 GC 压力。规则集合是有限且基本不变的，按规则串缓存即可。
 *
 * 上限保护：规则来自配置，理论上有限；仍设上限防止异常配置把内存撑爆。
 */
const BLOCKLIST_CACHE_MAX = 512;
const blockListCache = new Map();

/**
 * 取一条 CIDR 规则对应的 BlockList（带缓存）
 * @param {string} range 归一化后的网段地址
 * @param {number} bits 前缀长度
 * @param {'ipv4'|'ipv6'} type 协议族
 * @returns {net.BlockList}
 */
function getBlockList(range, bits, type) {
  const key = `${type}|${range}/${bits}`;
  const cached = blockListCache.get(key);
  if (cached) return cached;

  const blockList = new net.BlockList();
  blockList.addSubnet(range, bits, type);

  if (blockListCache.size >= BLOCKLIST_CACHE_MAX) {
    // 满了就清空重建：这些规则是幂等的，清掉只会多一次分配，不会影响正确性
    blockListCache.clear();
  }
  blockListCache.set(key, blockList);
  return blockList;
}

/**
 * IPv4 点分通配符匹配（'192.168.1.*'、'192.168.*.1'）
 *
 * 为什么不能直接用 `startsWith(前缀)`：`192.168.*.1` 的前缀是 `192.168.`，
 * 于是 `192.168.55.1`、`192.168.2.1` 全被放行 —— allowIps 白名单会比写的更宽。
 * 这里按**段**逐一比对：`*` 只吃掉一段，段数必须对得上（规则段数少于客户端时按前缀段比）。
 *
 * @param {string} ip 客户端 IP（已归一化）
 * @param {string} rule 含 `*` 的规则
 * @returns {boolean}
 */
function isWildcardMatch(ip, rule) {
  const ipSegs = ip.split('.');
  const ruleSegs = rule.split('.');

  // 规则段数多于客户端（如 '1.2.3.4.5'）→ 不可能匹配
  if (ruleSegs.length > ipSegs.length) return false;
  // 规则不以 '*' 结尾却段数更少（如 '192.168'）→ 语义模糊，按前缀段比对仍然成立，
  // 但要求客户端也是 IPv4 形态（段数 4）
  for (let i = 0; i < ruleSegs.length; i++) {
    const seg = ruleSegs[i];
    if (seg === '*') continue;
    if (seg !== ipSegs[i]) return false;
  }
  return true;
}

/**
 * 高性能 IP 匹配引擎，同时支持 IPv4 和 IPv6 及其对应的 CIDR、通配符和精确匹配。
 * @param {string} clientIp - 客户端 IP 地址
 * @param {string} rule - IP 匹配规则，支持：
 *   - '*' 或 '0.0.0.0/0' 或 '::/0' 匹配所有 IP
 *   - 精确匹配（如 '192.168.1.1' 或 '2001:db8::1'）
 *   - 通配符（如 '192.168.1.*'、'192.168.*.1'）仅适用于 IPv4，按段比对
 *   - CIDR 子网（如 '192.168.1.0/24' 或 '2001:db8::/32'）
 * @returns {boolean}
 */
function isIpMatch(clientIp, rule) {
  if (!clientIp || !rule) return false;

  const cleanIp = normalizeIp(clientIp);
  const cleanRule = rule.trim();

  // 1. 全通配符匹配
  if (cleanRule === '*' || cleanRule === '0.0.0.0/0' || cleanRule === '::/0') {
    return true;
  }

  // 2. 精确匹配
  if (cleanIp === cleanRule) {
    return true;
  }

  // 3. 通配符模式匹配（仅针对 IPv4，例如 '192.168.1.*' / '192.168.*.1'）
  if (cleanRule.includes('*')) {
    if (net.isIPv6(cleanIp)) return false; // 通配符规则不适用于 IPv6
    return isWildcardMatch(cleanIp, cleanRule);
  }

  // 4. CIDR 规则匹配
  if (cleanRule.includes('/')) {
    const slash = cleanRule.lastIndexOf('/');
    const cleanRange = normalizeIp(cleanRule.slice(0, slash));
    const bitsStr = cleanRule.slice(slash + 1);

    const type = net.isIPv6(cleanRange) ? 'ipv6' : 'ipv4';
    const clientType = net.isIPv6(cleanIp) ? 'ipv6' : 'ipv4';

    if (type !== clientType) {
      return false;
    }

    // 前缀长度必须**整串都是数字**且在协议族范围内。
    // 旧实现用 `parseInt('24abc', 10) === 24`，会把写错的规则静默当成合法规则用（比报错更危险）；
    // `/99` 这类越界值则在 addSubnet 里抛错，一个请求刷一条日志。
    const maxBits = type === 'ipv6' ? 128 : 32;
    const bits = /^\d{1,3}$/.test(bitsStr) ? Number(bitsStr) : NaN;
    if (!Number.isInteger(bits) || bits > maxBits) {
      warnBadRule(cleanRule);
      return false;
    }

    // 按规则缓存 BlockList（见 getBlockList 注释：这是逐请求分配的热路径）
    try {
      return getBlockList(cleanRange, bits, type).check(cleanIp, type);
    } catch (err) {
      // 网段地址本身非法（如 `abc/24`）：交给 warnBadRule 记一次，之后静默按不匹配处理
      warnBadRule(cleanRule, err);
      return false;
    }
  }

  return false;
}

export { normalizeIp, isIpMatch };
