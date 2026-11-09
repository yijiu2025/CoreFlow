/**
 * `src/utils/` 统一入口
 *
 * 全仓（`src/**` 与入口 `index.js`）一律 `import ... from '<相对路径>/utils/index.js'`，
 * 不再出现 `utils/colors.js` 这类具体文件路径。两个理由：
 *   1. 单个文件是**实现细节** —— 今天 `colors` 独立、明天并进 `terminal`，
 *      门面之外的代码不该跟着改 import；
 *   2. 出口收敛后才能用一条判据守住依赖方向（"只有 utils 自己能 import utils 的文件"），
 *      由 `src/__tests__/conventions/utils-entry.test.js` 机器检查 —— 否则半年后
 *      又会有人从 `utils/ip.js` 里 import `framework/*`，把叶子层变成中间层。
 *
 * ⚠️ 本目录内的文件**禁止**走门面互相引用（`cors.js` 不要 import `./index.js`）：
 * 门面 → 成员 → 门面 是环，拿到的会是未初始化的绑定。内部一律直连 `./xxx.js`。
 *
 * ⚠️ `ip.js` 是唯一 import `framework/support/log` 的成员（非法 CIDR 规则要留诊断），
 * 所以 `framework/support/log/**` 及其依赖**不得** import 本门面：否则形成
 * utils/index → ip → log → utils/index。目前 log 是零依赖叶子，由上面那条判据测试守着。
 *
 * 单元测试是唯一的例外：测哪个模块就 import 哪个文件（钉住被测代码，见
 * `conventions/test-effectiveness.test.js` 的「真实加载被测代码」要求）。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { C, IS_TTY } from './colors.js';
import { capMapSize } from './collections.js';
import { normalizeOrigin, parseOriginList, isOriginAllowed } from './cors.js';
import { encryptPhone, decryptPhone, maskPhone, isEncrypted } from './crypto.js';
import { normalizeIp, isIpMatch } from './ip.js';
import { looksLikeHtml, assertNotHtmlPayload } from './payload-guard.js';
import { DEFAULT_TRUST_PROXY, parseTrustProxy, describeProxyTrustRisk, formatProxyTrustRisks } from './proxy-trust.js';
import { parseCsvList } from './strings.js';
import { MAX_TIMEOUT_MS, resolveTimeoutMs } from './timeout.js';

export {
  C,
  IS_TTY,
  capMapSize,
  normalizeOrigin,
  parseOriginList,
  isOriginAllowed,
  encryptPhone,
  decryptPhone,
  maskPhone,
  isEncrypted,
  normalizeIp,
  isIpMatch,
  looksLikeHtml,
  assertNotHtmlPayload,
  DEFAULT_TRUST_PROXY,
  parseTrustProxy,
  describeProxyTrustRisk,
  formatProxyTrustRisks,
  parseCsvList,
  MAX_TIMEOUT_MS,
  resolveTimeoutMs
};
