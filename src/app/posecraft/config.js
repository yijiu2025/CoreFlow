/**
 * PoseCraft 应用配置
 * 供 loader 扫描时读取，包含 OAuth 2.1 客户端注册信息。
 *
 * @author yijiu2025
 * @since 2026-07-13
 */
const posecraftConfig = {
  app_id: 'posecraft',
  name: 'PoseCraft',
  description: 'AI 姿势分析 + 图片编辑平台',

  /**
   * 授权即送的默认角色（**主口径**）
   *
   * 用户首次授权本应用时自动授予这个角色（见 `app/oauth21/dao/approval.dao.js`）。
   * 优先级：本字段 > `roles.js` 里该角色的 `is_default: true` > 取最低职级（<= 20）。
   * 写 `null` 表示"有意不自动授予"。
   *
   * 🔴 必须是一个 `rank_level <= 20` 的普通档角色 —— 写管理员角色等于给每个
   *    授权的人发管理员，启动期审计会直接报 error。
   */
  default_role: 'posecraft_user',

  /**
   * OAuth 2.1 客户端配置
   * loader 扫描时自动同步到 oauth_clients 表
   */
  oauth_client: {
    client_id: 'posecraft',
    client_name: 'PoseCraft',
    client_secret: null, // null = 公共客户端（SPA）
    redirect_uris: ['http://localhost:5176/posecraft/callback', 'https://posecraft.example.com/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'none', // 公共客户端不认证
    application_type: 'web',
    /** 一方应用首次登录自动授权，跳过 consent 确认页 */
    skip_consent: false,
    /** scope 描述覆盖（授权页展示用，字段映射走系统 scope-registry） */
    scope_metadata: {
      profile: { name: '公开资料', desc: '获取你的用户名、昵称、头像，用于展示个人主页' },
      email: { name: '邮箱', desc: '获取你的邮箱，用于发送作品审核与通知' }
    }
  }
};

export default posecraftConfig;
