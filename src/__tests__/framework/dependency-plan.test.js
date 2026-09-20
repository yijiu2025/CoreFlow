/**
 * 容器依赖等待策略
 *
 * 这个文件的每一条断言都对应一种"运维事故形态"，不是凑覆盖率：
 *   - Redis 被判成硬依赖 → 一次缓存抖动 = 整个服务起不来；
 *   - DB 被判成可降级 → 容器 healthy 但所有请求 500（监控全绿、用户全错）；
 *   - 未配置的依赖被塞进等待列表 → 日志把"没配"说成"连不上"，排障被误导。
 */

import { describe, it, expect } from '@jest/globals';

const { planDependencyWaits, classifyWaitOutcome, parsePort } = await import('../../framework/ops/dependency-plan.js');

describe('planDependencyWaits', () => {
  it('DB 已配置 → 进计划且是硬依赖', () => {
    const plan = planDependencyWaits({ DB_HOST: 'mysql', DB_PORT: '3306' });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ name: '数据库', host: 'mysql', port: 3306, required: true });
  });

  it('Redis 已启用 → 进计划但**只能是软依赖**（防误改：一次抖动不该拖垮服务）', () => {
    const plan = planDependencyWaits({ REDIS_ENABLED: 'true', REDIS_HOST: 'redis', REDIS_PORT: '6379' });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ name: 'Redis', host: 'redis', port: 6379, required: false });
  });

  it('Redis 未启用 → 根本不进计划（没配置 ≠ 连不上）', () => {
    expect(planDependencyWaits({ REDIS_ENABLED: 'false', REDIS_HOST: 'redis' })).toHaveLength(0);
    expect(planDependencyWaits({ REDIS_HOST: 'redis' })).toHaveLength(0);
    expect(planDependencyWaits({ REDIS_ENABLED: 'true' })).toHaveLength(0);
  });

  it('DB 未配置 → 不进计划（本地 / 测试模式）', () => {
    expect(planDependencyWaits({})).toHaveLength(0);
    expect(planDependencyWaits({ DB_PORT: '3306' })).toHaveLength(0);
  });

  it('两者都配置 → 数据库在前（先等硬依赖，失败可以早退）', () => {
    const plan = planDependencyWaits({
      DB_HOST: 'mysql',
      REDIS_ENABLED: 'true',
      REDIS_HOST: 'redis'
    });
    expect(plan.map(d => d.name)).toEqual(['数据库', 'Redis']);
    expect(plan.map(d => d.required)).toEqual([true, false]);
  });

  it('端口缺失 / 非法 → 回退各自默认值', () => {
    const plan = planDependencyWaits({ DB_HOST: 'mysql', REDIS_ENABLED: 'true', REDIS_HOST: 'redis' });
    expect(plan.map(d => d.port)).toEqual([3306, 6379]);

    const weird = planDependencyWaits({
      DB_HOST: 'mysql',
      DB_PORT: 'abc',
      REDIS_ENABLED: 'true',
      REDIS_HOST: 'redis',
      REDIS_PORT: '70000'
    });
    expect(weird.map(d => d.port)).toEqual([3306, 6379]);
  });
});

describe('classifyWaitOutcome', () => {
  it('就绪 → ready（无论硬软依赖）', () => {
    expect(classifyWaitOutcome({ ok: true, required: true })).toBe('ready');
    expect(classifyWaitOutcome({ ok: true, required: false })).toBe('ready');
  });

  it('硬依赖超时 → fail（宁可起不来，也不要"起来了但全 500"）', () => {
    expect(classifyWaitOutcome({ ok: false, required: true })).toBe('fail');
  });

  it('软依赖超时 → degrade（降级是设计内行为，不是故障）', () => {
    expect(classifyWaitOutcome({ ok: false, required: false })).toBe('degrade');
  });
});

describe('parsePort', () => {
  it('合法值原样返回，越界/非数字回退', () => {
    expect(parsePort('6379', 6379)).toBe(6379);
    expect(parsePort('1', 6379)).toBe(1);
    expect(parsePort('65535', 6379)).toBe(65535);
    expect(parsePort('0', 6379)).toBe(6379);
    expect(parsePort('65536', 6379)).toBe(6379);
    expect(parsePort('-1', 6379)).toBe(6379);
    expect(parsePort('', 6379)).toBe(6379);
    expect(parsePort(undefined, 6379)).toBe(6379);
    expect(parsePort('8.5', 6379)).toBe(8); // parseInt 语义：截断到整数
  });
});
