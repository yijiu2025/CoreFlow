# 升级路线图 {#roadmap}

基于全面代码审计，制定从前到后、从安全到工程化的完整升级路线。

## 优先级矩阵

```
紧急 + 重要          重要但不紧急
┌───────────────────┬────────────────────┐
│ Phase 0 安全修复   │ Phase 2 TypeScript │
│ Phase 1.1 优雅关闭 │ Phase 3 前端架构   │
│ Phase 1.2 健康检查 │ Phase 4 测试体系   │
│ Phase 1.3 Redis重连│ Phase 6 高级特性   │
├───────────────────┼────────────────────┤
│ Phase 1.5 Hooks   │ Phase 1.4 Docker   │
│ Phase 5.2 Swagger │ Phase 5.1 CI/CD    │
│ Phase 1.6 清理    │ Phase 6.5 缓存层   │
└───────────────────┴────────────────────┘
```

## Phase 0: 安全修复 ✅ 已完成

- [x] 密码哈希化（bcryptjs）
- [x] 环境变量校验（INSECURE_SECRETS）
- [x] CORS 白名单化
- [x] Firewall API 鉴权

## Phase 1: 工程化基础

### 1.1 优雅关闭

```js
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 1.2 健康检查端点

```js
registerSecureRoute(fastify, {
  name: 'liveness',
  method: 'GET', url: '/health/live',
  handler: async (req, reply) => reply.send({ status: 'ok', uptime: process.uptime() })
});
```

### 1.3 Redis 重连策略

```js
reconnectStrategy: (retries) => {
  if (retries > 10) return new Error('Redis max retries reached');
  return Math.min(retries * 200, 5000); // 指数退避，最大 5s
}
```

### 1.4 Docker 化 ✅ 已完成

Dockerfile + docker-compose.yml 已就绪。

### 1.5 Pre-commit Hooks ✅ 已完成

Husky + lint-staged 已配置。

## Phase 2: TypeScript 渐进式迁移

由底向上逐步迁移：

```
Step 1: src/env.ts                    -- 环境变量类型定义
Step 2: src/core/result.ts            -- 纯函数
Step 3: src/auth/utils/lib/*.ts       -- 工具函数
Step 4: src/firewall/config.ts        -- 配置常量
Step 5: src/models/*.ts               -- Sequelize 模型定义
Step 6: src/api/guard.ts              -- 守卫系统
Step 7: src/auth/*.ts                 -- 认证系统
Step 8: src/api/**/v1/*.ts            -- API 路由（最后）
```

## Phase 3: 前端架构升级

### 3.1 引入 Pinia 状态管理

```
stores/
  dashboard.ts        -- summary, logs, wsEvents
  settings.ts         -- securitySettings
  firewall.ts         -- activeBlocks, activeWhitelist
  configs.ts          -- configs (3-level guard tree)
  ui.ts               -- isDarkMode, modal 开关, locale
```

### 3.2 引入 Vue Router

```ts
const routes = [
  { path: '/',           component: () => import('./views/Dashboard.vue') },
  { path: '/firewall',   component: () => import('./views/Firewall.vue') },
  { path: '/settings',   component: () => import('./views/Settings.vue') },
  { path: '/logs',       component: () => import('./views/Logs.vue') },
];
```

### 3.3 App.vue 瘦身

从 ~975 行缩减到 ~200 行（仅布局 + 组件引用）。

## Phase 4: 后端测试体系

覆盖率目标：

```json
{
  "coverageThreshold": {
    "global": { "branches": 60, "functions": 70, "lines": 70 }
  }
}
```

## Phase 5: CI/CD 与 API 文档

- GitHub Actions 自动化
- Swagger / OpenAPI 文档

## Phase 6: 高级特性

- 错误类体系（AppError 继承链）
- 请求日志中间件
- 数据库迁移规范化
- 前端性能优化
- Redis 缓存层
- WebSocket 鉴权

## 实施时间线

```
Week 1:  Phase 0 + Phase 1.1-1.3
Week 2:  Phase 1.4-1.6 + Phase 5.2
Week 3-4: Phase 2 (TypeScript 迁移)
Week 5-6: Phase 3 (前端架构)
Week 7:  Phase 4 + Phase 5.1
Week 8+: Phase 6 (按需迭代)
```

## 成功指标

| 指标 | 目标值 |
|------|--------|
| 安全漏洞 (Critical) | 0 |
| 测试覆盖率 | > 60% |
| TypeScript 覆盖 | > 80% |
| API 自动文档 | Swagger UI |
| 部署时间 | CI/CD 自动 |
| 容器化 | Docker + Compose |
| 前端 App.vue 行数 | < 200 |
| 首屏加载时间 | < 2s |
