/**
 * 迁移：注册 console（管理后台）为 oauth21 的一方客户端
 *
 * 为什么必须有这条：`POST /oauth2.1/login` 会用 `client_id` 去 `oauth_clients`
 * 查真实客户端，查不到直接 400「无效的客户端 ID」—— 登录页表现为
 * 「应用标识无效/登录失败」，而错误发生在 iframe 里，宿主前端只看到一次
 * postMessage 没来，排查方向很容易跑偏（先怀疑 CORS / 代理 / 网络）。
 *
 * 本仓约定「所有 app（一方/三方）都在 oauth_clients 注册，有真实 client_id」
 * （见 `app/oauth21/services/login.service.js` 的注释）。console 是本轮新增的
 * 一方应用，因此随它的首次部署一起落库。
 *
 * 幂等：`client_id` 已存在时不覆盖 —— 线上可能已被人手工调过 redirect_uris /
 * scope，迁移不该把它们打回去。
 *
 * @author yijiu2025
 * @since 2026-11-09
 */

/** console 的客户端定义（一方应用：public client，无密钥，仅授权码 + 刷新） */
const CONSOLE_CLIENT = {
  client_id: 'console',
  client_name: '管理后台（Console）',
  client_secret: null,
  redirect_uris: JSON.stringify(['http://localhost:5175/', 'http://localhost:3000/console/']),
  grant_types: JSON.stringify(['authorization_code', 'refresh_token']),
  response_types: JSON.stringify(['code']),
  scope: 'openid profile email',
  token_endpoint_auth_method: 'none',
  application_type: 'web',
  scope_metadata: JSON.stringify({
    profile: { name: '公开资料', desc: '获取你的用户名、昵称、头像，用于管理后台展示' },
    email: { name: '邮箱', desc: '获取你的邮箱，用于安全告警与审计通知' }
  }),
  skip_consent: 0
};

/**
 * 执行迁移
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @param {object} ctx.Sequelize Sequelize 构造器
 * @returns {Promise<void>}
 */
export async function up({ queryInterface, Sequelize }) {
  const [tables] = await queryInterface.sequelize.query('SHOW TABLES LIKE "oauth_clients"');
  if (tables.length === 0) return;

  const [exists] = await queryInterface.sequelize.query(
    'SELECT client_id FROM oauth_clients WHERE client_id = :clientId LIMIT 1',
    { replacements: { clientId: CONSOLE_CLIENT.client_id } }
  );
  if (exists.length > 0) return;

  await queryInterface.bulkInsert('oauth_clients', [
    {
      ...CONSOLE_CLIENT,
      created_at: Sequelize.literal('CURRENT_TIMESTAMP'),
      updated_at: Sequelize.literal('CURRENT_TIMESTAMP')
    }
  ]);
}

/**
 * 回滚：删除 console 客户端
 *
 * 只删本迁移登记的这一条；已签发的令牌不在此处理（它们属于运行期数据）。
 *
 * @param {object} ctx Umzug 上下文
 * @param {object} ctx.queryInterface Sequelize 查询接口
 * @returns {Promise<void>}
 */
export async function down({ queryInterface }) {
  await queryInterface.sequelize.query('DELETE FROM oauth_clients WHERE client_id = :clientId', {
    replacements: { clientId: CONSOLE_CLIENT.client_id }
  });
}
