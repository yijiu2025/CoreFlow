# framework/log — 全项目统一日志系统

全项目**唯一**日志出口。业务代码中禁止出现任何 `console.*`（ESLint `no-console: error` 强制），所有打印与日志记录都从这里导出使用。

> **架构说明**：日志核心已抽到独立 npm 包 `packages/log`（包名 `wb-logkit`，Node/浏览器通用、零依赖、前端可直接复用——浏览器环境自动降级为仅控制台输出）。本目录只是薄适配层：`index.js` 转发包导出，`traps.js` 提供服务器专属的全局异常钩子。

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
log.info('直接打印');   // 等价 createLogger('app')，跟随全局配置
```

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

实例优先级最高，创建时传或运行时热改：

```js
const log = createLogger('pay.charge', {
  level: 'debug',             // 本模块最低级别
  console: true,              // 本模块控制台开关
  file: { name: 'pay' },      // 本模块独立文件：logs/pay-YYYY-MM-DD.log
  debug: true                 // 本模块 debug 免关键词直接输出（false = 强制静默）
});

log.config({ level: 'warn' });   // 运行时热更新，返回自身可链式
```

### ④ 日志文件命名（全字段可配）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `name` | 跟随全局（`app`） | 文件名前缀 |
| `dir` | 跟随全局（`logs`） | 目录（不存在自动创建） |
| `ext` | `.log` | 扩展名，如 `.txt` |
| `date` | `true` | 文件名带日期后缀按天滚动；`false` = 单文件 |
| `dateDir` | `false` | 日期作为子目录：`logs/2026-09-12/app.log`（文件名不再带日期后缀） |
| `subdir` | 不启用 | 模块子目录：`'auto'`/`true` = 按 tag 首段分类；字符串 = 固定目录名 |
| `error` | `true` | 错误文件开关；`false` 关闭；字符串 = 自定义前缀 |
| `keepDays` | `30` | 按天清理过期日志；`0` = 永久保留 |

```js
// 单文件 pay.txt；关闭错误文件 error:false；自定义错误前缀 error:'myerr'
createLogger('pay', { file: { name: 'pay', ext: '.txt', date: false } });
createLogger('audit', { file: { name: 'audit', date: false, error: 'myerr' } });
```

### ④' 目录布局：让日志按日期 / 模块分文件夹

默认是平铺（全部堆在同一层）。想要更整洁，可开启**日期目录**和/或**模块子目录**——两者都是**可选新增**，不改默认行为：

| 模式 | 配置 | 产出 |
| --- | --- | --- |
| ① 平铺（默认） | — | `logs/app-2026-09-12.log` |
| ② 日期目录 | `dateDir: true` | `logs/2026-09-12/app.log` |
| ③ 模块子目录 | `subdir: 'auto'` | `logs/app-2026-09-12.log`、`logs/firewall/app-2026-09-12.log` |
| ④ 日期 + 模块（二级） | `dateDir: true` + `subdir: 'auto'` | `logs/2026-09-12/app.log`、`logs/2026-09-12/firewall/app.log` |

`subdir` 取值：不填/`false` = 不分目录；`'auto'`（或 `true`）= 自动取 tag 首段（`firewall.engine.rule` → `firewall/`）；固定字符串 = 该模块统一写入指定目录。

```js
// 推荐：日期做一级、模块做二级，目录清晰且逐天归档
// 全局：configureLog({ file: { dateDir: true, subdir: 'auto' } })
// 或按模块：createLogger('firewall.engine', { file: { subdir: 'auto' } });
//          createLogger('oauth21.token',   { file: { name: 'oauth', subdir: 'auto' } });
```

也可用环境变量全局开启：`LOG_DATE_DIR=on`、`LOG_SUBDIR=auto`（或固定名如 `LOG_SUBDIR=firewall`）。

> **清理安全**：日期目录模式下，过期清理**只整块删除 `YYYY-MM-DD` 命名的过期目录**；非日期命名的目录（如 `logs/mydata/`）和当天目录永不触碰。

文件产出规则：

| 文件 | 命名规则 | 内容 |
| --- | --- | --- |
| 主日志 | `<fileName>-YYYY-MM-DD.log`（默认 `app-2026-09-11.log`） | 全部级别，JSON 行，按天滚动 |
| 日期目录模式 | `<dir>/YYYY-MM-DD/<fileName>.log` | 同上，日期在目录上 |
| 错误日志 | `error-YYYY-MM-DD.log`（默认前缀时沿用旧命名） | warn 及以上 |
| 自定义名 | `<name>-...` + `<name>-error-...` | 实例 `file: { name }` 指定 |

### ⑤ 全局编程配置（应用入口用一次）

```js
import { configureLog } from '.../framework/log/index.js';

configureLog({
  level: 'warn',              // 全局最低级别
  file: { name: 'server', date: false },  // 文件总开关 + 命名配置
  console: true,              // 控制台总开关
  pretty: true,               // 彩色可读 / JSON 行
  showDev: true,              // dev 专属输出开关
  debugKeywords: ['auth']     // debug/trace 白名单
});
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

## 环境变量总表

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | info 及以上级别的门槛（trace/debug 由 LOG_DEBUG 单独控制） |
| `LOG_DEBUG` | 空 | debug/trace 白名单关键词 |
| `LOG_DIR` | `logs` | 日志文件目录 |
| `LOG_FILE_NAME` | `app` | 主日志文件名前缀 |
| `LOG_FILE_EXT` | `.log` | 文件扩展名 |
| `LOG_FILE_DATE` | `true` | 文件名日期后缀（`off` = 单文件不滚动） |
| `LOG_DATE_DIR` | `false` | 日期作为子目录（`on` = `logs/2026-09-12/app.log`） |
| `LOG_SUBDIR` | 空 | 模块子目录：`auto`/`true` = 按 tag 首段；或固定目录名 |
| `LOG_ERROR_FILE` | `true` | 错误文件开关 |
| `LOG_KEEP_DAYS` | `30` | 日志保留天数（`0` = 永久保留） |
| `LOG_CONSOLE` | `true` | 控制台开关 |
| `LOG_FILE` | `true` | 文件开关 |
| `LOG_PRETTY` | 非 prod 为 `true` | 控制台彩色可读 / JSON 行 |
| `LOG_DEV` | 随 `NODE_ENV` | dev 专属输出强制开关 |
| `LOG_LEVEL_<NAME>` | — | 模块级最低级别覆盖 |
| `LOG_CONSOLE_<NAME>` | 随 `LOG_CONSOLE` | 模块级控制台开关 |
| `LOG_FILE_<NAME>` | 随 `LOG_FILE` | 模块级文件开关 |

## 内置能力

- **自动脱敏**：`password` / `token` / `secret` / `key` / `cookie` 等字段输出为 `***`（递归 3 层，超深部分替换为 `[maxDepth]` 占位符）
- **链路追踪**：auth 框架注册了上下文提供器，请求内日志自动携带 `requestId` / `userId`
- **全局异常钩子**：`app.js` 已调用 `initLogErrorTraps()`，`uncaughtException` 记 fatal（同步落盘 + fd 2 同步兜底）后留 100ms 刷新窗口再退出（防管道场景丢最后一条控制台日志），`unhandledRejection` 记 always.error（不受 LOG_LEVEL 门控）
- **永不抛异常**：日志调用自身绝不把错误抛进业务代码（循环引用 / BigInt 经 safeStringify 安全序列化）
- **文件同步落盘**：`appendFileSync` 写入，进程崩溃前最后几条日志不丢
- **按天清理**：写文件时自动清理超过 `keepDays` 的过期日志（只删本框架命名规则的文件）
- **计时器**：`const done = log.time('dbQuery'); ...; done();` 自动输出耗时
- **零依赖**：仅用 node 内置模块（前端复用时进一步降级为零 node 依赖）

## 特殊出口

CLI 工具面向用户的结果输出（表格、成功提示等）不需要时间戳装饰，用：

```js
import { logStdout as stdout } from '.../log/index.js';
stdout('✔ 完成');   // 原样输出到 stdout
```

## 前端 / 其他项目复用

**已发布 npm 包：`wb-logkit`**（源码位于 `packages/log`，仓库 https://github.com/yijiu2025/log）

```bash
npm install wb-logkit
```

- **本仓库内**：统一用包名导入 `import { createLogger } from 'wb-logkit'`；`src/framework/log/index.js` 已转发 `export * from 'wb-logkit'`，因此既有 `framework/log/index.js` 路径导入同样有效（同一份实现）
- **软链机制**：`packages/log` 已在根 `package.json` 的 workspaces 中，经 npm workspace 软链到 `node_modules/wb-logkit`；**不要**把它写进 `dependencies`（会被线上同名包覆盖软链）
- **前端项目**：直接 `npm install wb-logkit`，浏览器环境自动降级（无文件通道，`log.file.*` 变体安全变 no-op，控制台经 `console.*` 输出）

## 兼容旧 API

旧代码 `import Logger from '.../log/index.js'` 的静态调用（`Logger.info / warn / error / auth`）仍然可用，内部委托给默认 logger（tag=`app`）。新代码请使用 `createLogger(tag)`。

## 源码

- `packages/log/src/config.js` — 配置（环境变量 + configureLog + 模块级规则 + 关键词匹配）
- `packages/log/src/context.js` — 上下文提供器（解耦 auth，避免循环依赖）
- `packages/log/src/logger.js` — Logger 核心（变参解析、实例配置、矩阵变体、门控）
- `packages/log/src/transports.js` — 控制台通道（通用）+ 文件通道注入器
- `packages/log/src/file-transport.node.js` — Node 文件通道（同步落盘、按天滚动、按天清理）
- `packages/log/src/sanitize.js` — 日志脱敏
- `packages/log/src/index.js` / `index.node.js` / `index.d.ts` — 双出口（浏览器/Node）+ 类型定义
- `src/framework/log/index.js` — 服务器适配层，`export * from 'wb-logkit'`（保持既有导入路径）
- `src/framework/log/traps.js` — 全局异常捕获（Node 专属）
