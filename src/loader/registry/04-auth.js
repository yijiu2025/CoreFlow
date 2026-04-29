// src/loader/registry/01-auth.js
import { initAuth } from '../../auth/index.js';

export default async (app) => {
  await app.register(initAuth);
  console.log('✅ 认证系统初始化完成');
};
