/**
 * 应用注册表：请求 → 应用 的解析
 *
 * 这条链路是新应用"零框架改动"的支点：新增应用只要在自己的 `system.json` 写
 * `app_id` + `prefix`（或 `config.js` 写 `hosts`），启动期登记后，认证层就能判出
 * "这个请求属于哪个应用"。所以这里要钉住三件事：前缀边界、最长匹配、未声明时返回 null
 * （null = 共享系统，不参与归属校验）。
 */
import { describe, it, expect } from '@jest/globals';
import {
  registerApiBinding,
  resolveAppByPath,
  resolveAppByHost,
  registerAppConfig,
  resolveRequestApp
} from '../../../framework/config/app-registry.js';

describe('resolveAppByPath：路径 → 应用', () => {
  it('前缀命中，返回登记的应用', () => {
    registerApiBinding('/__t/admin', 'console');
    expect(resolveAppByPath('/__t/admin/v1/users')).toBe('console');
  });

  it('边界不能误伤：/__t/admin 不命中 /__t/administrator', () => {
    registerApiBinding('/__t/admin', 'console');
    expect(resolveAppByPath('/__t/administrator/x')).toBeNull();
  });

  it('最长前缀优先（/__t/api 与 /__t/api/posecraft 并存时选后者）', () => {
    registerApiBinding('/__t/api', 'shared');
    registerApiBinding('/__t/api/posecraft', 'posecraft');
    expect(resolveAppByPath('/__t/api/posecraft/work')).toBe('posecraft');
    expect(resolveAppByPath('/__t/api/other')).toBe('shared');
  });

  it('未登记 / 空路径返回 null（= 共享系统，不参与归属校验）', () => {
    expect(resolveAppByPath('/auth/v1/login')).toBeNull();
    expect(resolveAppByPath('')).toBeNull();
  });

  it('登记空前缀或空应用时忽略（防止把根路径绑给某个应用）', () => {
    registerApiBinding('', 'console');
    registerApiBinding('/__t/x', '');
    expect(resolveAppByPath('/')).toBeNull();
    expect(resolveAppByPath('/__t/x')).toBeNull();
  });
});

describe('resolveAppByHost：Host → 应用', () => {
  it('应用声明 hosts 后按 hostname 命中（忽略端口）', () => {
    registerAppConfig({ app_id: '__t_host_app', hosts: ['console.localhost'] });
    expect(resolveAppByHost('console.localhost:5173')).toBe('__t_host_app');
  });

  it('未声明的 host 返回 null', () => {
    expect(resolveAppByHost('unknown.localhost')).toBeNull();
  });
});

describe('resolveRequestApp：路径优先，Host 兜底', () => {
  it('路径能判就用路径', () => {
    registerApiBinding('/__t/r', 'console');
    registerAppConfig({ app_id: 'console', hosts: ['console.localhost'] });
    expect(resolveRequestApp({ pathname: '/__t/r/x', host: 'console.localhost' })).toBe('console');
  });

  it('路径判不出时用 Host', () => {
    registerAppConfig({ app_id: '__t_host_app', hosts: ['__t.localhost'] });
    expect(resolveRequestApp({ pathname: '/auth/v1/login', host: '__t.localhost' })).toBe('__t_host_app');
  });

  it('两者都判不出返回 null', () => {
    expect(resolveRequestApp({ pathname: '/auth/v1/login', host: 'nothing.localhost' })).toBeNull();
  });
});
