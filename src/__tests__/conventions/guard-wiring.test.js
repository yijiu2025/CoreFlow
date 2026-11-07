/**
 * 守卫接线契约测试：`allowRoles` / `requirePermission` 必须引用**真实存在**的标识
 *
 * 为什么需要它
 * ─────────────
 * 2026-11-07 的全量审计发现两类**完全静默**的接线错误，症状都是"接口对所有人 403"，
 * 而代码、日志、类型检查全都正常：
 *
 *   1. 28 处 `allowRoles: ['admin']` —— 全仓**从来没有** `code='admin'` 的角色
 *      （admin 应用用 `admin_admin` / `admin_operator` / `admin_viewer`）。
 *      于是整个 `/admin/**` 与 `/notice/**` 连 superadmin 都进不去。
 *   2. 4 个 `permission: '的码'`（`iam:role:assign`、`iam:policy:update`、
 *      `posecraft:analysis:use|view`）—— 注册表里根本没有这些动作，
 *      于是 AI 分析、IAM 授权对真实用户全 403（只有持 `*` 的 superadmin 能过）。
 *
 * 这两类错误的共同点：**判据是字符串**，没有任何编译期/运行期校验。守卫配置里
 * 少写一个角色 / 权限码拼错，只会表现为"这个接口永远 403"，排查方向极易跑偏。
 *
 * 规则（与运行期语义严格对齐）
 * ────────────────────────────
 * - 角色：`guard.js` 用 `userRoles.includes(r)`，**精确匹配**（不支持通配）。
 * - 权限：`isWildcardMatch(allows 中的 pattern, required)`，pattern 里的 `*` 可通配。
 *   因此静态校验等价于：存在一个已定义的权限码 D，使 D 能匹配该字面量
 *   （D 自身含 `*` 时按通配处理，例如 `fw:*` 覆盖 `fw:config:write`）。
 *
 * 只校验**字符串字面量**：`permission: ADMIN_PERMISSIONS.ROLE.ASSIGN` 这类常量引用
 * 由注册表保证正确性（拼错会直接抛 TypeError），不在本测试的射程内。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 匹配语义直接用**运行时那份实现**（而不是在测试里抄一份）：
// 既保证判据与 guard.js 一致，也让本文件满足"测试必须真实加载被测代码"的守卫。
import { isWildcardMatch } from '../../framework/security/auth/permission/wildcard-match.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'src');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__tests__']);

/** 递归列出 .js 文件 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 通配匹配：直接用运行时实现（`framework/security/auth/permission/wildcard-match.js`）
 *
 * 不在测试里另抄一份的原因：本仓历史上正是"两份实现语义漂移"出过事
 * （stp-util 的正则不转义元字符、guard 的只支持尾部 `:*`）。测试若抄一份，
 * 修的就不是同一个东西了。
 */
const wildcardMatch = isWildcardMatch;

/**
 * 去掉注释（保留长度与换行，行号/偏移不变）
 *
 * 必须做：文件头注释里写"本组原先写 allowRoles: ['admin']"是**说明**，不是声明。
 * 不剥注释会把历史说明当成违规（第一次跑就误报了 7 条注释）。
 *
 * @param {string} src 源码
 * @returns {string} 等长的"仅代码"文本
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/** 收集所有已定义的角色码 */
function collectRoleCodes() {
  const codes = new Set(['superadmin']); // setup-superadmin.js 建立，不在 app/*/permission 里
  for (const file of walk(SRC)) {
    if (!file.endsWith(`${path.sep}roles.js`)) continue;
    if (!file.includes(`${path.sep}permission${path.sep}`)) continue;
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/code:\s*'([^']+)'/g)) codes.add(m[1]);
  }
  return codes;
}

/** 收集所有已定义的权限码（只扫权限注册表目录，避免把错误码/事件名混进来） */
function collectPermissionCodes() {
  const codes = new Set();
  for (const file of walk(path.join(SRC, 'app'))) {
    if (!file.includes(`${path.sep}permission${path.sep}`)) continue;
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    if (!src.includes('createPermissionRegistry')) continue;
    for (const m of src.matchAll(/code:\s*'([^']+)'/g)) codes.add(m[1]);
  }
  return codes;
}

/** 收集路由里的 allowRoles 字面量与 permission 字面量 */
function collectRouteDeclarations() {
  const roles = [];
  const perms = [];
  for (const file of walk(path.join(SRC, 'api'))) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');

    for (const m of src.matchAll(/allowRoles:\s*\[([^\]]*)\]/g)) {
      const entries = m[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      for (const raw of entries) {
        const quoted = raw.match(/^'([^']*)'$/) || raw.match(/^"([^"]*)"$/);
        // 只校验字符串字面量；变量/常量引用交给运行时
        if (quoted) roles.push({ value: quoted[1], file: rel, line: lineOf(src, m.index) });
      }
    }

    for (const m of src.matchAll(/(?:requirePermission|permission):\s*'([^']+)'/g)) {
      perms.push({ value: m[1], file: rel, line: lineOf(src, m.index) });
    }
  }
  return { roles, perms };
}

/** 由字符偏移算行号（报错直接指到行，便于修） */
function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

describe('守卫接线契约：角色码 / 权限码必须真实存在', () => {
  const roleCodes = collectRoleCodes();
  const permCodes = collectPermissionCodes();
  const { roles, perms } = collectRouteDeclarations();

  test('已收集到角色码与权限码（防止扫描本身失效导致"空集恒通过"）', () => {
    expect(roleCodes.size).toBeGreaterThan(10);
    expect(permCodes.size).toBeGreaterThan(50);
    expect(roles.length).toBeGreaterThan(10);
  });

  test('allowRoles 引用的每个角色都必须已定义（否则该路由对所有人 403）', () => {
    const offenders = roles
      .filter(r => r.value && !roleCodes.has(r.value))
      .map(r => `${r.file}:${r.line}  角色 "${r.value}" 不存在`);

    expect(offenders).toEqual([]);
  });

  test('requirePermission 引用的每个权限码都必须能被某个已定义码匹配', () => {
    const defined = [...permCodes];
    const offenders = perms
      .filter(p => !defined.some(code => wildcardMatch(code, p.value)))
      .map(p => `${p.file}:${p.line}  权限码 "${p.value}" 未定义`);

    expect(offenders).toEqual([]);
  });
});
