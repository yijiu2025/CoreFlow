/**
 * 迁移：把历史会话的 `app_id = 'console'` 归并到 `admin`
 *
 * 背景：管理后台的登录应用已由 `console` 改名为 `admin`（见
 * `20261121000001-rename-console-client-to-admin` 改的是 `oauth_clients`）。但**会话表**
 * 里还留着改名之前的行，于是：
 *   · 用户详情 → 应用 tab 会多出一条「console」（应用名已作废，查不到显示名就只能裸奔）；
 *   · 新加的会话归属校验拿 `session.appId` 与请求所属应用比对，旧行会对不上。
 *
 * 改 `app_id` 而不是撤销：这些会话本身是合法的，用户没必要因为改名被踢下线；
 * 归并之后它们与新会话完全等价（权限本来就按 `admin` 命名空间算）。
 *
 * 幂等：没有 `console` 行时什么都不做。
 */
export async function up({ queryInterface }) {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT COUNT(*) AS c FROM session_tokens WHERE app_id = 'console'"
  );
  if (Number(rows?.[0]?.c || 0) === 0) return;

  const [result] = await queryInterface.sequelize.query(
    "UPDATE session_tokens SET app_id = 'admin' WHERE app_id = 'console'"
  );
  // Umzug 不打印自定义日志，这里返回受影响行数供脚本侧核对（`--verbose` 时可见）
  return { updated: Number(result?.affectedRows || 0) };
}
