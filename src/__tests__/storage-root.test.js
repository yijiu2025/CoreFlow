/**
 * 存储根位置的守卫：两个根必须在**仓库根**，`src/` 下不许再出现 public / storage
 *
 * 为什么专门写这条测试：
 * `preview.js` 曾经写 `path.resolve(__dirname, '../../../public/uploads/posecraft/previews')`，
 * 从 `src/app/posecraft/utils/` 数三级落在 `src/` —— 于是预览图被写进 `src/public`，
 * 而静态服务读的是仓库根 `public/`。结果是**预览图全部 404，且没有任何报错**：
 * 写入成功、目录也存在，只是没人会去那里读。这类 bug 单测抓不到（写文件不会失败），
 * 只能靠"这个相对路径解析到哪儿"来守。
 *
 * 检测两类写法（都是历史真实踩过的）：
 *   ① 一整串：`path.resolve(__dirname, '../../../public/x')`
 *   ② 分开给：`path.join(__dirname, '..', '..', 'public')`
 *
 * @author yijiu2025
 * @since 2026-11-04
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const REPO = path.resolve(SRC, '..');

const { PUBLIC_ROOT, PRIVATE_ROOT, REPO_ROOT } = await import('../framework/storage/index.js');

/** 运行期根目录名（放错位置会静默失效的那两个） */
const RUNTIME_ROOTS = ['public', 'storage'];

/**
 * 递归收集 src 下所有 .js（跳过 __tests__ 自身与 node_modules）
 *
 * @param {string} dir 绝对目录
 * @returns {string[]} 绝对文件路径
 */
function collectJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...collectJs(abs));
    } else if (entry.name.endsWith('.js')) {
      out.push(abs);
    }
  }
  return out;
}

/** 注释行不算（说明性注释里就写着反面示例） */
function isComment(raw) {
  const t = raw.trim();
  return t.startsWith('*') || t.startsWith('//') || t.startsWith('/*');
}

/**
 * 一串相对路径解析后会落到哪一层
 *
 * @param {number} depth 文件所在目录相对 src 的层数（src 根下文件 = 0）
 * @param {string} literal 形如 `../../../public/x` 的字面量
 * @returns {{layer: number, first: string}} layer: 0=src 内、-1=仓库根、-2=更上一层
 */
function simulate(depth, literal) {
  let layer = depth;
  for (const seg of literal.split('/')) {
    if (seg === '..') layer -= 1;
    else if (seg === '.' || seg === '') continue;
    else return { layer, first: seg };
  }
  return { layer, first: '' };
}

/**
 * 收集「把 public / storage 解析进 src」的行
 *
 * @returns {string[]} 违规位置（空数组 = 通过）
 */
function findBadDirnamePaths() {
  const offenders = [];

  for (const file of collectJs(SRC)) {
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    const depth = path.dirname(rel) === '.' ? 0 : path.dirname(rel).split('/').length;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((raw, i) => {
      if (isComment(raw) || !raw.includes('__dirname')) return;

      // ① 一整串字面量：从每个引号串里找 public / storage 段
      for (const m of raw.matchAll(/['"]([^'"\n]*?(?:public|storage)[^'"\n]*?)['"]/g)) {
        const literal = m[1];
        if (!literal.includes('/')) continue;
        const { layer, first } = simulate(depth, literal);
        if (RUNTIME_ROOTS.includes(first) && layer >= 0) {
          offenders.push(`${rel}:${i + 1} 解析到 src/${first}（应回退到仓库根）→ ${raw.trim()}`);
        }
      }

      // ② 分开给参数：`path.join(__dirname, '..', '..', 'public')`
      const hops = (raw.match(/['"]\.\.['"]/g) || []).length;
      for (const root of RUNTIME_ROOTS) {
        if (!new RegExp(`['"]${root}['"]`).test(raw)) continue;
        if (depth - hops >= 0) {
          offenders.push(`${rel}:${i + 1} 回退 ${hops} 级后仍在 src 内（需要 ≥ ${depth + 1}）→ ${raw.trim()}`);
        }
      }
    });
  }
  return offenders;
}

describe('存储根：必须在仓库根，不在 src/ 下', () => {
  it('PUBLIC_ROOT / PRIVATE_ROOT 指向仓库根的两个目录', () => {
    expect(REPO_ROOT).toBe(REPO);
    expect(PUBLIC_ROOT).toBe(path.join(REPO, 'public'));
    expect(PRIVATE_ROOT).toBe(path.join(REPO, 'storage'));
    // 反证：两者都不在 src 里（否则静态服务与挂卷的假设全部错位）
    expect(PUBLIC_ROOT.startsWith(SRC + path.sep)).toBe(false);
    expect(PRIVATE_ROOT.startsWith(SRC + path.sep)).toBe(false);
  });

  it('src/public 不存在（历史 bug 的产物，已迁进根 public/）', () => {
    const bugged = path.join(SRC, 'public');
    // 空目录不算违规；一旦有文件，说明又有人往 src 里写了运行期文件
    const files = fs.existsSync(bugged) ? fs.readdirSync(bugged) : [];
    expect(files).toEqual([]);
  });

  it('没有代码用 __dirname 把 public / storage 拼到 src 里（必须走 framework/storage）', () => {
    expect(findBadDirnamePaths()).toEqual([]);
  });

  it('没有代码用 process.cwd() 拼 public（依赖启动目录，换 cwd 就静默读不到）', () => {
    const offenders = [];
    for (const file of collectJs(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      const hit = lines.some(l => !isComment(l) && /process\.cwd\(\)[^;]*['"][^'"]*public[^'"]*['"]/.test(l));
      if (hit) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('守卫本身有效：能识别历史写法（三层深文件回退三级 = 落回 src）', () => {
    // 直接喂当年那行，防止守卫被改坏后永远绿
    const bad = simulate(3, '../../../public/uploads/posecraft/previews');
    expect(bad.first).toBe('public');
    expect(bad.layer).toBe(0); // 0 = 还在 src 内 ⇒ 就是当年那个 bug
    // 正确写法（回退 4 级 → 仓库根）
    expect(simulate(3, '../../../../public/x').layer).toBe(-1);
  });
});
