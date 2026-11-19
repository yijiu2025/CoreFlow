/**
 * 管理端用户域路由必须走 PBAC 权限码（不再用角色白名单）
 *
 * 真实问题：这些路由原来用 `allowRoles: ['superadmin','admin_admin',...]`，与
 * 控制台的菜单/按钮授权**完全脱钩** —— 把「用户管理」页面和「高危操作」按钮取消后，
 * 持那几个角色的人照样能调；白名单还写死角色名，新管理员角色用不了、老角色撤不掉。
 *
 * 这里钉住两件事：**文件里没有 allowRoles**、**每条 registerSecureRoute 都带 requirePermission**。
 *
 * 只读源码不 import 模块：断言对象是"路由声明用了哪种鉴权写法"，
 * 注册表里看不到这个区别（已登记 STRUCTURAL_GUARD_WHITELIST）。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const DIR = new URL('../../api/admin/user/v1/', import.meta.url);

/** 纳入守卫的文件（新增管理端用户域路由文件时在此登记） */
const FILES = ['admin.js', 'bans.js', 'deactivation.js', 'device-accounts.js', 'sessions.js'];

/**
 * 去掉注释行，只留代码（注释里保留历史说明不算违规）
 *
 * @param {string} source 源码
 * @returns {string} 代码行
 */
function codeOnly(source) {
  return source
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

describe('管理端用户域路由的鉴权方式', () => {
  // 不用 test.each 生成动态标题（jest/valid-title 只认字符串字面量），
  // 改为显式遍历 + 带文件名的错误信息，定位同样精确
  test('每个文件都不再使用 allowRoles 白名单', () => {
    for (const file of FILES) {
      const code = codeOnly(readFileSync(new URL(file, DIR), 'utf8'));
      if (code.includes('allowRoles')) throw new Error(`${file} 仍在使用 allowRoles 角色白名单`);
    }
    expect(FILES.length).toBeGreaterThan(0);
  });

  test('每条 registerSecureRoute 都声明了 requirePermission', () => {
    let checked = 0;
    for (const file of FILES) {
      const code = codeOnly(readFileSync(new URL(file, DIR), 'utf8'));
      const blocks = code.split('registerSecureRoute(fastify, {').slice(1);
      if (blocks.length === 0) throw new Error(`${file} 里没有找到路由`);
      for (const block of blocks) {
        const name = (block.match(/name: '(\w+)'/) || [])[1] || '(未命名)';
        if (!block.includes('requirePermission')) {
          throw new Error(`${file} 的路由 ${name} 没有声明 requirePermission`);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(FILES.length);
  });

  test('组元数据只要求登录（能力由逐条路由的权限码决定）', () => {
    for (const file of FILES) {
      const code = codeOnly(readFileSync(new URL(file, DIR), 'utf8'));
      const group = (code.match(/registerGroupMetadata\(\{[\s\S]*?\}\)/) || [''])[0];
      if (!group.includes('requireLogin: true')) throw new Error(`${file} 的组元数据缺少 requireLogin`);
      if (group.includes('allowRoles')) throw new Error(`${file} 的组元数据仍带 allowRoles`);
    }
  });
});
