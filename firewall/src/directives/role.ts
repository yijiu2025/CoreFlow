/**
 * v-role 角色指令
 *
 * 用法：
 *   <button v-role="'admin'">管理</button>
 *   <button v-role="['admin', 'operator']">操作</button>
 *
 * 角色不匹配时元素从 DOM 移除
 */
import type { Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'

function checkRole(value: string | string[]): boolean {
  const authStore = useAuthStore()
  if (!authStore.isLoggedIn) return false

  const required = Array.isArray(value) ? value : [value]
  return required.some(r => authStore.hasRole(r))
}

export const roleDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const value = binding.value
    if (!value) return

    if (!checkRole(value)) {
      el.parentNode?.removeChild(el)
    }
  }
}
