/**
 * 应用层隔离守卫
 *
 * 固化约定：`src/app/<appA>/` 下的代码**不得 import 另一个应用** `src/app/<appB>/`
 * 的模块 —— 跨应用调用会把两个应用的部署/裁剪耦死（裁掉 B 应用 A 就跑不起来）。
 *
 * 例外走显式白名单（`ALLOWED_EDGES`），每条边必须是：
 *   - 有注释说明业务理由的单向依赖（A → B，反向仍然禁止）；
 *   - 真实存在于源码中（本守卫会反向校验白名单条目，防止留一堆「幽灵豁免」）。
 *
 * 本文件是**结构守卫**：只读源文件文本做静态断言，不 import 任何被测模块
 * （已登记进 test-effectiveness 的 STRUCTURAL_GUARD_WHITELIST）。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '../../app');

/** 应用目录集合（src/app/ 的一级子目录） */
function listApps() {
  return fs
    .readdirSync(APP_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 跨应用白名单（单向边）
 *
 * key: `<源文件相对 src/app 的路径> -> <目标模块相对 src/app 的路径>`
 * 新增条目必须附业务理由（写在下方注释或目标 import 处）。
 */
const ALLOWED_EDGES = new Set([
  // oauth21 登录要通知 user 域撤销该用户的全部会话（注销中登录的特殊分支）
  'oauth21/services/login.service.js -> user/services/deactivation.service.js',
  // user DAO 需要复用 admin 的 IAM 数据访问（角色/权限同源，避免复制查询逻辑）
  'user/dao/user.js -> admin/dao/iam.dao.js',
  // 防火墙自动响应触发告警邮件，复用 notice 的邮件服务（动态 import，通知失败不影响拦截）
  'firewall/engine/auto-responder.js -> notice/services/email.js'
]);

/** 提取源码里全部 import/export-from 的模块说明符 */
function extractImportSpecs(src) {
  const specs = [];
  const re = /(?:^|[\s;}])import\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|export\s[^'"]*?from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    specs.push(m[1] || m[2] || m[3]);
  }
  return specs;
}

const relFromApp = f => path.relative(APP_DIR, f).replace(/\\/g, '/');

/**
 * 解析一个 import 说明符，若指向「另一个应用」则返回跨应用边
 *
 * @param {string} srcFile 源文件绝对路径
 * @param {string} spec import 说明符（仅处理相对路径；包名/别名不可能是跨应用）
 * @param {Set<string>} apps 应用名集合
 * @returns {string|null} 形如 `a/file.js -> b/mod.js` 的边，或 null
 */
function resolveCrossAppEdge(srcFile, spec, apps) {
  if (!spec.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(srcFile), spec);
  const rel = relFromApp(resolved);
  const [fromApp] = relFromApp(srcFile).split('/');
  const [toApp] = rel.split('/');
  if (!apps.has(toApp) || toApp === fromApp) return null;
  return `${relFromApp(srcFile)} -> ${rel}`;
}

describe('应用层隔离守卫', () => {
  const apps = new Set(listApps());
  const files = walk(APP_DIR);

  it('应当扫描到应用层源文件（防止路径写错导致守卫空转）', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('跨应用 import 必须出现在显式白名单中（单向边）', () => {
    const violations = [];

    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const spec of extractImportSpecs(src)) {
        const edge = resolveCrossAppEdge(f, spec, apps);
        if (edge && !ALLOWED_EDGES.has(edge)) {
          violations.push(edge);
        }
      }
    }

    if (violations.length > 0) {
      const lines = [...new Set(violations)].map(v => `  - src/app/${v}`).join('\n');
      throw new Error(
        `以下跨应用 import 未在白名单中（跨应用耦合必须显式声明为单向边）：\n${lines}\n\n` +
          `修法二选一：\n` +
          `  1) 消除耦合：把共享逻辑下沉到 src/framework/ 或 src/shared/；\n` +
          `  2) 确属必要的单向依赖：加入 ALLOWED_EDGES 并写明业务理由（反向边仍然禁止）。`
      );
    }

    expect(violations).toEqual([]);
  });

  it('白名单条目必须真实存在（防止豁免失效后无人清理）', () => {
    const stale = [];

    for (const edge of ALLOWED_EDGES) {
      const [srcRel, targetRel] = edge.split(' -> ');
      const srcFull = path.join(APP_DIR, srcRel);
      let found = false;
      if (fs.existsSync(srcFull)) {
        const src = fs.readFileSync(srcFull, 'utf8');
        found = extractImportSpecs(src).some(spec => {
          if (!spec.startsWith('.')) return false;
          const resolved = relFromApp(path.resolve(path.dirname(srcFull), spec));
          return resolved.replace(/\\/g, '/') === targetRel.replace(/\\/g, '/');
        });
      }
      if (!found) stale.push(edge);
    }

    if (stale.length > 0) {
      const lines = stale.map(v => `  - ${v}`).join('\n');
      throw new Error(`以下白名单边在源码中已不存在（幽灵豁免），请从 ALLOWED_EDGES 删除：\n${lines}`);
    }

    expect(stale).toEqual([]);
  });
});
