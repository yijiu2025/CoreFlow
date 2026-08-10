/**
 * IP 工具集
 * 提供 IP 规范化、CIDR/通配符/IPV6 等多种规则的高性能匹配。
 *
 * @author Claude
 * @since 2026-07-13
 */
import net from 'net';

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
 * 高性能 IP 匹配引擎，同时支持 IPv4 和 IPv6 及其对应的 CIDR、通配符和精确匹配。
 * @param {string} clientIp - 客户端 IP 地址
 * @param {string} rule - IP 匹配规则，支持：
 *   - '*' 或 '0.0.0.0/0' 或 '::/0' 匹配所有 IP
 *   - 精确匹配（如 '192.168.1.1' 或 '2001:db8::1'）
 *   - 通配符（如 '192.168.1.*'）仅适用于 IPv4
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

  // 3. 通配符模式匹配（仅针对 IPv4，例如 '192.168.1.*'）
  if (cleanRule.includes('*')) {
    const prefix = cleanRule.split('*')[0];
    return cleanIp.startsWith(prefix);
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

      // 使用 Node.js 的 BlockList (Node.js >= 15.0.0)
      const blockList = new net.BlockList();
      blockList.addSubnet(cleanRange, bits, type);
      return blockList.check(cleanIp, type);
    } catch (err) {
      console.error('IP CIDR 匹配规则错误:', err);
      return false;
    }
  }

  return false;
}

export { normalizeIp, isIpMatch };
