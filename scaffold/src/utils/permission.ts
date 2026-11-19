import type { Router } from 'vue-router';

/**
 * 权限码通配匹配（前端单一来源）
 *
 * 语义与后端 `framework/security/auth/permission/wildcard-match.js` 对齐的部分：
 * `*` 匹配一切、`xxx:*` 匹配前缀、其余按字面量。前端只需要这三条（后端那份还支持
 * 中段通配，前端没有这种写法）。
 *
 * @param patterns 待匹配的权限码集合（角色 policy / 用户权限）
 * @param code 目标权限码
 * @returns 是否命中
 */
function matchPermission(patterns: string[], code: string): boolean {
  return patterns.some(pattern => {
    if (pattern === '*' || pattern === code) return true;
    if (pattern.endsWith('*')) return code.startsWith(pattern.slice(0, -1));
    return false;
  });
}

/**
 * 按「路由声明的权限码」过滤入口列表
 *
 * 为什么以路由为准而不是在入口清单里各写一遍权限码：
 *   · 单一来源 —— 路由改了码，入口自动跟着变，不会出现"入口还在、点进去 403"；
 *   · 与守卫同源 —— 守卫判的就是 `meta.permission`，同一个码同时决定"能不能进"
 *     和"要不要显示"，两边不可能分叉。
 *
 * 两条边界：
 *   · **路由没注册**（主题包切换、页面被裁掉）→ 藏。否则点进去是 404。
 *   · **未声明权限码** → 显示。与守卫 `if (permission && !has)` 的判据一致；
 *     这里若改成 fail-closed，就会出现"入口不显示、手动输 URL 却能进"的矛盾。
 *
 * 三处调用方（工作台常用入口、口袋版「通讯录」「发现」）原先各自手写这 8 行，
 * 其中工作台那份干脆没写 —— 于是卡片上写着"按权限可见"，实际全量显示。
 *
 * @param items 入口列表（每项需带 `path`）
 * @param router 路由实例（用 `resolve` 取 meta）
 * @param hasPermission 权限判定（通常是 `auth.hasPermission`）
 * @returns 过滤后的列表（保持原顺序）
 */
function filterByRoutePermission<T extends { path: string }>(
  items: T[],
  router: Router,
  hasPermission: (code: string) => boolean
): T[] {
  return items.filter(item => {
    const resolved = router.resolve(item.path);
    if (resolved.name === 'not-found') return false;
    const code = (resolved.meta?.permission as string | undefined) ?? '';
    return !code || hasPermission(code);
  });
}

export { matchPermission, filterByRoutePermission };
