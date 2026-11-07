/**
 * 防火墙持久化配置缺失时的可观测性契约
 *
 * 背景（2026-11-07）：`initDao` 在 `data/firewall_config.json` 不存在时**静默**回落内置默认。
 * 首启这是正常的；但对已有部署，文件缺失意味着 data/ 卷丢了或换了机器 ——
 * 而内置默认里 `enableRateLimit` / `enableGeoFilter` 是**关**的，防护会变弱且日志一片安静。
 *
 * 本用例钉住「必须留一条能解释这件事的 warn」：消息里要带文件路径（定位是哪个卷）
 * 和那两个默认关闭的开关（解释为什么变弱）。
 *
 * 为什么连文案一起断言：这条日志是**唯一的**事后线索。如果有人把 warn 降级成 info、
 * 或删掉关键信息，事后就没人能从日志里还原"防护为什么变弱"。
 *
 * @author yijiu2025
 * @since 2026-11-07
 */

import { describe, it, expect, jest } from '@jest/globals';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** 捕获到的 warn 文案（只关心本模块发出的那条） */
const warnings = [];

const stubLogger = {
  info: () => {},
  warn: (...args) => warnings.push(args.join(' ')),
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {}
};

// 日志替身：dao 与它依赖的 config.js 都只要 createLogger
jest.unstable_mockModule('../framework/support/log/index.js', () => ({
  createLogger: () => stubLogger,
  initLogErrorTraps: () => {},
  default: stubLogger
}));

// 指向一个**必定不存在**的文件：临时目录刚建，里面没有任何文件
const MISSING_FILE = path.join(mkdtempSync(path.join(tmpdir(), 'fw-missing-')), 'firewall_config.json');

jest.unstable_mockModule('../framework/ingress/firewall/config/persisted.js', () => ({
  FIREWALL_FILE: MISSING_FILE,
  loadPersistedSettings: () => ({})
}));

const { initDao } = await import('../app/firewall/dao/dao.js');

describe('持久化配置缺失 · 必须可诊断', () => {
  it('文件不存在时打一条 warn，且带路径与"哪些开关默认关"', () => {
    initDao();

    const hit = warnings.find(w => w.includes('未找到持久化配置'));
    expect(hit).toBeTruthy();
    // 路径：定位是哪个卷 / 哪个部署
    expect(hit).toContain(MISSING_FILE);
    // 为什么变弱：默认关的两个开关必须点名
    expect(hit).toContain('enableRateLimit');
    expect(hit).toContain('enableGeoFilter');
    // 首启与事故要能区分，否则运维会以为是故障
    expect(hit).toContain('首次启动');
  });

  it('缺失不阻断启动：initDao 不抛错，且策略仍是完整形状', async () => {
    expect(() => initDao()).not.toThrow();

    const { getSecuritySettings } = await import('../app/firewall/dao/dao.js');
    const settings = getSecuritySettings();
    expect(Object.keys(settings).sort()).toEqual(['activeIpApi', 'defense', 'showTrajectory']);
    expect(settings.defense.enableFirewall).toBe(true);
  });
});
