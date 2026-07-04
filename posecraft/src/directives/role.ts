/**
 * v-role 角色权限控制指令
 *
 * 用法举例：
 *   <button v-role="'admin'">系统管理</button>
 *   <button v-role="['admin', 'operator']">编辑配置</button>
 *
 * 说明：
 *   如果当前登录用户不具备指定的角色，该指令会自动从 DOM 中移除绑定的元素。
 */
import type { Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 校验当前登录用户是否具备要求的角色之一
 */
function checkRole(value: string | string[]): boolean {
  const authStore = useAuthStore()
  // 未登录直接无权限
  if (!authStore.isLoggedIn) return false

  // 格式化为数组，支持传入单字符串或多字符串数组
  const required = Array.isArray(value) ? value : [value]
  return required.some(r => authStore.hasRole(r))
}

export const roleDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const value = binding.value
    if (!value) return

    // 校验未通过时，将元素从其父节点中物理移出
    if (!checkRole(value)) {
      el.parentNode?.removeChild(el)
    }
  }
}
