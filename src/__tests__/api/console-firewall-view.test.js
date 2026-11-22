/**
 * 管理后台「防火墙监控」视图归一测试
 *
 * 被测对象：`api/admin/v1/firewall.js` 的 `toBlockView`
 *
 * 为什么单测这个函数：底层封禁记录按维度给出 `ip / fingerprint / deviceId`，
 * 而管理前端（scaffold 的 firewall 版式）只认 `kind` + `value`，且 `createdAt`
 * 走 `new Date(...)`。归一写在接口层，任何一侧改字段都会让页面静默显示「—」——
 * 这条断言就是那个契约的钉子。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { describe, test, expect } from '@jest/globals';

const { toBlockView } = await import('../../api/admin/v1/firewall.js');

const CREATED_AT = Date.UTC(2026, 10, 21, 3, 0, 0);

describe('toBlockView：底层维度记录 → 前端视图', () => {
  test('IP 维度：kind=ip、value 取 ip、createdAt 转 ISO', () => {
    const view = toBlockView({
      ip: '203.0.113.9',
      type: 'ip',
      status: 'BLOCKED',
      permanent: false,
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + 60_000,
      remainingSeconds: 42
    });

    expect(view).toEqual({
      id: 'ip:203.0.113.9',
      kind: 'ip',
      value: '203.0.113.9',
      reason: 'BLOCKED',
      permanent: false,
      remainingSeconds: 42,
      createdAt: new Date(CREATED_AT).toISOString()
    });
  });

  test('设备维度：value 取 deviceId；原因优先用 reason', () => {
    const view = toBlockView({
      deviceId: 'WEB-DaBOSbNdSuc-8s4T',
      type: 'device',
      reason: '自动封禁: brute_force',
      permanent: true,
      remainingSeconds: null
    });

    expect(view.kind).toBe('device');
    expect(view.value).toBe('WEB-DaBOSbNdSuc-8s4T');
    expect(view.reason).toBe('自动封禁: brute_force');
    expect(view.permanent).toBe(true);
    // 永久封禁没有剩余秒数（前端据此显示「—」而不是 0s）
    expect(view.remainingSeconds).toBeNull();
  });

  test('createdAt 缺失时不伪造日期（前端显示「—」而不是 Invalid Date）', () => {
    const view = toBlockView({ fingerprint: 'abc123', type: 'fingerprint' });
    expect(view.createdAt).toBeNull();
    expect(view.value).toBe('abc123');
  });

  test('type 缺失时按存在的维度字段兜底推断', () => {
    expect(toBlockView({ ip: '1.2.3.4' }).kind).toBe('ip');
    expect(toBlockView({ fingerprint: 'ff' }).kind).toBe('fingerprint');
    expect(toBlockView({ deviceId: 'DEV' }).kind).toBe('device');
  });
});
