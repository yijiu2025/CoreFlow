/**
 * 日志用法契约测试
 *
 * 固化两条约定，防止历史事故重演：
 *  1. wb-logkit 的 AppLogger 实例**没有** stdout 成员。CLI / 脚本面向用户的裸输出
 *     必须用**顶层导出** logStdout(text)（无时间戳装饰、不受 LOG_LEVEL 门控）。
 *  2. scripts/migrate-console-to-log.js 的 CLI 映射表必须指向 logStdout。
 *
 * 背景：该一次性迁移脚本曾把 console.log/info 映射成 logger 实例上的 stdout 调用，
 * 而该符号在 wb-logkit 中从不存在（git 全历史无定义），导致全仓约 324 处调用
 * 在运行到输出语句时抛 "is not a function"。
 *
 * @author yijiu2025
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');

const SCAN_DIRS = ['src', 'migrations', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git', '__tests__', 'dist']);

/** 检测 logger 实例上的 stdout 调用（\s* 容忍各种书写间距） */
const BAD_CALL = /\blog\s*\.\s*stdout\s*\(/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (fs.existsSync(abs)) files.push(...walk(abs));
  }
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(path.join(ROOT, entry.name));
  }
  return files;
}

describe('日志用法契约', () => {
  test('logStdout 是顶层导出，而 logger 实例上不存在 stdout 成员', async () => {
    const { createLogger, logStdout } = await import('../../../framework/log/index.js');
    expect(typeof logStdout).toBe('function');

    const log = createLogger('contract.probe');
    expect(typeof log.stdout).toBe('undefined');
    for (const lv of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
      expect(typeof log[lv]).toBe('function');
    }
  });

  test('扫描范围有效（防止路径写错导致空扫描假通过）', () => {
    const files = collectFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(f => f.endsWith(path.join('src', 'framework', 'log', 'index.js')))).toBe(true);
  });

  test('全仓源码、迁移与脚本不出现 logger 实例的 stdout 调用', () => {
    const offenders = [];
    for (const file of collectFiles()) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (BAD_CALL.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
      });
    }
    expect(offenders.join('\n')).toBe('');
  });

  test('迁移脚本的 CLI 映射表指向 logStdout（不是实例上的 stdout）', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'migrate-console-to-log.js'), 'utf8');
    const block = src.match(/const REPLACEMENTS_CLI = \{([\s\S]*?)\};/);
    expect(block).not.toBeNull();
    expect(block[1]).toMatch(/log:\s*'logStdout'/);
    expect(block[1]).toMatch(/info:\s*'logStdout'/);
    expect(block[1]).not.toMatch(/log\.stdout/);
  });
});
