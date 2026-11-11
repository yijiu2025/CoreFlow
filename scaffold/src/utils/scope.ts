/**
 * 授权范围 · 前端展示层判定
 *
 * ⚠️ 这不是权限闸门，**服务端才是**（`app/console/services/access-scope.service.js`）。
 * 这里只解决一个体验问题：让按钮在"点了必被拒"的时候就是灰的，而不是让用户填完
 * 表单、点保存、再收到 403。
 *
 * 因此规则必须与后端**逐条对齐**，且只允许出现"更保守"的偏差（灰掉其实可改的，
 * 最坏是多问一句管理员）；反过来（亮着但后端拒）才是 bug。两边改一处时请同时改。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import type { ActorScope, RoleOption, UserRow } from '@/api/types';

/** 判定结果 */
export interface ManageVerdict {
  ok: boolean;
  /** 不可管理的原因（`ok` 为 true 时为空串） */
  reason: string;
}

/**
 * 从用户行推出「目标画像」
 *
 * 只认 `role_ids`（GROUP_CONCAT 的 ID 串）：角色名可能重名、可改名、还可能含逗号，
 * 用名字反查会静默选错角色（列表回填也是同一条口径）。
 *
 * @param row 用户行
 * @param roleById 角色 ID → 角色选项
 * @returns 画像
 */
function describeUser(row: UserRow, roleById: Map<number, RoleOption>): {
  maxRank: number;
  isSuper: boolean;
  apps: Set<string>;
} {
  const ids = String(row.role_ids || '')
    .split(',')
    .map(v => Number(v))
    .filter(n => Number.isInteger(n) && n > 0);
  const roles = ids.map(id => roleById.get(id)).filter((r): r is RoleOption => Boolean(r));
  return {
    maxRank: roles.reduce((max, r) => Math.max(max, r.rank_level), 0),
    isSuper: roles.some(r => r.code === 'superadmin'),
    apps: new Set(roles.map(r => r.app_id || 'GLOBAL').filter(app => app !== 'GLOBAL'))
  };
}

/**
 * 当前操作者能否管理这个用户
 *
 * 与后端 `assertCanManageUser` 同序判定：超管保护 → 超管放行 → 职级严格大于 →
 * 非跨应用管理员必须有应用交集。
 *
 * @param scope 操作者范围（来自 `/users/options`）
 * @param row 目标用户行
 * @param roleById 角色 ID → 角色选项
 * @param operatorId 操作者用户 ID（改自己有单独的自锁校验，不算"越权"）
 * @param action 动作名（拼提示语）
 * @returns 判定结果
 */
export function canManageUser(
  scope: ActorScope | undefined,
  row: UserRow,
  roleById: Map<number, RoleOption>,
  operatorId: number | undefined,
  action = '管理'
): ManageVerdict {
  if (!scope) return { ok: true, reason: '' }; // 拿不到范围时交给后端裁决，别误伤
  if (Number(row.id) === Number(operatorId)) return { ok: true, reason: '' };

  const target = describeUser(row, roleById);

  if (target.isSuper && !scope.isSuper) {
    return { ok: false, reason: `只有超级管理员可以${action}超级管理员账号` };
  }
  if (scope.isSuper) return { ok: true, reason: '' };

  if (target.maxRank >= scope.maxRank) {
    return { ok: false, reason: `不能${action}同级或更高级管理员（职级 ${target.maxRank}）` };
  }

  if (!scope.crossApp) {
    const mine = scope.appIds || [];
    const overlapped = [...target.apps].some(app => mine.includes(app));
    if (mine.length > 0 && !overlapped) {
      return { ok: false, reason: `该用户不在你管理的应用内，不能${action}` };
    }
  }

  return { ok: true, reason: '' };
}

/**
 * 取角色 ID → 角色选项的索引
 *
 * @param roles 角色选项
 * @returns 索引表
 */
export function indexRoles(roles: RoleOption[]): Map<number, RoleOption> {
  return new Map(roles.map(role => [role.id, role]));
}
