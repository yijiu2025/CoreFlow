/**
 * 运行调优配置校验单测（src/config/app_config.js）
 *
 * 覆盖点：默认配置必须零告警、未知配置段/配置项要报（拼写错误诊断）、
 * 越界值要报。校验函数本身「只告警不阻断」—— 非法值由消费方回退默认。
 */

import { describe, it, expect } from '@jest/globals';
import { APP_CONFIG, validateAppConfig } from '../config/app_config.js';

describe('app_config · 默认配置', () => {
  it('默认配置零告警（否则每次启动都会刷警告）', () => {
    expect(validateAppConfig()).toEqual([]);
  });

  it('默认值符合约定（改动需同步本测试与消费方）', () => {
    expect(APP_CONFIG.http.keepAliveTimeoutMs).toBe(72_000);
    expect(APP_CONFIG.http.requestTimeoutMs).toBe(300_000);
    expect(APP_CONFIG.websocket.shutdownGraceMs).toBe(1_000);
    expect(APP_CONFIG.guard.syncIntervalMs).toBe(30_000);
    expect(APP_CONFIG.monitor.slowRequestThresholdMs).toBe(2_000);
    expect(APP_CONFIG.passwordHash.scryptMaxConcurrency).toBe(16);
    expect(APP_CONFIG.passwordHash.bcryptMaxConcurrency).toBe(4);
  });
});

describe('app_config · 拼写错误诊断', () => {
  it('未知配置段 → 告警并提示合法段名', () => {
    const warnings = validateAppConfig({ https: { keepAliveTimeoutMs: 1 } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('未知配置段 "https"');
    expect(warnings[0]).toContain('http');
  });

  it('未知配置项 → 告警并指出疑似拼写错误', () => {
    // 典型陷阱：漏写 Ms 后缀会让值静默失效
    const warnings = validateAppConfig({ http: { keepAliveTimeout: 72_000 } });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('http.keepAliveTimeout');
    expect(warnings[0]).toContain('拼写错误');
  });
});

describe('app_config · 值域校验', () => {
  it('负数 → 告警（回退默认）', () => {
    const warnings = validateAppConfig({ http: { requestTimeoutMs: -1 } });
    expect(warnings.some(w => w.includes('http.requestTimeoutMs'))).toBe(true);
  });

  it('非整数 → 告警', () => {
    const warnings = validateAppConfig({ websocket: { shutdownGraceMs: 1.5 } });
    expect(warnings.some(w => w.includes('websocket.shutdownGraceMs'))).toBe(true);
  });

  it('字符串数字 → 视作非法（配置是代码，不该出现字符串）', () => {
    const warnings = validateAppConfig({ monitor: { slowRequestThresholdMs: '2000ms' } });
    expect(warnings.some(w => w.includes('monitor.slowRequestThresholdMs'))).toBe(true);
  });

  it('并发上限 0 → 告警（合法区间从 1 起）', () => {
    const warnings = validateAppConfig({ passwordHash: { scryptMaxConcurrency: 0 } });
    expect(warnings.some(w => w.includes('passwordHash.scryptMaxConcurrency'))).toBe(true);
  });

  it('超出上限 → 告警', () => {
    const warnings = validateAppConfig({ http: { keepAliveTimeoutMs: 3_600_001 } });
    expect(warnings.some(w => w.includes('http.keepAliveTimeoutMs'))).toBe(true);
  });

  it('合法值零告警（含 0：关 keep-alive 是合法语义）', () => {
    expect(validateAppConfig({ guard: { syncIntervalMs: 0 }, http: { keepAliveTimeoutMs: 0 } })).toEqual([]);
  });
});
