import type { App } from 'vue'
import { roleDirective } from './role'
import { authDirective } from './auth'

/**
 * 集中注册全局 Vue 指令
 * @param app Vue App 实例
 */
export function setupDirectives(app: App) {
  app.directive('role', roleDirective)
  app.directive('auth', authDirective)
}
