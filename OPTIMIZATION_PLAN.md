# Antigravity Framework - Optimization & Modernization Plan

> 基于全面代码审计，制定从前到后、从安全到工程化的完整升级路线。
> 目标：将当前框架升级为可支撑中型项目生产的现代化全栈体系。

---

## Phase 0: 紧急安全修复 (1-2 天)

> 不修这些，其他一切都无意义。

### 0.1 密码哈希化

**现状**: 明文存储密码，`identity.credential !== password` 直接比较。
**目标**: 引入 `argon2`（2025 年密码哈希首选，优于 bcrypt）。

```bash
npm install argon2
```

**改动清单**:
| 文件 | 改动 |
|------|------|
| `src/dao/user/user.js` | `registerUser()`: 密码存入前 `await argon2.hash(password)` |
| `src/dao/user/user.js` | `getTokens()`: 改为 `await argon2.verify(identity.credential, password)` |
| `src/models/user/UserIdentity.js` | `credential` 字段改为 `TEXT`（argon2 hash 长度 97 字符） |
| `migrations/` | 新增迁移：已有用户密码字段标记为需要重置 |

### 0.2 RSA 私钥外部化

**现状**: `src/auth/utils/lib/encrypt.js` 硬编码完整 RSA 私钥。
**目标**: 移至环境变量或文件引用。

```js
// 改后
const PRIVATE_KEY = fs.readFileSync(process.env.RSA_PRIVATE_KEY_PATH, 'utf8');
```

**改动清单**:
| 文件 | 改动 |
|------|------|
| `src/auth/utils/lib/encrypt.js` | 从 `process.env.RSA_PRIVATE_KEY_PATH` 读取 |
| `.env` | 新增 `RSA_PRIVATE_KEY_PATH=./secrets/private.pem` |
| `.gitignore` | 添加 `secrets/` |
| 部署文档 | 说明如何生成和放置密钥文件 |

### 0.3 环境变量统一与验证

**现状**: 代码读 `JWT_SECRET`，`.env` 定义 `APP_SECRET`，存在不匹配。
**目标**: 引入 `envalid` 做启动时强校验。

```bash
npm install envalid
```

**新建 `src/env.js`**:
```js
import { cleanEnv, str, num, bool } from 'envalid';

export const env = cleanEnv(process.env, {
  PORT:            num({ default: 3000 }),
  DB_HOST:         str(),
  DB_PORT:         num({ default: 3306 }),
  DB_USER:         str(),
  DB_PASS:         str(),
  DB_NAME:         str(),
  REDIS_HOST:      str({ default: '' }),
  REDIS_PORT:      num({ default: 6379 }),
  JWT_SECRET:      str({ desc: 'JWT 签名密钥，至少 32 字符' }),
  FIREWALL_SECRET: str({ desc: 'Firewall HMAC 密钥' }),
  RSA_PRIVATE_KEY_PATH: str({ default: '' }),
  DB_SYNC:         bool({ default: false }),
  NODE_ENV:        str({ choices: ['development', 'production', 'test'], default: 'development' }),
});
```

**改动清单**:
| 文件 | 改动 |
|------|------|
| `src/app.js` | 顶部 `import './env.js'`（在 dotenv 之后） |
| 所有 `process.env.*` | 改为 `import { env } from './env.js'` 后用 `env.JWT_SECRET` |
| `.env` | 将 `APP_SECRET` 改为 `JWT_SECRET`，确保与 `FIREWALL_SECRET` 不同 |
| `.env.example` | 同步更新，使用占位值 |

### 0.4 CORS 白名单化

**现状**: `origin: (origin, cb) => cb(null, true)` 接受所有来源。
**目标**: 从环境变量读取允许的域名列表。

```js
// src/app.js
const allowedOrigins = env.CORS_ORIGINS.split(',').map(s => s.trim());

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('CORS not allowed'), false);
  },
  credentials: true,
});
```

**改动清单**:
| 文件 | 改动 |
|------|------|
| `src/app.js` | 替换 CORS origin 回调 |
| `src/env.js` | 新增 `CORS_ORIGINS: str({ default: 'http://localhost:5173' })` |
| `.env` | 新增 `CORS_ORIGINS=http://localhost:5173,https://yourdomain.com` |

### 0.5 Firewall API 鉴权

**现状**: 整个 `/api/firewall/*` 无需登录即可访问。
**目标**: 敏感操作（blocks/whitelist/settings）要求管理员角色。

**改动清单**:
| 文件 | 改动 |
|------|------|
| `src/api/firewall/system.json` | `requireLogin: true` |
| `src/api/firewall/v1/monitor.js` | blocks/whitelist/settings 相关路由添加 `allowRoles: ['admin']` |
| `src/api/firewall/v1/apiConfig.js` | toggle/update 路由添加 `allowRoles: ['admin']` |

---

## Phase 1: 工程化基础 (3-5 天)

> 让项目从"能跑"变成"能协作、能部署"。

### 1.1 优雅关闭 (Graceful Shutdown)

**现状**: 无 SIGTERM/SIGINT 处理，进程终止时连接直接断开。
**目标**: 收到终止信号后，等待在途请求完成，关闭所有连接。

**新建逻辑在 `index.js`**:
```js
const server = await createApp();
await server.listen({ port: env.PORT, host: '0.0.0.0' });

const shutdown = async (signal) => {
  server.log.info(`${signal} received, shutting down gracefully...`);
  await server.close();           // 停止接受新请求，等待在途请求完成
  await server.db?.sequelize?.close();
  await server.redis?.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 1.2 健康检查端点

**现状**: 无 `/health` 端点（虽然防火墙 safePaths 已预留）。
**目标**: 提供存活探针 + 就绪探针。

**新建 `src/api/system/v1/health.js`**:
```js
registerSecureRoute(fastify, {
  name: 'liveness',
  method: 'GET', url: '/health/live',
  handler: async (req, reply) => reply.send({ status: 'ok', uptime: process.uptime() })
});

registerSecureRoute(fastify, {
  name: 'readiness',
  method: 'GET', url: '/health/ready',
  handler: async (req, reply) => {
    const checks = {};
    try { await req.server.db.sequelize.query('SELECT 1'); checks.db = 'ok'; }
    catch { checks.db = 'fail'; }
    try { await req.server.redis?.ping(); checks.redis = 'ok'; }
    catch { checks.redis = 'fail'; }
    const ready = checks.db === 'ok';
    reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'degraded', checks });
  }
});
```

**配套**:
| 文件 | 改动 |
|------|------|
| `src/api/system/system.json` | 新建，name: "system", prefix: "" |
| `src/api/system/v1/health.js` | 如上 |
| `src/firewall/config.js` | safePaths 已包含 `/health`，无需改动 |

### 1.3 Redis 重连策略

**现状**: `reconnectStrategy: false`，Redis 断开后永不重连。
**目标**: 指数退避重连。

**改动 `src/loader/registry/02-redis.js`**:
```js
const client = createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Redis max retries reached');
      return Math.min(retries * 200, 5000); // 指数退避，最大 5s
    }
  }
});
```

### 1.4 Docker 化

**新建 `Dockerfile`**:
```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .

FROM base AS frontend
WORKDIR /app/firewall
COPY firewall/package.json firewall/package-lock.json ./
RUN npm ci
COPY firewall/ .
RUN npm run build

FROM base AS final
COPY --from=frontend /app/public/firewall ./public/firewall
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health/live || exit 1
CMD ["node", "index.js"]
```

**新建 `docker-compose.yml`**:
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASS}
      MYSQL_DATABASE: ${DB_NAME}
    volumes: [db_data:/var/lib/mysql]
    ports: ["3306:3306"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]

volumes:
  db_data:
  redis_data:
```

**新建 `.dockerignore`**:
```
node_modules
firewall/node_modules
.env
.git
*.md
```

### 1.5 Pre-commit Hooks

```bash
npm install -D husky lint-staged
npx husky init
```

**`package.json` 新增**:
```json
{
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.vue": ["prettier --write"],
    "*.json": ["prettier --write"]
  }
}
```

**`.husky/pre-commit`**:
```bash
npx lint-staged
```

### 1.6 清理死代码

| 操作 | 文件/目录 |
|------|-----------|
| 删除 | `src/validator/` (遗留 Koa 验证器) |
| 删除 | `src/middleware/` (空目录) |
| 删除 | `firewall/src/components/layout/` (未使用的布局组件) |
| 删除 | `firewall/src/composables/useTheme.js` (未使用的 composable) |
| 移除 | `package.json` 中 `lodash-es`（仅用了一个 `uniq`，用 `[...new Set()]` 替代） |

---

## Phase 2: TypeScript 渐进式迁移 (1-2 周)

> 不要一次性重写，按模块逐步迁移。

### 2.1 基础设施

```bash
npm install -D typescript tsx @types/node @types/jsonwebtoken
```

**新建 `tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "firewall", "dist"]
}
```

**`package.json` 改动**:
```json
{
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  }
}
```

### 2.2 迁移顺序（由底向上，每步可独立上线）

```
Step 1: src/env.ts                    -- 环境变量类型定义
Step 2: src/core/result.ts            -- 纯函数，零依赖
Step 3: src/auth/utils/lib/*.ts       -- 工具函数
Step 4: src/firewall/config.ts        -- 配置常量
Step 5: src/firewall/fingerprint.ts   -- 纯函数
Step 6: src/models/*.ts               -- Sequelize 模型定义
Step 7: src/firewall/detector.ts      -- 核心检测引擎
Step 8: src/api/guard.ts              -- 守卫系统
Step 9: src/auth/*.ts                 -- 认证系统
Step 10: src/api/**/v1/*.ts           -- API 路由（最后迁移）
```

**迁移策略**:
- 文件重命名 `.js` -> `.ts`
- 添加参数类型注解和返回值类型
- `tsconfig.json` 初始设置 `"strict": false`，逐步开启
- 每个 Step 完成后运行 `tsc --noEmit` 确保无报错

### 2.3 关键类型定义示例

```ts
// src/types/fastify.d.ts
import { User } from '../models/user/User.js';

declare module 'fastify' {
  interface FastifyRequest {
    state: { user?: User | null };
    _fingerprint?: string;
    _firewallLog?: FirewallLogRecord;
  }
  interface FastifyInstance {
    redis: ReturnType<typeof createClient> | null;
    db: {
      sequelize: Sequelize;
      transaction: <T>(fn: (t: Transaction) => Promise<T>) => Promise<T>;
      user: { User: typeof User; /* ... */ };
      sso: { SsoUser: typeof SsoUser; /* ... */ };
    };
    auth: AuthUtils;
  }
}

// src/firewall/types.ts
interface BlockMetadata {
  status: 'BLOCKED' | 'SCANNER' | 'CHALLENGE';
  source: 'auto' | 'manual';
  permanent: boolean;
  createdAt: number;
  expiresAt: number | null;
}

interface FirewallLogRecord {
  time: string;
  ip: string;
  fingerprint?: string;
  method: string;
  url: string;
  statusCode?: number;
  blocked: boolean;
  region?: string;
  city?: string;
}
```

---

## Phase 3: 前端架构升级 (1-2 周)

> 从"单文件巨石"进化为可维护的中型前端。

### 3.1 引入 Pinia 状态管理

```bash
cd firewall && npm install pinia
```

**新建 `firewall/src/stores/`**:

```
stores/
  index.ts            -- createPinia()
  dashboard.ts        -- summary, logs, wsEvents, 连接 WS
  settings.ts         -- securitySettings, serverPosition, availableIpApis
  firewall.ts         -- activeBlocks, activeWhitelist, CRUD 操作
  configs.ts          -- configs (3-level guard tree), toggle/edit 操作
  ui.ts               -- isDarkMode, isUIVisible, modal 开关, locale
```

**示例 `stores/dashboard.ts`**:
```ts
export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref({ totalRequests: 0, totalBlocked: 0, topRegions: [], topPaths: [] });
  const logs = ref<LogRecord[]>([]);
  const wsEvents = ref<WsEvent[]>([]);

  // WebSocket 连接逻辑从 App.vue 迁移至此
  function connectWS() { /* ... */ }
  function handleInit(data) { /* ... */ }
  function handleLog(record) { /* ... */ }

  return { summary, logs, wsEvents, connectWS };
});
```

**App.vue 瘦身**: 从 ~975 行缩减到 ~200 行（仅布局 + 组件引用）。

### 3.2 引入 Vue Router

```bash
cd firewall && npm install vue-router
```

**路由规划**:
```ts
const routes = [
  { path: '/',           component: () => import('./views/Dashboard.vue') },
  { path: '/firewall',   component: () => import('./views/Firewall.vue') },
  { path: '/settings',   component: () => import('./views/Settings.vue') },
  { path: '/security',   component: () => import('./views/SecurityConsole.vue') },
  { path: '/logs',       component: () => import('./views/Logs.vue') },
];
```

**收益**: 各页面懒加载，首屏更快；URL 可分享；浏览器前进/后退可用。

### 3.3 前端 TypeScript 化

```bash
cd firewall && npm install -D typescript vue-tsc @vue/tsconfig
```

**迁移顺序**:
```
Step 1: stores/*.ts          -- 新建 store 直接用 TS
Step 2: api/firewall.ts      -- API 层加类型
Step 3: composables/*.ts     -- 新建 composable 直接用 TS
Step 4: components/ui/*.vue  -- UI 组件逐步迁移
Step 5: views/*.vue          -- 页面组件
Step 6: App.vue              -- 最后迁移
```

### 3.4 组件按需拆分

**App.vue 拆分方案**:
```
App.vue (~200行)
  |-- <RouterView />           -- 页面内容
  |-- <TheHeader />            -- 顶栏（已存在，激活使用）
  |-- <HudToggle />            -- HUD 按钮
  |-- <ThemeToggle />          -- 主题切换

views/Dashboard.vue
  |-- MapChart
  |-- LogTable
  |-- RegionList
  |-- PathList
  |-- SecurityInsightCard

views/Firewall.vue
  |-- DefenseModuleGrid
  |-- ParameterPanels
  |-- TrustListEditor

views/Settings.vue
  |-- NodeSettings
  |-- LanguageSelector
  |-- BanManagement
  |-- WhitelistManagement
```

### 3.5 前端测试

```bash
cd firewall && npm install -D vitest @vue/test-utils jsdom
```

**`firewall/vitest.config.ts`**:
```ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,js}'],
  },
});
```

**优先测试**:
- `stores/*.ts` -- 状态逻辑（纯函数，最容易测）
- `api/firewall.ts` -- API 层（mock axios）
- `composables/*.ts` -- 可组合函数
- `components/ui/*.vue` -- 基础 UI 组件

---

## Phase 4: 后端测试体系 (1 周)

> 从 0% 覆盖率到核心链路有保障。

### 4.1 测试框架升级

当前 Jest 保留，但补充测试工具：

```bash
npm install -D @jest/globals supertest
```

### 4.2 测试分层

```
tests/
  unit/
    core/result.test.js           -- Result 类
    firewall/fingerprint.test.js  -- 指纹生成
    firewall/detector.test.js     -- 检测逻辑（mock Redis）
    api/guard.test.js             -- IP 匹配逻辑
    auth/xToken.test.js           -- JWT 签发/验证
  integration/
    api/auth.login.test.js        -- 登录全流程
    api/firewall.blocks.test.js   -- 封禁 CRUD
    api/firewall.challenge.test.js -- 挑战验证
  helpers/
    setup.js                      -- 测试 DB/Redis 连接
    factories.js                  -- 测试数据工厂
```

### 4.3 测试优先级

| 优先级 | 模块 | 原因 |
|--------|------|------|
| P0 | `detector.js` 的 checkGlobalBlock/checkRateLimit | 安全核心，逻辑复杂 |
| P0 | `auth/xToken.js` 的 login/check | 认证核心 |
| P0 | `api/guard.js` 的 isIpMatch | IP 匹配逻辑有通配符/CIDR |
| P1 | API 路由集成测试 | 确保请求链路正确 |
| P1 | `fingerprint.js` | 指纹生成一致性 |
| P2 | 前端 store 逻辑 | 状态管理正确性 |

### 4.4 覆盖率目标

```json
// jest.config.js
{
  "coverageThreshold": {
    "global": { "branches": 60, "functions": 70, "lines": 70 }
  }
}
```

---

## Phase 5: CI/CD 与 API 文档 (3-5 天)

### 5.1 GitHub Actions

**新建 `.github/workflows/ci.yml`**:
```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env: { MYSQL_ROOT_PASSWORD: test, MYSQL_DATABASE: test }
        ports: ['3306:3306']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test -- --coverage
        env:
          DB_HOST: localhost
          DB_USER: root
          DB_PASS: test
          DB_NAME: test
          JWT_SECRET: test-secret-key-for-ci-only-32chars
          FIREWALL_SECRET: test-firewall-secret-ci-only

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: cd firewall && npm ci && npm run build
      - run: npm run build
```

### 5.2 Swagger / OpenAPI

```bash
npm install @fastify/swagger @fastify/swagger-ui
```

**在 `src/app.js` 注册**:
```js
await app.register(swagger, {
  openapi: {
    info: { title: 'Antigravity API', version: '2.0.0' },
    servers: [{ url: 'http://localhost:3000' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  },
  // 复用已有的 AJV schema
});

await app.register(swaggerUI, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true },
});
```

**改动清单**:
| 文件 | 改动 |
|------|------|
| `src/app.js` | 注册 swagger + swagger-ui 插件 |
| `src/api/**/v1/*.js` | 给每个路由补充 `schema`（大部分已有，补充 response schema） |
| `src/api/**/v1/schemas.js` | 扩展 response schema 定义 |

**产出**: 访问 `http://localhost:3000/docs` 即可看到交互式 API 文档。

---

## Phase 6: 高级特性 (持续迭代)

> 中型项目开发过程中按需引入。

### 6.1 错误类体系

```ts
// src/core/errors.ts
export class AppError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly details?: unknown
  ) { super(message); }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    super(404, `${resource}${id ? ` #${id}` : ''} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}
```

**全局错误处理器更新**:
```js
app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.code).send({
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp: Date.now(),
    });
  }
  // ... 原有 AJV / 5xx 处理逻辑
});
```

### 6.2 请求日志中间件

利用 Fastify 的 `onRequest` 增强日志上下文：

```js
app.addHook('onRequest', async (request) => {
  request.log = request.log.child({
    requestId: request.id,
    ip: request.ip,
    method: request.method,
    url: request.url,
  });
});
```

### 6.3 数据库迁移规范化

**现状**: `sequelize.sync({ alter: true })` 在开发环境有数据丢失风险。
**目标**: 全部使用 Umzug 迁移文件，禁用 sync。

```js
// src/loader/registry/06-models.js
// 删除 sync 逻辑，改为：
if (env.NODE_ENV !== 'test') {
  const umzug = new Umzug({
    migrations: { glob: 'migrations/*.js' },
    context: app.db.sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize: app.db.sequelize }),
  });
  await umzug.up();
}
```

### 6.4 前端性能优化

| 优化项 | 做法 |
|--------|------|
| 路由懒加载 | `component: () => import('./views/X.vue')` |
| 组件异步加载 | `defineAsyncComponent(() => import('./HeavyChart.vue'))` |
| 虚拟滚动 | 日志列表使用 `@tanstack/vue-virtual` 替代全量渲染 |
| 图表按需加载 | ECharts tree-shaking，只引入用到的组件 |
| 图片/字体优化 | 字体 `font-display: swap`，地图 GeoJSON 懒加载 |
| Service Worker | PWA 离线缓存静态资源 |

### 6.5 Redis 缓存层

对高频读取的安全设置增加缓存：

```js
// src/firewall/utils/cache.js
const CACHE_TTL = 30; // 秒

export async function getCachedSettings(redis) {
  const cached = await safeRedis(redis, r => r.get('fw:cache:settings'));
  if (cached) return JSON.parse(cached);
  const settings = getSecuritySettings();
  await safeRedis(redis, r => r.set('fw:cache:settings', JSON.stringify(settings), { EX: CACHE_TTL }));
  return settings;
}
```

### 6.6 WebSocket 鉴权

**现状**: WebSocket 连接无需认证。
**目标**: 连接时验证 JWT token。

```js
fastify.get(wsUrl, { websocket: true }, async (connection, req) => {
  // 从 query 或第一个消息中获取 token
  const token = req.query.token || '';
  try {
    jwt.verify(token, env.JWT_SECRET);
  } catch {
    connection.socket.close(4001, 'Unauthorized');
    return;
  }
  // ... 原有逻辑
});
```

---

## 实施路线图

```
Week 1:  Phase 0 (安全修复) + Phase 1.1-1.3 (优雅关闭/健康检查/Redis重连)
Week 2:  Phase 1.4-1.6 (Docker/Hooks/清理) + Phase 5.2 (Swagger)
Week 3-4: Phase 2 (TypeScript 迁移，核心模块)
Week 5-6: Phase 3 (前端架构: Pinia + Router + TS)
Week 7:  Phase 4 (后端测试) + Phase 5.1 (CI/CD)
Week 8+: Phase 6 (按需迭代)
```

---

## 依赖清单汇总

### 后端新增依赖

```bash
# 生产
npm install argon2 envalid @fastify/swagger @fastify/swagger-ui

# 开发
npm install -D typescript tsx @types/node @types/jsonwebtoken husky lint-staged supertest
```

### 前端新增依赖

```bash
# 生产
cd firewall && npm install pinia vue-router

# 开发
cd firewall && npm install -D typescript vue-tsc @vue/tsconfig vitest @vue/test-utils jsdom
```

---

## 优先级矩阵

```
紧急 + 重要        重要但不紧急
┌─────────────────┬──────────────────┐
│ Phase 0 安全修复 │ Phase 2 TypeScript│
│ Phase 1.1 优雅关闭│ Phase 3 前端架构  │
│ Phase 1.2 健康检查│ Phase 4 测试体系  │
│ Phase 1.3 Redis重连│ Phase 6 高级特性 │
├─────────────────┼──────────────────┤
│ Phase 1.5 Hooks  │ Phase 1.4 Docker │
│ Phase 5.2 Swagger│ Phase 5.1 CI/CD  │
│ Phase 1.6 清理   │ Phase 6.5 缓存层 │
└─────────────────┴──────────────────┘
 紧急但不重要       不紧急不重要
```

---

## 成功指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 安全漏洞 (Critical) | 3 | 0 |
| 测试覆盖率 | 0% | > 60% |
| TypeScript 覆盖 | 0% | > 80% |
| API 自动文档 | 无 | Swagger UI |
| 部署时间 | 手动 | CI/CD 自动 |
| 容器化 | 无 | Docker + Compose |
| 前端 App.vue 行数 | ~975 | < 200 |
| 首屏加载时间 | 未优化 | < 2s (懒加载) |
