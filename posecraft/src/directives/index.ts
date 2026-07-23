/**
 * 集中注册全局 Vue 指令
 *
 * 当前注册指令：
 *   v-auth  — 权限控制（支持权限 + 角色组合验证）
 */
import type { App } from 'vue';
import { authDirective } from './auth';

export function setupDirectives(app: App) {
  app.directive('auth', authDirective);
}
