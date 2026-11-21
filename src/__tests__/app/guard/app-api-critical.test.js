/**
 * 保护性接口：不允许被关闭
 *
 * 这类接口一关就是"管理后台进不去 / 谁都登不进来"，恢复只能改库或改代码 ——
 * 所以判定必须在**服务层**（不靠前端把开关置灰），且对超管同样生效。
 *
 * 不连库：守卫配置是模块级内存树，注册即可用；被判定的是纯逻辑。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

let mod;
let registerSystemMetadata;
let registerGroupMetadata;
let registerApiMetadata;

/** 管理员请求（超管也拒绝：见服务层注释） */
const request = {
  ip: '127.0.0.1',
  headers: {},
  body: {},
  state: { user: { userId: 1, uid: 'u1', roles: ['superadmin'], permissions: { allows: ['*'], denies: [] } } }
};

beforeAll(async () => {
  mod = await import('../../../app/guard/services/app-api.service.js');
  ({ registerSystemMetadata, registerGroupMetadata, registerApiMetadata } = await import('../../../api/guard-config.js'));

  /* 整个系统保护（如 oauth21 授权域） */
  registerSystemMetadata('critSys', { alias: '授权域', prefix: '/authz', app_id: 'admin', critical: true });
  registerGroupMetadata('critSys', 'auth', { alias: '认证', prefix: '/v1' });
  registerApiMetadata('critSys', 'auth', 'login', { alias: '登录', requireLogin: false });

  /* 仅单条接口保护 */
  registerSystemMetadata('mixSys', { alias: '业务域', prefix: '/biz', app_id: 'admin' });
  registerGroupMetadata('mixSys', 'biz', { alias: '业务', prefix: '/v1' });
  registerApiMetadata('mixSys', 'biz', 'list', { alias: '列表', requireLogin: true });
  registerApiMetadata('mixSys', 'biz', 'guardSelf', { alias: '守卫自身', requireLogin: true, critical: true });
});

describe('保护性接口', () => {
  it('系统级 critical 会被接口继承（整域保护）', () => {
    const tree = mod.listAppSystems('admin');
    const sys = tree.find(s => s.key === 'critSys');
    expect(sys.critical).toBe(true);
    expect(sys.groups[0].critical).toBe(true);
    expect(sys.groups[0].apis[0].critical).toBe(true);
  });

  it('单条 critical 只保护自己', () => {
    const tree = mod.listAppSystems('admin');
    const sys = tree.find(s => s.key === 'mixSys');
    const flags = Object.fromEntries(sys.groups[0].apis.map(a => [a.key, a.critical]));
    expect(flags.guardSelf).toBe(true);
    expect(flags.list).toBe(false);
  });

  it('关闭保护性接口被拒绝（403，且对超管同样生效）', async () => {
    const res = await mod.toggleAppNode({
      appId: 'admin',
      systemKey: 'critSys',
      groupKey: 'auth',
      apiKey: 'login',
      request,
      stepupToken: null
    });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.message).toMatch(/保护性接口/);
  });

  it('系统级保护时，模块级开关也被拒绝', async () => {
    const res = await mod.toggleAppNode({
      appId: 'admin',
      systemKey: 'critSys',
      groupKey: 'auth',
      request,
      stepupToken: null
    });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('普通接口不受影响：走二次认证流程，而不是被保护规则拦下', async () => {
    const res = await mod.toggleAppNode({
      appId: 'admin',
      systemKey: 'mixSys',
      groupKey: 'biz',
      apiKey: 'list',
      request,
      stepupToken: null
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('stepup_required');
    expect(res.statusCode).not.toBe(403);
  });
});
