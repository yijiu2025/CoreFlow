// src/auth/xToken.js
import { getCtx } from './als.js';
import jwt from 'jsonwebtoken';

export const xToken = {
  // 获取当前登录用户 ID
  getLoginId: () => getCtx().state.user?.uid,

  // 强制登录检查
  check: () => {
    if (!getCtx().state.user) {
      getCtx().throw(401, '请先登录');
    }
    return getCtx().state.user;
  },

  /**
   * 登录助手：签发 Token 并处理多端适配
   * @param {number|string} userId 用户ID
   * @param {object} payload 额外载荷 (如 appId)
   */
  login: (userId, payload = {}) => {
    const ctx = getCtx();
    const token = jwt.sign({ uid: userId, ...payload, iat: Math.floor(Date.now() / 1000) }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    // 1. 浏览器端适配：注入 HttpOnly Cookie
    if (ctx.reply?.setCookie) {
      ctx.reply.setCookie('token', token, {
        httpOnly: true,
        maxAge: 7 * 24 * 3600 * 1000,
        path: '/',
        sameSite: 'lax'
      });
    }

    // 2. 移动端/小程序适配：返回 token 字符串
    return token;
  },

  /**
   * 角色权限校验逻辑 (后期完善)
   */
  checkRole: (role) => {
    const user = xToken.check();
    if (user.role !== role) {
      getCtx().throw(403, `权限不足：需要角色 ${role}`);
    }
  },

  checkPermission: (perm) => {
    const user = xToken.check();
    const perms = user.permissions || [];
    if (!perms.includes(perm)) {
      getCtx().throw(403, `权限不足：需要权限 ${perm}`);
    }
  }
};
