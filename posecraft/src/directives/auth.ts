/**
 * v-auth 操作权限控制指令
 *
 * 用法举例：
 *   <button v-auth="'posecraft:template:create'">发布模板</button>
 *   <button v-auth="['posecraft:template:update', 'posecraft:template:delete']">高级修改</button>
 *
 * 说明：
 *   如果当前登录用户不具备指定的某一项权限，该指令会自动从 DOM 中移除绑定的元素。
 *   支持通配符模式匹配，并且对 admin 角色默认放行所有权限。
 */
import type { Directive, DirectiveBinding } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 校验当前登录用户是否满足指定的权限要求
 */
function checkPermission(value: string | string[]): boolean {
  const authStore = useAuthStore()
  // 未登录直接无权限
  if (!authStore.isLoggedIn) return false

  // 系统管理员默认放行所有权限操作
  if (authStore.isAdmin) return true

  // 格式化为数组，支持传入单字符串或多字符串数组
  const required = Array.isArray(value) ? value : [value]
  return required.some(p => authStore.hasPermission(p))
}

export const authDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    const value = binding.value
    if (!value) return

    // 校验未通过时，将元素从其父节点中物理移出
    if (!checkPermission(value)) {
      el.parentNode?.removeChild(el)
    }
  }
}
