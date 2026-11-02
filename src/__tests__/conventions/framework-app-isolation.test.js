/**
 * 架构层 → 应用层隔离守卫
 *
 * 固化约定：`src/framework/` 下的代码**不得**静态 import `src/app/<X>/` 的模块 ——
 * framework 是架构层，app 必须可卸载（删除 `src/app/<X>/` 整个文件夹后端要能正常
 * 启动运行）。顶层静态 import 会让「删除 app 文件夹」直接变成启动崩溃。
 *
 * 允许的唯一形态：**存在性守卫 + 动态 import**（`import()`），且该边必须登记进
 * `ALLOWED_DYNAMIC_EDGES` 白名单（每条带业务理由）。守卫额外校验：
 *   - 白名单边在源码中必须真实存在且确实是**动态** import（防静态回归 / 幽灵豁免）；
 *   - 扫描范围有效（防路径写错空转）。
 *
 * 与 `app-isolation.test.js`（app ↔ app）对称，共同构成完整的可卸载性约束。
 *
 * @author yijiu2025
 * @since 2026-11-01
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FW_DIR = path.join(ROOT, 'framework');
const APP_DIR = path.join(ROOT, 'app');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 提取源码里的 import 边，区分静态与动态
 *
 * @param {string} src 源码文本
 * @returns {Array<{spec: string, dynamic: boolean}>}
 */
function extractImports(src) {
  const out = [];
  // 动态：import('spec') —— 先摘掉，避免被静态正则误判
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const stripped = src.replace(dynamicRe, (_m, spec) => {
    out.push({ spec, dynamic: true });
    return '';
  });
  // 静态：import ... from 'spec' / export ... from 'spec'
  const staticRe = /(?:^|[\s;}])import\s[^'"]*?from\s*['"]([^'"]+)['"]|export\s[^'"]*?from\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = staticRe.exec(stripped)) !== null) {
    out.push({ spec: m[1] || m[2], dynamic: false });
  }
  return out;
}

/** 把相对说明符解析成磁盘真实文件（.js / index.js 补全） */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [abs, `${abs}.js`, path.join(abs, 'index.js')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

const relFromFw = f => path.relative(FW_DIR, f).replace(/\\/g, '/');
const relToApp = f => path.relative(APP_DIR, f).replace(/\\/g, '/');

/** 动态 app 依赖白名单（单向边；新增必须写业务理由） */
const ALLOWED_DYNAMIC_EDGES = new Set([
  // （2026-11-02 起）05-firewall.js 不再依赖 app：配置读取已下沉
  // framework/firewall/config/persisted.js，依赖方向恢复单向（app → framework）。
  // 邮件的 SMTP 配置/模板 CRUD 在 notice 应用；notice 未安装时发信报清晰错误（见 email.js 注释）
  'notice/services/email.js -> notice/dao/notice.js'
]);

describe('架构层隔离守卫：framework 不得静态依赖 app', () => {
  const files = walk(FW_DIR);

  it('扫描范围有效（防止路径写错导致守卫空转）', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some(f => relFromFw(f) === 'loader/registry/05-firewall.js')).toBe(true);
    expect(files.some(f => relFromFw(f) === 'notice/services/email.js')).toBe(true);
  });

  it('framework/** 不得静态 import app/**（动态 import 必须在白名单中）', () => {
    const violations = [];

    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const { spec, dynamic } of extractImports(src)) {
        const target = resolveSpecifier(f, spec);
        if (!target || !target.startsWith(APP_DIR + path.sep)) continue;

        const edge = `${relFromFw(f)} -> ${relToApp(target)}`;
        if (!dynamic || !ALLOWED_DYNAMIC_EDGES.has(edge)) {
          violations.push(
            `${edge}${dynamic ? '（动态但未登记白名单）' : '（静态 import，必须改为存在性守卫 + 动态 import）'}`
          );
        }
      }
    }

    if (violations.length > 0) {
      const lines = [...new Set(violations)].map(v => `  - src/framework/${v}`).join('\n');
      throw new Error(
        `以下 framework → app 依赖不合法（app 必须可卸载，删除 app 文件夹后端要能正常启动）：\n${lines}\n\n` +
          `修法二选一：\n` +
          `  1) 消除依赖：把能力下沉 framework，或用「存在性守卫 + 动态 import」+ 登记白名单（参考 05-firewall.js）；\n` +
          `  2) 确属架构必须：先论证为什么这个 app 不能卸载，再改本测试。`
      );
    }
    expect(violations).toEqual([]);
  });

  it('白名单边必须真实存在且是动态 import（防静态回归与幽灵豁免）', () => {
    const problems = [];

    for (const edge of ALLOWED_DYNAMIC_EDGES) {
      const [srcRel, targetRel] = edge.split(' -> ');
      const srcFull = path.join(FW_DIR, srcRel);
      let found = false;
      if (fs.existsSync(srcFull)) {
        const src = fs.readFileSync(srcFull, 'utf8');
        found = extractImports(src).some(({ spec, dynamic }) => {
          if (!dynamic) return false;
          const target = resolveSpecifier(srcFull, spec);
          return target && relToApp(target) === targetRel;
        });
        // 静态形式存在也算「静态回归」——上面一条已报，这里只检查动态缺失
      }
      if (!found) problems.push(edge);
    }

    if (problems.length > 0) {
      const lines = problems.map(v => `  - ${v}`).join('\n');
      throw new Error(
        `以下白名单边在源码中不存在动态 import（可能被改回静态或已删除），请修正源码或清理白名单：\n${lines}`
      );
    }
    expect(problems).toEqual([]);
  });
});

// ============== 防护执行点接线钉子（2026-11-01 两层分离时补齐） ==============
//
// firewall 引擎上移 framework 后，两个「只写不执行」的历史缺口在同一轮补上了执行点。
// 这里用**源码接线断言**钉住（这类接线无法用单测驱动——需要完整登录/路由环境），
// 目的：防止将来有人删除调用点后，锁定/拉黑退回「写入后无人消费」的死状态。

describe('防护执行点接线（引擎 framework 化的配套）', () => {
  const readSrc = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  it('账号锁定执行点：oauth21 登录链必须消费 isAccountLocked（否则账号维度只写不执行）', () => {
    const src = readSrc('app/oauth21/services/login.service.js');
    // 静态 import 引擎检测器（app → framework，合法方向）
    expect(src).toMatch(
      /import\s*\{[^}]*isAccountLocked[^}]*\}\s*from\s*['"][^'"]*framework\/firewall\/engine\/detectors\/brute-force\.js['"]/
    );
    // 且在凭据校验前真实调用
    expect(src).toMatch(/await\s+isAccountLocked\s*\(/);
  });

  it('用户黑名单执行点：guard 必须消费 isUserManuallyBlocked（否则面板拉零效果）', () => {
    const src = readSrc('api/guard.js');
    expect(src).toMatch(
      /import\s*\{\s*isUserManuallyBlocked\s*\}\s*from\s*['"][^'"]*framework\/firewall\/block-manager\.js['"]/
    );
    expect(src).toMatch(/isUserManuallyBlocked\s*\(/);
  });

  it('遥测 sink：app store 注册接收器、引擎经 sink 产生事件（两层解耦的桥必须双向在位）', () => {
    expect(readSrc('app/firewall/data/store.js')).toMatch(/registerRecordSink\s*\(\s*pushRecord\s*\)/);
    expect(readSrc('app/firewall/index.js')).toMatch(/registerEmailAlertSender\s*\(/);
    const pipeline = readSrc('framework/firewall/engine/pipeline.js');
    expect(pipeline).toMatch(/recordFirewallEvent\s*\(/);
    expect(pipeline).not.toMatch(/from\s+'[^']*app\/firewall/);
  });
});
