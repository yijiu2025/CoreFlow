import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const releaseSource = readFileSync(path.join(ROOT, 'scripts/release.mjs'), 'utf8');
const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');

// 加载真实发版模块但不执行 main；静态断言用于覆盖禁止实际执行的 git/tag 流程。
await import('../framework/release/index.js');

describe('release 自动元数据提交顺序', () => {
  it('写 CHANGELOG/package.json 后必须显式 add + commit，再从该提交创建 tag', () => {
    const applySection = releaseSource.slice(releaseSource.indexOf('// 3) 收尾'));
    const add = applySection.indexOf("git('add'");
    const commit = applySection.indexOf("git('commit'");
    const tag = applySection.indexOf("git('tag'");

    expect(add).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(add);
    expect(tag).toBeGreaterThan(commit);
  });

  it('dry-run 仍在任何自动文件写入之前返回', () => {
    const dryRunReturn = releaseSource.indexOf('if (!APPLY) {', releaseSource.indexOf('async function main()'));
    const metadataWrite = releaseSource.indexOf('// 3) 收尾：CHANGELOG');
    expect(dryRunReturn).toBeGreaterThanOrEqual(0);
    expect(metadataWrite).toBeGreaterThan(dryRunReturn);
  });
});

describe('Docker 可重复安装与最小写权限', () => {
  it('deps 阶段不拷 lockfile（workspace link 会导致悬空软链），用无 lock 安装并忽略脚本', () => {
    expect(dockerfile).not.toMatch(/COPY package\.json package-lock\.json \.\//);
    expect(dockerfile).toMatch(/RUN npm install --omit=dev --workspaces=false --ignore-scripts --legacy-peer-deps/);
  });

  it('node 用户只能写运行状态目录，不能拥有整棵源码', () => {
    expect(dockerfile).not.toContain('chown -R node:node /app');
    expect(dockerfile).toMatch(/chown -R node:node logs src\/data public\/uploads/);
  });
});
