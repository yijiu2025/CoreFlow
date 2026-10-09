/**
 * RetroWeb 快照统计派生
 *
 * 从整棵路线树快照**后端统一计算**冗余统计列（node_count / step_count / depth /
 * scheme_count），而不是信任前端传的数字 —— 前端传的会和快照内容漂移，列表页就会
 * 显示错的数量。派生规则与前端 `sessionSignature` 能看到的字段严格一致。
 *
 * @since 2026-10-09
 */

/**
 * 从快照对象派生统计列。
 *
 * @param {object} snapshot 前端 WorkspaceSnapshot（{ rootId, nodes, schemes, ... }）
 * @returns {{node_count: number, step_count: number, depth: number, scheme_count: number}}
 */
function deriveStats(snapshot) {
  const snap = snapshot ?? {};
  const nodes = snap.nodes ?? {};

  const nodeList = Object.values(nodes);

  // node_count：节点总数
  const node_count = nodeList.length;

  // depth：树的最大层级（rootId 对应节点深度 0；无根则 0）
  let depth = 0;
  for (const n of nodeList) {
    if (typeof n.depth === 'number' && n.depth > depth) depth = n.depth;
  }

  // step_count：已选定反应的步数（chosenReactionId 非空的节点数）
  const step_count = nodeList.filter(n => n?.chosenReactionId).length;

  // scheme_count：已保存的路线方案数
  const scheme_count = Array.isArray(snap.schemes) ? snap.schemes.length : 0;

  return { node_count, step_count, depth, scheme_count };
}

export { deriveStats };
