# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的高频约定。详细事实/实测数据 → `MEMORY-details.md`；过程 → `YYYY-MM-DD.md`。
> 维护一律用 Write/Edit（不要 `cat >>`，会从偏移 0 覆写）。

---

## 0. 仓库形态与发版

- **`packages/log/` 是独立嵌套 git 仓**（remote `yijiu2025/log.git`，主仓 .gitignore 排除）。
  改它去那个仓提交。⚠️ `git add packages/log/...` 在主仓**静默不生效**（有 gitignore 警告但 Exit=0）→ 见警告必须停下查。
- **本机 git ref 失灵**：不写松散 ref → `git status` 谎报 ahead、push 可能零输出（曾 5m27s）。
  **同步状态一律以 `git ls-remote origin main` 为准**，不信退出码/status；超时≠失败，重试安全。
  每次 push 后修 packed-refs：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "$(git rev-parse HEAD)"`
  ⚠️ 必须 `C:/...` 绝对路径（~ 会展开成 MSYS 路径）；**必须完整 40 位 SHA**（截短/手拼 → `bad object origin main`，GUI 历史全灭，本地历史无损）。
- **发版**：提交推送后**顺手发不必问**，用 `node scripts/release.mjs`（默认预览）→ `--apply`；`--from <ref>` 复盘；`--allow-dirty` 并行时用。
  判据：含 `feat`→minor；仅 `fix`/`perf`→patch；破坏性（**只认 footer 行首+冒号**，子串匹配会误升 major）→major；`chore/docs/test/style/ci/refactor` →不发。
  通道：git tag / GitHub Release（凭据取 git credential manager，无需 gh；tag 已推缺 Release 重跑自动补）/ npm `packages/log`。
  **版本源是 git tag**，package.json 单向跟随。决策逻辑必须在 `src/`（scripts/ 无法被 jest 覆盖）。

---

## 1. 强制约定（有守卫，违反会红）

- **导出位置**：export 收拢文件末尾（范围 src/）。守卫 eslint + `conventions/export-placement.test.js`。
- **`src` 不得 import `scripts`**。守卫 `conventions/no-scripts-import.test.js`。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」。守卫 `test-effectiveness.test.js`；
  `KNOWN_INEFFECTIVE_TESTS` 只减不增（当前 14，2026-09-20 应用户要求恢复存量伪测试），改动同步 `FROZEN_SIZE`。
  零 import 的结构守卫登记 `STRUCTURAL_GUARD_WHITELIST`。**一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
- **跨应用隔离**：`src/app/<A>` 不得 import `src/app/<B>`，例外走 `app-isolation.test.js` 单向边白名单（含幽灵豁免校验）。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js。
  `engine/dao` 已撤销，封禁直接 import `app/firewall/dao/block-manager.js`。守卫 `firewall-layering.test.js`。
- **📐 文档 ≠ 实现**：docs/ 设计稿大量失真。核法：拿文档承诺的环境变量名 grep 代码，命中 0 = 未实现。
  实测已失真的典型：`src/loader`/`src/auth`/`src/db`/`src/redis` **均不存在**（全在 `src/framework/` 下）；
  `backend-review-plan.md` 的 P0 乱码**早已修完**；同一份 loader 表还漏了 `01-monitor`/`07-keys`。
- **🔗 文档站链接**（违反 → `docs:build` 直接失败）：`docs/.vitepress/config.ts` 的 `ignoreDeadLinks`
  **只放行** `AGENTS|oauth21|posecraft|packages` 前缀。指向 `docs/` 之外的其他路径（`../src/...`、`.github/...`）
  一律 build 失败 → **指源码用反引号，不要用链接**。⚠️ `docs/development-standards.md` 在 `docs/` **根**，
  不在 `docs/development/` 下（写成 `./development-standards` 必死链）。
- **代码审查**：唯一入口 `docs/development/code-review.md`（分级 L0–L3 / 机器与人工分工 / 五道闸）；
  PR 模板 `.github/PULL_REQUEST_TEMPLATE.md`；归属 `.github/CODEOWNERS`。
  **L3（格式类）明令禁止人工提出**——工具已覆盖，提了纯属浪费注意力预算。

---

## 2. 高频陷阱速查（细节见 details §3）

| 陷阱 | 要点 |
| --- | --- |
| `getModel(name)` 未命中 | **抛 TypeError 非返回 null** → 调用点放 try |
| `getStore(prefix)` | prefix 字符串全仓逐字一致；无 Redis 走 MapStore（不支持 zAdd/zRangeByScore） |
| 密码哈希 | **禁用 bcryptjs**（10 并发冻结 774ms，async 版 649ms）；用 `framework/auth/password-hash.js`（scrypt，22ms） |
| 请求路径禁 `*Sync(` | 审计 `grep -E '\b\w+Sync\s*\(' src --glob '!**/__tests__/**'`；守卫用「一调用就抛错」替身 |
| `underscored: true` | 属性名 `createdAt`；写 `attributes:['created_at']` 被静默丢弃 → Invalid Date |
| 模块级 `process.exit` | 伪装绿色（汇总恒 0 失败）→ `!isTestEnv` |
| 改导出面 | 必须真实 import 上层入口一次；同步所有 `unstable_mockModule` 替身 |
| 守卫外部输入 | 进 `timingSafeEqual`/`.length`/`Buffer.from(x,'hex')`/`new Date(x)` 必先归一化 |

- **Fastify**：`NN-*.js` 数字前缀=顺序；`addHook('onRoute')` 不回溯（全局限流唯一注册点 `loader/registry/05-firewall.js`）。
  已排除空旋钮：connectionTimeout / headersTimeout / keepAliveTimeout:72000 / forceCloseConnections（对已 upgrade WS 无效）。
  **WS 优雅停机必须自定义 preClose**（`framework/websocket/preclose.js`）。
  `loader/engine.js` 的 OPTIONAL_LOADERS 是带伤启动白名单，未列入者 fail-fast（不声明=关键是有意的）。
  `/health/*` 未登录可见 → 新增 body 字段先想"给外人看合适吗"（曾回显内网 IP:port）。
- **Redis node-redis v5**：只有驼峰命令（`hset/hgetall` undefined，常被 try 吞）；`store().get()` 会 safeParse，原始串用 `store().call(c=>c.get(k))`；`hexists` 返 1/0；`withTimeout` 禁 `.finally`。
  **重连策略分两档**（`resolveReconnectDelay` 纯函数，`redis-reconnect-policy.test.js` 锁边界）：`forever`=常驻服务（超限转低频探测，**永不 reject**）/ `bounded`=CLI·脚本（超限即 reject）。
  ⚠️ **`client.connect()` 在 `forever` 下永不 reject** → 任何"连不上就报错"的调用点必须自带超时，别指望它抛（历史上就是这么挂了 5 分 18 秒）。
  `connectStandalone({timeoutMs})` 已改**有界返回** `{ready,code,reason}`（NOT_CONFIGURED / BAD_DB / TCP_UNREACHABLE / CONNECT_FAILED）：先 `probeTcp` 预检再连，`retryPolicy:'bounded'`，外层 `withLocalTimeout` 兜底。依赖它的关卡/CLI **应显式传 `timeoutMs`**。
- **Guard**：`requirePermission`/`freshPermission` 不得进 RUNTIME_FIELDS；`allowRoles:[]` = 不限角色；
  ⚠️ `guard-config.dao.js` 的 `restore()` = truncate 全表+回填 → **空快照会清空 guard_configs**，备份→改库→回滚脚本先断言快照非空。
- **日志**：唯一出口 `src/framework/log/index.js`；业务禁 `console.*`；`logStdout` 不落盘、`log.info` 会被丢 → 脚本输出结果别用 log.info。

---

## 3. 手法 / 命令速查

- 🔴 **禁止在 WorkBuddy Bash 工具里 `git rm` src/ 下任何路径**（2026-09-20 二次深挖定案，铁证链）：
  删除执行者 = **WorkBuddy Bash 工具的 tsbx 沙箱执行层本身**。沙箱日志显示 git rm 命令的沙箱进程（tsbx-<pid>）
  从目标文件所在目录开始**按目录树递归遍历清空整个 src/**（~44 文件/秒，单文件先备份再删，15.6s 清 344+ 文件；
  `~/.workbuddy/logs/sandbox/` 的 ModifyBackup 记录逐条吻合，被删文件在会话 `modify_backup/` 有完整内容备份）。
  实测触发矩阵：`git rm src/…` → 🔴 级联清空 src（5 次复现）；`git rm` 根部文件 → 安全；`git rm migrations/…` → 安全；
  POSIX `rm src/…` → 安全；豚鼠小仓 git rm src/… → 安全（沙箱规则未覆盖）。即**仅 src/ 路径 + git rm 组合触发**。
  **删 src 文件一律 `rm <path> && git add -A`**。恢复：`git checkout HEAD -- src`（全删时）或
  `git status --porcelain -z | tr '\0' '\n' | grep "^ D " | cut -c4- | xargs -d '\n' git checkout --`（-z 必须）。
- **大块改动立刻检查点提交**（本会话三次靠它兜底）。
- **毒丸实验**：被测文件覆写 `throw new Error('__QUARANTINE__')` 再跑——变红=真加载；照绿=测试失效。实验后恢复+全量复验。毒丸要语法合法（否则 0 total 是加载失败）。
- **测事件循环冻结用 tick 间隔法**（10ms 心跳相邻最大间隔）；**禁用 monitorEventLoopDelay**（774ms 冻结报成 17ms）；噪声下限 ≈20ms。
- ⚠️ `cmd | tail` 后 `$?` 是 tail 的 → 要真实码重定向到文件再读。
- ⚠️ git-bash `/dev/tcp` 在 Windows 假阴性 → 判连通用 node:net。
- ⚠️ `npm run` 丢命令行环境变量；`node --env-file` 不能被命令行覆盖 → 经 npm 启动的脚本无法切环境，自己 `process.loadEnvFile(...)`（注意 ESM 静态 import 先求值，相关 import 改动态）。
- **跨进程验收关卡** `npm run verify:all`：退出码 0 通过/1 断言失败/2 回滚不完整/3 环境不可用。
- ⚠️ 同一条消息对同一文件多个 Edit 会静默丢失 → 串行或合并。
- **CLI 引导**：`loadAllModels()` 后 `getModel` 才可用；`framework/db` 非测试缺 DB 配置直接退进程；`loadGuardConfig()` 吞错且**回写 DB**；CLI 写配置先 `initDao()`；CLI 下 globalRedis 恒 null 用 connectStandalone/disconnectStandalone（不释放挂住进程）。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`（npx jest 丢 ESM 标志）。
- 临时脚本放 `.tmp-probe/`（唯一 gitignore 项），跑完删。

---

## 4. 待办（跨会话）

- ~~E3~~ **已完成并复跑（2026-09-20）**：遥测外置 + WS 广播扇出落地；跨进程关卡 stats-aggregation / ws-fanout
  在本机（无 Redis/MySQL）**9 秒内返回退出码 3（环境不可用）**，不再挂死。
- ~~`connectStandalone()` 注释与实现不符~~ **已修**：有界返回 + `retryPolicy` 双策略 + `probeTcp` 预检（见 §2 Redis 条）。
- ~~Docker 部署~~ **已落地**：`Dockerfile`（多阶段 / tini / 非 root / HEALTHCHECK）、`docker-compose.yml`（app+mysql+redis+migrate profile）、
  `docker/entrypoint.mjs`（等待依赖 → 可选迁移 → 转发 SIGTERM/SIGINT）、`.env.docker.example`、`.dockerignore`、
  `.github/workflows/ci.yml` + `publish-image.yml`。依赖等待策略抽在 `src/framework/ops/dependency-plan.js`：
  **DB 硬依赖**（等不到即失败）/ **Redis 软依赖**（降级 MapStore 继续）。文档：`docs/deployment/docker.md`、`cicd.md` 已从设计稿重写为已落地文档。
- ⚠️ 多服务器（Swarm/K8s 集群）方案**仍只有设计稿**，代码不存在，勿照做。
- ⚠️ `.github/workflows/` **未经 GitHub Actions 真跑**（本仓此前无 .github），仅本地 lint/test 验证过。
- ⚠️ 构建镜像**不能用 `npm ci`**：`wb-logkit` 在 lock 里是 `link: packages/log` 且被 gitignore 排除 → 须 `npm install --workspaces=false`。
- P2 session.js 拆分评估**未开始**；P3 容器化/CI 本轮已实质完成（见 `docs/core/architecture-review-2026-09-19.md`）。
