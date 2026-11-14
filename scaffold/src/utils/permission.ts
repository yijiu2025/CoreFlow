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

export { matchPermission };
