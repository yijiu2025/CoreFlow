// src/loader/registry/01-auth.js
// import { initAuth } from '../../auth/index.js';
import { initOAuthAuth } from '../../oauth21/middleware/auth.middleware.js';

export default async (app) => {
  await app.register(initOAuthAuth);
  console.log('✅ 认证系统初始化完成');
};
