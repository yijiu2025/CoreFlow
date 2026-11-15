/**
 * 导航分组（侧栏与命令面板的**唯一来源**）
 *
 * === 为什么抽到 composable ===
 * 命令面板要列"所有能进的页面"，而这份清单原本长在 `AppShell.vue` 里（只为侧栏服务）。
 * 如果面板自己再算一遍，就会出现两套过滤规则：侧栏藏了某个入口、面板里却还搜得到。
 *
 * 现在两边都调这里：`AppShell` 取 `groups` 渲染侧栏，命令面板取 `pages` 做搜索。
 *
 * === 过滤规则（三道） ===
 * 1. `visible === 0` 的节点**不进**（后端已滤过一遍，这里再滤一次：这个字段是"强制下架"，
 *    宁可重复也不要因为某条老数据漏滤而露出来）；
 * 2. 路由没注册（`name === 'not-found'`）**不进** —— 点进去只有 404；
 * 3. 路由 `meta.permission` 不通过**不进** —— 判据取路由声明的那一份，不拿菜单自己的
 *    `permission` 字段（它是库里可改的自由文本，与路由漂移时会露死链）。
 *
 * 目录在子项被筛空后整组消失：只剩标题的空分组比死链更让人摸不着头脑。
 *
 * @author yijiu2025
 * @since 2026-11-15
 */
import { computed, type ComputedRef } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { MenuNode } from '@/api/types';
import type { ConsoleNavGroup, ConsoleNavItem } from '@/theme/views/console';

/** 扁平后的一个页面（命令面板用） */
export interface NavPage extends ConsoleNavItem {
  /** 所属分组标题（顶层菜单为「导航」） */
  group: string;
}

/**
 * 判断某个路径是否可进入
 *
 * @param path 目标路径
 * @param router 路由器
 * @param hasPermission 权限判定
 * @returns 可进入返回 true
 */
function canEnterPath(
  path: string,
  router: ReturnType<typeof useRouter>,
  hasPermission: (code: string) => boolean
): boolean {
  const resolved = router.resolve(path);
  if (resolved.name === 'not-found') return false;
  const code = (resolved.meta?.permission as string | undefined) ?? '';
  return !code || hasPermission(code);
}

export function useNavGroups(): {
  groups: ComputedRef<ConsoleNavGroup[]>;
  pages: ComputedRef<NavPage[]>;
  /** 这条路径当前账号进不进得去（侧栏用来禁用入口、命令面板用来过滤） */
  can: (path: string) => boolean;
} {
  const auth = useAuthStore();
  const router = useRouter();

  const groups = computed<ConsoleNavGroup[]>(() => {
    const out: ConsoleNavGroup[] = [];
    const loose: MenuNode[] = [];

    /** 递归过滤：去下架、去空目录、去进不去的 */
    const shown = (nodes: MenuNode[]): MenuNode[] =>
      nodes
        .filter(node => node.visible !== 0)
        .map(node => ({ ...node, children: shown(node.children || []) }))
        .filter(node =>
          node.type === 'dir'
            ? (node.children || []).length > 0
            : !node.path || canEnterPath(node.path, router, auth.hasPermission)
        );

    for (const node of shown(auth.menus)) {
      if (node.type === 'dir') {
        out.push({
          key: `dir-${node.id}`,
          title: node.name,
          items: (node.children || [])
            .filter(child => !!child.path)
            .map(child => ({
              id: child.id,
              name: child.name,
              path: child.path as string,
              icon: child.icon || ''
            }))
        });
      } else if (node.type === 'menu') {
        loose.push(node);
      }
    }

    if (loose.length > 0) {
      out.unshift({
        key: 'root',
        title: '导航',
        items: loose
          .filter(node => !!node.path)
          .map(node => ({ id: node.id, name: node.name, path: node.path as string, icon: node.icon || '' }))
      });
    }
    return out;
  });

  /** 扁平页面清单（带分组标题，便于命令面板显示副标题） */
  const pages = computed<NavPage[]>(() =>
    groups.value.flatMap(group => group.items.map(item => ({ ...item, group: group.title })))
  );

  /**
   * 这条路径当前账号进不进得去
   *
   * 版式（侧栏）与命令面板都要判，所以从同一处导出 —— 两份判据就会出现
   * "侧栏能点、面板搜不到"或反过来的错位。
   *
   * @param path 目标路径
   * @returns 可进入返回 true
   */
  function can(path: string): boolean {
    return canEnterPath(path, router, auth.hasPermission);
  }

  return { groups, pages, can };
}
