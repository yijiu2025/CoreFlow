/**
 * 挑战链路观测的计数语义
 *
 * 这块最容易出两类错（都会让面板给出错误结论，而不是报错）：
 *   ① 分桶边界写错 → P95 永远显示某个值，看不出难度配高了；
 *   ② drain / merge 语义错 → 一次 Redis 刷写失败就永久丢一段统计，
 *      或者刷写后计数不清零，越涨越大。
 *
 * @author yijiu2025
 * @since 2026-11-06
 */
import { describe, test, expect, beforeEach } from '@jest/globals';

const {
  recordChallengeEvent,
  drainChallengeMetrics,
  mergeChallengeMetrics,
  peekChallengeMetrics,
  resetChallengeMetrics,
  summarizeChallengeFields,
  solveMsBucketIndex,
  SOLVE_MS_BOUNDS
} = await import('../../../framework/firewall/challenge/index.js');

beforeEach(() => {
  resetChallengeMetrics();
});

describe('solveMsBucketIndex：桶边界', () => {
  test('边界值落在「不超过上界」的桶（<= 语义）', () => {
    expect(solveMsBucketIndex(0)).toBe(0);
    expect(solveMsBucketIndex(SOLVE_MS_BOUNDS[0])).toBe(0); // 10ms 属于 "≤10"
    expect(solveMsBucketIndex(SOLVE_MS_BOUNDS[0] + 1)).toBe(1);
    expect(solveMsBucketIndex(SOLVE_MS_BOUNDS[1])).toBe(1);
    expect(solveMsBucketIndex(SOLVE_MS_BOUNDS[4] + 1)).toBe(SOLVE_MS_BOUNDS.length); // 开区间末桶
  });

  test('无效值不入桶（客户端可伪造，只做统计不能影响形状）', () => {
    for (const bad of [-1, Number.NaN, Infinity, null, undefined, 'abc']) {
      expect(solveMsBucketIndex(bad)).toBe(-1);
    }
  });
});

describe('recordChallengeEvent：只记服务端能观测到的维度', () => {
  test('issued 同时记 provider 与难度', () => {
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 3 });
    expect(peekChallengeMetrics()).toEqual({ 'issued:pow': 1, 'difficulty:3': 1 });
  });

  test('难度越界不入账（防止上游写错把 hash 塞满任意 field）', () => {
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 0 });
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 99 });
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 2.5 });
    expect(peekChallengeMetrics()).toEqual({ 'issued:pow': 3 });
  });

  test('verified 记账耗时桶；失败不计耗时', () => {
    recordChallengeEvent({ type: 'verified', provider: 'pow', solveMs: 12 });
    recordChallengeEvent({ type: 'failed', provider: 'pow', reason: 'Challenge Expired', solveMs: 9999 });
    expect(peekChallengeMetrics()).toEqual({ 'verified:pow': 1, 'solveMs:b1': 1, 'failed:Challenge Expired': 1 });
  });

  test('surface 只认枚举值；未知 type 静默忽略', () => {
    recordChallengeEvent({ type: 'surface', surface: 'inline' });
    recordChallengeEvent({ type: 'surface', surface: 'page' });
    recordChallengeEvent({ type: 'surface' }); // 没值 → 不记
    recordChallengeEvent({ type: 'nope' });
    recordChallengeEvent(null);
    expect(peekChallengeMetrics()).toEqual({ 'surface:inline': 1, 'surface:page': 1 });
  });
});

describe('drain / merge：刷写语义', () => {
  test('drain 取走并清零（不清零会让计数越涨越大）', () => {
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 3 });
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 3 });
    expect(drainChallengeMetrics()).toEqual({ 'issued:pow': 2, 'difficulty:3': 2 });
    expect(peekChallengeMetrics()).toEqual({});
    expect(drainChallengeMetrics()).toEqual({});
  });

  test('merge 把失败的增量放回，且可与新事件累加', () => {
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 3 });
    const taken = drainChallengeMetrics();
    mergeChallengeMetrics(taken);
    recordChallengeEvent({ type: 'issued', provider: 'pow', difficulty: 3 });
    expect(peekChallengeMetrics()).toEqual({ 'issued:pow': 2, 'difficulty:3': 2 });
  });

  test('merge 忽略非法输入（脏数据不能污染计数）', () => {
    mergeChallengeMetrics(null);
    mergeChallengeMetrics({ 'issued:pow': -5, 'verified:pow': 'abc' });
    expect(peekChallengeMetrics()).toEqual({});
  });
});

describe('summarizeChallengeFields：面板口径', () => {
  test('成功率分母是「真正提交过答案」的次数，不是签发数', () => {
    const s = summarizeChallengeFields({
      'issued:pow': 100, // 打开页面又关掉也会签发
      'verified:pow': 6,
      'failed:Challenge Expired': 2,
      'failed:Invalid Proof': 2
    });
    expect(s.issued).toBe(100);
    expect(s.verified).toBe(6);
    expect(s.failed).toBe(4);
    // 6 / (6 + 4)，而不是 6 / 100
    expect(s.successRate).toBe(0.6);
    expect(s.reasons).toEqual({ 'Challenge Expired': 2, 'Invalid Proof': 2 });
    expect(s.byProvider).toEqual({ pow: 100 });
  });

  test('没有提交过答案时成功率为 null（而不是 0 —— 0 会被误读成"全都失败"）', () => {
    const s = summarizeChallengeFields({ 'issued:pow': 5 });
    expect(s.successRate).toBeNull();
    expect(s.solveMs.samples).toBe(0);
    expect(s.solveMs.p50EstimateMs).toBeNull();
  });

  test('耗时桶与分位估算（桶中点口径）', () => {
    // 60% 落在 b0、40% 落在 b1 → 中位数在 b0、P95 在 b1
    const s = summarizeChallengeFields({ 'solveMs:b0': 60, 'solveMs:b1': 40 });
    expect(s.solveMs.buckets).toHaveLength(SOLVE_MS_BOUNDS.length + 1);
    expect(s.solveMs.samples).toBe(100);
    // b0 = 0~10ms 中点 5；b1 = 10~50ms 中点 30
    expect(s.solveMs.p50EstimateMs).toBe(5);
    expect(s.solveMs.p95EstimateMs).toBe(30);
  });

  test('开区间末桶按 lastBound*2 取代表值', () => {
    const s = summarizeChallengeFields({ 'solveMs:b5': 10 });
    expect(s.solveMs.p50EstimateMs).toBe(Math.round((SOLVE_MS_BOUNDS[4] + SOLVE_MS_BOUNDS[4] * 2) / 2));
  });

  test('各维度分布 + 非法字段不炸', () => {
    const s = summarizeChallengeFields({
      'issued:turnstile': 2,
      'difficulty:4': 2,
      'surface:inline': 1,
      'surface:xhr': 3,
      'issueRejected:Not Challenged': 7,
      'solveMs:bX': 5, // 非法桶下标
      weird: 9
    });
    expect(s.byProvider).toEqual({ turnstile: 2 });
    expect(s.byDifficulty).toEqual({ 4: 2 });
    expect(s.bySurface).toEqual({ inline: 1, xhr: 3 });
    expect(s.issueRejected).toEqual({ 'Not Challenged': 7 });
    expect(s.solveMs.samples).toBe(0);
  });

  test('空输入给全零结构（面板不用判空）', () => {
    const s = summarizeChallengeFields({});
    expect(s).toMatchObject({ issued: 0, verified: 0, failed: 0, successRate: null });
    expect(s.reasons).toEqual({});
  });
});
