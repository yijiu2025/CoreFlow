# nodeServers 项目笔记（主索引）

> **本文件只放"违反就出事"的高频约定**（注入有大小限制）。
> **详细事实 / 实测数据 / 踩坑全过程 → `.workbuddy/memory/MEMORY-details.md`**（涉及具体模块时先读它）。
> 过程细节在 `YYYY-MM-DD.md`。维护一律用 Write/Edit（**不要 `cat >>`**，会从偏移 0 覆写）。

---

## 0. 仓库形态

**`packages/log/` 是独立嵌套 git 仓库**（remote `yijiu2025/log.git`，`.gitignore:32` 排除，主仓零跟踪）。
改它下面任何文件都要去那个仓库提交：`cd packages/log && git add -A && git commit && git push origin HEAD`。
⚠️ `git add packages/log/...` 在主仓**静默不生效**（有 gitignore 警告但 **Exit Code = 0**）
→ **add 阶段出现 gitignore 警告必须停下查，不能只看退出码**。
（`packages/shared-device` **不是**独立仓库，由主仓跟踪。）

**本机 git ref 失灵**：`.git/refs/remotes/origin/main` 无法由 git 自身写入（`update-ref`/`fetch`/`push`
都返回 0，但松散 ref 不落地）→ `git status` 谎报 ahead，`git push` 甚至零输出。
⚠️ `git push` 还可能**耗时数分钟且全程零输出**（实测 5m27s）——**超时不代表失败**，重试是安全的
（第二次即时成功）。判定一律用 `git ls-remote origin main`。
- **同步状态一律以 `git ls-remote origin main` 为准**，不信退出码、不信 `git status`。
- 只能改 **`.git/packed-refs`** 中该行 SHA，**每次 push 后都要重做**；脚本须带 4 条断言：
  ① 头行 `'# pack-refs with: peeled fully-peeled sorted '`（**含尾空格**）原样；② 待替换行恰好命中一处；
  ③ 变化行数 = 1；④ 保持纯 LF。

---

## 1. 强制约定（有守卫，违反会红）

- **导出位置**：所有 `export` 收拢到文件末尾（定义处不写 `export`；default 先命名再末尾导出）。
  范围 `src/`。守卫 = eslint `no-restricted-syntax` + `conventions/export-placement.test.js`。
  ⚠️ 盲区：全文件只有一个 export 时它天然"在末尾" → 靠「形式规则」兜住。
- **`src` 不得 import `scripts`**（只允许 `scripts/ → src/`）。守卫 `conventions/no-scripts-import.test.js`。
  CLI 工具库在 `src/framework/cli/index.js`，模型加载在 `src/framework/db/models.js`。
- **测试有效性**：测试必须**真实加载被测代码**，禁止「手写常量再断言该常量」（毒丸实验证实那类测试
  删掉被测模块仍全绿）；**禁止内联复制被测逻辑**（副本与真身会各自演化，比零覆盖更危险）。
  守卫 `conventions/test-effectiveness.test.js`；`KNOWN_INEFFECTIVE_TESTS` **只减不增，当前 15**
  （改动后须同步 `FROZEN_SIZE`）。⚠️ 读文件做静态断言的**结构守卫**零 import 是正当的。
  **一个测试文件只能注册一组路由**（`_routeRegistry` 是模块级状态且无重置入口）。
- **firewall 分层（单向）**：`interface/` → `config/ util/` → `dao/` → `engine/` → `services/ cli/ data/` → `index.js`。
  ⚠️ **`engine/dao` 已撤销**，封禁能力直接 import **`src/app/firewall/dao/block-manager.js`**。
  守卫 `conventions/firewall-layering.test.js`（三色法查环 + 自带反例）。
- **📐 文档 ≠ 实现**：`docs/` 的设计稿与"已完成"标记**大量失真**。评估/扩容前必须先核**文档 vs 代码**
  ——**手法：拿文档承诺的环境变量名去 grep 代码，命中 0 = 未实现**（详见 details）。

---

## 2. 高频陷阱速查

**改代码前必看（细节见 details §3）**

| 陷阱 | 要点 |
| --- | --- |
| `getModel(name)` 未命中 | **抛 `TypeError` 不是返回 null** → 调用点放 `try`；点号写法 `'a.B'` 与 `'B'` 等价 |
| `getStore(prefix)` | 按 prefix 隔离命名空间，**字符串全仓逐字一致**（`user_sessions` ≠ `userSessions`）；无 Redis 时走 MapStore（**不支持 zAdd/zRangeByScore**） |
| `underscored: true` | 属性名是 `createdAt`；写 `attributes: ['created_at']` 会被**静默丢弃** → `Invalid Date` |
| 模块级 `process.exit` | 会伪装成绿色（jest 用例总数每次不同而汇总恒 0 失败）→ 修法 `!isTestEnv` |
| 改完导出面 | 必须真实 `import` 一次上层入口（ESM 链接期抛错）；**并同步所有 `unstable_mockModule` 替身** |
| 守卫未防御非预期输入 | 外部可控值进 `timingSafeEqual`/`.length`/`Buffer.from(x,'hex')`/`new Date(x)` 必先归一化 |

**Fastify（细节见 details §6）**
- `NN-*.js` 数字前缀 = 执行顺序；`addHook('onRoute')` **不回溯**（全局限流靠它）→ `initFirewall`
  唯一注册点是 `loader/registry/05-firewall.js`（必须早于 `08-api`）。
- **实测排除的错误方案**：`connectionTimeout` 是空旋钮、`headersTimeout` 被 Fastify 静默丢弃、
  `keepAliveTimeout: 72000` 本就是默认值、`forceCloseConnections` **对已 upgrade 的 WS 完全无效**。
- **WS 优雅停机必须自定义 `preClose`**（`src/framework/websocket/preclose.js`）：广播 `1001` →
  宽限期后 `terminate()` → `done()` 立即返回。**只有 `socket.destroy()`/`ws.terminate()` 能解卡。**
- **加载器失败分级**：`framework/loader/engine.js` 的 `OPTIONAL_LOADERS` 是"允许带伤启动"的**白名单**，
  未列入者一律按关键 → **失败即 fail-fast**。新增 registry 加载器时要主动想清归哪一类 ——
  默认（不声明）取"关键"是**有意的安全缺省**（漏声明会拦住启动，而不是被静默放过）。
- **探针的公开性**：`/health/*` 是 `requireLogin: false` 的**公开**端点 → **新增任何进 body 的字段前
  先问"给未登录的人看合适吗"**（曾把 `sequelize` 报错里的内网 `IP:port` 直接回显出去）。

**Redis / node-redis v5（细节见 details §5）**
- **只有驼峰命令**：`client.hset/hgetall/zadd/...` 全 undefined，调用即 `TypeError`（常被 try 吞掉）。
- `store().get()` 会 safeParse；要原始串用 `store().call(c => c.get(k))`；`hexists` 返 **1/0 非布尔**。
- `withTimeout` 的 `.finally()` 曾派生孤儿 promise → 一次 Redis 报错**升级为整个进程崩溃**（已修，禁用 `.finally`）。

**Guard / 授权（细节见 details §7）**
- `requirePermission` / `freshPermission` 是**代码级声明，不得进 `RUNTIME_FIELDS`**（否则改一次 DB 即永久提权）。
- `allowRoles: []` 语义是**「不限角色」**，不是「禁止」；写不存在的角色码 = **永不匹配**（路由裸奔）。
- 守卫热更新接口必须有**字段白名单**（未知字段显式 400）。

**日志（细节见 details §8）**
- 唯一出口 `src/framework/log/index.js`；业务代码禁 `console.*`；**`packages/log/README.md` 才是权威源**。
- **`logStdout` 不受 LOG_LEVEL 门控且不落盘**，`log.info` 会被整条丢弃（`LOG_LEVEL=warn` 实测）
  → **脚本的结果输出绝不能用 `log.info`**（静默失败）。
- **终端颜色只有一处出处 `src/utils/colors.js`**，全仓 `process.stdout.isTTY` 读取点**只允许 1 处**。

---

## 3. 手法 / 命令速查

- **毒丸实验**（验证测试真有效）：把被测文件覆写成 `throw new Error('__QUARANTINE__')` 再跑 ——
  **变红 = 真加载了；照绿 = 测试完全失效**。实验后必须恢复 + 全量复验。
- **inode 断言法**：`fs.statSync(f).ino` 变化 = 真的走了 `rename`（原子写），比"能读回来"强得多。
- **"修复有效"要给反例对照**：同时跑一条不做修复的同场景用例（只证明"现在能过"不算数）。
- ⚠️ **同一条消息里对同一文件发多个 Edit 会静默丢失**（工具仍报成功）→ 同文件多处改动必须串行或合并。
- **结构性断言要自带反例**："无环/无违规"不能来自可能写坏的检测器。
- **`src` 里的临时脚本放 `.tmp-probe/`**（唯一的 gitignore 忽略项），跑完删。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<pattern>"`
  （直接 `npx jest` 会丢 ESM 标志；jest 30 里是 `--testPathPatterns` 复数）。
  不可用：`grep -P`、`sort -u`、`wc -l *.js | sort -rn`（用 Node 脚本替代）。
- **CLI 写配置前必须先 `initDao()`**（否则用默认值覆盖线上配置）；CLI 下 `globalRedis` 恒 null，
  需 `connectStandalone()`/`disconnectStandalone()`，**不释放 socket 会挂住进程**。
- **改 `docs/` 里的链接后要跑一次 `npm run docs:build`**：vitepress 的死链检查默认开启，
  站内链接写错会让 build 直接失败（`config.ts` 的 `ignoreDeadLinks` 只放行指向 docs **之外**源码的引用）。
  ⚠️ 这项检查曾在"红灯"状态下躺了很久（10 条历史死链，2026-09-19 才修）——
  **长期亮红灯的检查等于没有检查**，失败会被当成"正常现象"。

---

## 4. 待办（跨会话）

- **单实例假定的三处阻断点**（加实例前必须修）：遥测进程内状态 / 调度器无分布式锁 / guard 配置模块级单例。
  详见 `docs/core/architecture-review-2026-09-19.md`。
- 部署文档里的 Docker、多服务器方案**代码不存在**，不要照着做。
