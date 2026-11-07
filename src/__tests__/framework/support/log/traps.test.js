/**
 * traps.js（进程级异常钩子）回归测试
 *
 * 钉住三条曾经出过问题 / 一旦改坏就很难在本地发现的行为：
 *
 *  1. **同一份崩溃堆栈只能出现一次**。历史实现先 `log.fatal`（格式化写 stderr）
 *     再 `fs.writeSync(2, ...)` 裸写兜底，结果 docker 日志里每条崩溃都是双份
 *     （格式化一条 + 裸写一条）。现在只在"控制台通道被关掉"时才裸写。
 *  2. **退出码非 0，且退出前 stderr 已落盘**。用 `process.stderr.write('', cb)` 做
 *     flush 屏障，取代原来的"盲等 100ms"。
 *  3. **非 Error 的 Promise 拒绝保留原值**。历史实现 `new Error(String(reason))`
 *     造出的 stack 指向 traps.js 自己，真实抛出位置丢失。
 *
 * 这三个都必须起子进程验证：钩子的效果体现在"进程怎么死"上，在 jest 进程里调用
 * 会直接把测试跑挂。子进程 cwd 指到临时目录，避免污染仓库 logs/。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from '@jest/globals';

import { initLogErrorTraps } from '../../../../framework/support/log/traps.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAPS = path.join(HERE, '../../../../framework/support/log/traps.js');
const TRAPS_URL = pathToFileURL(TRAPS).href;

/** 子进程临时目录（每个用例一个，结束时统一清理） */
const tmpDirs = [];

/**
 * 起一个装了钩子的子进程跑 body，返回退出码与两路输出。
 *
 * @param {string} body - 追加在 `initLogErrorTraps()` 之后的脚本正文
 * @param {Object<string,string>} [env] - 覆盖到子进程的环境变量
 * @returns {{status: number|null, stdout: string, stderr: string, dir: string}}
 */
function runChild(body, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-traps-'));
  tmpDirs.push(dir);
  const script = `import { initLogErrorTraps } from ${JSON.stringify(TRAPS_URL)};\ninitLogErrorTraps();\n${body}`;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      LOG_CONSOLE: 'true',
      LOG_PRETTY: 'true',
      // 故意关掉全局文件通道：traps 的 logger 自带 file 配置，崩溃日志必须照样落盘
      LOG_FILE: 'false',
      ...env
    }
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', dir };
}

/**
 * 读取临时目录里落盘的日志记录（process-*.log / process-error-*.log 都算）。
 *
 * @param {string} dir - 子进程 cwd
 * @returns {Array<object>} 解析成功的记录数组（坏行忽略）
 */
function readLogRecords(dir) {
  const logsDir = path.join(dir, 'logs');
  if (!fs.existsSync(logsDir)) return [];
  const records = [];
  for (const name of fs.readdirSync(logsDir)) {
    if (!name.startsWith('process-') || !name.endsWith('.log')) continue;
    const text = fs.readFileSync(path.join(logsDir, name), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        // 非 JSON 行（不该出现）：忽略
      }
    }
  }
  return records;
}

/** 统计子串出现次数（不区分大小写更宽松，这里保持精确匹配） */
function countOf(text, needle) {
  return text.split(needle).length - 1;
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('initLogErrorTraps — uncaughtException', () => {
  it('只打一份堆栈、退出码 1、且崩溃记录仍然落盘（不受 LOG_FILE=false 影响）', () => {
    const { status, stderr, dir } = runChild("setTimeout(() => { throw new Error('boom-traps'); }, 10);");

    expect(status).toBe(1);
    // 核心回归点：同一份堆栈打两遍的解药 —— 格式化输出有 stack，裸写兜底没有
    expect(countOf(stderr, 'Error: boom-traps')).toBe(1);
    expect(stderr).not.toContain('[process] FATAL');
    // 全局 file 通道是关的，但进程级 fatal 必须留档
    expect(readLogRecords(dir).some(r => r.level === 'fatal' && r.tag === 'process')).toBe(true);
  });

  it('非 pretty（生产 JSON）下 stderr 恰好一条可解析的 fatal 记录', () => {
    const { status, stderr } = runChild("setTimeout(() => { throw new Error('boom-json'); }, 10);", {
      LOG_PRETTY: 'false'
    });

    expect(status).toBe(1);
    const lines = stderr.split('\n').filter(line => line.trim());
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.level).toBe('fatal');
    expect(record.tag).toBe('process');
    expect(record.err.message).toBe('boom-json');
  });

  it('控制台通道关闭时补一条同步 stderr，保证容器里不是“什么都没留下”', () => {
    const { status, stderr } = runChild("setTimeout(() => { throw new Error('boom-quiet'); }, 10);", {
      LOG_CONSOLE: 'false'
    });

    expect(status).toBe(1);
    expect(stderr).toContain('[process] FATAL');
    expect(countOf(stderr, 'Error: boom-quiet')).toBe(1);
  });
});

describe('initLogErrorTraps — unhandledRejection', () => {
  it('记录后进程继续运行（不退出，exit code 0）', () => {
    const { status, stdout, stderr, dir } = runChild(`Promise.reject(new Error('rej-traps'));
setTimeout(() => { process.stdout.write('alive\\n'); process.exit(0); }, 150);`);

    expect(status).toBe(0);
    expect(stdout).toContain('alive');
    expect(stderr).toContain('未处理的 Promise 拒绝');
    expect(readLogRecords(dir).some(r => r.level === 'error' && r.err?.message === 'rej-traps')).toBe(true);
  });

  it('非 Error 的拒绝值走 data.reason，不伪造指向 traps.js 的假 stack', () => {
    const { status, stdout, stderr, dir } = runChild(`Promise.reject('plain-string');
Promise.reject({ code: 'E_CUSTOM' });
setTimeout(() => { process.stdout.write('alive\\n'); process.exit(0); }, 150);`);

    expect(status).toBe(0);
    expect(stdout).toContain('alive');
    expect(stderr).toContain('plain-string');
    // 假 stack 的特征：堆栈顶帧指向 traps.js 自身
    expect(/traps\.js:\d+/.test(stderr)).toBe(false);
    const records = readLogRecords(dir).filter(r => r.msg === '未处理的 Promise 拒绝');
    expect(records.some(r => r.reason === 'plain-string')).toBe(true);
  });
});

describe('initLogErrorTraps — 安装与卸载', () => {
  it('幂等：重复安装返回同一个卸载句柄，只挂一套监听', () => {
    const before = {
      uncaught: process.listenerCount('uncaughtException'),
      rejection: process.listenerCount('unhandledRejection')
    };

    const offFirst = initLogErrorTraps();
    const offSecond = initLogErrorTraps();

    expect(offSecond).toBe(offFirst);
    expect(process.listenerCount('uncaughtException')).toBe(before.uncaught + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rejection + 1);

    offFirst();
    expect(process.listenerCount('uncaughtException')).toBe(before.uncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rejection);
  });

  it('卸载后可重新安装，且重复卸载不会抛错', () => {
    const before = process.listenerCount('uncaughtException');

    const off = initLogErrorTraps();
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);

    off();
    off(); // 重复卸载：off 幂等（process.off 对不存在的监听是 no-op）
    expect(process.listenerCount('uncaughtException')).toBe(before);

    const offAgain = initLogErrorTraps();
    expect(offAgain).not.toBe(off);
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
    offAgain();
    expect(process.listenerCount('uncaughtException')).toBe(before);
  });
});
