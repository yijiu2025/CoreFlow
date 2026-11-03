/**
 * src/config 分层守护测试
 *
 * 规则：`src/config/*.js` 是**配置值叶子模块** —— 只放数据与纯函数，
 * 禁止 import 任何 src 内代码（框架/应用/共享都不行）。
 *
 * 为什么必须机器守：配置值一旦反向依赖框架，framework → src/config 的单向
 * 依赖就会成环（ESM 循环引用在启动期报 TDZ / undefined，且极难定位）；
 * 同时叶子化保证任何层（framework / api / app）都能安全引用配置而不引入耦合。
 *
 * 机制类代码不属于这里：deepMerge、持久化读写、reader 注册等
 * 留在各自的 framework 目录（如 framework/firewall/config/persisted.js）。
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config');

/** 列出 src/config 下的所有 .js 文件 */
function listConfigFiles() {
  return readdirSync(CONFIG_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name);
}

describe('src/config 分层契约', () => {
  it('目录非空（防止路径写错导致本测试空跑）', () => {
    expect(listConfigFiles().length).toBeGreaterThan(0);
  });

  it('配置文件一律零 import（叶子模块，禁止反向依赖）', () => {
    const offenders = [];
    for (const name of listConfigFiles()) {
      const src = readFileSync(path.join(CONFIG_DIR, name), 'utf-8');
      // 只看真实的 import 语句，忽略注释里的文字
      const importLines = src
        .split(/\r?\n/)
        .filter(line => /^\s*import\s/.test(line) || /^\s*export\s+.*\sfrom\s+['"]/.test(line));
      if (importLines.length > 0) offenders.push(`${name}: ${importLines[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('配置文件必须至少导出一个名字（空文件视为误提交）', () => {
    const offenders = [];
    for (const name of listConfigFiles()) {
      const src = readFileSync(path.join(CONFIG_DIR, name), 'utf-8');
      if (!/export\s*\{/.test(src)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
