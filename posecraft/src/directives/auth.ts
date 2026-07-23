/**
 * v-auth 权限指令
 *
 * 用法：
 *   <button v-auth="'config:write'">保存</button>                    <!-- 单权限 -->
 *   <button v-auth="['config:write', 'config:delete']">操作</button>  <!-- 多权限 OR（任一满足） -->
 *   <button v-auth="{ any: ['a', 'b'] }">操作</button>               <!-- 同上，显式 OR -->
 *   <button v-auth="{ all: ['a', 'b'] }">操作</button>               <!-- 多权限 AND（全部满足） -->
 *   <button v-auth:disabled="'config:write'">保存</button>            <!-- 无权限时禁用 -->
 *   <button v-auth:hidden="'config:write'">保存</button>              <!-- 无权限时隐藏 -->
 *
 *   <!-- 权限 + 角色组合验证 -->
 *   <button v-auth="{ perm: 'config:write', role: 'admin' }">保存</button>
 *   <button v-auth="{ perm: { any: ['a', 'b'] }, role: 'admin' }">操作</button>
 *   <button v-auth="{ perm: { all: ['a', 'b'] }, role: 'admin' }">操作</button>
 *
 * 权限数据结构：
 *   { roles: string[], permissions: { allows: string[], denies: string[] } }
 *   支持通配符匹配（* 和 xxx:*），deny 永远优先于 admin 放行
 */
import type { Directive, DirectiveBinding } from 'vue';
import { useAuthStore } from '@/stores/auth';

type PermSpec = string | string[] | { any: string[] } | { all: string[] };

interface AuthValue {
  perm?: PermSpec;
  role?: string | string[];
}

type BindingValue = string | string[] | AuthValue;

/**
 * 通配符匹配：pattern 是否匹配 target
 */
function matchSingle(pattern: string, target: string): boolean {
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (pattern.endsWith(':*')) return target.startsWith(pattern.slice(0, -1));
  return false;
}

/**
 * 校验权限：deny 优先于 admin 放行
 * 支持三种模式：
 *   'perm'              → 单权限
 *   ['a', 'b']          → OR（任一满足）
 *   { any: ['a','b'] }  → OR（显式）
 *   { all: ['a','b'] }  → AND（全部满足）
 */
function checkPermission(perm: PermSpec): boolean {
  try {
    const authStore = useAuthStore();
    if (!authStore.isLoggedIn) return false;

    const { allows, denies } = authStore.permissions;

    // 解析需要的权限列表和匹配模式
    let required: string[];
    let mode: 'any' | 'all';

    if (typeof perm === 'string') {
      required = [perm];
      mode = 'any';
    } else if (Array.isArray(perm)) {
      required = perm;
      mode = 'any';
    } else if ('any' in perm) {
      required = perm.any;
      mode = 'any';
    } else {
      required = perm.all;
      mode = 'all';
    }

    // 1. deny 优先：任一 deny 匹配任一 required → 拒绝（即使 admin）
    if (denies.some((p: string) => required.some(r => matchSingle(p, r)))) return false;

    // 2. admin 放行（deny 未命中时）
    if (authStore.isAdmin) return true;

    // 3. allow 匹配
    if (mode === 'all') {
      // AND：每个 required 都必须有 allow 匹配
      return required.every(r => allows.some((p: string) => matchSingle(p, r)));
    }
    // OR：任一 required 有 allow 匹配即可
    return required.some(r => allows.some((p: string) => matchSingle(p, r)));
  } catch {
    return false;
  }
}

/**
 * 校验角色：用户是否拥有指定角色之一
 */
function checkRole(role: string | string[]): boolean {
  try {
    const authStore = useAuthStore();
    if (!authStore.isLoggedIn) return false;
    const required = Array.isArray(role) ? role : [role];
    return required.some(r => authStore.hasRole(r));
  } catch {
    return false;
  }
}

/**
 * 校验绑定值
 * 字符串/数组 → 仅验权限
 * { perm, role } → 权限和角色同时验（都通过才放行）
 */
function checkValue(value: BindingValue): boolean {
  if (typeof value === 'string' || Array.isArray(value)) {
    return checkPermission(value);
  }
  // 对象模式：权限 + 角色组合验证
  const { perm, role } = value;
  const permOk = perm ? checkPermission(perm) : true;
  const roleOk = role ? checkRole(role) : true;
  return permOk && roleOk;
}

function applyResult(el: HTMLElement, passed: boolean, modifiers: Record<string, boolean>) {
  if (passed) {
    if (modifiers.disabled) el.removeAttribute('disabled');
    if (modifiers.hidden) el.style.display = '';
    return;
  }

  if (modifiers.disabled) {
    el.setAttribute('disabled', 'disabled');
  } else if (modifiers.hidden) {
    el.style.display = 'none';
  } else {
    el.remove();
  }
}

export const authDirective: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    if (!binding.value) return;
    applyResult(el, checkValue(binding.value), binding.modifiers as Record<string, boolean>);
  },

  updated(el: HTMLElement, binding: DirectiveBinding) {
    if (!binding.value) return;
    applyResult(el, checkValue(binding.value), binding.modifiers as Record<string, boolean>);
  }
};
