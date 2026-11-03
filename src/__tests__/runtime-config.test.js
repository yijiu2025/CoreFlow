/**
 * 运行时配置热改层单测（framework/config/runtime.js）
 *
 * 重点验证**热改语义**（改 JSON 无需重启即生效）与容错：
 *   1. 文件缺失 → 纯默认值
 *   2. 覆盖文件 → 深合并生效
 *   3. mtime 变化 → 下一次 get() 拿到新值（热改）
 *   4. JSON 写坏 → 保留上一份可用配置，不抛错
 *   5. 数组整体替换（不拼接，防删除条目复活）
 *   6. bind() 原地同步：已导出的对象引用不变也能读到新值
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntimeConfig, deepMerge, applyInPlace } from '../framework/config/runtime.js';
import { loadOverrides } from '../framework/config/overrides.js';

const DEFAULTS = {
  session: {
    maxActiveDevices: 20,
    singleDeviceTypes: ['browser', 'app', 'desktop'],
    nested: { keep: 'default', override: 'default' }
  }
};

let file;

/** 单调递增的 mtime 偏移：每次写覆盖都往后推，避免同毫秒内两次写入"撞车"导致漏重载 */
let mtimeTick = 0;

beforeEach(() => {
  file = path.join(os.tmpdir(), `runtime-config-test-${process.pid}-${Date.now()}-${Math.random()}.json`);
  mtimeTick = 0;
});

afterEach(() => {
  try {
    fs.unlinkSync(file);
  } catch {
    /* 不存在即可 */
  }
});

/**
 * 写覆盖文件并**强制 mtime 单调前进**
 *
 * ⚠️ 不能用固定的 `now + 1s`：同一测试内连续两次写入会得到相同 mtime，
 * mtime 比较判定"没变" → 第二次覆盖不生效（Linux CI 上必现，Windows 偶发）。
 * 用递增 tick 保证每次写入的时间戳严格大于上一次。
 */
function writeOverlay(obj) {
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8');
  mtimeTick += 2;
  const future = new Date(Date.now() + mtimeTick * 1_000);
  fs.utimesSync(file, future, future);
}

describe('runtime config · 默认与覆盖', () => {
  it('覆盖文件不存在 → 纯默认值', () => {
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file });
    expect(store.get().session.maxActiveDevices).toBe(20);
  });

  it('覆盖文件 → 深合并生效，未覆盖的键保持默认', () => {
    writeOverlay({ session: { maxActiveDevices: 5 } });
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file });
    const cfg = store.get();
    expect(cfg.session.maxActiveDevices).toBe(5);
    expect(cfg.session.nested.keep).toBe('default');
  });

  it('数组整体替换而不是拼接', () => {
    writeOverlay({ session: { singleDeviceTypes: ['app'] } });
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file });
    expect(store.get().session.singleDeviceTypes).toEqual(['app']);
  });
});

describe('runtime config · 热改语义', () => {
  it('改文件后 get() 拿到新值（无需重建 store）', () => {
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file, reloadMs: 0 });
    expect(store.get().session.maxActiveDevices).toBe(20);

    writeOverlay({ session: { maxActiveDevices: 3 } });
    expect(store.get().session.maxActiveDevices).toBe(3);

    writeOverlay({ session: { maxActiveDevices: 7 } });
    expect(store.get().session.maxActiveDevices).toBe(7);
  });

  it('bind() 后已导出的对象原地更新（引用不变，消费方零改造）', () => {
    const exported = {};
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file, reloadMs: 0 });
    store.bind(exported);
    expect(exported.session.maxActiveDevices).toBe(20);

    writeOverlay({ session: { maxActiveDevices: 9 } });
    store.get(); // 一次读取触发同步
    expect(exported.session.maxActiveDevices).toBe(9);
  });

  it('删除覆盖文件 → 退回默认值', () => {
    writeOverlay({ session: { maxActiveDevices: 4 } });
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file, reloadMs: 0 });
    expect(store.get().session.maxActiveDevices).toBe(4);

    fs.unlinkSync(file);
    expect(store.get().session.maxActiveDevices).toBe(20);
  });
});

describe('runtime config · 容错', () => {
  it('JSON 写坏 → 保留上一份可用配置，不抛错', () => {
    writeOverlay({ session: { maxActiveDevices: 6 } });
    const store = createRuntimeConfig({ name: 'test', defaults: DEFAULTS, fileName: file, reloadMs: 0 });
    expect(store.get().session.maxActiveDevices).toBe(6);

    fs.writeFileSync(file, '{ 坏掉的 json', 'utf-8');
    const future = new Date(Date.now() + 2_000);
    fs.utimesSync(file, future, future);

    expect(() => store.get()).not.toThrow();
    expect(store.get().session.maxActiveDevices).toBe(6);
  });
});

describe('deepMerge / applyInPlace 语义', () => {
  it('deepMerge 不改入参，返回新对象', () => {
    const base = { a: { b: 1 }, list: [1, 2] };
    const merged = deepMerge(base, { a: { c: 2 }, list: [9] });
    expect(base).toEqual({ a: { b: 1 }, list: [1, 2] });
    expect(merged).toEqual({ a: { b: 1, c: 2 }, list: [9] });
  });

  it('applyInPlace 删除源里已不存在的键（JSON 显式删除要生效）', () => {
    const target = { keep: 1, drop: 2, nested: { a: 1, b: 2 } };
    applyInPlace(target, { keep: 1, nested: { a: 1 } });
    expect(target).toEqual({ keep: 1, nested: { a: 1 } });
  });
});

describe('可选覆盖层 · src/config 可缺失', () => {
  it('文件不存在 → 返回 {}（不抛错，服务用 core 保底继续跑）', () => {
    expect(loadOverrides('__not_exist_config__.js', 'ANY_CONFIG', 'missing')).toEqual({});
  });

  it('文件存在但缺导出 → 返回 {}', () => {
    // 用真实存在的 app_config.js 当"存在但没这个导出"的样本
    expect(loadOverrides('app_config.js', 'NOT_EXPORTED', 'app_config')).toEqual({});
  });

  it('overrides 层优先于 core 保底，JSON 再覆盖 overrides', () => {
    writeOverlay({ session: { maxActiveDevices: 8 } });
    const store = createRuntimeConfig({
      name: 'test',
      defaults: DEFAULTS,
      overrides: { session: { maxActiveDevices: 5, singleDeviceTypes: ['app'] } },
      fileName: file,
      reloadMs: 0
    });
    const cfg = store.get();
    expect(cfg.session.maxActiveDevices).toBe(8); // JSON 覆盖胜出
    expect(cfg.session.singleDeviceTypes).toEqual(['app']); // overrides 生效
    expect(cfg.session.nested.keep).toBe('default'); // core 保底保留
  });
});
