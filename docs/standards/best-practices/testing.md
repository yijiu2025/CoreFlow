# 测试 {#testing}

## 常用命令

```bash
npm test                    # 运行所有测试（内部已带 --experimental-vm-modules）
npm test -- --coverage      # 运行并生成覆盖率报告
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/__tests__/<路径>  # 单个文件
```

## 铁律：测试必须真实加载被测代码

**毒丸判据**：把被测模块改成 `throw new Error('__QUARANTINE__')`，相关测试必须变红。
不会变红的测试等于不存在 —— 它只会在报告里贡献一个绿色的数字。

历史上有 14 个测试文件是「手写常量 → 断言该常量」，被测模块整个删掉也全绿。
现在由 `src/__tests__/conventions/test-effectiveness.test.js` 守这条线：

- 判据是 **AST + 路径解析**（不是文本正则）——存在一个 import 说明符，解析后落在仓库内、
  且不在 `src/__tests__/` 下，才算"加载了被测代码"；
- 注释里写 `from '../x'`、夹具字符串里出现相对路径、`await import('crypto')` 都**不算**；
- 只读文件系统做静态断言的结构守卫，必须登记进 `STRUCTURAL_GUARD_WHITELIST` 并写明理由；
- 没有"存量豁免"通道（`KNOWN_INEFFECTIVE_TESTS` 为空且冻结）。

## 目录结构（按域分目录，扁平为主）

```
src/__tests__/
  api/                 -- 路由级契约（guard 配置同步、接口权限）
  app/oauth21/         -- 应用内服务（设备页渲染等）
  auth/                -- 权限缓存 / 指纹 / 密码哈希
  conventions/         -- 结构守卫（导出位置、依赖方向、测试有效性…）
  firewall/            -- 防火墙子模块
  framework/           -- 框架层（auth / db / redis / log / scheduler …）
  integration/         -- 真实 Fastify 集成（签名链路、app 启动）
  security/            -- 安全基线（限频规则表 ↔ 真实路由）
  verify/              -- 验证码 / 校验码
  helpers/             -- 测试辅助（redis 连接引导等，非测试文件）
  *.test.js            -- 跨域整体契约（guard / session / jwt / keys …）
```

> 命名约定：`*.test.js` 才会被 `testMatch: ['**/src/__tests__/**/*.test.js']` 收进来；
> `__fixtures__/` 下是加载器夹具（不是测试），`helpers/` 下是辅助模块。

## 测试分层与优先级

| 优先级 | 关注点 | 代表文件 |
| ------ | ------ | -------- |
| P0 | 权限判定（deny 优先 + 通配 + fail-closed） | `guard.test.js`、`api-integration.test.js` |
| P0 | 会话 / Cookie / 签名（含防重放） | `integration/signature.test.js`、`session-kick.test.js` |
| P0 | 密码哈希与背压 | `auth/password-hash.test.js`、`performance.test.js` |
| P0 | 防火墙拦截（封禁 / 挑战 / 限流） | `firewall.test.js`、`bot-detector.test.js` |
| P1 | 路由注册完整性、限频规则表一致性 | `api-routes.test.js`、`security/rate-limit-rules.test.js` |
| P1 | Redis 双后端语义一致性 | `framework/redis/*`、`ring-queue-redis.test.js` |

## 覆盖率目标

与 `jest.config.js` 的 `coverageThreshold` 保持一致（低于此值 `--coverage` 直接失败）：

```json
{
  "coverageThreshold": {
    "global": { "branches": 30, "functions": 40, "lines": 40, "statements": 40 }
  }
}
```

⚠️ 覆盖率只统计 `collectCoverageFrom` 列出的目录，且**高覆盖率不等于有效覆盖** ——
一个断言自己手写常量的文件也能达到 100%。以毒丸判据为准。

## Fastify Inject 测试

```js
import Fastify from 'fastify';
import globalsLoader from '../framework/loader/registry/00-globals.js'; // reply.result 装饰器
import registerXxxRoutes from '../api/xxx/v1/xxx.js';

const app = Fastify({ logger: false });
await app.register(globalsLoader);
await app.register(registerXxxRoutes, { prefix: '/xxx' });
await app.ready();

const res = await app.inject({ method: 'GET', url: '/xxx/v1/probe' });
expect(res.statusCode).toBe(200);
```

> 注意 `import '../src/app.js'` 这类路径是错的（测试文件在 `src/__tests__/` 下，
> 应写 `../app.js`）。另外 `registerSecureRoute` 的路由登记表是**模块级全局状态**，
> 同一 URL 在一个测试文件内只能注册一次 —— 需要多种状态时用「改 env / 改 app 上的属性」
> 而不是重建 app（参考 `api/health.test.js`）。

## 需要 Redis 的套件

```js
const describeOrSkip = isRedisConfigured() ? describe : describe.skip;
beforeAll(() => connectTestRedis());   // 只读环境变量≠有连接，必须显式建连
afterAll(() => disconnectTestRedis());
```

- 本地不配 Redis → 套件显示 **skipped**（而不是假绿）；
- CI 里 `REDIS_ENABLED=true` 但连不上 → 直接抛错变红（由 `redis-ci-guard.test.js` 反向保证不会静默跳过）。
