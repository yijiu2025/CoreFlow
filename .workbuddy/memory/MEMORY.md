# nodeServers 项目笔记（主索引）

> **本文件只放"违反就出事"的高频约定**（注入有大小限制，正文必须保持精简）。
> **详细事实 / 实测数据 / 踩坑全过程 → `.workbuddy/memory/MEMORY-details.md`**（动具体模块前先读它）。
> 过程细节在 `YYYY-MM-DD.md`。维护一律用 Write/Edit（**不要 `cat >>`**，会从偏移 0 覆写）。

---

## 0. 仓库形态与发版

**`packages/log/` 是独立嵌套 git 仓库**（remote `yijiu2025/log.git`，`.gitignore` 排除，主仓零跟踪）。
改它要去那个仓库提交。⚠️ `git add packages/log/...` 在主仓**静默不生效**（有 gitignore 警告但 **Exit Code = 0**）
→ **add 阶段出现 gitignore 警告必须停下查，不能只看退出码**。（`packages/shared-device` 由主仓跟踪。）

**本机 git ref 失灵**：`.git/refs/remotes/origin/main` 写不进去 → `git status` 谎报 ahead、`git push` 甚至零输出
（实测耗时 5m27s，**超时≠失败，重试安全**）。
- **同步状态一律以 `git ls-remote origin main` 为准**，不信退出码、不信 `git status`。
- 修法是改 **`.git/packed-refs`**，**每次 push 后都要重做**：
  ✅ `node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" <远端SHA>`
  ⚠️ **必须写 `C:/...` 绝对路径** —— git-bash 的 `~` 会展开成 MSYS 路径，Windows 版 node 解析不了（`MODULE_NOT_FOUND`）。

**发版**（完整规则见 `AGENTS.md`）：提交推送后**按情况顺手发，不必询问**，用脚本别手敲：
✅ `node scripts/release.mjs`（默认只预览）→ `--apply` 执行；`--from <ref>` 复盘；`--allow-dirty` 并行任务时用。
- 判据：含 `feat` → minor；仅 `fix`/`perf` → patch；破坏性变更 → major；只有 `chore`/`docs`/`test`/`style`/`ci`/`refactor` → **不发**。
  ⚠️ 破坏性变更**只认 footer 形式**（行首 + 冒号），**不能退化成子串匹配**（正文里"提到"就会把 minor 误升 major，本仓真实发生过）。
- 三条通道：git tag / GitHub Release（凭据取自 git credential manager，**无需 gh CLI**）/ npm `packages/log`。
  **tag 已推而 Release 缺失时，重跑脚本会自动补建**。
- **版本源是 git tag**，`package.json` 单向跟随（不要反推）。
- 决策纯逻辑必须在 `src/`（`src/framework/release/index.js` 有测试）——放 `scripts/` 会因"禁止 src import scripts + jest 只收 src/__tests__"而无法被覆盖。

---

## 1. 强制约定（有守卫，违反会红）

- **导出位置**：所有 `export` 收拢到文件末尾（定义处不写 `export`；default 先命名再末尾导出）。范围 `src/`。
  守卫 = eslint `no-restricted-syntax` + `conventions/export-placement.test.js`。盲区：全文件只有一个 export 时天然"在末尾"。
- **`src` 不得 import `scripts`**（只允许 `scripts/ → src/`）。守卫 `conventions/no-scripts-import.test.js`。
- **测试有效性**：必须**真实加载被测代码**，禁止「手写常量再断言该常量」、禁止**内联复制被测逻辑**。
  守卫 `conventions/test-effectiveness.test.js`；`KNOWN_INEFFECTIVE_TESTS` **只减不增，当前 14**（改动后同步 `FROZEN_SIZE`）。
  ⚠️ 读文件做静态断言的**结构守卫**零 import 是正当的。**一个测试文件只能注册一组路由**（`_routeRegistry` 是模块级状态，无重置入口）。
- **firewall 分层（单向）**：`interface/` → `config/ util/` → `dao/` → `engine/` → `services/ cli/ data/` → `index.js`。
  ⚠️ **`engine/dao` 已撤销**，封禁能力直接 import `src/app/firewall/dao/block-manager.js`。守卫 `conventions/firewall-layering.test.js`。
- **📐 文档 ≠ 实现**：`docs/` 的设计稿与"已完成"标记**大量失真**。评估/扩容前先核**文档 vs 代码**
  ——**手法：拿文档承诺的环境变量名去 grep 代码，命中 0 = 未实现**。

---

## 2. 高频陷阱速查（改代码前必看，细节见 details §3）

| 陷阱 | 要点 |
| --- | --- |
| `getModel(name)` 未命中 | **抛 `TypeError` 不是返回 null** → 调用点放 `try` |
| `getStore(prefix)` | 按 prefix 隔离命名空间，**字符串全仓逐字一致**（`user_sessions` ≠ `userSessions`）；无 Redis 时走 MapStore（**不支持 zAdd/zRangeByScore**） |
| 密码哈希 | **绝不能用 `bcryptjs`**（纯 JS 跑主线程）：10 并发冻结 **774ms**，其 **async 版同样冻结 649ms**。统一走 `framework/auth/password-hash.js`（`crypto.scrypt`，冻结 **22ms**） |
| 请求路径禁止 `*Sync(` | 审计手法：`grep -E '\b\w+Sync\s*\(' src --glob '!**/__tests__/**'`，逐个判定是否在请求路径上（启动/CLI 可放行）。守卫用"一调用就抛错"的替身锁死（见 §3） |
| `underscored: true` | 属性名是 `createdAt`；写 `attributes: ['created_at']` 会被**静默丢弃** → `Invalid Date` |
| 模块级 `process.exit` | 会伪装成绿色（用例总数每次不同而汇总恒 0 失败）→ 修法 `!isTestEnv` |
| 改完导出面 | 必须真实 `import` 一次上层入口（ESM 链接期抛错）；**并同步所有 `unstable_mockModule` 替身** |
| 守卫未防御非预期输入 | 外部可控值进 `timingSafeEqual`/`.length`/`Buffer.from(x,'hex')`/`new Date(x)` 必先归一化 |

**Fastify**：`NN-*.js` 数字前缀 = 执行顺序；`addHook('onRoute')` **不回溯**（全局限流靠它，唯一注册点 `loader/registry/05-firewall.js`）。
实测排除的错误方案：`connectionTimeout` 是空旋钮、`headersTimeout` 被静默丢弃、`keepAliveTimeout:72000` 本就是默认值、`forceCloseConnections` 对已 upgrade 的 WS 无效。
**WS 优雅停机必须自定义 `preClose`**（`framework/websocket/preclose.js`）：只有 `socket.destroy()`/`ws.terminate()` 能解卡。
**加载器失败分级**：`loader/engine.js` 的 `OPTIONAL_LOADERS` 是"允许带伤启动"白名单，未列入者失败即 fail-fast —— **不声明=关键是有意的安全缺省**。
**探针的公开性**：`/health/*` 是 `requireLogin: false` → **新增进 body 的字段前先问"给未登录的人看合适吗"**（曾回显内网 IP:port）。

**Redis / node-redis v5**：**只有驼峰命令**（`client.hset/hgetall` 全 undefined，调用即 TypeError，常被 try 吞掉）；
`store().get()` 会 safeParse，要原始串用 `store().call(c => c.get(k))`；`hexists` 返 **1/0 非布尔**；
`withTimeout` 禁用 `.finally`（曾派生孤儿 promise，把一次 Redis 报错升级为进程崩溃）。
⚠️ **`connectStandalone()` 在 Redis 不可达时约 90s 才返回**（注释写"最多重试 1 次"，但真正决定次数的是 client 的
`reconnectStrategy` 取 `REDIS_MAX_RETRIES` 默认 10；`connectWithRetry(client, 1)` 只是外层循环 → **注释与实现不符**）。
CLI 调用前必须自带超时（`Promise.race`）。

**Guard / 授权**：`requirePermission`/`freshPermission` 是**代码级声明，不得进 `RUNTIME_FIELDS`**（否则改一次 DB 即永久提权）；
`allowRoles: []` 语义是**「不限角色」**，写不存在的角色码 = **永不匹配**（路由裸奔）；
守卫热更新接口必须有**字段白名单**。
⚠️ **`guard/dao/guard-config.dao.js` 的 `restore(snapshot)` = `truncate` 全表 + 回填** → **空快照会清空 `guard_configs`**。
任何"备份→改库→回滚"脚本都必须**先断言快照非空**再动第一笔写。

**日志**：唯一出口 `src/framework/log/index.js`；业务代码禁 `console.*`；**`packages/log/README.md` 才是权威源**。
`logStdout` 不受 LOG_LEVEL 门控且不落盘，`log.info` 会被整条丢弃 → **脚本结果输出绝不能用 `log.info`**。
**终端颜色只有一处出处 `src/utils/colors.js`**，全仓 `process.stdout.isTTY` 读取点只允许 1 处。

---

## 3. 手法 / 命令速查

- **毒丸实验**：把被测文件覆写成 `throw new Error('__QUARANTINE__')` 再跑 —— **变红 = 真加载了；照绿 = 测试失效**。实验后必须恢复 + 全量复验。
- **量"事件循环被冻结多久"只能用 tick 间隔法**：10ms 心跳取相邻 tick 最大间隔。
  ⚠️ **不要用 `monitorEventLoopDelay`**：实测把 774ms 冻结报成 17ms（据此会得出相反结论）。
  ⚠️ **噪声下限 ≈20ms**，低于该量级的"差异"不要当结论。
- **"同步必须换异步"的守卫写法**：`jest.unstable_mockModule` 把 `crypto`/`fs` 的同步方法换成**「一调用就抛错」**，其余 spread 真身。
  **必须毒丸复验**（只断言"返回 Promise"是假绿的）；⚠️ 毒丸要**语法合法**，否则 `Tests: 0 total` 是"加载失败"不是"断言失败"。
- ⚠️ **`cmd | tail` 后的 `$?` 是 `tail` 的退出码**，不是 `cmd` 的（本会话据此误读过多次）。要真实码：重定向到文件再读 `$?`。
- ⚠️ **git-bash 的 `/dev/tcp` 在 Windows 给假阴性**（对可连通的 Redis 报不可达）→ 判连通性一律用 `node:net` 真实 connect。
- ⚠️ **`npm run` 会丢掉命令行环境变量**（`PROBE_PROCS=3 npm run x` 仍取默认值）；而 `node --env-file=.env` 的取值**不能被命令行覆盖**。
  两者叠加 ⇒ **经 npm 启动的脚本无法被指向另一套环境**。要支持环境切换就自己 `process.loadEnvFile(...)`。
  （ESM 陷阱：静态 `import` 在模块体之前求值 → 相关 `import` 必须改**动态**。）
- **跨进程验收关卡**：`scripts/verify/`（`npm run verify:all`）—— E1 锁互斥 / E2 配置跨实例同步。
  退出码 **0 通过 / 1 断言失败 / 2 回滚不完整 / 3 环境不可用**，**刻意区分环境与回归**（长期红灯的检查等于没有检查）。
- **"修复有效"要给反例对照**：同时跑一条不做修复的同场景用例（只证明"现在能过"不算数）。
- ⚠️ **同一条消息里对同一文件发多个 Edit 会静默丢失**（工具仍报成功）→ 同文件多处改动必须串行或合并。
- **CLI 脚本引导**：`await loadAllModels()` 之后 `getModel('X')` 才可用。两个**静默吃错**的坑：`framework/db/index.js` 非测试环境缺 DB 配置会**直接退进程**；
  `loadGuardConfig()` 会**吞掉**错误退回代码级配置，且末尾会把内存配置**写回 DB**（用部分结构夹具调它 = 覆盖线上完整配置）；
  CLI 写配置前必须先 `initDao()`；CLI 下 `globalRedis` 恒 null，需 `connectStandalone()`/`disconnectStandalone()`，**不释放 socket 会挂住进程**。
- **改 `docs/` 链接后要跑 `npm run docs:build`**（vitepress 死链检查默认开启）。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"`（直接 `npx jest` 会丢 ESM 标志）。
  不可用：`grep -P`、`sort -u`、`wc -l *.js | sort -rn`（用 Node 脚本替代）。
- **临时脚本放 `.tmp-probe/`**（唯一的 gitignore 忽略项），跑完删。

---

## 4. 待办（跨会话）

- **单实例假定只剩 1 处未修**：遥测统计 / WS 广播仍在进程内累加（多实例下聚合值偏小、封禁通知送不到其他实例的客户端）→ **E3**。
  E1（调度器锁）/ E2（守卫配置）**已修**，并有可复跑关卡 `npm run verify:all`。详见 `docs/core/architecture-review-2026-09-19.md`。
- **`connectStandalone()` 重试次数与注释不符**（Redis 不可达挂 ~90s）：源码未改，仅在关卡里用有界前置检查绕开；是否修正由代码所有者决定。
- 部署文档里的 Docker、多服务器方案**代码不存在**，不要照着做；未经验证的 Dockerfile/CI 也刻意未提交。
