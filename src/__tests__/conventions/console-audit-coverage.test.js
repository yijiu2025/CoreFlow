/**
 * Console 写接口的审计覆盖（约定测试）
 *
 * 背景：用户管理页的「冻结/解冻」点了没日志，顺着查出新建、编辑、导出、批量授权
 * 也都没进 `audit_logs`；继续扫发现角色、菜单、岗位三个模块的增删改同样一条不记。
 * 根因不是"某处写错"，而是**没有任何东西要求写接口必须留痕** —— 新加一个接口时
 * 漏掉审计，所有功能测试照样全绿。
 *
 * 这条测试把「规范性」变成可执行的判据：每个列在册的写接口，其路由块内必须真的
 * 调用了 audit 系列函数，并且带上了预期的事件码。
 *
 * 新增写接口时：加审计 → 在这里登记一行。忘了登记不会失败，但忘了审计会。
 *
 * @author yijiu2025
 * @since 2026-11-17
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const DIR = new URL('../../api/admin/console/v1/', import.meta.url);

/** 模块 → 该模块内必须留痕的写接口（路由 name → 事件码/常量） */
const MODULES = [
  {
    file: 'users.js',
    routes: [
      ['adminUserCreate', 'USER_EVENTS.CREATE'],
      ['adminUserUpdate', 'USER_EVENTS.UPDATE'],
      ['adminUserStatus', 'USER_EVENTS.STATUS'],
      ['adminUserExport', 'USER_EVENTS.EXPORT'],
      ['adminUserBatchGrant', 'USER_EVENTS.BATCH_GRANT']
    ]
  },
  {
    file: 'roles.js',
    routes: [
      ['adminRoleCreate', "'ROLE_CREATE'"],
      ['adminRoleUpdate', "'ROLE_UPDATE'"],
      ['adminRoleRemove', "'ROLE_DELETE'"]
    ]
  },
  {
    file: 'menus.js',
    routes: [
      ['adminMenuCreate', "'MENU_CREATE'"],
      ['adminMenuUpdate', "'MENU_UPDATE'"],
      ['adminMenuRemove', "'MENU_DELETE'"]
    ]
  },
  {
    file: 'posts.js',
    routes: [
      ['adminPostCreate', "'POST_CREATE'"],
      ['adminPostUpdate', "'POST_UPDATE'"],
      ['adminPostRemove', "'POST_DELETE'"]
    ]
  },
  {
    file: 'depts.js',
    routes: [
      ['adminDeptCreate', 'DEPT_AUDIT_TYPES.CREATE'],
      ['adminDeptUpdate', 'DEPT_AUDIT_TYPES.UPDATE'],
      ['adminDeptRemove', 'DEPT_AUDIT_TYPES.DELETE']
    ]
  }
];

/**
 * 按 `registerSecureRoute(fastify, {` 切块
 *
 * 每块从该路由开始，到下一条路由之前结束 —— 这样"在 handler 里"与"在相邻接口里"
 * 能被区分开（否则随便哪个接口写了审计，全文件都会通过）。
 *
 * @param {string} file 模块文件名
 * @returns {string[]} 路由块
 */
function blocksOf(file) {
  const source = readFileSync(new URL(file, DIR), 'utf8');
  return source.split('registerSecureRoute(fastify, {').slice(1);
}

/**
 * 取出指定路由的源码块
 *
 * @param {string[]} blocks 全部路由块
 * @param {string} name 路由 name
 * @returns {string} 路由块源码（找不到返回空串）
 */
function blockOf(blocks, name) {
  return blocks.find(block => block.includes(`name: '${name}'`)) || '';
}

describe('Console 写接口必须留痕', () => {
  test('每个登记的写接口都调用了审计且事件码正确', () => {
    // 不用 describe/test.each 生成动态标题：jest/valid-title 只认字符串字面量，
    // 这里改为显式遍历 + 带路由名的错误信息，定位同样精确
    const checked = [];
    for (const { file, routes } of MODULES) {
      const blocks = blocksOf(file);
      for (const [name, eventCode] of routes) {
        const block = blockOf(blocks, name);
        if (!block) throw new Error(`${file} 里找不到路由 ${name}`);
        if (!/await (audit|auditUser)\(/.test(block)) {
          throw new Error(`${name} 的 handler 没有调用审计（audit / auditUser）`);
        }
        if (!block.includes(eventCode)) {
          throw new Error(`${name} 的审计缺少事件码 ${eventCode}`);
        }
        checked.push(name);
      }
    }
    expect(checked).toHaveLength(MODULES.reduce((sum, module) => sum + module.routes.length, 0));
  });

  test('路由块切分有效（每块都能定位到唯一一条路由）', () => {
    for (const { file, routes } of MODULES) {
      const names = blocksOf(file)
        .map(block => (block.match(/name: '(\w+)'/) || [])[1])
        .filter(Boolean);
      if (new Set(names).size !== names.length) throw new Error(`${file} 路由块切分失败（出现重名块）`);
      if (names.length < routes.length) throw new Error(`${file} 路由块数量少于登记数`);
    }
    expect(MODULES.length).toBeGreaterThan(0);
  });
});

describe('留痕要记「改成了什么」，不能只有一句"操作成功"', () => {
  test('用户状态变更带 changes（from → to）', () => {
    const block = blockOf(blocksOf('users.js'), 'adminUserStatus');
    expect(block).toContain('changes');
    expect(block).toContain('statusText(');
    expect(block).toContain('statusBefore');
  });

  test('用户编辑带字段级 diff', () => {
    const block = blockOf(blocksOf('users.js'), 'adminUserUpdate');
    expect(block).toContain('diffProfile(');
    expect(block).toContain('changes');
  });

  test('导出记条数与筛选条件（数据外带要能追溯范围）', () => {
    const block = blockOf(blocksOf('users.js'), 'adminUserExport');
    expect(block).toContain('count');
    expect(block).toContain('filters');
  });

  test('菜单编辑记字段级 diff（permission 换码等于换授权范围）', () => {
    const block = blockOf(blocksOf('menus.js'), 'adminMenuUpdate');
    expect(block).toContain('menuChanges');
    expect(block).toContain("'permission'");
  });

  test('岗位编辑在 update 之前取变更前快照', () => {
    const block = blockOf(blocksOf('posts.js'), 'adminPostUpdate');
    expect(block).toContain('postDao.findById(id)');
    expect(block.indexOf('postDao.findById(id)')).toBeLessThan(block.indexOf('postDao.update(id'));
  });
});
