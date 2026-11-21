/**
 * 应用总览的数据访问层
 *
 * 「应用」本身是**代码声明**（`src/app/<app>/config.js`），没有表；这张页面需要的是
 * 各应用**授权数据**的规模（角色 / 菜单 / 权限码 / OAuth 客户端），这些才落在库里。
 *
 * 三个统计一律**一次查完再在内存里归并**，不要按应用逐个 count：
 * 应用数会随接入方增长（现在 9 个），逐个查是 N 次往返，而这张页面是运维常驻打开的。
 *
 * @author yijiu2025
 * @since 2026-11-21
 */
import { getModel } from '../../../../framework/persistence/db/index.js';

class AppOverviewDao {
  /**
   * 每个权限命名空间下的角色数
   *
   * 用模型自身的 `count({ group })`（不手写 SQL）：`Role` 是 paranoid 模型，
   * 已删除角色会被自动排除 —— 手写 SQL 忘了 `deleted_at IS NULL` 就会把删掉的算进去。
   *
   * @returns {Promise<Map<string, number>>} `app_id → 角色数`
   */
  async roleCounts() {
    const rows = await getModel('Role').count({ group: ['app_id'] });
    const map = new Map();
    for (const row of rows) {
      /* count({group}) 的行形状随方言略有差异，两个键名都兜一下 */
      const appId = row.app_id ?? row.get?.('app_id');
      const total = row.count ?? row.get?.('count');
      if (appId) map.set(String(appId), Number(total || 0));
    }
    return map;
  }

  /**
   * 每个应用下的菜单节点数（含目录与按钮）
   *
   * @returns {Promise<Map<string, number>>} `app_id → 菜单数`
   */
  async menuCounts() {
    const rows = await getModel('SysMenu').count({ group: ['app_id'] });
    const map = new Map();
    for (const row of rows) {
      const appId = row.app_id ?? row.get?.('app_id');
      const total = row.count ?? row.get?.('count');
      if (appId) map.set(String(appId), Number(total || 0));
    }
    return map;
  }

  /**
   * 全部 OAuth 客户端标识
   *
   * 只取 `client_id` 一列并转成 Set：页面只需要回答"这个应用有没有注册客户端"，
   * 不需要客户端详情（详情有自己的管理页）。
   *
   * @returns {Promise<Set<string>>} 已注册的 client_id 集合
   */
  async oauthClientIds() {
    const rows = await getModel('OauthClient').findAll({ attributes: ['client_id'], raw: true });
    return new Set(rows.map(row => String(row.client_id)));
  }
}

const appOverviewDao = new AppOverviewDao();

export default appOverviewDao;
