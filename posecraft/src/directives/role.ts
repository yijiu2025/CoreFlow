/**
 * v-role 角色指令
 *
 * 用法：
 *   <button v-role="'admin'">管理</button>                    <!-- 单角色，不匹配时移除 -->
 *   <button v-role="['admin', 'operator']">操作</button>       <!-- 多角色（任一满足） -->
 *
 * 角色数据结构：
 *   { roles: string[], permissions: { allows: string[], denies: string[] } }
 *   roles 数组包含用户的所有角色编码
 */
import type { Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 校验当前用户是否拥有指定角色之一
 */
function checkRole(value: string | string[]): boolean {
  try {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) return false

    const required = Array.isArray(value) ? value : [value]
    return required.some(r => authStore.hasRole(r))
  } catch {
    return false
  }
}

export const roleDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    if (!binding.value) return

    if (!checkRole(binding.value)) {
      el.remove()
    }
  },

  /**
   * binding.value 动态变化时重新校验
   */
  updated(el: HTMLElement, binding: DirectiveBinding) {
    if (!binding.value) return

    if (!checkRole(binding.value)) {
      el.remove()
    }
  }
}