// src/auth/sso.js
import jwt from 'jsonwebtoken';
import Result from '../core/result.js';

export const ssoServer = {
  // 1. 验证并跳转：如果 SSO 已登录，直接带着 code 回去
  authorize: async (ctx) => {
    const { redirect_uri } = ctx.query;
    const user = ctx.state.user; // 这里的 user 是 SSO 站点的登录状态

    if (user) {
      // 已登录 SSO，生成一个 5 分钟有效的临时 code
      const code = jwt.sign({ uid: user.id }, process.env.SSO_SECRET, {
        expiresIn: '5m'
      });
      ctx.redirect(`${redirect_uri}?code=${code}`);
    } else {
      // 未登录 SSO，去登录页
      ctx.redirect(`/sso/login-page?redirect_uri=${encodeURIComponent(redirect_uri)}`);
    }
  },

  // 2. 票据换 Token：子系统后端调用此接口
  exchange: async (ctx) => {
    const { code } = ctx.request.body;
    try {
      const { SsoUserDao } = await import('../dao/sso/sso-user.js');
      const dao = new SsoUserDao();
      const token = await dao.exchangeTicket(code);
      ctx.body = { success: true, token };
    } catch (err) {
      ctx.json(Result.fail(400, err.message));
    }
  }
};
