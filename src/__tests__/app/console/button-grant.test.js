/**
 * 按钮授权服务（`app/console/services/button-grant.service.js`）的纯函数部分
 *
 * 只测不依赖数据库的判据：`isSuperViewer`（超管不看菜单授权）与缓存失效的空操作。
 * 真正的取数（角色 → 菜单授权 → 按钮码）需要库里数据，留给集成/人工验收 ——
 * 这里若用假数据自测，会验证不到 SQL 口径，属于"手写常量自测"。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect } from '@jest/globals';
import {
  isSuperViewer,
  stripBlockedButtons,
  invalidateButtonGrants,
  resetButtonGrantCacheForTesting
} from '../../../app/console/services/button-grant.service.js';

/** 造一个 request.state.user 形状的账号 */
const user = (allows, roles = []) => ({ userId: 1, roles, permissions: { allows, denies: [] } });

describe('isSuperViewer —— 谁不看菜单授权', () => {
  it('admin:* 通配算全量', () => {
    expect(isSuperViewer(user(['admin:*']))).toBe(true);
  });

  it('* 通配算全量', () => {
    expect(isSuperViewer(user(['*']))).toBe(true);
  });

  it('superadmin 角色算全量（哪怕策略里没有 admin:*）', () => {
    expect(isSuperViewer(user([], ['superadmin']))).toBe(true);
  });

  it('管理操作员不算全量：它的按钮必须按菜单授权判', () => {
    expect(isSuperViewer(user(['admin:user:*', 'admin:role:*', 'admin:policy:read'], ['admin_operator']))).toBe(false);
  });

  it('空权限不算全量', () => {
    expect(isSuperViewer(user([]))).toBe(false);
  });
});

describe('缓存失效', () => {
  it('全清与按用户清都是空操作，不抛错', () => {
    expect(() => invalidateButtonGrants()).not.toThrow();
    expect(() => invalidateButtonGrants(7)).not.toThrow();
    expect(() => resetButtonGrantCacheForTesting()).not.toThrow();
  });
});

describe('stripBlockedButtons —— 下发前把"按钮没授权"的码摘掉', () => {
  const ALL = ['admin:user:read', 'admin:user:create', 'admin:user:delete', 'admin:log:read', 'admin:log:remove'];
  const full = {
    buttonCodes: ['admin:user:create', 'admin:user:delete'],
    menuPerms: ['admin:user:create', 'admin:user:delete']
  };

  it('没有未授权按钮：原样返回（**保留通配**，前端还能匹配到将来新增的码）', () => {
    const allows = ['admin:*'];
    expect(stripBlockedButtons(allows, full, ALL)).toEqual(['admin:*']);
  });

  it('未授权字面码：直接摘掉，其它码不动', () => {
    const gate = { buttonCodes: full.buttonCodes, menuPerms: ['admin:user:create'] };
    expect(stripBlockedButtons(['admin:user:create', 'admin:user:delete', 'admin:log:read'], gate, ALL)).toEqual([
      'admin:user:create',
      'admin:log:read'
    ]);
  });

  it('通配扫到了未授权按钮：展开成具体码（模式表达不了"除了 X"）', () => {
    const gate = { buttonCodes: full.buttonCodes, menuPerms: ['admin:user:create'] };
    const result = stripBlockedButtons(['admin:*'], gate, ALL);
    expect(result).not.toContain('admin:*');
    expect(result).toContain('admin:user:create');
    expect(result).not.toContain('admin:user:delete'); // 被摘掉
    expect(result).toContain('admin:log:read'); // 非按钮码照旧保留
  });

  it('与被摘码同命名空间、但不相关的通配不受影响', () => {
    const gate = { buttonCodes: full.buttonCodes, menuPerms: [] };
    expect(stripBlockedButtons(['posecraft:*'], gate, ALL)).toEqual(['posecraft:*']);
  });
});
