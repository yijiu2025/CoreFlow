# 注释规范

## 一、文件头注释

所有源文件必须包含文件头注释，标明模块职责。注释语言用**简体中文**。

> **`@author` 作用域**：只在文件头标注初始创建者/主责人，函数级不需要加 `@author`。代码归属以 `git blame` / `git log` 为准，手动标注几轮迭代后容易失真。

### JS / TS 文件

```js
/**
 * 模块职责（一句话概括）
 * 详细说明（可选）：复杂模块写清楚业务场景、注意事项
 * 迁移文件额外说明：本次迁移做什么，down 是否能完全回滚
 *
 * @author <作者>
 * @since 2026-07-13
 */
```

### Vue 单文件组件

```vue
<!--
 * 组件职责（一句话概括）
 * 详细说明（可选）：使用场景、数据流、状态管理方式
 *
 * @author <作者>
 * @since 2026-07-13
-->
```

### SQL 迁移文件

```sql
-- =========================================================================
-- 迁移说明：本次迁移做什么（建表/改列/加索引等）
-- 逆操作：DROP TABLE xxx / ALTER TABLE ...（是否可完全回滚，注意数据丢失风险）
-- =========================================================================
```

### 配置文件（YAML / TOML / Shell / Dockerfile / Makefile）

```yaml
# =============================================================================
# 模块职责（一句话概括）
# 详细说明（可选）
# =============================================================================
```

### CSS / SCSS 文件

```css
/* =============================================================================
 * 模块职责（一句话概括）
 * 详细说明（可选）：样式作用域、依赖的 CSS 变量、主题适配说明
 * ============================================================================= */
```

### HTML 文件

```html
<!--
 * 模块职责（一句话概括）
 * 详细说明（可选）：使用场景、依赖的脚本/样式
-->
```

---

## 二、函数注释

### JS 函数（含类型声明）

纯 JavaScript 需要在 JSDoc 中声明参数类型：

```js
/**
 * 函数职责
 *
 * @param {string}  paramName  - 参数说明
 * @param {number}  [optional] - 可选参数，默认值
 * @returns {string} 返回值说明
 * @throws {BadRequestException} 异常说明
 */
```

### TypeScript 函数（类型由 TS 接管，JSDoc 只写说明）

```ts
/**
 * 根据用户 ID 查询用户信息，附带角色和权限
 *
 * @param userId - 用户 ID
 * @param includeRoles - 是否同时加载角色信息，默认 false
 * @returns 用户对象，未找到返回 null
 * @throws BadRequestException userId 为 0 或负数时抛出
 */
async function getUserById(userId: number, includeRoles = false): Promise<User | null> {
  // ...
}
```

> **TS 中省略 `{type}` 的原因**：类型已在函数签名中声明，JSDoc 重复写 `{number}` 会导致代码改类型时注释不同步。TS 编译器会自动推导类型，JSDoc 只负责说明语义。

---

## 三、代码注释规范

### 行内注释

```js
// 单行说明：解释"为什么这样做"，而不是"做了什么"
// 代码本身已经说明了做了什么，注释要说原因
const MAX_RETRY = 3; // 避免瞬时网络抖动导致误判
```

### 注释反例

```js
// ❌ 只写"做了什么"（代码已自明）
// 设置用户名为张三
user.name = '张三'

// ✅ 写"为什么"（解释代码无法表达的原因）
// 用户未设置昵称时用手机号占位显示
user.name = user.nickname || user.phone

// ❌ 注释和代码不一致
// 检查用户是否已登录
if (user.role === 'admin') { ... }

// ✅ 注释随代码同步更新
// 检查用户是否为管理员
if (user.role === 'admin') { ... }

// ❌ 无意义的注释
let i = 0; // 设置 i 为 0
counter++; // 增加 counter

// ✅ 删除无意义注释，让代码自解释
let pageIndex = 0;
totalPageCount++;
```

### 区块注释

```js
// ---------------------------------------------------------------------------
// 1. 验证输入参数
// ---------------------------------------------------------------------------
if (!userId) throw new BadRequestException('用户 ID 不能为空');

// ---------------------------------------------------------------------------
// 2. 查询用户信息
// ---------------------------------------------------------------------------
const user = await User.findByPk(userId);

// ---------------------------------------------------------------------------
// 3. 组装返回结果
// ---------------------------------------------------------------------------
return { id: user.id, name: user.name };
```

### CSS / SCSS 区块注释

```scss
// ---------------------------------------------------------------------------
// 变量与主题
// ---------------------------------------------------------------------------
$primary-color: var(--color-primary);

// ---------------------------------------------------------------------------
// 组件基础样式
// ---------------------------------------------------------------------------
.component { ... }

// ---------------------------------------------------------------------------
// 响应式适配
// ---------------------------------------------------------------------------
@media (max-width: 768px) { ... }
```

### TODO / FIXME / HACK 标记

```js
// TODO: 后续接入 Redis 缓存，减少数据库查询
// FIXME: 边界条件未处理，当 pageSize 为 0 时会导致死循环
// HACK: 第三方库的 bug，升级到 v3 后移除该兼容代码
// OPTIMIZE: 此处 N+1 查询，后续改为 eager loading
// REVIEW: 该逻辑与 user.js 中的 checkPermission 重复，考虑抽取公共方法
```

| 标记 | 含义 | 使用场景 |
|------|------|----------|
| `TODO` | 待办事项 | 后续需要补充的功能或优化 |
| `FIXME` | 已知缺陷 | 存在 bug 或边界条件未处理 |
| `HACK` | 临时方案 | 绕过第三方库限制，带条件说明何时移除 |
| `OPTIMIZE` | 性能优化点 | 当前实现效率不高，后续优化 |
| `REVIEW` | 需要审查 | 代码逻辑有疑问，需要团队确认 |

---

### 错误处理反例

```js
// ❌ 吞掉异常
try {
  await api.save(data)
} catch {
  // 啥也不做
}

// ❌ 只打印不处理
try {
  await api.save(data)
} catch (e) {
  console.log(e)
}

// ❌ catch 后继续执行，数据已损坏
try {
  await api.save(data)
} catch (e) {
  console.error(e)
}
// 这里 data 可能没保存成功，但代码继续往下走
notifySuccess()

// ✅ 记录日志 + 向上抛或给用户反馈
try {
  await api.save(data)
} catch (e) {
  logger.error(`保存失败: ${e.message}`)
  throw e  // 或给用户提示
}
```

---

## 四、控制台日志规范

### 格式模板

```js
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
};

console.log(`✅ [模块名] ${C.green}操作成功: 详细信息${C.reset}`);
console.warn(`⚠️ [模块名] ${C.yellow}警告信息: 降级/重试等${C.reset}`);
console.error(`❌ [模块名] ${C.red}错误信息: 原因${C.reset}`);
console.log(`📦 [模块名] ${C.cyan}信息日志${C.reset}`);
console.log(`💾 [模块名] ${C.dim}持久化日志${C.reset}`);
```

### 级别与颜色

| 级别 | emoji | 颜色 | 使用场景 |
|------|-------|------|----------|
| 成功 | ✅ | green | 连接成功、初始化完成、操作成功 |
| 信息 | 📦 ℹ️ 🛡️ 🌱 | cyan | 启动信息、配置加载、路由注册 |
| 警告 | ⚠️ | yellow | 降级运行、重试、配置缺失 |
| 错误 | ❌ 🚨 | red | 连接失败、异常、crash |
| 持久化 | 💾 | dim | 数据写入、文件保存 |

### 生产环境兼容

ANSI 颜色代码（`\x1b[32m`）在本地终端友好，但输出到日志文件或接入 Docker / K8s / Datadog / Loki 等收集平台时会产生乱码。建议封装 logger 工具自动判断：

```js
const isTTY = process.stdout.isTTY;

function logSuccess(module, msg) {
  const prefix = `✅ [${module}]`;
  const body = isTTY ? `${C.green}${msg}${C.reset}` : msg;
  console.log(`${prefix} ${body}`);
}

function logError(module, msg) {
  const prefix = `❌ [${module}]`;
  const body = isTTY ? `${C.red}${msg}${C.reset}` : msg;
  console.error(`${prefix} ${body}`);
}
```

> 非 TTY 环境（管道、日志文件、容器 stdout）自动过滤颜色代码，保留纯文本日志以便 JSON 解析和全文检索。

| 标签 | 所属模块 |
|------|----------|
| `[Redis]` | Redis 连接/操作 |
| `[DB]` | 数据库连接/查询 |
| `[Migrate]` | 数据库迁移 |
| `[Loader]` | 引擎加载器 |
| `[Guard]` | 守卫系统 |
| `[Guard Config]` | 守卫配置 |
| `[Firewall]` | 防火墙 |
| `[PBAC]` | 权限系统 |
| `[Seed]` | 种子数据 |
| `[API]` | API 路由 |
| `[Auth]` | 认证系统 |
| `[Notice]` | 通知模块 |

### 示例

```js
console.log(`✅ [Redis] ${C.green}连接成功: ${host}:${port}${C.reset}`);
console.warn(`⚠️ [Redis] ${C.yellow}连接失败，降级到内存模式${C.reset}`);
console.error(`❌ [DB] ${C.red}缺少必要环境变量${C.reset}`);
console.log(`📦 [Loader] ${C.cyan}加载模块: ${name}${C.reset}`);
console.log(`💾 [Firewall] ${C.dim}流量统计已持久化${C.reset}`);
```