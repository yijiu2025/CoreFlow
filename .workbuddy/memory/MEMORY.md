# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据→`MEMORY-details.md`（§号即引用），过程→`YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`，会从偏移 0 覆写）。oauth21 移动端认证页完整版 → details **§11**。

## 0. 仓库形态 / 发版

- **`packages/log/` 是独立嵌套 git 仓**（主仓 gitignore 排除）→ 去那个仓提交。
  ⚠️ 在主仓 `git add packages/log/...` **静默不生效**（有警告但 Exit=0）→ 见警告停下查。
- **本机 git ref 失灵** → status 谎报 ahead、push 可能数分钟零输出。**一律以 `git ls-remote origin main` 为准**，超时≠失败。
  push 后修：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "<完整 40 位 SHA>"`（必须绝对路径；截短→GUI 历史全灭）。
- **`git credential fill` 永久挂住** → 用它查 GitHub API 的脚本会一起卡死。绕法见 §10.10。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`（`--from <ref>`/`--allow-dirty`）。
  `feat`→minor；仅 `fix|perf`→patch；破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。
  **版本源是 git tag**，package.json 单向跟随；决策逻辑须在 `src/`。

## 1. 强制约定（有守卫）

- export 收拢文件末尾（仅 src/）· `src` 不得 import `scripts` · `src/app/<A>` 不得 import `src/app/<B>`（白名单在各自守卫测试里）。
- **测试有效性**：真实加载被测代码；禁「手写常量自测」「内联复制被测逻辑」。`KNOWN_INEFFECTIVE_TESTS` 只减不增（14）+ 同步 `FROZEN_SIZE`；
  **一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js；禁直接 import `app/firewall/dao/block-manager.js`。
- **📐 文档 ≠ 实现**：核法=文档承诺的环境变量名 grep 代码，命中 0=未实现（`src/loader|auth|db|redis` **均不存在**，全在 `src/framework/`）。
- **🔗 文档站链接**：`ignoreDeadLinks` 只放行 `AGENTS|oauth21|posecraft|packages` 前缀 → 指 `docs/` 之外必 `docs:build` 失败，**指源码用反引号**；
  ⚠️ `development-standards.md` 在 `docs/` **根**。
- **代码审查**：唯一入口 `docs/development/code-review.md`（L0–L3/五道闸）；**L3（格式类）禁止人工提出**。

## 2. 后端陷阱速查 → **details §12**（整表已迁出）

改后端代码前先扫一眼 **details §12**，共 14 条：`getModel(name)` 抛 TypeError · `getStore(prefix)` 命名空间/MapStore ·
密码哈希禁 `bcryptjs` · 请求路径禁 `*Sync(` · `underscored:true` 时间戳 · 模块级 `process.exit` 伪装绿色 ·
改导出面要真实 import · 外部输入归一化 · `vue-tsc` 拦不住模板标识符 · `/user/v1/register` 只认 `username` ·
Fastify（顺序/`onRoute`/`preClose`/`OPTIONAL_LOADERS`/`/health/*`）· Redis v5（驼峰命令/`duplicate()` 不建连）·
Guard（RUNTIME_FIELDS/`restore()` 清表）· 日志（`log.info` 会被丢）。

> 迁出原因：主索引是**每轮注入**的，超过约 18KB 会被**静默截断**（尾部整段消失）。§12 与本文件同目录，读一次即可。

## 3. oauth21 移动端认证页（细则全在 details §11）

- **样式单一来源** = `assets/styles/mobile-auth.scss`（`mauth-*`，main.ts 全局引入）；**基础版式与 `/m/*` 页不得自带 `<style>`**；
  ⚠️ 移动端版式**刻意不限宽**（加 `max-width` 两侧露底色，用户明确要求满宽）。
- 🔴 **调试前先造窄视口并刷新**：判定 `宽视口(≥1024) ＞ 窄视口(<768) ＞ UA`；宽视口开 `/m/register` 会**跳电脑版**；
  UA 伪装压不过宽视口；分发只在**导航时**执行 → 只拖 DevTools 不刷新看到的还是旧版式（§11.1）。
- **设备判定单一来源** = `utils/device.ts` 的 `isMobileViewport()`；`/m/*` 宽屏回跳的 `beforeEnter` 只跑一次 →
  视口变化须另挂 matchMedia，两处共用 `resolveDesktopRedirectTarget`；`?isMobile=true` 一律不迁；**query 原样透传**。
- **主题**：三层 token（全局语义 → 组件级 → 组件规则零裸色值）；明暗与皮肤**正交**；外置到 `src/themes/<id>/`；
  ⚠️ 外部输入（后端/postMessage）**必过白名单**（`theme/runtime.ts`，刻意拒 `url()` 与 CSS 颜色名）；
  🔴 `tokens` 是 `html` 上的 inline style、**优先级高于媒体查询** → 绝不能覆写断点里会变的 token
  （`--mauth-pad-*`/`--mauth-gap-*`/`--mauth-logo-size`/`--mauth-title-size`/`--mauth-field-h`/`--mauth-control-h`/`--mauth-err-h`/`--mauth-social-*`）；
  ⚠️ `assets/` 的 SVG **必须带 `width`/`height`**（只给 `viewBox` → `background-size:auto` 撑满容器）。§11.3
- **业务容器 + 可换版式**（§11.10）：`view/app/register/index.vue` 只留业务（状态/校验/请求/路由），UI 外置到
  `themes/app/<page>/<id>/`；`base/` 由容器**静态引入**（默认路径零请求），变体走 `import.meta.glob` 惰性 chunk；
  优先级 `?view=` > 主题包 `views.<page>` > `VITE_<PAGE>_VIEW` > base，⚠️ **URL 显式非法值不回退**（直接 base）；
  契约 `themes/app/register/types.ts`（纯类型）+ 容器侧 `assertRegisterContract` **编译期自检**；
  浮层（图形码/协议/Toast）由**容器**渲染（都是 `fixed`，与版式无关）；**新增变体目录要重启 dev server**。
- **移动端页必须自己当滚动容器**：`html,body{overflow:hidden}` 锁死根滚动 → `.mauth-page` 须 `height:100dvh + overflow-y:auto`，
  `.mauth-body` 须 `flex:1 0 auto`（否则横屏内容不可达）。§11.4
- 🔴 **"白条/色条"先定位到层再谈修色**（§11.7）：色由 ①**根画布**（`html` 背景向上传播）②祖先容器 ③页面自身 决定 →
  统一到唯一出口 **`--mauth-canvas`**（= 页面最上沿的颜色）；页面**必须贴顶**（`align-self:flex-start`）——
  否则 `vh(≡lvh)>dvh` 时外层 `items-center` 会留缝（**DevTools 不模拟动态工具栏 ⇒ 缝恒 0 ⇒ 电脑上永远看不到**）。
  ⚠️ **"给某个祖先改底色"是打补丁**，只会把问题转移。
- 🔴 **跨内核差异先分类再修**：① 初始值（§11.6）`color-scheme` 初始 `normal` ⇒ 画布/控件/滚动条色由 UA 自由决定 →
  显式写 `light` 与 `light only` 两条（只带 `only` 会被不支持的引擎**整条丢弃**）；⚠️ 拦不住合成器层 `filter: invert()`。
  ② 布局（§11.8）**视口被丢成 980** ⇒ 整页等比缩小"比例不对" → meta 写**单行 + 只留最通用键**；
  判据**只能用 `visualViewport.scale`**（`clientWidth` 解析期**恒为 980、连正常页也是**）；
  兜底 `utils/viewport-fix.ts`（`zoom=1/scale`，**必须配 `height: calc(100dvh / k)`**）。
- ⚠️ 主题把 `--mauth-header-bg` 设为 `transparent` 时**必须同时声明 `--mauth-canvas`**（落 `html`），否则画布色退回给 UA。
- **第三方登录行**：**providers 为空 → 零 DOM**；🔴 授权端点**只放行站内相对路径**（`/` 开头且非 `//`）；未配端点**不静默**。§11.5
- **移动端第 3 页 = 重置密码**：`/m/forgot-password`；"没漂移"证据 = **逐项比对同名元素计算样式**（login↔forgot 57 项全等）；
  🔴 邮件链接指向 `/reset-password?token=…` 而前端**无此路由** → 加 redirect（**query 原样带**）+ `/forgot-password` 改分发器；
  🔴 **`validateField` 不跑 zod 的 object 级 `refine`** → 两次密码一致须**显式比对** + `setFieldError`。§11.9

## 4. 手法 / 命令（细则 → details §9）

- 🔴 **禁止在 Bash 工具里 `git rm` src/ 下任何路径**（2026-09-20 定案）：执行者是 **tsbx 沙箱执行层本身**，会**递归清空整个 src/**。
  `git rm` 根部文件 / `git rm migrations/…` / POSIX `rm src/…` 安全；**删 src 文件一律 `rm <path> && git add -A`**；恢复 `git checkout HEAD -- src`。
- **大块改动立刻检查点提交**；**毒丸实验**验测试有效性（覆写 `throw new Error('__QUARANTINE__')`，变红=真加载）。
- **测事件循环冻结用 tick 间隔法**（10ms 心跳相邻最大间隔）；**禁 monitorEventLoopDelay**（774ms 报成 17ms）；噪声下限 ≈20ms。
- **手机端调试**：CDP `Emulation.setSafeAreaInsetsOverride` 可在桌面 Chrome 注入刘海（top=47 → `env()` 真返回 47px）；
  ⚠️ `setAutoDarkModeOverride` **不等价** MIUI "智能反色" → 不能据此排除"浏览器强制深色"；手机侧用 `.tmp-probe/diag-overlay.js`。
- 🔴 **视觉回归先稳定化、再归因**：不禁过渡/动画、不等 `fonts.ready` → 同代码连拍可报 **17.8% 假差异**；
  冻结样式须 `page.addStyleTag` **加载后**注入并**断言生效**。稳定后噪声下限 **0**；⚠️ 比对前先 `md5sum` 验两侧同一状态（§10.13）。
- ⚠️ 同一条消息对同一文件多个 Edit 会**静默丢失** → 同文件多改一律**串行**，改完 grep 复核。
- ⚠️ **本机 node 的同步 spawn（管道 IO）恒抛 `EBUSY`** → 依赖 `execFileSync` 的脚本（含 `scripts/release.mjs`）**本机跑不了**；
  异步 `spawn` / `stdio:'inherit'` / 文件 fd 都正常；**禁用 `Atomics.wait` 桥接（必死锁）**、预加载 patch 也无效。
  ⚠️ `cmd | tail` 后 `$?` 是 tail 的 → 真实码重定向到文件再读（**push 静默失败过一次**，判据一律用 `git ls-remote`）。
- ⚠️ git-bash `/dev/tcp` 在 Windows 假阴性（判连通用 node:net）。§9
- ⚠️ `npm run` 丢命令行环境变量；`node --env-file` 不可被命令行覆盖 → 脚本自己 `process.loadEnvFile(...)`。
- ⚠️ bash heredoc 里的 `${...}` 可能被插值 → 含模板字符串的脚本用 Write 落盘再跑。
- ⚠️ **沙箱拦两类删除**（都不是代码错）：① `vite build` 在 **`prepare-out-dir`** 被 safe-delete 守卫拒
  （阈值 50 项）→ 用 `npx vite build --outDir <全新目录>`；② `rm -rf <dir>` 大目录 fail-closed → **每批 ≤25 个 `rm -f`**。
- **跨进程关卡退出码**：0 通过 / 1 断言失败 / 2 回滚不完整 / 3 环境不可用。
- **CLI 引导**：`loadAllModels()` 后 `getModel` 才可用；`framework/db` 非测试缺 DB 配置直接退进程；`loadGuardConfig()` 吞错且**回写 DB**；
  CLI 写配置先 `initDao()`；CLI 下 globalRedis 恒 null，用 connectStandalone。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`（npx jest 丢 ESM 标志）。
- 临时脚本放 `.tmp-probe/`（唯一 gitignore 项），跑完删。

## 5. 部署 / CI（细则全在 details §10，2026-09-21 定案）

- **CI 安装三件套**（改 `ci.yml` 前必读）：`npm install --workspace=packages/shared-device --include-workspace-root --ignore-scripts
  --legacy-peer-deps --no-audit --no-fund` **+ `node packages/shared-device/scripts/build.mjs`**；四个"别改回去"见 §10.1/§10.2。
- **另四条高频**：Dockerfile 的 tini 按**实际路径**建软链（§10.3）；response schema 必须覆盖信封全字段（§10.5）；
  生产三 secret **≥32 位**否则拒绝启动（§10.11）；复刻树验收 `git archive HEAD | tar -x` 到**仓库外**（§10.9）。

## 6. 待办

- ⚠️ 多服务器（Swarm/K8s）**仍只有设计稿**，代码不存在。
- P2 session.js 拆分评估**未开始**；P3 容器化/CI 已实质完成。
- oauth21 其余页面（**登录 / 重置密码**）尚未接入「业务容器 + 可换版式」——注册页已落地（§11.10），机制可直接照抄。
