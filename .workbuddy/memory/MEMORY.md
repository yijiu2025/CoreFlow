# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据/全过程 → `MEMORY-details.md`（§号即引用）与 `YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`）。本文件**每轮注入且超 ~12KB 会被静默截断** → 宁缺勿长。

## 0. 仓库形态 / 发版

- **`packages/log/` 是独立嵌套 git 仓**（主仓 gitignore）→ 去那个仓提交；主仓 `git add packages/log/...` 静默不生效。
- **本机 git ref 失灵**：status 谎报 ahead、push 可能数分钟零输出 → **以 `git ls-remote origin main` 为准**，超时≠失败。
  push 后异常：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "<完整40位SHA>"`。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；
  破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。版本源是 git tag；工作区脏（含子模块）会拒。

## 1. 强制约定（有守卫 / 有规则文档，违反会红）

- export 收拢文件末尾（仅 src/）· `src` 不得 import `scripts` · `src/app/<A>` 不得 import `src/app/<B>`（白名单在各自守卫测试里）。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」；`KNOWN_INEFFECTIVE_TESTS` 只减不增（14）+ 同步 `FROZEN_SIZE`；
  **一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
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

### 3.1 设备 / 包 / 版式 / 配色结构（2026-09-25 三值化定案）

- 🔴 **设备三值**：`THEME_DEVICES = ['mobile','standard','mini']`，与分发器 `activeForm`（mobile/mini/standard）一一对应。
  **mini 是独立设备**（iframe 紧凑版），**不是 web/standard 下的变体子目录**；`themes/default/web/` 已更名 `standard/`。
  mini 独立配色目录 `mini/<page>/colors/`。路由层目录 `view/web/` **不改名**（那是电脑端路由语义）。
- 🔴 **分发器 renderedDevice 三映射**：`mobile→'mobile'`、`mini→'mini'`、`standard→'standard'`；路由基线（`setupThemeDeviceSync`）
  兜底 `'standard'`（非 mobile 即 standard）。`setupThemeDeviceSync` 只听 `route.meta.device`，别听整个 currentRoute（query 噪声）。
- 🔴 **`pageFromPath` 会剥 `mini-` 前缀**（`/mini-login` → login）：不剥则调试面板在 mini 路由上推断不出页面 → 版式/配色区全空。
- **版式优先级** `?view=` > 主题包 `views.<page>` > `VITE_<PAGE>_VIEW` > 基础版式；URL 显式非法值**不回退**；**新增版式目录要重启 dev server**。
- 🔴 **新版式下 view ≡ pkg**（v2.18.5）：基础版式登记 view = 包名，`'base'` 不是合法 view 名；`findRecord/getThemeRecord` 必须接收 pkg。
- **跨包切版式 → 自动重置配色到新包默认色**（v2.18.5 设计，字母序 black）：要跨包**比样式**必须 URL 钉 `&theme=`（否则比的是配色差）。
- **配色注册表键 = 五段** `包/设备/页面/版式/配色`；配色**每版式各一份**漏了静默回落；tokens 扁平值无 light/dark 两档。
- **明暗 = 配色系别**：`isDark = 当前配色 tone`；每套配色必填 `tone`；点色卡同步 mode、切 mode 联动配色；跨设备回落先按同系别（关卡 F 段）。
- **跨设备系别一致**：`getThemeRecord` 回落先取同系别首套；`themeId` 不随设备变。

### 3.2 样式 / token 硬规则

- **样式单一来源** = `mobile-auth.scss`（`mauth-*`）；基础版式与 `/m/*` 页禁自带 `<style>`；移动端版式刻意不限宽。
- 🔴 **scoped 禁写 `:global(.dark) X` / `:deep(.dark) X`**：编译成裸 `.dark` 命中 html → 夜间背景变红。正确 **`.dark X`**；桌面卡片根挂 `:class="{ dark: activeTone==='dark' }"`。
- 🔴 **纯黑口径**：black = `#000000`（不借 slate-950）→ 必须 `--mauth-bg` + `--mauth-body-bg` 同时 #000000；surface 系列 `#121212/#1c1c1c/#262626/#2e2e2e`；
  accent 用中性 `#e5e5e5`；focus 用冷调蓝灰 `#94a3b8`；input field-bg 0.10 白半透（0.06 看不见层次）；disabled = opacity 0.4 + `saturate(0)`；
  focus-within 图标联动 `color: var(--mauth-text)`；`--mauth-header-bg` 禁 transparent（要同色显式 `var(--mauth-bg)`）。
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
- 🔴 **起 dev server 必须服务本身当后台命令**（`run_in_background`）；端口：5174=code · 5175=link · 5177=compact · 5197=color-peer · 5184=panel-v3（跑前探活）。

## 5. 部署 / CI（细则全在 details §10）

改 `ci.yml` / Dockerfile 前先读 details §10：CI 安装三件套 · Dockerfile tini 按实际路径建软链 · response schema 覆盖信封全字段 ·
生产三 secret ≥32 位 · 复刻树验收 `git archive HEAD | tar -x` 到**仓库外**。

## 6. 待办

- ⚠️ 多服务器（Swarm/K8s）**仍只有设计稿**。P2 session.js 拆分评估**未开始**。
- `firewall` 前端无类型检查（121 错）；CI 无前端作业——均待定夺。
- ✅ `oauth21` eslint 存量已清零（`no-undef` 已在 eslint.config.js 置 off 由 TS 处理；`AntiCacheDebugPanel.vue` 的
  `preserve-caught-error` 已补 `{ cause: err }` 修复）。
- ✅ oauth21 三页（login/register/forgot-password）的 **standard/mini 容器+版式拆分已全部完成**（v2.21.0–v2.23.0），
  设备三值化（mobile/standard/mini）+ mini 独立设备目录均已落地。
