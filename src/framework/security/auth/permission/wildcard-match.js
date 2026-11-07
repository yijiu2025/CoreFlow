/**
 * 权限通配符匹配（单一来源）
 *
 * 语义（与 Sa-Token 对齐的子集）：
 * - `*`          → 匹配一切
 * - `user:*`     → `user:` 开头的一切（`*` 可跨 `:` 段）
 * - `user:*:read`→ 中段通配同样支持
 * - 其余字符按字面量匹配（**元字符不解释**：`user:read` 里的 `.` 不会匹配 `userXread`）
 *
 * 为什么抽成公共文件：stp-util 的 `_isMatch` 与 api/guard.js 的 `isPermissionMatch`
 * 曾是两份独立实现且语义漂移（前者正则未转义元字符，后者仅支持尾部 `:*`）。
 * 收拢后单一来源，改语义只动这里。
 *
 * 纯函数、零依赖、零副作用——stp-util（要求 import 零副作用）可安全引用。
 *
 * @author yijiu2025
 * @since 2026-11-01 自 stp-util._isMatch / api/guard.js isPermissionMatch 收拢
 */

/**
 * 通配符匹配
 * @param {string} pattern 权限模式（如 'user:admin:*'）
 * @param {string} target 待匹配的权限串
 * @returns {boolean}
 */
function isWildcardMatch(pattern, target) {
  if (typeof pattern !== 'string' || typeof target !== 'string') return false;
  if (pattern === '*') return true;
  if (pattern === target) return true;
  if (!pattern.includes('*')) return false;
  // 先转义全部正则元字符，再以 * 为界拼回 .*——防止 pattern 里的
  // '.'、'('、'[' 等被当正则语法解释
  const regex = new RegExp(
    '^' +
      pattern
        .split('*')
        .map(seg => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$'
  );
  return regex.test(target);
}

export { isWildcardMatch };
