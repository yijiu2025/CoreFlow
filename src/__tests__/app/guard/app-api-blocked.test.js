/**
 * 上级开关拦截：总开关关着时，下面几层不允许再改
 *
 * 语义：系统关了 → 它下面所有模块与接口都不生效；模块关了 → 它的接口都不生效。
 * 在这种状态下改单个接口"看起来成功、实际无效"，比直接拒绝更糟 —— 所以写入一律 409，
 * 读（列表）则带上 `blockedBy` 让界面把开关置灰并说明原因。
 *
 * 不连库：注册即可用的内存树；`enabled: false` 在注册时声明，避免触碰落盘定时器。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

let mod;
let registerSystemMetadata;
let registerGroupMetadata;
let registerApiMetadata;

const request = {
  ip: '127.0.0.1',
  headers: {},
  body: {},
  state: { user: { userId: 1, uid: 'u1', roles: ['superadmin'], permissions: { allows: ['*'], denies: [] } } }
};

beforeAll(async () => {
  mod = await import('../../../app/guard/services/app-api.service.js');
  ({ registerSystemMetadata, registerGroupMetadata, registerApiMetadata } = await import('../../../api/guard-config.js'));

  /* 系统总开关关着 */
  registerSystemMetadata('sysOff', { alias: '关着的系统', prefix: '/off', app_id: 'admin', enabled: false });
  registerGroupMetadata('sysOff', 'g', { alias: '组', prefix: '/v1' });
  registerApiMetadata('sysOff', 'g', 'a', { alias: '接口A', requireLogin: true });

  /* 系统开着、模块关着 */
  registerSystemMetadata('grpOff', { alias: '模块关着', prefix: '/grpoff', app_id: 'admin' });
  registerGroupMetadata('grpOff', 'off', { alias: '关着的组', prefix: '/v1', enabled: false });
  registerApiMetadata('grpOff', 'off', 'a', { alias: '接口A', requireLogin: true });

  /* 全开：对照组 */
  registerSystemMetadata('allOn', { alias: '全开', prefix: '/allon', app_id: 'admin' });
  registerGroupMetadata('allOn', 'g', { alias: '组', prefix: '/v1' });
  registerApiMetadata('allOn', 'g', 'a', { alias: '接口A', requireLogin: true });
});

describe('上级开关拦截', () => {
  it('系统总开关关着：组与接口都标记 blockedBy=system', () => {
    const sys = mod.listAppSystems('admin').find(s => s.key === 'sysOff');
    expect(sys.enabled).toBe(false);
    expect(sys.groups[0].blockedBy).toBe('system');
    expect(sys.groups[0].apis[0].blockedBy).toBe('system');
  });

  it('模块关着：组自己不受阻，它的接口 blockedBy=group', () => {
    const sys = mod.listAppSystems('admin').find(s => s.key === 'grpOff');
    expect(sys.groups[0].blockedBy).toBeNull();
    expect(sys.groups[0].apis[0].blockedBy).toBe('group');
  });

  it('全开时没有 blockedBy（对照组，防止判据永远命中）', () => {
    const sys = mod.listAppSystems('admin').find(s => s.key === 'allOn');
    expect(sys.groups[0].blockedBy).toBeNull();
    expect(sys.groups[0].apis[0].blockedBy).toBeNull();
  });

  it('系统关着时切换接口 → 409，且提示先开系统', async () => {
    const res = await mod.toggleAppNode({
      appId: 'admin',
      systemKey: 'sysOff',
      groupKey: 'g',
      apiKey: 'a',
      request,
      stepupToken: null
    });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(409);
    expect(res.message).toMatch(/总开关/);
  });

  it('模块关着时编辑接口 → 409，且提示先开模块', async () => {
    const res = await mod.updateAppNode({
      appId: 'admin',
      systemKey: 'grpOff',
      groupKey: 'off',
      apiKey: 'a',
      patch: { description: '改个描述' },
      request,
      stepupToken: null
    });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(409);
    expect(res.message).toMatch(/模块/);
  });

  it('系统关着时，系统自己的总开关仍然可以点（否则再也开不回来）', async () => {
    const res = await mod.toggleAppNode({
      appId: 'admin',
      systemKey: 'sysOff',
      groupKey: null,
      apiKey: null,
      request,
      stepupToken: null
    });
    expect(res.statusCode).not.toBe(409);
    expect(res.code).toBe('stepup_required');
  });

  it('全开时不会被拦（走到二次认证那一步）', async () => {
    const res = await mod.toggleAppNode({
      appId: 'admin',
      systemKey: 'allOn',
      groupKey: 'g',
      apiKey: 'a',
      request,
      stepupToken: null
    });
    expect(res.statusCode).not.toBe(409);
    expect(res.code).toBe('stepup_required');
  });
});
