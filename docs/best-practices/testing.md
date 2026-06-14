# 测试 {#testing}

## 常用命令

```bash
npm test                    # 运行所有测试
npm test -- --coverage      # 运行并生成覆盖率报告
node --experimental-vm-modules npx jest --testPathPattern <pattern>  # 单个测试
```

## 测试分层

```
src/__tests__/
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
```

## 测试优先级

| 优先级 | 模块 | 原因 |
|--------|------|------|
| P0 | `detector.js` 的 checkGlobalBlock/checkRateLimit | 安全核心 |
| P0 | `auth/xToken.js` 的 login/check | 认证核心 |
| P0 | `api/guard.js` 的 isIpMatch | IP 匹配逻辑 |
| P1 | API 路由集成测试 | 请求链路正确 |
| P1 | `fingerprint.js` | 指纹生成一致性 |

## 覆盖率目标

```json
{
  "coverageThreshold": {
    "global": {
      "branches": 30,
      "functions": 40,
      "lines": 40,
      "statements": 40
    }
  }
}
```

## Fastify Inject 测试

```js
import { createApp } from '../src/app.js';

describe('Auth API', () => {
  let app;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('POST /login 返回 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth21/v1/auth/login',
      payload: { email: 'test@example.com', password: 'password123' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe(200);
  });
});
```
