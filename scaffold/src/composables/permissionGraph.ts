/**
 * 权限关系图的数据入口（带缓存与并发合并）
 *
 * 溯源视图与菜单星图共用**同一份**整图：重复进页面不重复请求；
 * 并发调用只发一次（`pending` 合并）。写操作后需要新数据时传 `force = true`
 * 或调 `invalidatePermissionGraph()`。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */
import { shallowRef } from 'vue';
import { permissionGraph } from '@/api/system';
import { indexPermissionGraph, type PermissionIndex } from '@/utils/permissionGraph';

/** 当前整图索引（未加载时为 null） */
export const permissionIndex = shallowRef<PermissionIndex | null>(null);

let pending: Promise<PermissionIndex> | null = null;

/**
 * 加载（或取缓存）权限整图
 *
 * @param force 是否强制重新拉取
 * @returns 索引对象
 */
export function loadPermissionGraph(force = false): Promise<PermissionIndex> {
  if (!force && permissionIndex.value) return Promise.resolve(permissionIndex.value);
  if (!force && pending) return pending;

  pending = permissionGraph()
    .then(graph => {
      const index = indexPermissionGraph(graph);
      permissionIndex.value = index;
      return index;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** 丢弃缓存（授权变更、账号切换后调用） */
export function invalidatePermissionGraph(): void {
  permissionIndex.value = null;
}
