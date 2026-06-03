// src/loader/registry/04-auth.js
import initAuth from '../../auth/index.js';
import { C } from '../../utils/colors.js';

export default async (app) => {
  await app.register(initAuth);
  console.log(`✅ [Auth] ${C.green}认证系统初始化完成${C.reset}`);
};
