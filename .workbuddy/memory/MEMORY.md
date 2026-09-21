# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的高频约定；成因与实测数据 → `MEMORY-details.md`，过程 → `YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`，会从偏移 0 覆写）。

## 0. 仓库形态与发版

- **`packages/log/` 是独立嵌套 git 仓**（主仓 gitignore 排除）。改它去那个仓提交。
  ⚠️ `git add packages/log/...` 在主仓**静默不生效**（有 gitignore 警告但 Exit=0）→ 见警告停下查。
- **本机 git ref 失灵**：松散 ref 写不进 → status 谎报 ahead、push 可能数分钟零输出（曾 5m27s）。
  同步状态**一律以 `git ls-remote origin main` 为准**；超时≠失败，重试安全。
  push 后修 packed-refs：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "$(git rev-parse HEAD)"`
  ⚠️ 必须 `C:/...` 绝对路径 + **完整 40 位 SHA**（截短 → `bad object origin main`，GUI 历史全灭）。
- **`git credential fill` 会永久挂住**（credential.helper 首项是 `helper-selector`）：用 git 凭据查 GitHub API
  的脚本会一起卡死、易误判成"API 挂了"。绕法 = 直接调 GCM 本体
  `.../mingw64/bin/git-credential-manager.exe get`。详见 details §10.10。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`（`--from <ref>` 复盘 / `--allow-dirty` 并行用）。
  判据：`feat`→minor；仅 `fix|perf`→patch；破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` →不发。
  通道：git tag / GitHub Release / npm `packages/log`。**版本源是 git tag**，package.json 单向跟随；决策逻辑必须在 `src/`。

## 1. 强制约定（有守卫，违反会红）

- **导出位置**：export 收拢文件末尾（仅 src/）。`conventions/export-placement.test.js`。
- **`src` 不得 import `scripts`**（只允许 scripts→src）。`conventions/no-scripts-import.test.js`。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」。`test-effectiveness.test.js`；
  `KNOWN_INEFFECTIVE_TESTS` 只减不增（当前 14），同步 `FROZEN_SIZE`；零 import 结构守卫登记 `STRUCTURAL_GUARD_WHITELIST`。
  **一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
- **跨应用隔离**：`src/app/<A>` 不得 import `src/app/<B>`，例外走 `app-isolation.test.js` 白名单。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js。
  封禁直接 import `app/firewall/dao/block-manager.js`（`engine/dao` 已撤销）。`firewall-layering.test.js`。
- **📐 文档 ≠ 实现**：核法 = 文档承诺的环境变量名 grep 代码，命中 0 = 未实现。
  典型：`src/loader|auth|db|redis` **均不存在**（全在 `src/framework/`）。
- **🔗 文档站链接**：`docs/.vitepress/config.ts` 的 `ignoreDeadLinks` 只放行 `AGENTS|oauth21|posecraft|packages` 前缀；
  指向 `docs/` 之外一律 `docs:build` 失败 → **指源码用反引号**。
  ⚠️ `docs/development-standards.md` 在 `docs/` **根**（写成 `./development-standards` 必死链）。
- **代码审查**：唯一入口 `docs/development/code-review.md`（L0–L3 / 五道闸）+ `.github/PULL_REQUEST_TEMPLATE.md` + `CODEOWNERS`。
  **L3（格式类）禁止人工提出**——工具已覆盖。

## 2. 高频陷阱速查

| 陷阱 | 要点 |
| --- | --- |
| `getModel(name)` 未命中 | **抛 TypeError 非返回 null** → 调用点放 try |
| `getStore(prefix)` | prefix 全仓逐字一致；无 Redis 走 MapStore（不支持 zAdd/zRangeByScore） |
| 密码哈希 | **禁 bcryptjs**（10 并发冻结 774ms）；用 `framework/auth/password-hash.js`（scrypt 22ms） |
| 请求路径禁 `*Sync(` | `grep -E '\b\w+Sync\s*\(' src --glob '!**/__tests__/**'` |
| `underscored: true` | 属性名 `createdAt`；`attributes:['created_at']` 被静默丢弃 → Invalid Date |
| 模块级 `process.exit` | 伪装绿色（汇总恒 0 失败）→ `!isTestEnv` |
| 改导出面 | 真实 import 上层入口一次；同步所有 `unstable_mockModule` 替身 |
| 守卫外部输入 | 进 `timingSafeEqual`/`.length`/`Buffer.from(x,'hex')`/`new Date(x)` 必先归一化 |
| **vue-tsc 拦不住模板未定义标识符** | `@click="fn"` 中 `fn` 未定义时 `vue-tsc --noEmit`/build 仍全绿 → 运行时才炸；须真实渲染/点击验证 |
| `/user/v1/register` 只认 `username` | 后端只读 `body.username`，拿不到**静默回退成 email**（`src/app/user/dao/user.js:55`） |

- **oauth21 移动端认证页样式单一来源** = `oauth21/src/assets/styles/mobile-auth.scss`（前缀 `mauth-*`，main.ts 全局引入）。
  `/m/login`、`/m/register` **不得再自带 `<style>`**；改样式只改那一个文件。安全区依赖 `index.html` 的 `viewport-fit=cover`。
- **Fastify**：`NN-*.js` 数字前缀=顺序；`addHook('onRoute')` 不回溯（全局限流唯一注册点 `loader/registry/05-firewall.js`）；
  **WS 优雅停机必须自定义 preClose**（`framework/websocket/preclose.js`）；`loader/engine.js` 的 OPTIONAL_LOADERS 是带伤启动白名单，未列入者 fail-fast；
  `/health/*` 未登录可见 → 新增 body 字段先想"给外人看合适吗"。
- **Redis node-redis v5**：只有驼峰命令（`hset/hgetall` undefined，常被 try 吞）；`store().get()` 会 safeParse，
  原始串用 `store().call(c=>c.get(k))`；`hexists` 返 1/0；`withTimeout` 禁 `.finally`。
  重连两档：`forever`=常驻（超限转低频探测，**永不 reject**）/ `bounded`=CLI（超限即 reject）。
  ⚠️ `connect()` 在 `forever` 下永不 reject → "连不上就报错"的调用点必须自带超时。
  关卡/CLI 用 `connectStandalone({timeoutMs})`（有界返回 `{ready,code,reason}`），**应显式传 timeoutMs**。
  ⚠️ **`duplicate()` 只复制配置不建连** → 订阅必须先 `connect()`（否则 `ClientClosedError` 只落日志、扇出静默失效）。
- **Guard**：`requirePermission`/`freshPermission` 不得进 RUNTIME_FIELDS；`allowRoles:[]` = 不限角色；
  ⚠️ `guard-config.dao.js` 的 `restore()` = truncate 全表+回填 → **空快照会清空 guard_configs**，回滚脚本先断言非空。
- **日志**：唯一出口 `src/framework/log/index.js`；业务禁 `console.*`；`logStdout` 不落盘、`log.info` 会被丢 → 脚本输出别用 log.info。

## 3. 手法 / 命令速查

- 🔴 **禁止在 Bash 工具里 `git rm` src/ 下任何路径**（2026-09-20 定案）：删除执行者是 **tsbx 沙箱执行层本身**，
  会从目标目录起**递归清空整个 src/**（`~/.workbuddy/logs/sandbox/` 的 ModifyBackup 逐条吻合）。
  触发矩阵：`git rm src/…` → 🔴 级联清空（5 次复现）；`git rm` 根部文件 / `git rm migrations/…` / POSIX `rm src/…` → 安全。
  **删 src 文件一律 `rm <path> && git add -A`**。恢复：`git checkout HEAD -- src`。
- **大块改动立刻检查点提交**。**毒丸实验**验测试有效性（覆写 `throw new Error('__QUARANTINE__')`；变红=真加载，且必须语法合法）。
- **测事件循环冻结用 tick 间隔法**（10ms 心跳相邻最大间隔）；**禁 monitorEventLoopDelay**（774ms 报成 17ms）；噪声下限 ≈20ms。
- ⚠️ `cmd | tail` 后 `$?` 是 tail 的 → 真实码重定向到文件再读。
- ⚠️ git-bash `/dev/tcp` 在 Windows 假阴性 → 判连通用 node:net。
- ⚠️ `npm run` 丢命令行环境变量；`node --env-file` 不可被命令行覆盖 → 脚本自己 `process.loadEnvFile(...)`（相关 import 改动态）。
- ⚠️ 同一条消息对同一文件多个 Edit 会静默丢失 → 串行或合并。
- **跨进程关卡退出码**：0 通过 / 1 断言失败 / 2 回滚不完整 / 3 环境不可用。
- **CLI 引导**：`loadAllModels()` 后 `getModel` 才可用；`framework/db` 非测试缺 DB 配置直接退进程；
  `loadGuardConfig()` 吞错且**回写 DB**；CLI 写配置先 `initDao()`；CLI 下 globalRedis 恒 null，用 connectStandalone/disconnectStandalone。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`（npx jest 丢 ESM 标志）。
- 临时脚本放 `.tmp-probe/`（唯一 gitignore 项），跑完删。

## 4. 部署 / CI（2026-09-21 定案，成因链见 details §10）

- **CI 安装（三作业一致）**：`npm install --workspace=packages/shared-device --include-workspace-root --ignore-scripts --legacy-peer-deps --no-audit --no-fund`
  **+ `node packages/shared-device/scripts/build.mjs`**。四个"别改回去"：
  ① 不用 `npm ci`（lockfile 记 `wb-logkit` 为 `link: packages/log`，检出后不存在）；② **必须 `--legacy-peer-deps`**（绕开 arborist 崩溃 `Cannot read properties of null (reading 'edgesOut')`）；
  ③ **不能用 `--workspaces=false`**（`stable-deviceid` 两头落空 → 14 套件 failed to run）；④ **必须构建 dist**（不入库，包 `exports` 指向它）。setup-node **不能开 `cache: npm`**。
- **Dockerfile：tini 建软链** `ln -sf "$(command -v tini)" /usr/sbin/tini`（apt 装在 `/usr/bin/tini`；写死则构建过、启动炸）。
- **response schema 必须覆盖信封全字段** `code/message/data/timestamp/requestId` —— Fastify 对未声明字段**静默裁剪**。
- **无 lockfile 树暴露幽灵依赖**（`uuid` 曾靠 sequelize 提升侥幸可用）→ 必须显式声明。
- **关卡要驱动正确链路**：`__test__persistNow()` 写本地 JSON（对跨进程可见性零贡献）；刷 Redis 汇聚用 `__test__flushStats()`。
- **WS 跨实例扇出有两个坑，外部现象都是「订阅没生效」**（详见 details §10.6）：
  ① `duplicate()` 只复制配置**不建连** → 必须先 `connect()`；② 订阅回调签名是 **`(message, channel)`**，
  写反 → `JSON.parse(频道名)` 抛错被 dispatch 静默吞掉（"接收端 READY 但收 0 条"）。
  两者都只在**真 Redis + 跨进程**时现形，单进程里完全正常。
- **`NODE_ENV=production` 下三个 SECRET 必须 ≥32 位**（`MIN_SECRET_LENGTH`：`APP_SECRET` / `SESSION_SECRET` /
  `FIREWALL_SECRET`，`SIGN_APP_KEY` 无此校验）→ 不达标即「拒绝启动」，现象是容器反复重启、就绪探针等不到 200。
  **先 `docker compose logs app` 看应用自己怎么说，别先怀疑探针路径或 entrypoint。**
- **复刻树验收**：`git archive HEAD | tar -x` 到**仓库外**（Temp 下）。🔴 切勿在主仓内造树（会向上借 node_modules 误判）。
  基线：install 0 → dist 8 模块 → jest 86 套件/1084 用例绿 → ESLint 0 错（18 警告）。jest 需忽略 `.tmp-probe`。

## 5. 待办（跨会话）

- ✅ 已落地：E3 遥测外置 + WS 扇出、`connectStandalone()` 有界化、Docker 部署、CI 三作业 + Publish Image（2026-09-21）。
- ⚠️ 多服务器（Swarm/K8s）**仍只有设计稿**，代码不存在。
- P2 session.js 拆分评估**未开始**；P3 容器化/CI 已实质完成（`docs/core/architecture-review-2026-09-19.md`）。
