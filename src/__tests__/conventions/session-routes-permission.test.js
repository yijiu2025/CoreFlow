/**
 * 设备会话接口必须走 PBAC 权限码（`api/admin/user/v1/sessions.js`）
 *
 * 真实问题：这两个接口原来用 `allowRoles` 角色白名单，与控制台的菜单/按钮授权
 * **完全脱钩** —— 把「用户管理」页面和「高危操作」按钮取消之后，持那几个角色的人
 * 照样能看设备指纹、照样能把人踢下线。白名单还写死了角色名，新管理员角色永远用不了。
 *
 * 这里钉住：两条路由都必须声明 `requirePermission`，且文件里不再出现 `allowRoles`。
 *
 * @author yijiu2025
 * @since 2026-11-19
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../../api/admin/user/v1/sessions.js', import.meta.url), 'utf8');

/** 按 registerSecureRoute 切块 */
const blocks = SOURCE.split('registerSecureRoute(fastify, {').slice(1);
const blockOf = name => blocks.find(block => block.includes(`name: '${name}'`)) || '';

describe('设备会话路由的鉴权方式', () => {
  test('查看设备会话用「查看」码（与列表/详情同权）', () => {
    const block = blockOf('listUserSessions');
    expect(block).not.toBe('');
    expect(block).toContain('requirePermission');
    expect(block).toContain('ADMIN_PERMISSIONS.USER.READ');
  });

  test('踢设备下线用「编辑」码（与编辑/冻结同权）', () => {
    const block = blockOf('kickSessionByDevice');
    expect(block).not.toBe('');
    expect(block).toContain('requirePermission');
    expect(block).toContain('ADMIN_PERMISSIONS.USER.UPDATE');
  });

  test('整个文件不再出现 allowRoles 白名单（否则等于绕过菜单授权）', () => {
    // 注释里为了说明历史会提到这个词，这里只检查代码行
    const codeLines = SOURCE.split('\n').filter(line => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    expect(codeLines.join('\n')).not.toContain('allowRoles');
  });
});
