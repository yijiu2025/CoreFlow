/**
 * 列表页通用状态（分页 / 加载 / 错误 / 刷新）
 *
 * 各页面的差异只在「取数函数」与「查询条件」，分页与错误处理不该各写一遍。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */
import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';

/** 列表取数函数签名 */
export type ListFetcher<T> = (query: Record<string, unknown>) => Promise<{ rows: T[]; total: number }>;

/** 列表查询对象（分页字段 + 任意筛选字段） */
export type ListQuery = { pageNum: number; pageSize: number } & Record<string, unknown>;

/** 通用列表状态 */
export interface ListState<T> {
  rows: Ref<T[]>;
  total: Ref<number>;
  loading: Ref<boolean>;
  errorMessage: Ref<string>;
  query: ListQuery;
  pageCount: ComputedRef<number>;
  load: () => Promise<void>;
  search: () => void;
  reset: (defaults?: Record<string, unknown>) => void;
  turnPage: (delta: number) => void;
}

/**
 * 创建通用列表状态
 *
 * @param fetcher 取数函数（接收 { pageNum, pageSize, ...筛选 }）
 * @param defaults 额外筛选条件默认值
 * @returns 列表状态与方法
 */
export function useListPage<T>(fetcher: ListFetcher<T>, defaults: Record<string, unknown> = {}): ListState<T> {
  const rows = ref<T[]>([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const errorMessage = ref('');
  const query = reactive<ListQuery>({ pageNum: 1, pageSize: 20, ...defaults });

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / query.pageSize)));

  /**
   * 加载当前页
   *
   * @returns 无
   */
  async function load(): Promise<void> {
    loading.value = true;
    errorMessage.value = '';
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(query)) {
        // 空串 / null 不下发：后端 schema 对空值可能直接 400
        if (value === '' || value === null || value === undefined) continue;
        payload[key] = value;
      }
      const result = await fetcher(payload);
      rows.value = result.rows;
      total.value = result.total;
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '加载失败';
      rows.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 查询（回第一页） */
  function search(): void {
    query.pageNum = 1;
    void load();
  }

  /**
   * 重置筛选条件
   *
   * @param extra 要恢复的默认值
   */
  function reset(extra: Record<string, unknown> = {}): void {
    for (const key of Object.keys(defaults)) query[key] = defaults[key];
    Object.assign(query, extra);
    query.pageNum = 1;
    void load();
  }

  /**
   * 翻页
   *
   * @param delta 页码增量（-1 / 1）
   */
  function turnPage(delta: number): void {
    const next = query.pageNum + delta;
    if (next < 1 || next > pageCount.value) return;
    query.pageNum = next;
    void load();
  }

  return { rows, total, loading, errorMessage, query, pageCount, load, search, reset, turnPage };
}
