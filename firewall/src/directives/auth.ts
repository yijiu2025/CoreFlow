/**
 * v-auth 权限指令
 *
 * 用法：
 *   <button v-auth="'config:write'">保存</button>
 *   <button v-auth="['config:write', 'config:delete']">操作</button>
 *
 * 无权限时元素从 DOM 移除
 * 支持通配符匹配，deny 优先
 */
import type { Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'

function checkPermission(value: string | string[]): boolean {
  const authStore = useAuthStore()
  if (!authStore.isLoggedIn) return false

  // 管理员拥有所有权限
  if (authStore.isAdmin) return true

  const required = Array.isArray(value) ? value : [value]
  return required.some(p => authStore.hasPermission(p))
}

export const authDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const value = binding.value
    if (!value) return

    if (!checkPermission(value)) {
      el.parentNode?.removeChild(el)
    }
  }
}
