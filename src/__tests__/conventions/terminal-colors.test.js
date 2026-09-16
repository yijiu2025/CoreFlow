/**
 * 终端颜色契约测试：`src/` 的启动日志必须走统一的 `utils/colors.js`
 *
 * 为什么要有这条契约：
 * 日志库（wb-logkit）只给自己生成的**前缀**（时间 / 级别 / 标签）上色，
 * 消息体 `record.msg` 是原样拼接的 —— 也就是说**颜色由调用方自己负责**。
 * 于是每个写启动日志的文件都面临同一个问题：非交互式终端
 * （docker / pm2 / 重定向到文件 / CI）下该不该输出 `\x1b[31m`？
 *
 * 历史上这个判断被抄了多份且抄漏了：
 *   - 根目录 `index.js` 自己定义了一份 `C`，只给 2 处做了 TTY 降级，
 *     另外 4 处（chcp 失败、关闭超时、已安全关闭、关闭异常）在非 TTY 下泄漏转义序列；
 *   - `src/` 下 16 个文件裸拼颜色码，无一降级。
 * 现在统一由 `src/utils/colors.js` 按 TTY 决定 `C.xxx` 的取值，
 * 调用方**直接插值**即可，不得自行判断 isTTY、不得自建颜色表。
 *
 * ⚠️ 例外：`src/framework/cli/table.js` 自带一套更完整的调色板（含 bold / 背景色），
 * 供 CLI 表格渲染使用。CLI 本就运行在终端中，属独立关注点，暂不纳入。
 *
 * @author yijiu2025
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from '@jest/globals';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SRC = path.join(ROOT, 'src');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__tests__', 'docs']);

/** 颜色常量的唯一出处 */
const COLORS_MODULE = path.join(SRC, 'utils', 'colors.js');

/** 允许自带调色板的例外文件（相对 ROOT 的 posix 路径） */
const ALLOW_EXCEPTIONS = new Set(['src/framework/cli/table.js']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

/** 读取所有待检查的源码文件（排除例外与 colors.js 自身） */
function collectTargets() {
  return walk(SRC)
    .filter(f => rel(f) !== 'src/utils/colors.js')
    .filter(f => !ALLOW_EXCEPTIONS.has(rel(f)))
    .map(f => ({ file: f, rel: rel(f), src: fs.readFileSync(f, 'utf8') }));
}

const TARGETS = collectTargets();

describe('终端颜色契约', () => {
  it('样本非空：确实扫描到了源码文件（否则下面的断言可能空跑）', () => {
    expect(TARGETS.length).toBeGreaterThan(100);
  });

  it('除例外外，src/ 下不得出现裸 ANSI 转义字面量', () => {
    // 匹配 '\x1b[' 或 '\u001b[' 两种写法
    const RAW_ANSI = /\\x1b\[|\\u001b\[/;
    const offenders = TARGETS.filter(t => RAW_ANSI.test(t.src)).map(t => t.rel);

    expect(offenders).toEqual([]);
  });

  it('除例外外，src/ 下不得自行定义颜色表（含 reset + 多个前景色）', () => {
    // 自建颜色表的特征：同时出现 reset 与至少两个 3x 前景色码字面量
    const RESET = /\\x1b\[0m|\\u001b\[0m/;
    const FG_COUNT = /\\x1b\[3[0-7]m|\\u001b\[3[0-7]m/g;

    const offenders = TARGETS.filter(t => {
      if (!RESET.test(t.src)) return false;
      const fg = t.src.match(FG_COUNT) || [];
      return new Set(fg).size >= 2;
    }).map(t => t.rel);

    expect(offenders).toEqual([]);
  });

  it('使用 C.xxx 的文件都必须从 utils/colors.js 导入 C', () => {
    const USES_C = /\bC\.(reset|red|green|yellow|cyan|dim|bold)\b/;
    const IMPORTS_C = /import\s*\{[^}]*\bC\b[^}]*\}\s*from\s*['"][^'"]*utils\/colors\.js['"]/;

    const offenders = TARGETS.filter(t => USES_C.test(t.src) && !IMPORTS_C.test(t.src)).map(t => t.rel);

    expect(offenders).toEqual([]);
  });

  it('colors.js 是 TTY 自适应的：非 TTY 下所有颜色为空串', () => {
    const src = fs.readFileSync(COLORS_MODULE, 'utf8');

    // 必须存在 TTY 判断
    expect(src).toMatch(/isTTY/);

    // 必须存在"TTY 取原码 / 否则空串"的降级包装
    expect(src).toMatch(/IS_TTY\s*\?\s*s\s*:\s*''/);

    // 所有颜色键都必须经 code(...) 包装（裸字面量会给非 TTY 泄漏转义序列）
    const keys = ['reset', 'green', 'yellow', 'red', 'cyan', 'dim'];
    const wrapped = keys.filter(k => new RegExp(`${k}:\\s*code\\(`).test(src));
    expect(wrapped).toEqual(keys);
  });

  // ---------------------------------------------------------------------------
  // 反例验证：证明上面的检测器"真的会红"，而不是恒真的空断言。
  // 结构性断言的结论不能来自可能写坏了的检测器 —— 每条规则都要植入违规确认命中。
  // ---------------------------------------------------------------------------
  describe('检测器自带反例（否则上面的"全绿"可能是假通过）', () => {
    const RAW_ANSI = /\\x1b\[|\\u001b\[/;
    const RESET = /\\x1b\[0m|\\u001b\[0m/;
    const FG_COUNT = /\\x1b\[3[0-7]m|\\u001b\[3[0-7]m/g;
    const USES_C = /\bC\.(reset|red|green|yellow|cyan|dim|bold)\b/;
    const IMPORTS_C = /import\s*\{[^}]*\bC\b[^}]*\}\s*from\s*['"][^'"]*utils\/colors\.js['"]/;

    it('裸 ANSI 字面量规则：能命中植入的违规', () => {
      const bad = "const C = { red: '\\x1b[31m' };";
      expect(RAW_ANSI.test(bad)).toBe(true);
      // 合规写法不命中
      expect(RAW_ANSI.test("const C = { red: code('\\x1b[31m') };")).toBe(true); // 字面量本身仍在
      expect(RAW_ANSI.test("import { C } from './colors.js';")).toBe(false);
    });

    it('自建颜色表规则：能命中植入的违规', () => {
      const bad = "const C = { reset: '\\x1b[0m', red: '\\x1b[31m', green: '\\x1b[32m' };";
      const fg = bad.match(FG_COUNT) || [];
      expect(RESET.test(bad)).toBe(true);
      expect(new Set(fg).size).toBeGreaterThanOrEqual(2);
    });

    it('导入来源规则：能区分"用了 C 但没导入"与"正常导入"', () => {
      const bad = 'log.info(`${C.red}失败${C.reset}`);';
      expect(USES_C.test(bad)).toBe(true);
      expect(IMPORTS_C.test(bad)).toBe(false);

      const good = "import { C } from '../../utils/colors.js';\nlog.info(`${C.red}失败${C.reset}`);";
      expect(USES_C.test(good)).toBe(true);
      expect(IMPORTS_C.test(good)).toBe(true);

      // 从别处导入同名 C 不算合规
      const wrongSource = "import { C } from './my-colors.js';\nlog.info(`${C.red}x${C.reset}`);";
      expect(IMPORTS_C.test(wrongSource)).toBe(false);
    });
  });
});
