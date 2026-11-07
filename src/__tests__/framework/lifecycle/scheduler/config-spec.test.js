/**
 * `framework/lifecycle/scheduler/config-spec.js` 单元测试
 *
 * `data/scheduler_config.json` 是运维手改的：`intervalHours: "abc"` 会走到
 * `intervalMs = "abc" * 3600 * 1000` → NaN → 定时器立刻触发并空转，而日志只写一句
 * "任务已启动，间隔 abch"。这里把清洗行为钉住。
 *
 * @author yijiu2025
 * @since 2026-11-05
 */
import { describe, it, expect } from '@jest/globals';
import { sanitizeSchedulerConfig } from '../../../../framework/lifecycle/scheduler/config-spec.js';

describe('调度器配置清洗', () => {
  it('合法配置原样通过', () => {
    const { value, problems } = sanitizeSchedulerConfig({
      enabled: true,
      tasks: { 'session-cleanup': { enabled: true, intervalHours: 24, retentionDays: 90 } }
    });
    expect(problems).toEqual([]);
    expect(value).toEqual({
      enabled: true,
      tasks: { 'session-cleanup': { enabled: true, intervalHours: 24, retentionDays: 90 } }
    });
  });

  it('intervalHours 非数字被丢弃（否则 intervalMs = NaN，定时器空转）', () => {
    const { value, problems } = sanitizeSchedulerConfig({
      tasks: { 'session-cleanup': { intervalHours: 'abc', retentionDays: 90 } }
    });
    expect(value.tasks['session-cleanup']).toEqual({ retentionDays: 90 });
    expect(problems[0]).toEqual(
      expect.objectContaining({ kind: 'invalid', key: 'tasks.session-cleanup.intervalHours' })
    );
  });

  it('retentionDays 允许 0（0 = 更狠地删），但负数不行', () => {
    expect(sanitizeSchedulerConfig({ tasks: { t: { retentionDays: 0 } } }).problems).toEqual([]);
    expect(sanitizeSchedulerConfig({ tasks: { t: { retentionDays: -1 } } }).problems).toHaveLength(1);
  });

  it('未知任务字段丢弃并留痕（任务名不设白名单，字段设）', () => {
    const { value, problems } = sanitizeSchedulerConfig({
      tasks: { futureTask: { enabled: false, mystery: 1 } }
    });
    expect(value.tasks.futureTask).toEqual({ enabled: false });
    expect(problems[0]).toEqual(expect.objectContaining({ kind: 'unknown', key: 'tasks.futureTask.mystery' }));
  });

  it('未知顶层键丢弃（曾经写在文件里却没有读取点的字段）', () => {
    const { problems } = sanitizeSchedulerConfig({ enabled: true, legacyKey: 1 });
    expect(problems[0]).toEqual(expect.objectContaining({ kind: 'unknown', key: 'legacyKey' }));
  });

  it('"true"/"false" 字符串归一化为布尔值', () => {
    const { value, problems } = sanitizeSchedulerConfig({ enabled: 'false' });
    expect(value.enabled).toBe(false);
    expect(problems[0].kind).toBe('coerced');
  });

  it('tasks 不是对象时整体忽略，不抛错', () => {
    for (const tasks of ['x', 42, [1, 2], null]) {
      const { value, problems } = sanitizeSchedulerConfig({ tasks });
      expect(value.tasks).toEqual({});
      expect(problems.length).toBeGreaterThan(0);
    }
  });

  it('任意垃圾输入都不抛错', () => {
    for (const raw of [null, undefined, 'str', 42, []]) {
      expect(() => sanitizeSchedulerConfig(raw)).not.toThrow();
      expect(sanitizeSchedulerConfig(raw).value.tasks).toEqual({});
    }
  });
});
