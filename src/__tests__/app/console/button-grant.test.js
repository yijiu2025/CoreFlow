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

describe('页面级码（type=menu）也进闸', () => {
  const PAGE_GATE = {
    buttonCodes: ['admin:user:read', 'admin:user:export', 'admin:user:create'],
    menuPerms: ['admin:user:export', 'admin:user:create'],
    pageCodes: ['admin:user:read'],
    hasPageGrant: true
  };

  it('取消整个页面 → 页面码被摘掉（接口随之 403，不只是侧栏消失）', () => {
    const out = stripBlockedButtons(['admin:user:read', 'admin:user:export'], PAGE_GATE, [
      'admin:user:read',
      'admin:user:export'
    ]);
    expect(out).toEqual(['admin:user:export']);
  });

  it('页面仍授权时页面码保留', () => {
    const gate = { ...PAGE_GATE, menuPerms: ['admin:user:read', 'admin:user:export'] };
    const out = stripBlockedButtons(['admin:user:read', 'admin:user:export'], gate, [
      'admin:user:read',
      'admin:user:export'
    ]);
    expect(out).toEqual(['admin:user:read', 'admin:user:export']);
  });

  it('硬闸：即使该角色从没配过页面授权，页面码照样拦（存量已补齐）', () => {
    const gate = { ...PAGE_GATE, hasPageGrant: false };
    const out = stripBlockedButtons(['admin:user:read'], gate, ['admin:user:read']);
    expect(out).toEqual([]);
  });

  it('旧形状的 gate（没有 pageCodes）行为不变', () => {
    const gate = { buttonCodes: ['admin:user:read'], menuPerms: [] };
    expect(stripBlockedButtons(['admin:user:read'], gate, ['admin:user:read'])).toEqual([]);
  });
});

describe('祖先溯源：页面关了，页内按钮码一起作废', () => {
  /** 页面 #3 下有 read/export；log:remove 同时属于 #11 与 #12 两个页面 */
  const PAGES = new Map([
    ['admin:user:read', new Set([3])],
    ['admin:user:export', new Set([3])],
    ['admin:log:remove', new Set([11, 12])]
  ]);
  const ALL = ['admin:user:read', 'admin:user:export', 'admin:log:remove'];

  it('页面被取消时，即使按钮本身还勾着，它的码也作废', () => {
    const gate = {
      buttonCodes: ALL,
      menuPerms: ['admin:user:export', 'admin:log:remove'], // 按钮都授权
      pageCodes: ['admin:user:read'],
      pagesOfCode: PAGES,
      pageGrants: new Set([11, 12]), // 只取消了用户管理页
      hasPageGrant: true
    };
    const out = stripBlockedButtons(ALL, gate, ALL);
    expect(out).toEqual(['admin:log:remove']); // read 未授权、export 页面被取消
  });

  it('多页面归属用 OR：还剩一个页面授权就继续可用', () => {
    const gate = {
      buttonCodes: ALL,
      menuPerms: ['admin:log:remove'],
      pageCodes: ['admin:user:read'],
      pagesOfCode: PAGES,
      pageGrants: new Set([12]), // 只剩登录日志
      hasPageGrant: true
    };
    const out = stripBlockedButtons(['admin:log:remove'], gate, ALL);
    expect(out).toEqual(['admin:log:remove']);
  });

  it('两个所属页面都被取消 ⇒ 作废', () => {
    const gate = {
      buttonCodes: ALL,
      menuPerms: ['admin:log:remove'],
      pageCodes: ['admin:user:read'],
      pagesOfCode: PAGES,
      pageGrants: new Set([]),
      hasPageGrant: true
    };
    const out = stripBlockedButtons(['admin:log:remove'], gate, ALL);
    expect(out).toEqual([]);
  });

  it('没有 pagesOfCode 的旧形状行为不变', () => {
    const gate = { buttonCodes: ['admin:user:export'], menuPerms: ['admin:user:export'] };
    expect(stripBlockedButtons(['admin:user:export'], gate, ['admin:user:export'])).toEqual(['admin:user:export']);
  });
});
