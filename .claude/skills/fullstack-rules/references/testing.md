# 测试规范

## 测试原则

- **测试即文档**：测试用例应该能说明功能的使用方式和预期行为
- **先测核心逻辑**：优先覆盖核心业务逻辑，再覆盖边界条件
- **不测框架**：不测试 Vue/Sequelize 等框架本身的功能
- **不写脆弱的测试**：避免测试实现细节，测试行为而非实现

### 测试反例

```js
// ❌ 测试实现细节（脆弱）
const spy = vi.spyOn(wrapper.vm, 'handleClick');
wrapper.find('button').trigger('click');
expect(spy).toHaveBeenCalled();

// ✅ 测试行为结果（健壮）
wrapper.find('button').trigger('click');
expect(wrapper.find('.error-message').exists()).toBe(true);
```

```js
// ❌ 测试框架本身
// Vue 的响应式不需要我们来测
const count = ref(0);
count.value++;
expect(count.value).toBe(1); // 无意义

// ✅ 测试业务逻辑
const user = reactive({ name: 'Alice', age: 17 });
const result = checkAdult(user); // 自定义函数
expect(result).toBe(false);
```

```js
// ❌ 一个测试测太多
test('用户模块', () => {
  // 测了登录、注册、登出... 失败时不知道哪个环节出问题
})

// ✅ 一个测试只测一个行为
test('登录成功时跳转首页', () => { ... })
test('密码错误时显示错误提示', () => { ... })
test('登录失败时按钮恢复可用', () => { ... })
```

---

## 一、测试文件命名

| 类型     | 命名规范                   | 示例                                   |
| -------- | -------------------------- | -------------------------------------- |
| 单元测试 | `*.test.js` 或 `*.spec.js` | `user.test.js`、`auth.spec.js`         |
| 集成测试 | `*.test.js`                | `api.test.js`                          |
| 测试工具 | `*.helper.js`              | `setup.helper.js`、`factory.helper.js` |

测试文件与源码保持相同目录结构，放在 `src/__tests__/` 下：

```
src/
├── __tests__/
│   ├── framework/auth/  # 和 src/framework/auth/ 对应
│   │   └── session.test.js
│   ├── api/            # 和 src/api/ 对应
│   │   └── user.test.js
│   └── helpers/        # 测试工具
│       └── factory.js
├── framework/
│   └── auth/
│       └── session.js
└── api/
    └── user.js
```

---

## 二、后端测试（Jest + Fastify inject）

### 测试环境配置

```js
// jest.config.js（仓库实际配置，ESM 模式）

// 运行方式（ESM 需开启 vm-modules）：
// node --experimental-vm-modules node_modules/jest/bin/jest.js
// 单个测试：node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns <pattern>
export default {
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/src/__tests__/**/*.test.js']
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 40,
      lines: 40,
      statements: 40
    }
  }
};
```

### Fastify inject 测试模板

```js
import app from '../../src/app.js';

describe('用户信息 API', () => {
  let fastify;

  beforeAll(async () => {
    fastify = await app();
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  test('GET /api/user/v1/profile - 未登录返回 401', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/user/v1/profile'
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      code: 401,
      message: expect.any(String)
    });
  });

  test('GET /api/user/v1/profile - 已登录返回用户信息', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/user/v1/profile',
      cookies: { sid: 'valid-session-id' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      code: 200,
      data: expect.objectContaining({
        uid: expect.any(String),
        username: expect.any(String)
      })
    });
  });
});
```

### 测试场景检查清单

- [ ] 正常输入（Happy Path）
- [ ] 未登录/无权限（401 / 403）
- [ ] 参数缺失/无效（400）
- [ ] 资源不存在（404）
- [ ] 边界值（空数组、分页边界、超长字符串）
- [ ] 并发操作（重复请求、竞态条件）

---

## 三、前端测试（Vitest）

### 测试文件命名和位置

```
src/
├── __tests__/
│   ├── components/     # 组件测试
│   │   └── LoginForm.test.ts
│   ├── stores/         # Store 测试
│   │   └── auth.test.ts
│   └── utils/          # 工具函数测试
│       └── format.test.ts
```

### 组件测试模板

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoginForm from '@/components/LoginForm.vue';

describe('LoginForm', () => {
  it('渲染登录按钮', () => {
    const wrapper = mount(LoginForm);
    expect(wrapper.text()).toContain('登录');
  });

  it('空表单提交时显示错误', async () => {
    const wrapper = mount(LoginForm);
    await wrapper.find('button[type="submit"]').trigger('click');
    expect(wrapper.text()).toContain('请输入用户名');
  });
});
```

### Store 测试模板

```ts
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';

describe('AuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('初始状态为未登录', () => {
    const store = useAuthStore();
    expect(store.isLoggedIn).toBe(false);
  });
});
```

---

## 四、测试覆盖率

| 指标       | 阈值   | 说明                        |
| ---------- | ------ | --------------------------- |
| Branches   | >= 30% | 分支覆盖（if/else、switch） |
| Functions  | >= 40% | 函数覆盖                    |
| Lines      | >= 40% | 行覆盖                      |
| Statements | >= 40% | 语句覆盖                    |

> 覆盖率阈值是底线，新功能建议达到 60%+。核心业务逻辑（auth、权限校验、支付等）要求 80%+。

---

## 五、测试运行命令

```bash
npm test                    # 运行所有测试
npm test -- --coverage      # 运行并生成覆盖率报告
npm test -- --watch         # 监听模式
npm test -- --testPathPattern user  # 只运行 user 相关测试
```

---

## 六、E2E 测试（Playwright）

### 适用场景

- 关键用户流程（登录、注册、支付、核心业务操作）
- 跨页面/跨组件的集成行为
- 需要真实浏览器环境的测试

### 测试文件命名

```
e2e/
├── auth/
│   ├── login.spec.ts
│   └── register.spec.ts
├── dashboard/
│   └── navigation.spec.ts
└── helpers/
    └── auth.helper.ts        # 登录等通用操作封装
```

### 测试模板

```ts
import { test, expect } from '@playwright/test';

test.describe('用户登录', () => {
  test('正常登录跳转首页', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.user-name')).toContainText('admin');
  });

  test('密码错误显示提示', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-message')).toContainText('密码错误');
  });
});
```

### E2E 测试原则

| 原则       | 说明                                                  |
| ---------- | ----------------------------------------------------- |
| 测业务流程 | 测"用户能做什么"，不测实现细节                        |
| 稳定优先   | 使用 data-testid 或 aria-label 定位，避免脆弱的选择器 |
| 隔离性     | 每个测试独立运行，不依赖其他测试的状态                |
| 数据准备   | 测试前通过 API 或 fixture 准备数据，不依赖手动操作    |

### 运行命令

```bash
npx playwright test                    # 运行所有 E2E 测试
npx playwright test --headed           # 有头模式（可视化调试）
npx playwright test --project=chromium # 只运行 Chromium
npx playwright show-report             # 查看测试报告
```
