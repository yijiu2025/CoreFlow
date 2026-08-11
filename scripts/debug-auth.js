/**
 * 认证流程调试脚本（临时，预览后删除）
 * 触发真实认证流程，打印每个函数的输入/输出
 *
 * 运行：node --env-file=.env scripts/debug-auth.js
 * 需要：DEBUG_AUTH=true 环境变量开启调试输出
 */
/* eslint-disable no-console */

import { createApp } from '../src/app.js';

// 开启认证调试输出
process.env.DEBUG_AUTH = 'true';

const app = await createApp();

// 1. 准备测试用户（写入真实 Session 数据）
const sessionId = 'debug-session-001';
const sessionData = {
  userId: 1,
  uid: 'debug-user-001',
  username: 'debug_alice',
  email: 'alice@example.com',
  avatar: 'https://example.com/alice.png',
  status: 1,
  appId: 'firewall',
  roles: ['admin'],
  permissions: { allows: ['*'], denies: [] },
  ip: '127.0.0.1',
  deviceId: 'debug-device',
  deviceType: 'browser',
  userAgent: 'debug-agent',
  loginAt: Math.floor(Date.now() / 1000),
  lastActiveAt: Math.floor(Date.now() / 1000),
  rememberMe: false
};

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔐 认证流程调试（Session 模式）');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 2. 写入测试 Session 到 Redis
console.log('【准备】写入测试 Session 到 Redis');
if (app.redis) {
  await app.redis.set(`session:${sessionId}`, JSON.stringify(sessionData), { EX: 1800 });
  console.log(`  ✅ 已写入 session:${sessionId}\n`);
} else {
  console.log('  ⚠️ Redis 未连接，仅演示流程\n');
}

// 3. 用 Fastify inject 触发真实认证流程
const res = await app.inject({
  method: 'GET',
  url: '/api/health',
  headers: {
    cookie: `sid=${sessionId}.debugsignature`,
    'user-agent': 'debug-agent'
  }
});

// 4. 模拟 sid_r 刷新场景（sid 过期）
console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔐 认证流程调试（sid_r 刷新模式）');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const refreshToken = 'debug-refresh-001';
if (app.redis) {
  // 写入 refresh token 映射
  await app.redis.set(`refresh:${refreshToken}`, sessionId, { EX: 2592000 });
  console.log(`  ✅ 已写入 refresh:${refreshToken}\n`);
}

await app.inject({
  method: 'GET',
  url: '/api/health',
  headers: {
    // 只带 sid_r，不带 sid（触发刷新）
    cookie: `sid_r=${refreshToken}.debugsignature`,
    'user-agent': 'debug-agent'
  }
});

// 5. 清理
console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧹 清理测试数据');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
if (app.redis) {
  await app.redis.del(`session:${sessionId}`);
  await app.redis.del(`refresh:${refreshToken}`);
  console.log('  ✅ 已清理测试数据');
}

await app.close();
console.log('  ✅ 调试完成，应用已关闭');