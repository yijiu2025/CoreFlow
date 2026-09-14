# 项目长期约定

## 日志系统（wb-logkit）

- **全项目唯一日志出口**：`src/framework/log/index.js`（`export * from 'wb-logkit'`）。业务代码禁止任何 `console.*`（ESLint `no-console: error`）。
- **统一用包名导入**：`import { createLogger } from 'wb-logkit'`。禁止跨目录深层路径导入 `packages/log/src/*`。
- 该包是本地 npm workspace 包（`packages/log`），靠软链 `node_modules/wb-logkit` 生效，**不要写进 `dependencies`**。
- **已开源发布**：GitHub https://github.com/yijiu2025/log （独立仓库，`packages/log` 已从主仓库 `.gitignore` 排除）；npm 正式包名 **`wb-logkit`**，最新 **0.5.0**（GitHub 已推 `2aad119`；npm 发布待新 token）。
  - npm token 会过期；发布时用 `printf '//registry.npmjs.org/:_authToken=<token>\n' > .npmrc.tmp && npm publish --userconfig ./.npmrc.tmp --access public; rm -f .npmrc.tmp`
  - 历史有效 token 用户名 `qirly`；**2026-09-14 起 `~/.npmrc` 里的 token（`npm_q8ThKeT5...`）已失效（whoami 401）**，需换新 token
  - 另有 `@qirly/wb-log@0.1.0`（scoped 备份版，内容相同，保留不删）
  - 命名踩坑：`wb-log` 与 `wblog` 相似被拒；`wb-trace` 与 `dd-trace` 相似被拒
- 注意：`packages/log` 是**嵌套在项目内的独立 git 仓库**（有自己的 `.git`），在主仓库中执行 git 操作时它会以未跟踪目录形式出现。
- 前端目录（`oauth21/`、`firewall/`、`admin/`）复用时直接引 `wb-logkit`，浏览器自动降级为纯控制台。

### 使用约定（0.4.x 起，重要）

1. **文件输出默认关闭**。要写文件必须显式给 `file` 配置——在 `configureLog` 里给（全局）或模块 `.config()` 里给（该模块）。给 `file: {…}` 对象（哪怕 `{}`）即开启，其余键走默认值；`file: false` 显式关闭。
2. **`configureLog` 全项目只在 `src/app.js` 调一次**；`src/app.js` 里 `createLogger('app', true)` 注册全局 log，其他文件 `import { log } from '<...>/framework/log/index.js'` 直接可用。
3. **`createLogger` 只有两个参数**：`(tag, asGlobal)`。其余一切配置走 `log.config({...})`（运行时更新，累积合并，返回自身可链式）。
4. **`consoleLevel` / `file.level` 是通道独立级别**，写法：`'info'`（及以上）/ `'all'` / `['info','error']`（白名单）/ `'warn,error'` / `'off'`。
5. **显式通道配置优先于全局 `level` 门槛**：写了 `file.level='all'` 就连 `debug`/`trace` 也落盘，不需要 `LOG_DEBUG`。一句话——*门槛管默认行为，显式配置说了算*。
6. **实例 `file` 配置是替换而非叠加** → 全局与模块同时开启也不会重复记录。
7. 业务代码禁 `console.*`（ESLint `no-console: error`）；统一 `import { createLogger } from 'wb-logkit'`（或经 `src/framework/log/index.js` 转发），禁止深层路径导入 `packages/log/src/*`。
8. 该包是本地 npm workspace 包（`packages/log`），靠软链 `node_modules/wb-logkit` 生效，**不要写进 `dependencies`**。

- **日志目录布局（0.2.0 新增，均为可选）**：
  - `file.dateDir`（env `LOG_DATE_DIR`）：日期做子目录 `logs/2026-09-12/app.log`，此时文件名不再带日期后缀
  - `file.subdir`（env `LOG_SUBDIR`）：`'auto'`/`true` = 按 tag 首段自动分类；字符串 = 固定目录名
  - 两者组合 = 推荐形态 `logs/<日期>/<模块>/app.log`
  - 清理安全：日期目录模式只整块删过期的 `YYYY-MM-DD` 目录，非日期目录与当天目录永不触碰
- `traps.js` 的 `process` logger 强制 `.config({ file: { level:'all' } })`，崩溃留档不与全局 file 开关耦合。

### 降级告警（0.5.0 起）

- **`packages/log/src/degraded.js` 是唯一「库自身故障留痕」出口**：`writeRawStderr(line)`（Node→stderr 裸写 / 浏览器→console.error）+ `warnOnce(key, line)`（按 key 去重限流）。
- **原则**：日志库自身出故障**不向上抛**（绝不污染业务），但**必须留痕**——"日志静默丢失"是最糟结果。
- **必须限流**：磁盘满/权限错会每条日志都触发，不限流会刷爆 stderr。
- 已覆盖 5 个场景：文件写入失败、清理失败（非 ENOENT）、`fatal` 双关兜底（裸写 stderr）、`log.file.*` 但文件关闭、`configureLog` 非法级别名。
- **`parseLevelOpt` 保持纯函数**（非法值静默退 null）；告警走 `validateLevelOpt(value, where)` 包装层（仅 `configureLog` 内部用），不要往 `parseLevelOpt` 里塞副作用。
- 业务侧感知：库故障时 stderr 会多出 `❌/⚠️ [wb-logkit] ...` 行，这是**预期行为**，不是 bug。

## 发布流程（wb-logkit）

```bash
cd packages/log
git add -A && git commit -m "..." && git push origin main      # GitHub（凭据走系统 Credential Manager）
npm publish --access public                                     # npm（需有效 token）
```

关键经验：
- **"名称未被占用" ≠ "能发布"**。npm 有相似度校验，必须真实 PUT 试发布才能确认；带 `log`/`trace`/`logger` 等通用英文词的短名撞车风险高。
- npm token 失效表现为 `PUT` 返回 404/403；用 `curl -H "Authorization: Bearer <token>" https://registry.npmjs.org/-/whoami` 判别（有效返回用户名，失效 401）。
- 含 `/` 的 npm 配置项无法用环境变量设置，改用 `npm publish --userconfig ./.npmrc.tmp`（临时文件，用完即删）。
- **bypass-2FA 的 Granular Token 不能执行 unpublish**（403），发布不受影响。发布后 72 小时内可用网页端删除，过期只能 deprecate。
- 备份目录不要留在 `packages/` 下，否则 npm workspaces 报 `EDUPLICATEWORKSPACE`。
- **`npm publish` 会触发敏感审批**，审批超时命令会被拦截并返回 `SENSITIVE_APPROVAL=TIMED_OUT`。此时**不要重试**，先用 `npm view wb-logkit version` / `dist-tags` 确认是否实际已发布成功（本仓库已出现两次「审批超时但实际已发布」）。发布前也先查线上最新版，避免空耗版本号。
- **发布前先 `npm whoami` 验 token**：401 = token 已失效，直接找用户要新 token，别等 publish 报错。`~/.npmrc` 里的 token 是唯一凭据来源（仓库内无 `.npmrc`）。
- **`git push` 静默成功但跟踪引用残留旧值**（本仓库复现 3 次）：用 `git ls-remote origin main` 确认真实远端 SHA；修复本地引用写 `.git/packed-refs`（`printf '<sha> refs/remotes/origin/main\n' > .git/packed-refs`），`git update-ref` 对已被清空的 refs 目录无效。
- **发布后从 npm 真实安装回归**：`cd $(mktemp -d) && npm init -y && npm install wb-logkit@<ver>`，确认 `node_modules/wb-logkit/package.json` 版本与关键修复代码确实在包里（本地 workspace 软链会掩盖问题，容易误判）。
- **`docs/` 不在 package.json `files` 白名单**，所以审查报告等内部文档不会进 npm 包（`npm pack --dry-run` 可验证，15 files / docs 已排除）。

## 测试命令（Windows Git Bash）

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"
```

注意：直接 `npx jest` 会丢失 ESM 标志；`--testPathPattern` 已被 jest 30 更名为 `--testPathPatterns`。
