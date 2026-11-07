/**
 * 优雅关闭编排测试
 *
 * 两条判据都只有"起一个真服务再关掉"才测得出来的话，这段逻辑实际上等于没有回归保护。
 * 这里用假 app + 假任务把两件事钉死：
 *   ① 顺序 —— 关闭任务必须按数组顺序执行（守卫配置要"先停轮询再落盘"）；
 *   ② 错误隔离 —— 一条任务抛错不能中断后面的任务，否则一个 Redis 关闭超时
 *      就会让守卫配置永远不落库，而 onClose 不会把异步错误抛给调用方。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

import { describe, it, expect } from '@jest/globals';
import { runShutdownTasks, registerShutdownHooks } from '../../../framework/lifecycle/shutdown.js';

/** 构造一个只记录 onClose 回调的假 Fastify 实例 */
function createFakeApp() {
  const hooks = [];
  return {
    addHook(name, fn) {
      hooks.push({ name, fn });
    },
    hooks
  };
}

/** 构造一个只记录调用的假日志器 */
function createFakeLogger() {
  const errors = [];
  return { errors, error: (msg, err) => errors.push({ msg, err }) };
}

describe('runShutdownTasks', () => {
  it('按数组顺序依次执行', async () => {
    const order = [];
    await runShutdownTasks([
      { name: 'a', run: () => order.push('a') },
      { name: 'b', run: async () => order.push('b') },
      { name: 'c', run: () => order.push('c') }
    ]);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('一条任务抛错不中断后续任务，且失败被记录', async () => {
    const order = [];
    const logger = createFakeLogger();

    await runShutdownTasks(
      [
        { name: '停轮询', run: () => order.push('stop-sync') },
        {
          name: '配置落库',
          run: () => {
            order.push('flush');
            throw new Error('模拟写入失败');
          }
        },
        { name: '关 Pub/Sub', run: () => order.push('pubsub') }
      ],
      logger
    );

    // 关键：Pub/Sub 必须照常关闭，否则进程留着活句柄退不出去
    expect(order).toEqual(['stop-sync', 'flush', 'pubsub']);
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0].msg).toContain('配置落库');
  });

  it('缺 run 的项被跳过（允许占位/调顺序）', async () => {
    const order = [];
    await runShutdownTasks([null, { name: 'noop' }, { name: 'real', run: () => order.push('real') }]);

    expect(order).toEqual(['real']);
  });

  it('空数组 / 非数组入参不抛错', async () => {
    await expect(runShutdownTasks([])).resolves.toBeUndefined();
    await expect(runShutdownTasks(undefined)).resolves.toBeUndefined();
  });
});

describe('registerShutdownHooks', () => {
  it('挂到 Fastify 的 onClose 上，触发时才执行任务', async () => {
    const app = createFakeApp();
    const order = [];

    registerShutdownHooks(app, [{ name: 'x', run: () => order.push('x') }]);

    expect(app.hooks).toHaveLength(1);
    expect(app.hooks[0].name).toBe('onClose');
    // 注册本身不执行任务
    expect(order).toEqual([]);

    await app.hooks[0].fn();
    expect(order).toEqual(['x']);
  });

  it('任务里抛错时 onClose 回调仍然 resolve（否则 app.close() 会被 reject 卡住）', async () => {
    const app = createFakeApp();
    const logger = createFakeLogger();

    registerShutdownHooks(
      app,
      [
        {
          name: '会炸的任务',
          run: () => {
            throw new Error('boom');
          }
        }
      ],
      logger
    );

    await expect(app.hooks[0].fn()).resolves.toBeUndefined();
    expect(logger.errors).toHaveLength(1);
  });
});
