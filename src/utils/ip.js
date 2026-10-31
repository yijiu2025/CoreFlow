/**
 * IP 工具集
 * 提供 IP 规范化、CIDR/通配符/IPV6 等多种规则的高性能匹配。
 *
 * @author Claude
 * @since 2026-07-13
 */
import net from 'net';
import { createLogger } from '../framework/log/index.js';

const log = createLogger('utils.ip');

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
    try {
      const [range, bitsStr] = cleanRule.split('/');
      const bits = parseInt(bitsStr, 10);
      const cleanRange = normalizeIp(range);

      const type = net.isIPv6(cleanRange) ? 'ipv6' : 'ipv4';
      const clientType = net.isIPv6(cleanIp) ? 'ipv6' : 'ipv4';

      if (type !== clientType) {
        return false;
      }

      // 按规则缓存 BlockList（见 getBlockList 注释：这是逐请求分配的热路径）
      return getBlockList(cleanRange, bits, type).check(cleanIp, type);
    } catch (err) {
      log.error('IP CIDR 匹配规则错误:', err);
      return false;
    }
  }

  return false;
}

export { normalizeIp, isIpMatch };
