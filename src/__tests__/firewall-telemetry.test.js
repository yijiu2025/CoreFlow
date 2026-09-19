/**
 * 防火墙遥测持久化测试
 *
 * 覆盖：原子写（tmp+rename）语义 + 优雅关闭落盘
 *
 * 【核心手法：用 inode 判定是否真的走了 rename】
 * `rename` 落到**新的 inode**，原地 `writeFile` 覆写则 inode 不变。
 * 这条断言在旧实现（直接 writeFile）下**必然失败** ——
 * 而「写完再读回来能解析」这类断言两种实现都能通过，属于弱断言。
 *
 * 【为什么必须先设环境变量再动态导入】
 * `store.js` 的 DATA_FILE 在**模块求值时**读取环境变量，且默认路径
 * （`src/data/traffic_stats.json`）是**被 git 跟踪**的文件 —— 测试直写会留下脏改动。
 * 因此本文件不在顶部静态 import store.js，而是在 beforeAll 里动态导入。
 *
 * @author yijiu2025
 * @since 2026-09-19
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-telemetry-'));
const STATS_FILE = path.join(TMP_DIR, 'traffic_stats.json');

// 必须在动态导入 store.js 之前设置（模块求值即读取）
process.env.FW_TRAFFIC_STATS_FILE = STATS_FILE;

/** @type {typeof import('../app/firewall/data/store.js')} */
let store;

/** 取当前落盘文件的 inode */
const inode = () => fs.statSync(STATS_FILE).ino;

// 注意：加载与清理都必须放在**顶层**。若挂在第一个 describe 的 afterAll 上，
// 它会在第二个 describe 开跑之前就删掉临时目录（jest 按声明顺序逐个执行 describe）。
beforeAll(async () => {
  store = await import('../app/firewall/data/store.js');
});

afterAll(() => {
  // 清掉 pushRecord 触发的 10s 防抖计时器：否则它会在临时目录被删后又触发一次写入，
  // 既挂住 jest 进程，又刷出一条 ENOENT 噪声日志
  store.stopPersistTimer();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('遥测持久化（原子写）', () => {
  it('首次写入会创建目标文件，内容是完整可解析的 JSON', async () => {
    store.pushRecord({ ip: '10.0.0.1', method: 'GET', url: '/first', blocked: false, statusCode: 200 });
    await store.__test__persistNow();

    expect(fs.existsSync(STATS_FILE)).toBe(true);
    const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    expect(Array.isArray(data.records)).toBe(true);
    expect(data.records.at(-1)).toMatchObject({ ip: '10.0.0.1', url: '/first' });
  });

  it('写入通过 rename 替换完成（inode 变化），而非原地覆写', async () => {
    const before = inode();
    await store.__test__persistNow();
    expect(inode()).not.toBe(before);
  });

  it('写入完成后目录中不残留临时文件', async () => {
    await store.__test__persistNow();

    const leftovers = fs.readdirSync(TMP_DIR).filter(f => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('持久化的是最近 500 条记录，而非全部', async () => {
    // 环形缓冲区容量 1000，persistNow 只落最近 500 条
    for (let i = 0; i < 600; i++) {
      store.pushRecord({ ip: '10.0.0.2', method: 'GET', url: `/r${i}`, blocked: false, statusCode: 200 });
    }
    await store.__test__persistNow();

    const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    expect(data.records).toHaveLength(500);
    expect(data.records.at(-1).url).toBe('/r599');
  });
});

describe('优雅关闭落盘', () => {
  it('没有待写变更时不写盘（避免空跑启动把统计算成全零）', async () => {
    store.stopPersistTimer(); // 清掉上一个用例留下的防抖计时器
    const before = inode();

    await store.flushPersist();

    expect(inode()).toBe(before);
  });

  it('有待写变更时落盘，且不会丢掉最后一条记录', async () => {
    store.pushRecord({ ip: '10.0.0.9', method: 'POST', url: '/flush', blocked: false, statusCode: 200 });
    const before = inode();

    // 不等 10s 防抖，直接走关闭路径
    await store.flushPersist();

    expect(inode()).not.toBe(before);
    const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    expect(data.records.at(-1)).toMatchObject({ ip: '10.0.0.9', url: '/flush' });
  });

  it('flushPersist 会一并停掉防抖计时器（关闭后不应再有写入）', async () => {
    store.pushRecord({ ip: '10.0.0.10', method: 'GET', url: '/after-flush', blocked: false, statusCode: 200 });
    await store.flushPersist();

    const after = inode();
    // 防抖计时器已被清掉，等待期间不应再产生任何写入
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(inode()).toBe(after);
  });
});
