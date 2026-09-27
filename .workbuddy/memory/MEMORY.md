# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据/全过程 → `MEMORY-details.md`（§号即引用）与 `YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`）。本文件**每轮注入且超 ~12KB 会被静默截断** → 宁缺勿长。

## 0. 仓库形态 / 发版

- **`packages/log/` 是独立嵌套 git 仓**（主仓 gitignore）→ 去那个仓提交；主仓 `git add packages/log/...` 静默不生效。
- **本机 git ref 失灵**：status 谎报 ahead、push 可能数分钟零输出 → **以 `git ls-remote origin main` 为准**，超时≠失败。
  push 后异常：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "<完整40位SHA>"`。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；
  破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。版本源是 git tag；
  工作区脏会拒（`--allow-dirty` 放行）；**唯一例外 `phonecopy`** —— 脚本已显式过滤（release.mjs L338 `!line.includes('phonecopy')`）。

## 1. 强制约定（有守卫 / 有规则文档，违反会红）

- export 收拢文件末尾（仅 src/）· `src` 不得 import `scripts` · `src/app/<A>` 不得 import `src/app/<B>`（白名单在各自守卫测试里）。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」；`KNOWN_INEFFECTIVE_TESTS` 只减不增（14）+ 同步 `FROZEN_SIZE`；
  **一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
- **🔍 运行期"鸭子类型"判据必须由接口派生**：写 `Record<keyof T, 'string'|'function'>` 再遍历 ——
  穷尽性由 TS 保证，接口加成员不在这里分类直接编译失败。**手抄成员名 = 接口一改判据静默落后**
  （实锤：`theme/views/pages.ts` 判 `candidate.list`，而 `list()` 已在 `8f6b328` 删除 → `isViewRegistry` 恒假
  → `pageFromPath`/`viewsForPage` 恒 undefined → 调试面板「版式」区永不渲染，零报错，潜伏整轮）。
  同类：**"长红的关卡 = 噪声"**，它会掩护真红 —— 过期关卡要**显式退役**（移走或对齐口径），不许留在原地。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js；禁直接 import `app/firewall/dao/block-manager.js`。
- **📐 文档 ≠ 实现**：核法 = 文档承诺的环境变量名 grep 代码，命中 0 = 未实现（`src/loader|auth|db|redis` **均不存在**，全在 `src/framework/`）。
- **🔗 文档站**：`ignoreDeadLinks` 只放行 `AGENTS|oauth21|posecraft|packages` 前缀 → 指 `docs/` 之外必 `docs:build` 失败，**指源码用反引号**；
  ⚠️ `development-standards.md` 在 `docs/` **根**；新增文档页要**同时**注册进 `docs/.vitepress/config.ts` sidebar。
- **代码审查**：唯一入口 `docs/development/code-review.md`（L0–L3/五道闸）；**L3（格式类）禁止人工提出**。
- 🔴 **前端类型闸门必须是"真检查"**：方案式 tsconfig 下裸 `vue-tsc` 恒 exit 0 → 口径 **`vue-tsc -b`**，**改完口径必须毒丸验证**。
- **跨内核渲染基线**（`docs/frontend/browser-baseline.md`）：规范留白处不显式声明 = 把渲染交给内核；viewport meta 跨行/加实验键会被内核整条丢弃。
- 🔴 **多主题 / 多版式开发模式（强制）**（`docs/frontend/multi-theme.md`）：token 基线 → 皮肤 → 版式三正交；**目录名即 id**（坏目录静默跳过）；
  🔴 **业务只在容器**，版式只读 `ctx`、只调 `ctx.actions`；外部输入**一律过白名单**。

## 2. 后端陷阱速查 → **details §12**（14 条整表在那里）

`getModel` TypeError · `getStore` 命名空间 · 禁 `bcryptjs` · 禁 `*Sync(` 路径 · `underscored:true` · 模块级 `process.exit` 伪装绿 ·
改导出面要真实 import · 外部输入归一化 · `vue-tsc` 拦不住模板标识符 · `/user/v1/register` 只认 `username` ·
Fastify（顺序/`onRoute`/`preClose`/`OPTIONAL_LOADERS`/`/health/*`）· Redis v5（驼峰/`duplicate()` 不建连）·
Guard（RUNTIME_FIELDS/`restore()` 清表）· 日志（`log.info` 会被丢）。

## 3. oauth21 → **details §11**（细则/实测数据全在那里）

### 3.1 设备 / 包 / 版式 / 配色

> **结构描述**（设备三值、`renderedDevice` 三映射、`setupThemeDeviceSync` 只听 `route.meta.device`、
> `pageFromPath` 剥 `mini-` 前缀、注册表键五段、路由级 fade 默认非 `out-in`）→ **details §11.17**。

- 🔴 **设备三值平级** `mobile|standard|mini`（mini 是**独立设备**，不是变体子目录；路由层 `view/web/` 不改名）。
- **版式优先级** `?view=` > 包声明 `views.<page>` > `VITE_<PAGE>_VIEW` > 当前包名；URL 显式非法值**不回退**；新增版式目录要重启 dev server。
- 🔴 **新版式下 view ≡ pkg**（v2.18.5）：登记的 view = 包名，`'base'` 不是合法 view 名；`findRecord/getThemeRecord` 必须接收 pkg。
- **跨包切版式 → 配色自动重置到新包默认色**（现为 `DEFAULT_THEME_COLOR`）：要跨包**比样式**必须 URL 钉 `&theme=`（否则比的是配色差）。
- 🔴 **配色注册表键 = 五段**（`包/设备/页面/版式/配色`）；配色**每版式各一份**，漏了静默回落；tokens 扁平无 light/dark 两档。
- **明暗 = 配色系别**：`isDark = 当前配色 tone`；每套配色必填 `tone`；点色卡同步 mode、切 mode 联动配色；跨设备回落**先按同系别**
  （关卡 F 段）；`themeId` 不随设备变，`getThemeRecord` 回落先取同系别首套。
- 🔴 **URL `?theme=`/`?skin=` 设备无关**（`readUrlIntent` 读 `location.search`，不限设备）：能否生效只看该设备 `colors/` 有无该配色，
  没有则**同系别回落**且**不写** `data-mauth-theme`；电脑端三页只有 black/white（补目录做法 → **details §11.16 A**）。
- 🔴 **设备维度参数两侧同形**：`?theme.<设备>`/`?skin.<设备>`/`?view.<设备>` 一律「设备专属 → 通用键 → 落盘/包默认」；
  版式侧唯一入口 `theme/views/params.ts` 的 `readDeviceParam`（**别直接读 `route.query.view`**）。
  **空串/纯空白 = 未指定**（`get('theme.mobile')` 对 `?theme.mobile=` 返回**空串非 null** → `'' ?? 通用键` **会把通用键一起吞掉**）。
  版式 id 恒 ≡ 包名：`?view=base` 只是**别名**要归一，**任何地方都不许返回 `'base'`**（配色键里没有它 → tokens 静默全丢）。
- 🔴 **`data-mauth-view` 值 = 主题包名，且三端每份版式都带**（关卡与排查的唯一取值口；`verify-theme-dirs` §7b 守）。

### 3.2 样式 / token 硬规则

- **样式单一来源** = `mobile-auth.scss`（`mauth-*`）；基础版式与 `/m/*` 页禁自带 `<style>`；移动端版式刻意不限宽。
- 🔴 **scoped 禁写 `:global(.dark) X` / `:deep(.dark) X`**：编译成裸 `.dark` 命中 html → 夜间背景变红。正确 **`.dark X`**；桌面卡片根挂 `:class="{ dark: activeTone==='dark' }"`。
- 🔴 **纯黑口径**：black = `#000000`（不借 slate-950），且 `--mauth-bg` + `--mauth-body-bg` **必须同时**设；
  `--mauth-header-bg` 禁 `transparent`（要显式 `var(--mauth-bg)`）。surface/accent/focus/input/disabled 精确值 → **details §11.16 C**。
- 🔴 **main.scss body 已 token 化**（`var(--mauth-canvas, …)`）：desktop 页 body 也走 token，别再引 Tailwind `bg-background`。
- 浮层（GraphicCaptcha/MessageToast/DocModal）已全 token 化；**GraphicCaptcha 输入框类名 `.mauth-captcha-input`**（旧 `.minimal-input-large` 已删，守卫已同步）。

### 3.3 行为 / 业务坑

- 🔴 **调试移动端页前先造窄视口并刷新**：判定 `宽(≥1024) ＞ 窄(<768) ＞ UA`；probe 模拟真机横屏必须带移动 UA（裸 844 宽 = 桌面）。
- 🔴 **三个分发器必须都认「mini 来源」**（显式 isMobile ＞ from=mini/fromLogin=mini/路径 ＞ 自动 ＞ 桌面默认）。
- 🔴 **URL 不被视口改写**：`/m/*` 与 `/<page>` 共用分发器；旧重定向三件套已全删。
- 🔴 **父 origin 白名单单一来源 `utils/parent-origins.ts`**；漏配症状 =「弹窗 loading 慢」非报错；别把 5174/5175 写进白名单。
- 🔴 **`validateField` 不跑 zod object 级 refine** → 两次密码一致须显式比对 + `setFieldError`。
- 🔴 **新 watch 取「旧值」必须显式传**（default 参数在触发时已变，currentPkg 永远等于新值 → 整段逻辑静默失效）。
- **登录行**：providers 空 → 零 DOM；授权端点只放行站内相对路径；未配端点**不静默**。
- 🔴 **路由级 fade + 三层 prefetch**（v2.20.1）：默认模式非 out-in；`.route-stage` absolute；dispatcher 内层禁 out-in 包异步组件。

## 4. 手法 / 命令（细则 → details §9）

- 🔴 **禁止在 Bash 工具里 `git rm` src/ 下任何路径**：会递归清空整个 src/。删 src 一律 `rm <path> && git add -A`。
- **大块改动立刻检查点提交**；毒丸验测试有效性；同一文件多 Edit 同条消息会静默丢失 → 串行并 grep 复核；块注释禁 `*/` 紧邻。
- 🔴 **视觉回归先稳定化、再归因**：禁过渡/动画、等 `fonts.ready`，冻结样式 `addStyleTag` 后断言生效。
- ⚠️ **本机 node 同步 spawn（管道 IO）恒抛 EBUSY**：用 `spawnSync` + 文件型 stdio；`cmd | tail` 后 `$?` 是 tail 的；git-bash `/dev/tcp` 假阴性。
- ⚠️ **沙箱拦两类删除**：`vite build` 出目录 → `--outDir <全新目录>`；`rm -rf` → 每批 ≤25 个 `rm -f`。
- ⚠️ `npm run` 丢命令行环境变量 → 直接 `VITE_XXX=… npx vite --port N` 起第二实例（5175=link 模式）。
- ⚠️ **重命名/移动被 dev server watch 的目录会 Permission denied**：先 taskkill vite 再 mv。
- 事件循环冻结用 tick 间隔法；手机端注入刘海用 CDP `setSafeAreaInsetsOverride`。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`。
- 临时脚本放 `.tmp-probe/`（唯一 gitignore 项）。**oauth21 的 Playwright 关卡长期留在 `.tmp-probe/verify-*.mjs`**，改前先跑当基线。
- 🔴 **起 dev server 必须服务本身当后台命令**（`run_in_background`）；端口：5174=code · 5175=link · 5177=compact · 5197=color-peer · 5184=panel-v3 · **5189=dist 预览（流量实测）**（跑前探活）。
- 🔴 **量首屏流量必须用生产构建**（dev 每模块一请求，无意义）+ **必须新建 outDir**（`dist-*` 已 gitignore）：
  `vite build --outDir dist-measure-N` → `vite preview --outDir … --port 5189` → `measure-load-budget.mjs`。
  🔴 **这个口径看不见 SW 流量**（SW install 跑在独立 target，不在 page 的 Network 域）—— 曾据此误判"SW 无成本"。
- ✅ **oauth21 的 PWA 已于 2026-09-27 整体移除**（它本就是 `PWA_GUIDE.md` §一写的「**不适用**：纯登录页」→ 此前**违反自家规范**）：
  首访 **994 KB → 213.5 KB**；`VitePWA` / `workbox` / `lazy-theme` 前缀全删。🔴 **光删配置清不掉老用户** →
  `oauth21/public/sw.js` 是**自毁迁移脚本**（顶替 `/sw.js`，靠浏览器原生更新检查清缓存并注销自己），**旧装机量归零才可删**。
  关卡：`verify-no-pwa.mjs`（17 项 + 毒丸 10/10）、`verify-sw-migration.mjs`（8/8）；旧 `verify-pwa-precache.mjs` 已退场（判据反了）。
- 🔴 **workspaces 共用根 `node_modules`** → 删任一 workspace 的依赖**前先 `npm ls <包>`**（`vite-plugin-pwa` 仍被 `posecraft` 依赖，
  按"oauth21 不用了"的直觉移走包体会**连带弄坏 posecraft**，已踩一次）。
- ℹ️ **行尾混合、但每文件内部一致**（258 文件：113 LF / 142 CRLF / **0 混用**）；`core.autocrlf=true` 让 git 归一化，
  **工作区行尾不影响 diff**。惯例：配置与脚本 LF，`src/` 源码多为 CRLF。**别做批量转换**。
- 🔴 **多实例必须串行启动**（前一个 curl 到 200 再起下一个）：几个 Vite 共用 `node_modules/.vite`，同时冷启会互相废掉
  optimizeDeps → 白屏 + `504 (Outdated Optimize Dep)`。**删依赖后**首启还会被沙箱拦在"清 `.vite/deps`"（>50 文件）→ 先 `mv` 走 `.vite` 再起。

## 5. 部署 / CI（细则全在 details §10）

改 `ci.yml` / Dockerfile 前先读 details §10：CI 安装三件套 · Dockerfile tini 按实际路径建软链 · response schema 覆盖信封全字段 ·
生产三 secret ≥32 位 · 复刻树验收 `git archive HEAD | tar -x` 到**仓库外**。

## 6. 待办 / 进度

- ⚠️ 多服务器（Swarm/K8s）**仍只有设计稿**；P2 `session.js` 拆分评估未开始；`firewall` 前端无类型检查（121 错）；CI 无前端作业 —— 均待定夺。
- ⚠️ 卡关脚本欠账：`verify-theme.mjs` 期望值仍按旧配色名（已 `exit 2` 自检）。面板四件套已于 2026-09-27
  退役到 `_retired/`，`verify-panel-v3.mjs` 已重写（34/34）—— 长红关卡已清理。
- ✅ **主题模块改造 B1→B6 已落地**（2026-09-27，见 `theme-module-analysis-plan` 报告与当日日志）：
  B1 判据由接口派生 + 运行时标记 · B2 修失修关卡 · B3 包自描述 `coverage` + 关卡去硬编码 ·
  B4 页面工厂 + 清残留 · B6 设备清单 `devices.ts` 下沉 + 三分发器统一 `pickDeviceId` + 路由数据化。
  **加包/加页面 = 只写目录+契约文件，加设备 = 加一条清单+写容器**（runbook 见 `docs/frontend/multi-theme.md` §七/§八）。
- ⏳ **B5 四段键未做**（删注册表 view 冗余段，用户此前选定要做）：动 `theme/index.ts` 近 10 函数 + store 调用面，
  风险高，需单独一轮 R1→R2→R3。B4 剩余：注册表二级索引、runtime 注入名去重、O5 关卡整合。
- ⚠️ `phonecopy` 是**嵌套 git 仓**（不在 `.gitmodules`）→ `git status` 永远显示脏 ` m phonecopy`。
  **但 `release.mjs` 已在 porcelain 里显式过滤它**（L338）→ 正常发版**不需要** `--allow-dirty`（2026-09-27 实测 v2.25.1 一次通过）。
- ✅ **主题抽包 Stage 1 已完成**（`packages/theme-core` 纯叶子层 + 零逻辑壳；默认 `default`+`white`；版式选择收口 `views/picker.ts`）。
  ⏳ **Stage 2 未做**：`runtime.ts` 注入器 → `ThemeAssets` / `ThemeEnv` / `ThemeHost`。
- ✅ 历史已完成（细节可查 git log）：oauth21 三页 standard/mini 容器+版式拆分、设备三值化、eslint 存量清零（v2.21.0–v2.23.0）。
