/**
 * 窄屏表格卡片化：把表头文字写进每个单元格的 `data-label`
 *
 * 列表页在手机上只有 360px 可用宽，而表格普遍 800–900px —— 横向滚动条之外
 * 的「操作」列基本够不到。常见解法是再写一套卡片模板，代价是同一份字段名
 * 出现两次（列定义 + 卡片模板），改一处忘一处就会不一致。
 *
 * 这里换成「表头即标签」：**列名的唯一来源仍然是 `<thead>`**，运行时把它抄到
 * 对应单元格的 `data-label` 上，再由 `components.css` 的窄屏规则
 * （`td::before { content: attr(data-label) }`）渲染成卡片。
 * 于是：
 *   · 新增/改名一列 → 卡片自动跟着变，不需要第二份定义；
 *   · 桌面端完全不受影响（样式只在 `max-width: 720px` 生效，DOM 上只多一个属性）；
 *   · 所有列表页一次覆盖，不需要逐页改造。
 *
 * 🔴 只处理 `.table`（全站唯一的表格类），且跳过：
 *    · 没有 `thead` 的表（无表头可抄）；
 *    · `colspan` 的单元格（空状态行，本身就要横跨整行）；
 *    · 已经有 `data-label` 的单元格（异步刷新时不重复写）。
 *
 * 异步数据到达后行是新的，所以用 MutationObserver 兜底（只监听 childList，
 * 不监听属性，避免自己写 data-label 触发自己）。
 *
 * @author yijiu2025
 * @since 2026-11-10
 */

/** 给一棵子树里的表格补标签 */
function labelTables(root: ParentNode): void {
  for (const table of root.querySelectorAll<HTMLTableElement>('table.table')) {
    const headers = [...table.tHead?.rows[0]?.cells ?? []].map(cell => (cell.textContent ?? '').trim());
    if (headers.length === 0) continue;
    for (const row of table.tBodies[0]?.rows ?? []) {
      for (let i = 0; i < row.cells.length; i += 1) {
        const cell = row.cells[i];
        if (cell.colSpan > 1) continue;
        if (cell.dataset.label) continue;
        const label = headers[i];
        if (!label) continue;
        cell.dataset.label = label;
      }
    }
  }
}

/**
 * 安装「表格 → 卡片」标签器
 *
 * 全局只需调用一次（`AppShell` 挂载时）。返回卸载函数，便于将来做热更新清理。
 *
 * @returns 卸载函数
 */
export function useResponsiveTables(): () => void {
  labelTables(document);

  let timer = 0;
  const observer = new MutationObserver(records => {
    // 只关心「新增了节点」，属性变化（自己写 data-label）不触发
    const hasAdded = records.some(r => r.addedNodes.length > 0);
    if (!hasAdded) return;
    window.clearTimeout(timer);
    // 一帧内的多次插入合并成一次：表格常在同一个 tick 里插入整批行
    timer = window.setTimeout(() => labelTables(document), 60);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.clearTimeout(timer);
    observer.disconnect();
  };
}
