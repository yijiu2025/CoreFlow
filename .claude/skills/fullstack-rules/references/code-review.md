# 企业级代码审查规范

> 代码审查（Code Review）的检查清单和规则，适用于所有后端 API、守卫系统、加载器、数据库操作的审查。

---

## 一、审查流程

审查代码时，必须按以下顺序进行：

```
1. 读需求 → 理解改动的业务背景
2. 读文件 → 读取被修改文件的完整内容
3. 追踪调用链 → 检查该文件的 import 依赖和调用方（至少 2 层）
4. 对照清单 → 逐项检查以下所有规则
5. 输出报告 → 按严重等级（🔴 🟡 🔵）排列问题
6. 修复确认 → 修复后重新验证，确保不破坏现有功能
```

**核心原则：不只看单个文件，必须追踪完整调用链。**

---

## 二、控制流安全

### 2.1 禁止字符串匹配做控制流

错误消息文本可能因版本、国际化、人为修改而变化，**不得依赖错误消息文本做控制流判断**。

```js
// ❌ 禁止：依赖错误消息文本
if (err.message?.includes('路由重复注册')) { ... }

// ✅ 正确：使用错误码或自定义错误类
const err = new Error('路由重复注册');
err.code = 'DUPLICATE_ROUTE';
throw err;

// 检查时：
if (err.code === 'DUPLICATE_ROUTE') { throw err; }
```

### 2.2 异步操作必须有超时保护

任何可能阻塞的异步操作（网络请求、数据库查询、模块加载）必须设置超时：

```js
// ✅ 正确：Promise.race 超时保护
await Promise.race([
  register(app),
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('超时'), { code: 'TIMEOUT' })), 30000))
]);
```

### 2.3 优雅关闭

所有定时器、异步队列、未完成的写操作必须有优雅关闭机制：

| 场景           | 处理方式                                     | 示例                              |
| -------------- | -------------------------------------------- | --------------------------------- |
| 防抖保存       | 暴露 `flush()` 方法，`onClose` 钩子调用      | `flushGuardConfig()`              |
| 定时器         | `clearTimeout` / `clearInterval`             | `if (timer) clearTimeout(timer)`  |
| WebSocket 连接 | 关闭所有活跃连接                             | `clients.forEach(c => c.close())` |
| 数据库连接池   | 使用连接池自带的 `close()`                   | `sequelize.close()`               |
| 文件写入流     | `stream.end()` 或 `fs.promises` 的 `close()` | `writeStream.end()`               |

### 2.4 onClose 钩子必须自己 try-catch

**框架（Fastify、Express 等）的关闭钩子通常不暴露异步错误**。如果钩子内抛异常，错误会被静默吞掉。

```js
// ❌ 禁止：onClose 异步错误被静默吞掉
app.addHook('onClose', async () => {
  await flushGuardConfig(); // 如果这里抛异常，没人知道
});

// ✅ 正确：onClose 中自己 try-catch
app.addHook('onClose', async () => {
  try {
    await flushGuardConfig();
  } catch (err) {
    console.error(`❌ [App] 优雅关闭失败: ${err.message}`);
  }
});
```

### 2.5 进程退出时必须确保日志已刷新

`process.exit(1)` 立即终止进程，**不等待 stdout/stderr 刷新**。在 CI/CD、Docker、systemd 等非交互式环境中，错误消息可能被截断。

```js
// ❌ 禁止：日志可能未刷新
console.error('❌ 安全错误: 密钥不合法');
process.exit(1);

// ✅ 正确：给 stderr 刷新时间
console.error('❌ 安全错误: 密钥不合法');
setTimeout(() => process.exit(1), 100);
```

---

## 三、空值安全

### 3.1 所有嵌套对象访问必须保护

```js
// ❌ 禁止：直接访问嵌套属性
Object.assign(configs[systemKey].groups[groupKey].apis[apiKey], patch);

// ✅ 正确：逐层可选链保护
const group = configs[systemKey]?.groups?.[groupKey];
const api = group?.apis?.[apiKey];
if (!api) return null;
Object.assign(api, patch);
```

### 3.2 空值合并优先级

```js
const value = obj?.prop ?? defaultValue; // ✅ 正确：null/undefined 用默认值
const value = obj?.prop || defaultValue; // ⚠️ 谨慎：0 / '' / false 也会走默认值
```

### 3.3 函数参数默认值

所有可能为 `null`/`undefined` 的参数必须有安全默认值：

```js
function handle(opts = {}) {
  const { enabled = true, allowIps = [], requireLogin = false } = opts;
  // ...
}
```

---

## 四、安全一致性

### 4.1 功能一致性

**相同功能的不同实现路径必须具有相同级别的安全保护。**

| 路径           | 必须支持                                                       | 常见遗漏                              |
| -------------- | -------------------------------------------------------------- | ------------------------------------- |
| HTTP 路由      | enabled, allowIps, requireLogin, allowRoles, requirePermission | —                                     |
| WebSocket 路由 | 同上全部                                                       | allowIps, requirePermission, 三级级联 |
| 文件上传       | 类型校验, 大小限制, 权限校验                                   | MIME magic bytes 校验                 |
| 内部 API       | 鉴权, 速率限制                                                 | 权限校验                              |

### 4.2 对称性

首次调用和后续调用的行为差异必须文档化：

```js
// 注意：首次注册和后续更新的行为不对称：
// - 首次：创建完整条目，包含所有运行时字段
// - 后续：仅更新结构字段，不覆盖运行时字段（由 DB 控制）
```

### 4.3 reply.sent 显式标记

直接调用 `reply.send()` 或 `reply.code(N).send()` 时，**必须显式标记 `reply.sent = true`**。`createGuard` 等中间件依赖 `reply.sent` 判断是否已发送响应，不标记会导致守卫继续执行后续校验。

```js
// ❌ 禁止：直接 return reply.send()，不标记 sent
return reply.code(401).send({ error: 'invalid_token' });

// ✅ 正确：send 后显式标记 sent
reply.code(401).send({ error: 'invalid_token' });
reply.sent = true;
return;
```

注意：`reply.result.*`（如 `reply.result.forbidden()`）内部已设置 `reply.sent`，无需手动标记。

---

## 五、错误处理

### 5.1 静默失败检测

**所有 `continue`、`return`、`break` 跳过某个路径时，必须记录日志。**

```js
// ❌ 禁止：静默跳过
if (!configs[systemKey]) continue;

// ✅ 正确：跳过时记录警告
if (!configs[systemKey]) {
  console.warn(`⚠️ [Module] DB 中存在已删除的配置: ${systemKey}，已忽略`);
  continue;
}
```

### 5.2 异常输入告警

函数接收非预期格式的参数时，必须记录警告日志，而非静默返回默认值：

```js
// ❌ 禁止：静默返回 false
if (required.any) { ... }
if (required.all) { ... }
return false;  // 用户不知道配置错了

// ✅ 正确：记录日志
if (required.any) { ... }
if (required.all) { ... }
console.warn(`⚠️ [Guard] 非预期权限格式: ${JSON.stringify(required)}`);
return false;
```

### 5.3 错误码规范

推荐使用 `err.code` 字符串常量，格式为 `DOMAIN_ERROR_TYPE`：

| 错误码                    | 场景           | 说明                  |
| ------------------------- | -------------- | --------------------- |
| `DUPLICATE_ROUTE`         | 路由重复注册   | 模块加载时检测        |
| `LOAD_TIMEOUT`            | 模块加载超时   | 超过 30s 未完成       |
| `CONFIG_VERSION_CONFLICT` | 配置版本冲突   | 乐观锁更新失败        |
| `DB_CONNECTION_FAILED`    | 数据库连接失败 | 启动时检测            |
| `REDIS_CONNECTION_FAILED` | Redis 连接失败 | 启动时检测            |
| `INVALID_PARAM`           | 函数参数无效   | 公共 API 参数校验失败 |

### 5.4 公共 API 函数参数校验

**所有 export 的公共函数必须对参数做防御性校验。** 调用方可能传错参数，校验失败时抛出带错误码的异常，而非让崩溃发生在深层调用中。

```js
// ❌ 禁止：假设参数有效
export function registerSecureRoute(fastify, options) {
  const { method, url, handler } = options;
  const methodUpper = method.toUpperCase();  // method 为 undefined 时崩溃

// ✅ 正确：防御性校验 + 错误码
export function registerSecureRoute(fastify, options) {
  if (!options.method || typeof options.method !== 'string') {
    const err = new Error(`method 无效`);
    err.code = 'INVALID_PARAM';
    throw err;
  }
  // 或者使用 guard-config.js 的 register* 模式：console.warn + return
  if (!metadata || typeof metadata !== 'object') {
    console.warn(`⚠️ [Module] metadata 参数无效`);
    return;
  }
```

### 5.5 错误对象构造方式

构造带错误码的 Error 时，**使用 `err.code = '...'` 赋值，而非 `Object.assign`**：

```js
// ❌ 禁止：Object.assign 方式（linter 格式化困难）
throw Object.assign(new Error('消息'), { code: 'ERROR_CODE' });

// ✅ 正确：先创建 Error，再赋值 code
const err = new Error('消息');
err.code = 'ERROR_CODE';
throw err;
```

---

## 六、并发安全

### 6.1 共享可变状态

模块级可变变量必须审查并发访问：

```js
// 需审查：是否有多个写入路径？
let configs = {};
let currentVersion = 0;

// 需审查：防抖是否覆盖所有写入路径？
let saveTimer = null;
```

### 6.2 防抖与竞态

防抖延迟写入时，必须考虑：

- 关闭时未完成的写入 → 添加 `flush()` 方法
- 连续写入的顺序 → 单线程 JS 保证顺序，但 version 乐观锁兜底
- 写入失败的重试 → 不要在防抖回调中重试（会无限重试）

---

## 七、日志与监控

### 7.1 日志规范

```js
// 统一标签格式：[模块名]
console.log(`✅ [Module] ${C.green}成功信息${C.reset}`);
console.warn(`⚠️ [Module] ${C.yellow}警告信息${C.reset}`);
console.error(`❌ [Module] ${C.red}错误信息${C.reset}`);
```

### 7.2 可观测性

审查以下内容是否缺失：

- 启动耗时统计（每个模块加载耗时）
- 错误计数（按错误类型统计）
- 降级标记（如 Redis 降级到内存）
- 配置变更事件（谁、什么时间、改了哪个字段）

### 7.3 生产环境配置警告

**生产环境未配置关键参数时，必须在启动日志中输出明确警告**。运维人员部署时可能不知道某些配置未设置，启动警告能帮助快速定位问题。

审查以下场景是否需要启动警告：

| 场景                | 警告内容                 | 严重程度       |
| ------------------- | ------------------------ | -------------- |
| CORS 白名单为空     | 所有跨域请求将被拒绝     | 中（功能受限） |
| Redis 降级到内存    | 缓存失效，重启后数据丢失 | 中             |
| 密钥使用默认值      | 安全风险，立即修改       | 高             |
| 数据库连接池过小    | 高并发下连接等待         | 低             |
| 外部 API 依赖未配置 | 某功能不可用             | 中             |

```js
// ✅ 正确：启动时主动提醒
if (isProduction && CORS_ORIGINS.length === 0) {
  console.warn('⚠️ [App] 生产环境未配置 CORS_ORIGINS，所有跨域请求将被拒绝');
}
```

---

## 八、审查清单

### 代码提交前自查

```
[ ] 所有嵌套对象访问有可选链或空值保护
[ ] 没有使用 err.message.includes() 做控制流判断
[ ] 所有异步操作有超时保护
[ ] 所有定时器/防抖有优雅关闭路径
[ ] 所有 continue/return 跳过路径有日志输出
[ ] 函数处理非预期输入时有警告日志
[ ] 相同功能的不同路径安全级别一致
[ ] 首次调用和后续调用的差异已文档化
[ ] 模块级可变状态已审查并发安全
[ ] 新增错误使用了错误码而非消息文本
```

### 审查完成后的报告格式

```
## 审查报告

| 等级 | 数量 | 说明 |
|------|------|------|
| 🔴 严重 | N | 运行时崩溃、安全绕过、数据丢失风险 |
| 🟡 中等 | N | 配置错误难排查、潜在性能问题 |
| 🔵 低 | N | 可读性、文档、代码风格 |
```

---

## 九、相关规范

| 规范        | 文件                                         | 说明                              |
| ----------- | -------------------------------------------- | --------------------------------- |
| 🔒 安全红线 | [security.md](security.md)                   | 敏感信息、XSS、SQL 注入、权限校验 |
| ⚙️ 后端规范 | [backend/main.md](backend/main.md)           | 目录结构、API 路由、守卫、数据库  |
| 🏷️ 命名规范 | [naming-convention.md](naming-convention.md) | 代码/文件/API 命名                |
| 📝 注释规范 | [note.md](note.md)                           | 文件头注释、函数注释、TODO 标记   |
