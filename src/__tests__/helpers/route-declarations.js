/**
 * 路由声明解析（测试用）
 *
 * 「关于路由的事实」现在有五种，都写在 `registerSecureRoute` 的 `config` 里：
 *
 * | 声明 | 含义 |
 * | --- | --- |
 * | `config.firewall.credentialRoute` | 该路由消费凭证 → 响应参与暴力破解计数 |
 * | `config.firewall.challengeSurface` | 该路由是挑战接口 → 任何状态下无条件可达 |
 * | `config.firewall.probeEndpoint` | 该路由是健康探针 → 任何状态下无条件可达 |
 * | `config.firewall.skipScanTrap` | 该路由的 403/404 是正常业务 |
 * | `config.riskExempt` | 该路由不参与「指纹变更拦截」 |
 *
 * 三种「声明 vs 路由」的对账测试（`login-brute-force-wiring` /
 * `challenge-surface-wiring` / `probe-endpoint-wiring`）都要读同一份东西，
 * 所以解析器集中在这里 —— 三份拷贝迟早会各自学会不同的读法。
 *
 * 为什么用 espree 而不是正则：`config: { firewall: { x: true } }` 是嵌套对象，
 * 正则数不清"这个 `true` 属于哪条路由"（`monitor.js` 里就有过这种假阳性）。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 仓库根（helpers 在 src/__tests__/helpers/ 下） */
const ROOT = path.resolve(HERE, '../../..');

/** 转成仓库内的相对路径（统一正斜杠，跨平台比对才稳） */
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

/** 取对象字面量里某个键的 value 节点 */
function propOf(node, key) {
  if (node?.type !== 'ObjectExpression') return undefined;
  return node.properties.find(p => p.type === 'Property' && p.key?.name === key)?.value;
}

/** 对象字面量 → { 键: 字面量值 }，非字面量值记 undefined */
function literalMap(node) {
  const out = {};
  if (node?.type !== 'ObjectExpression') return out;
  for (const p of node.properties) {
    if (p.type !== 'Property' || !p.key?.name) continue;
    out[p.key.name] = p.value?.type === 'Literal' ? p.value.value : undefined;
  }
  return out;
}

/**
 * 从源码里抽出所有 `registerSecureRoute(fastify, {...})` 的 url 与防火墙声明
 *
 * @param {string} file 文件绝对路径
 * @returns {Array<{file: string, url: string|undefined, firewall: Object, riskExempt: boolean}>}
 *   声明清单；`firewall` 是 `config.firewall` 的键值表（未声明时为 `{}`）
 */
function collectRouteDeclarations(file) {
  const ast = espree.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
    loc: true
  });
  const out = [];

  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);

    if (node.type === 'CallExpression' && node.callee?.name === 'registerSecureRoute') {
      const opts = node.arguments?.[1];
      const urlNode = propOf(opts, 'url');
      const configNode = propOf(opts, 'config');
      out.push({
        file: rel(file),
        url: urlNode?.type === 'Literal' ? urlNode.value : undefined,
        firewall: literalMap(propOf(configNode, 'firewall')),
        riskExempt: propOf(configNode, 'riskExempt')?.value === true
      });
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range') continue;
      visit(node[key]);
    }
  };

  visit(ast);
  return out;
}

/** 递归收集某个目录下所有 .js */
function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 全仓 `src/api` 的路由声明（对账测试的公共扫描面）
 *
 * 顶层求值一次即可：`src/api` 在一次测试运行里不会变。
 *
 * @returns {Array<{file: string, url: string|undefined, firewall: Object, riskExempt: boolean}>}
 */
const ALL_API_ROUTES = walkJs(path.join(ROOT, 'src/api')).flatMap(collectRouteDeclarations);

export { ROOT, rel, collectRouteDeclarations, walkJs, ALL_API_ROUTES };
