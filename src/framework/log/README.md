# framework/log — 全项目统一日志系统

全项目**唯一**日志出口。业务代码中禁止出现任何 `console.*`（ESLint `no-console: error` 强制），所有打印与日志记录都从这里导出使用。

> **架构说明**：日志核心已抽到独立 npm 包 `packages/log`（包名 `wb-logkit`，Node/浏览器通用、零依赖、前端可直接复用——浏览器环境自动降级为仅控制台输出）。本目录只是薄适配层：`index.js` 转发包导出，`traps.js` 提供服务器专属的全局异常钩子。

## 文档分工（先看这条，避免改错地方）

| 想知道 | 去哪看 |
| --- | --- |
| **环境变量、配置项、API、文件命名规则、浏览器降级** | 📦 **[`packages/log/README.md`](../../../packages/log/README.md) — 权威说明** |
| **本项目怎么接入**：`app.js` 调什么、全局 `log` 怎么注册、必须守哪些约定 | 👈 本文档（下面几节） |
| 服务器专属能力：进程级异常钩子 | 👈 本文档「全局异常钩子」一节 |

⚠️ **本文档不复制包的配置细节**。历史上两边各维护一份「环境变量总表」（21 行逐字相同），
已经开始漂移 —— 现在只保留**指向包文档的链接**。要改环境变量或 `config()` 行为，改包侧 README。

## 10 秒上手

```js
import { createLogger } from '<相对路径>/framework/log/index.js';

// tag 建议 = 文件路径的点分形式（不含 src/ 前缀和扩展名）
const log = createLogger('auth.session');

log.info('用户登录', { userId: 1 });   // 常规日志（对象自动并入 data）
log.warn('缓存降级', err);             // 警告（Error 自动提取 stack）
log.error('查询失败', err);            // 错误
log.debug('缓存未命中', key);          // 调试：默认静默，见「场景①」
```

不建 logger 也能用：

```js
import { log } from '.../framework/log/index.js';
log.info('直接打印');   // 未注册全局时 = tag 'app' 的默认实例
```

## 三条硬约定（务必遵守）

1. **`configureLog` 全项目只在 `src/app.js` 调用一次**，文件通道默认**关闭**，要写文件就在那里给 `file: {…}`
2. **入口注册全局 log**：`src/app.js` 里 `createLogger('app', true)`，其他文件 `import { log } from '.../framework/log/index.js'` 直接可用，不必再 `createLogger`
3. **`createLogger` 只有两个参数**：`tag` + 是否注册为全局。其余一切配置走 `log.config({...})`

> 三条都源自包的设计原则，完整表述见
> [包 README「设计原则」](../../../packages/log/README.md#设计原则重要)。

## 按场景查用

### ① 只想调试某个模块

`debug`/`trace` 默认静默、不受 `LOG_LEVEL` 影响。想看哪块，配一个关键词：

```bash
LOG_DEBUG=auth            # 命中 auth.session / framework.auth.index 等所有含 auth 段的 tag
LOG_DEBUG=auth,redis      # 多个关键词
LOG_DEBUG=firewall.*      # 前缀通配
LOG_DEBUG=*               # 放开全部
DEBUG_AUTH=true           # 兼容旧开关：自动映射为关键词 auth
```

```js
log.debug('缓存未命中', key);       // 关键词命中 tag 才输出
log.dev.debug('排查明细');          // 仅开发环境 + 关键词控制
```

### ② 必输 / 环境 / 只写文件

矩阵 API：**必要性**（默认 / `always` 必输）× **环境**（任意 / `dev` / `prod`）× **通道**（控制台+文件 / `file` 仅文件），任意级别 × 任意组合，**顺序无关**：

```js
log.always('系统启动完成');               // 快捷方式 = log.always.info(...)，无视一切门控
log.always.error('配置校验失败');          // 必输的 error
log.dev.debug('开发期排查明细');           // 仅开发 + 关键词控制
log.prod.error('生产专用错误提示');        // 仅生产的 error
log.dev.always.info('仅开发的必输信息');   // log.always.dev.info 同义
log.file.info('详细数据快照');             // 只进文件，不刷屏
log.file.always.error('敏感堆栈留档');     // 组合任意维度
```

### ③ 给某个模块单独配置

实例优先级最高，一律通过 `config()` 热改（`createLogger` 只接受 tag 和是否注册全局）：

```js
const log = createLogger('pay.charge');

log.config({
  level: 'debug',             // 本模块最低级别
  console: true,              // 本模块控制台开关
  consoleLevel: 'warn',       // 控制台通道级别：只打 warn+（写法同 file.level）
  file: { name: 'pay' },      // 本模块独立文件：logs/pay-YYYY-MM-DD.log（给 file 即开启）
  debug: true                 // 本模块 debug 免关键词直接输出（false = 强制静默）
});

log.config({ level: 'warn' });   // 运行时热更新，返回自身可链式
```

### ④ 日志文件命名与目录布局

`file: {…}` 支持的全部字段（`name` / `dir` / `ext` / `suffix` / `date` / `dateDir` /
`subdir` / `level` / `error` / `keepDays`）、四种目录布局（平铺 / 日期目录 / 模块子目录 /
日期+模块）、以及过期清理的安全边界，**均在包侧维护**：

- [文件配置字段与记录等级 `file.level`](../../../packages/log/README.md#日志文件仅-node)
- [避免重复记录](../../../packages/log/README.md#避免重复记录)
- [目录布局（三种，可组合）](../../../packages/log/README.md#目录布局三种可组合)

**本项目最常用的一种组合**（日期做一级、模块做二级）：

```js
// 全局（app.js 的 configureLog 里）
configureLog({ file: { dateDir: true, subdir: 'auto' } });
// 或按模块热改
createLogger('firewall.engine').config({ file: { subdir: 'auto' } });
// 对应环境变量：LOG_DATE_DIR=on、LOG_SUBDIR=auto（或固定名如 LOG_SUBDIR=firewall）
```

> 要点提醒：**默认不写文件**（要写就给 `file: {…}`，关掉用 `file: false`）；
> **实例 `file` 是替换不是叠加**（全局开了、模块又给了 → 只写模块那份，一次输出最多一个文件）；
> **写了 `file.level` 就优先于全局 `level`**（连 `debug`/`trace` 也落盘，不必再配 `LOG_DEBUG`）。

### ⑤ 全局编程配置（`src/app.js` 用一次）

```js
import { configureLog, createLogger, initLogErrorTraps } from './framework/log/index.js';

configureLog({
  level: 'info',              // 全局最低级别
  console: true,              // 控制台总开关
  consoleLevel: 'info',       // 控制台通道级别（可选）
  debugKeywords: process.env.LOG_DEBUG || '',
  // file 默认不写（注释掉即关闭）；给 file 对象即全局开启，键全都有默认值
  // file: { name: 'app', dir: 'logs', ext: '.log', suffix: '', date: true, dateDir: false,
  //         subdir: 'auto', level: 'info', error: true, keepDays: 30 }
});

createLogger('app', true);    // ② = 注册为全局 log，其他文件直接 import { log }
initLogErrorTraps();
```

### ⑥ 部署时按模块配置（环境变量，无需改代码）

```bash
# 生产示例：全局只看 error+，auth 放开到 info，redis 只写文件不刷屏
LOG_LEVEL=error
LOG_LEVEL_AUTH=info          # auth 模块最低级别 info
LOG_CONSOLE_REDIS=off        # redis 模块不进控制台（只写文件）
LOG_FILE_CLI=false           # cli 模块不写文件
LOG_FILE_NAME=server         # 主日志文件名前缀
```

规则：`LOG_(LEVEL|CONSOLE|FILE)_<NAME>`，`NAME` 小写、下划线转点分，按 tag **路径段匹配**；多个规则命中取最长关键词（最具体）。

优先级：**实例 options > 模块规则 > 全局 config/env**。

> 📖 **[全部环境变量总表 →](../../../packages/log/README.md#环境变量)**
> （含 `LOG_DIR` / `LOG_FILE_EXT` / `LOG_MAX_STR` / `LOG_PRETTY` / `LOG_DEV` / `LOG_KEEP_DAYS` 等 21 项）

## 内置能力

**完整清单见 [包 README「内置能力」](../../../packages/log/README.md#内置能力)**
（自动脱敏、故障不静默、超长截断、时区一致、多进程、上下文注入、Error 提取、计时器、原始输出等）。

本项目的两条**接入相关**说明：

- **链路追踪**：auth 框架通过 `setLogContextProvider()` 注册了上下文提供器，请求内日志自动携带
  `requestId` / `userId`（核心字段受保护不被覆盖）。这是**宿主接入**，包侧只有通用机制。
- **零依赖**：仅用 Node 内置模块，前端复用时降级为零 Node 依赖。

## 全局异常钩子（服务器专属）

`traps.js` 不在 npm 包里 —— 它依赖 `process` / `fs` 等 Node API，属宿主职责。
`app.js` 已调用 `initLogErrorTraps()`：

| 事件 | 行为 |
| --- | --- |
| `uncaughtException` | 记 `fatal`（同步落盘 + fd 2 同步兜底）→ 留 100ms 刷新窗口 → `process.exit(1)` |
| `unhandledRejection` | 记 `always.error`（不受 `LOG_LEVEL` 门控），**进程继续运行** |

两个细节值得知道：

1. **100ms 刷新窗口的用途**：stdout/stderr 在管道/重定向场景（docker、pm2、CI）是异步写，
   立即 `process.exit` 会丢掉控制台最后一条日志，因此先用 `fs.writeSync(2, …)` 同步兜底再退出。
2. **崩溃留档不与全局 file 开关耦合**：`traps.js` 内部对 `process` logger 强制
   `.config({ file: { name: 'process', level: 'all', error: true } })`。进程级致命日志丢了对排查是灾难。
3. **副作用提醒**：安装 `unhandledRejection` 处理器会改变 Node ≥15 的默认行为
   （默认是 throw 崩溃，安装后进程继续运行）。

## 特殊出口

CLI 工具面向用户的结果输出（表格、成功提示等）不需要时间戳装饰，用：

```js
import { logStdout as stdout } from '.../log/index.js';
stdout('✔ 完成');   // 原样输出到 stdout
```

> 注意 `logStdout` **只写 stdout、不落盘**，也不受 `LOG_CONSOLE` / `LOG_LEVEL` 门控。
> 详见 [包 README「内置能力」](../../../packages/log/README.md#内置能力) 末条。

## 本仓库内的接入方式

**已发布 npm 包：`wb-logkit`**（源码位于 `packages/log`，仓库 https://github.com/yijiu2025/log）

```bash
npm install wb-logkit
```

- **本仓库内**：统一用包名导入 `import { createLogger } from 'wb-logkit'`；`src/framework/log/index.js` 已转发 `export * from 'wb-logkit'`，因此既有 `framework/log/index.js` 路径导入同样有效（同一份实现）
- **软链机制**：`packages/log` 已在根 `package.json` 的 workspaces 中，经 npm workspace 软链到 `node_modules/wb-logkit`；**不要**把它写进 `dependencies`（会被线上同名包覆盖软链）
- **前端项目**：直接 `npm install wb-logkit`，浏览器环境自动降级（无文件通道，`log.file.*` 变体安全变 no-op，控制台经 `console.*` 输出）—— 详见 [包 README「浏览器使用」](../../../packages/log/README.md#浏览器使用)

## 兼容旧 API

旧代码 `import Logger from '.../log/index.js'` 的静态调用（`Logger.info / warn / error / auth`）仍然可用，内部委托给默认 logger（tag=`app`）。新代码请使用 `createLogger(tag)`。

## 源码

**包内源码**（12 个文件，[完整结构见包 README](../../../packages/log/README.md#源码结构)）：

- `packages/log/src/config.js` — 配置（环境变量 + configureLog + 模块级规则 + 关键词匹配）
- `packages/log/src/logger.js` — Logger 核心（变参解析、实例配置、矩阵变体、门控）
- `packages/log/src/transports.js` / `file-transport.node.js` — 控制台通道 / Node 文件通道
- `packages/log/src/sanitize.js` / `safe-stringify.js` / `degraded.js` — 脱敏 / 安全序列化 / 降级告警
- `packages/log/src/context.js` — 上下文提供器（解耦 auth，避免循环依赖）
- `packages/log/src/index.js` / `index.node.js` / `index.d.ts` — 双出口（浏览器/Node）+ 类型定义

**本目录（适配层，服务器专属）**：

- `src/framework/log/index.js` — `export * from 'wb-logkit'`（保持既有导入路径）+ 转发 `initLogErrorTraps`
- `src/framework/log/traps.js` — 全局异常捕获（Node 专属，不进 npm 包）
- `src/framework/log/README.md` — 本文档（**接入约定**，不是包文档）

