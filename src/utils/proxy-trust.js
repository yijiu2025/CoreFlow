/**
 * 反向代理信任网段工具
 *
 * 这组判据守的是一条**看不见的边界**：`trustProxy` 里的每一条网段，其来源都可以
 * **自定义 `X-Forwarded-For`**，于是 `request.ip` 变成攻击者可填的字符串。而
 * `request.ip` 是下面三件事的唯一判据：
 *   1. `allowIps` 守卫白名单（`src/api/guard.js`）
 *   2. `@fastify/rate-limit` 的 `keyGenerator`（`rate:ip:*`）
 *   3. 防火墙按 IP 的封禁与挑战（`fw:blocked:ips`）
 * 网段写得越宽，等于越多来源能自证"我是任意 IP"，且这三层同时失效却**没有任何报错**。
 *
 * 从 `src/app.js` 抽出（2026-11-07）：入口文件只该留编排，判据本体属于通用工具，
 * 抽出来后可以脱离 Fastify / 环境变量单独驱动，测试也不必再为了导入它去 mock 静态插件。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import { parseCsvList } from './strings.js';

/** 未配置 `PROXY_TRUST_CIDR` 时的默认信任范围：仅本机回环 */
const DEFAULT_TRUST_PROXY = ['127.0.0.1', '::1'];

/**
 * 解析 `PROXY_TRUST_CIDR` 环境变量
 *
 * - 未配置 / 空串 → 回环默认值（应用层不信任任意代理）
 * - 逗号分隔，去空白；全为空白项时同样回退默认值（避免把 `' , '` 解析成 ['','']
 *   交给 Fastify，那会让启动期抛一条难以定位的信任网段错误）
 *
 * @param {string|undefined|null} raw - 原始环境变量值
 * @returns {string[]} 可直接交给 Fastify `trustProxy` 的地址/网段列表
 */
function parseTrustProxy(raw) {
  // 解析规则与 CORS 白名单同一份（utils/strings.js）：去空白、丢空项、空配置回退默认值。
  // 回退值是「仅回环」而不是「信任全部」—— 宁可代理不生效（日志里 502 立刻暴露），
  // 也不能默认把 IP 维度让给攻击者。
  return parseCsvList(raw, { fallback: DEFAULT_TRUST_PROXY });
}

/**
 * 判断一条信任网段是否「宽到把 IP 维度让给攻击者」
 *
 * 判据（只报「明显过宽」，避免正常部署天天告警）：
 *   - `0.0.0.0/0` / `::/0`：信任全部来源 —— 等于关掉 IP 维度，必报；
 *   - IPv4 前缀 ≤ 12（如 `172.16.0.0/12` 覆盖 100 万地址）、IPv6 前缀 ≤ 32：必报；
 *   - 单个主机地址（无 `/`）：永远安全，不报。
 *
 * @param {string[]} entries - `trustProxy` 的取值
 * @returns {string[]} 每一条过宽网段的说明；空数组表示没有风险
 */
function describeProxyTrustRisk(entries) {
  const risks = [];
  for (const raw of entries || []) {
    const entry = String(raw).trim();
    if (!entry) continue;

    const slash = entry.lastIndexOf('/');
    if (slash === -1) continue; // 单主机地址，不存在"整段可伪造"的问题

    const addr = entry.slice(0, slash);
    const prefix = Number(entry.slice(slash + 1));
    if (!Number.isInteger(prefix) || prefix < 0) continue; // 非法写法交给 Fastify 报错

    const isV6 = addr.includes(':');
    const maxPrefix = isV6 ? 128 : 32;
    if (prefix > maxPrefix) continue;

    if (prefix === 0) {
      risks.push(`"${entry}" 信任了全部来源（/${prefix}），等价于关闭 IP 维度防护`);
      continue;
    }
    const tooWide = isV6 ? prefix <= 32 : prefix <= 12;
    if (tooWide) {
      risks.push(
        `"${entry}" 覆盖约 2^${maxPrefix - prefix} 个地址，` +
          `其中任何来源都能自定义 X-Forwarded-For 并冒充任意客户端 IP`
      );
    }
  }
  return risks;
}

/**
 * 把风险条目渲染成一条可直接落日志的告警文本
 *
 * 单独抽出来的原因：文案里带着「修法」，属于运维可读性的一部分，
 * 不该散落在入口文件里被后续改动顺手删掉。
 *
 * @param {string[]} risks - `describeProxyTrustRisk` 的返回值
 * @returns {string} 空字符串表示无风险（调用方无需判空逐个渲染）
 */
function formatProxyTrustRisks(risks) {
  if (!Array.isArray(risks) || risks.length === 0) return '';
  return (
    `⚠️ [Proxy] PROXY_TRUST_CIDR 过宽，IP 白名单 / 限流 / 封禁可被 X-Forwarded-For 绕过：\n` +
    risks.map(r => `   - ${r}`).join('\n') +
    `\n   修法：只填反向代理的确切地址（如 172.18.0.2/32），不要填整个网段。`
  );
}

export { DEFAULT_TRUST_PROXY, parseTrustProxy, describeProxyTrustRisk, formatProxyTrustRisks };
