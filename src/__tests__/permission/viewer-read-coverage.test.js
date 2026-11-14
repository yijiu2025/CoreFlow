/**
 * 「管理观察者 = 全站只读」的契约守卫
 *
 * 背景（2026-11-14）：
 * 侧栏由 `sys_role_menu` 决定，接口由权限码决定 —— 两套事实。把菜单全量授权给
 * `admin_viewer` 之后，菜单看上去一切正常，可页面一进去就被路由守卫送 `/no-access`：
 * 因为 `admin_viewer` 的 policy 当时只有 `user/role/policy` 三个 read 码。
 * 现象是「这页点了没反应 / 白屏跳走」，排查起来先怀疑菜单、再怀疑守卫、最后才翻 policy。
 *
 * 这类漏配不会在启动时报错（roleRegistry 只是 upsert 一个数组），也不会被任何接口
 * 单测抓到 —— 只有真拿观察者账号把每个菜单点一遍才会发现。所以把它变成机器判据：
 *
 *   1. `admin_viewer` 必须覆盖 admin 域**每一个** `type: 'read'` 的码；
 *   2. `admin_viewer` 里**不许**出现非 read 码（写码 / 通配符）；
 *   3. 判据本身要有牙（少一个必须被抓到），否则两条断言都可能因为集合取空而空转。
 *
 * 判据从权限注册表派生，不在测试里手抄码表：新增页面时作者只需在
 * `src/app/admin/permission/index.js` 里写一个 `{ type: 'read' }` 条目，
 * 这份守卫就会立刻要求观察者跟上；真要"这一页不给观察者看"，那就得在这里显式
 * 排除并写清理由 —— 让例外变成一次有人负责的决定，而不是一次遗忘。
 *
 * @author yijiu2025
 * @since 2026-11-14
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

import { actionMetaRegistry, roleRegistry } from '../../framework/security/pbac/index.js';

/** 观察者角色编码（本文件全部判据的主语） */
const VIEWER_CODE = 'admin_viewer';

/**
 * admin 域全部 read 型权限码
 *
 * 取注册表里 `domain === 'admin' && type === 'read'` 的条目，而不是
 * `ADMIN_PERMISSIONS` 的键名 —— 后者是纯字符串表，读不出 `type`。
 *
 * @returns {string[]} 权限码
 */
function adminReadCodes() {
  return actionMetaRegistry
    .filter(meta => meta.domain === 'admin')
    .flatMap(meta => meta.actions || [])
    .filter(action => action.type === 'read')
    .map(action => action.code);
}

/**
 * 某个角色在 policy 里声明的全部 Action
 *
 * @param {object|null} role 角色定义
 * @returns {string[]} 权限码（已去重）
 */
function actionsOf(role) {
  const statements = role?.policy?.Statement || [];
  return [...new Set(statements.flatMap(statement => statement.Action || []))];
}

/**
 * 观察者缺了哪些 read 码
 *
 * @param {string[]} granted 观察者已声明的 Action
 * @param {string[]} required 应当覆盖的 read 码
 * @returns {string[]} 缺口；空数组表示齐了
 */
function missingReadCodes(granted, required) {
  const owned = new Set(granted);
  return required.filter(code => !owned.has(code));
}

/**
 * 观察者里混进了哪些非 read 码
 *
 * @param {string[]} granted 观察者已声明的 Action
 * @param {string[]} readCodes admin 域的 read 码
 * @returns {string[]} 越界的码；空数组表示干净的只读
 */
function nonReadCodes(granted, readCodes) {
  const read = new Set(readCodes);
  return granted.filter(code => !read.has(code));
}

beforeAll(async () => {
  // 只 import 角色定义就会连带注册权限码（`./index.js` 在 import 期建注册表），
  // 不需要连 DB —— 这里量的是静态声明，不是运行期策略。
  await import('../../app/admin/permission/roles.js');
});

describe('管理观察者：全站只读的权限契约', () => {
  it('确实读到了 admin 域的 read 码与观察者角色（防止路径写错导致守卫空转）', () => {
    expect(adminReadCodes().length).toBeGreaterThanOrEqual(8);
    expect(roleRegistry.some(role => role.code === VIEWER_CODE)).toBe(true);
  });

  it('观察者覆盖 admin 域每一个 read 码 —— 漏一个就是一个点不进去的菜单', () => {
    const viewer = roleRegistry.find(role => role.code === VIEWER_CODE);
    const gaps = missingReadCodes(actionsOf(viewer), adminReadCodes());

    expect(gaps.join('\n')).toBe('');
  });

  it('观察者不含任何非 read 码 —— 只读身份不能被一个写码作废', () => {
    const viewer = roleRegistry.find(role => role.code === VIEWER_CODE);
    const extras = nonReadCodes(actionsOf(viewer), adminReadCodes());

    expect(extras.join('\n')).toBe('');
  });

  it('检测器有牙：少给一个 read 码必须被抓到', () => {
    const readCodes = adminReadCodes();
    const all = [...readCodes];
    const dropped = all.pop();

    expect(missingReadCodes(all, readCodes)).toEqual([dropped]);
    expect(missingReadCodes(readCodes, readCodes)).toHaveLength(0);
  });

  it('检测器有牙：混进写码必须被抓到', () => {
    const readCodes = adminReadCodes();
    // 挑一个真实存在的写码，而不是手写字符串 —— 码表改了这里跟着改
    const writeCode = actionMetaRegistry
      .filter(meta => meta.domain === 'admin')
      .flatMap(meta => meta.actions || [])
      .find(action => action.type !== 'read').code;

    expect(nonReadCodes([...readCodes, writeCode], readCodes)).toEqual([writeCode]);
    expect(nonReadCodes(readCodes, readCodes)).toHaveLength(0);
  });
});
