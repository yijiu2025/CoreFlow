# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据/全过程 → `MEMORY-details.md`（§号即引用）与 `YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`）。本文件**每轮注入且超 ~12KB 会被静默截断** → 宁缺勿长。

## 0. 仓库形态 / 发版

- **`packages/log/` 与 `phonecopy/` 是嵌套 git 仓**（不在 .gitmodules）→ `git status` 恒显示脏；`release.mjs` L338 已过滤 phonecopy → 正常发版**不需** `--allow-dirty`。
- 🔴 **`packages/theme-core/` 是 submodule**（→ <https://github.com/yijiu2025/theme>）→ **克隆必须 `--recurse-submodules`**（vite alias 直指它 `src/index.ts`，缺了构建炸）。已发 npm 包 **`skinsuite`**。
- 🔴 **oauth21 / posecraft / firewall / admin / poseadmin 是独立前端项目，非 workspace 成员**（各有独立 package.json / node_modules / lock）。
  引用本地包（`skinsuite` / `stable-deviceid`）靠 **vite alias + tsconfig paths 源码直供**，**不得用 `workspace:*` 声明**；
  装依赖用 `npm install --prefix <dir>`；CI job 要 `submodules: recursive`。
- **本机 git ref 失灵**：status 谎报 ahead、push 可能数分钟零输出 → **以 `git ls-remote origin main` 为准**，超时≠失败。
  push 后异常：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "<完整40位SHA>"`。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；
  破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。版本源是 git tag。

## 1. 强制约定（有守卫 / 有规则文档，违反会红）

- export 收拢文件末尾（仅 src/）· `src` 不得 import `scripts` · `src/app/<A>` 不得 import `src/app/<B>`。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」；`KNOWN_INEFFECTIVE_TESTS` 只减不增（14）+ 同步 `FROZEN_SIZE`；**一个测试文件只能注册一组路由**（`_routeRegistry` 无重置）。
- **🔍 运行期"鸭子类型"判据必须由接口派生**：写 `Record<keyof T, 'string'|'function'>` 再遍历（TS 保穷尽性）。**手抄成员名 = 接口一改判据静默落后**。
  同类：**"长红的关卡 = 噪声"** 会掩护真红 → 过期关卡必须**显式退役**。
- 🔴 **往 lint 范围新增目录必须先配语言环境**（"纳管"≠只加进目录）：oauth21 `e2e/` 迁入版本控制后被
  `eslint .` 扫到、缺全局配置报 446 error ⇒ 要同时给 `languageOptions.globals` + 关不适用规则。
- 🔴 **拆分/移动源码后，凡"断言读文件内容"的关卡必须同步文件清单**（`implText`/`read(join(...))`）—— 已三次踩到。
- 🔴 **构建期配置文件必须参与类型检查**（`.js` → `.ts`）：`vite.config` 长期 `.js` ⇒
  `build.esbuild.drop:['console']` 在 **Vite 8 下早已失效**却无信号（实测残留 28 处 console）。
  **Vite 8 = Rolldown+Oxc**：删 console 入口 `build.rolldownOptions.output.minify.compress.dropConsole`；
  `rollupOptions`→`rolldownOptions`；顶层 `esbuild` deprecated（→`oxc`）。详见 details §10.98。
  ⇒ **"配置类保护措施一定要有关卡"**（行为层真跑，见 `verify-console-strip.mjs`）。
- 🔴 **路径别名单一来源 `oauth21/config/aliases.ts`**（vite/vitest 共用；tsconfig.paths 静态 JSON 仍手写、
  由 `verify-alias-single-source.mjs` 守）。改别名**两处同改**。JSONC 解析**禁用正则剥注释**，用 `typescript.parseConfigFileTextToJson`。
- 🔴 **`skinsuite` / `stable-deviceid` 必须零外部 import**：宿主靠 alias **源码直供**，包内 `import vue` 会
  **静默出两份 Vue**。守 `verify-kernel-zero-coupling.mjs`（判据排除 `__tests__/`）。细节 → details §10.97。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js；禁直接 import `app/firewall/dao/block-manager.js`。
- **📐 文档 ≠ 实现**：核法 = 文档承诺的环境变量名 grep 代码，命中 0 = 未实现。
- **🔗 文档站**：`ignoreDeadLinks` 只放行 `AGENTS|oauth21|posecraft|packages` 前缀 → 指 `docs/` 之外必 `docs:build` 失败；新增页要**同时**注册进 `docs/.vitepress/config.ts` sidebar。
- **代码审查**唯一入口 `docs/development/code-review.md`（L0–L3/五道闸）；**L3（格式类）禁止人工提出**。
- 🔴 **前端类型闸门必须是"真检查"**：方案式 tsconfig 下裸 `vue-tsc` 恒 exit 0 → 口径 **`vue-tsc -b`**，改完口径必须毒丸验证。
- **跨内核渲染基线**（`docs/frontend/browser-baseline.md`）：规范留白处不显式声明 = 把渲染交给内核；viewport meta 跨行/加实验键会被内核整条丢弃。
- 🔴 **多主题 / 多版式开发模式（强制）**（`docs/frontend/multi-theme.md`）：token 基线 → 皮肤 → 版式三正交；**目录名即 id**（坏目录静默跳过）；
  🔴 **业务只在容器**，版式只读 `ctx`、只调 `ctx.actions`；外部输入**一律过白名单**。

## 2. 后端陷阱速查 → **details §12**（14 条整表在那里）

`getModel` TypeError · `getStore` 命名空间 · 禁 `bcryptjs` · 禁 `*Sync(` 路径 · `underscored:true` · 模块级 `process.exit` 伪装绿 ·
改导出面要真实 import · 外部输入归一化 · `vue-tsc` 拦不住模板标识符 · `/user/v1/register` 只认 `username` ·
Fastify（顺序/`onRoute`/`preClose`/`OPTIONAL_LOADERS`/`/health/*`）· Redis v5（驼峰/`duplicate()` 不建连）· Guard（RUNTIME_FIELDS/`restore()` 清表）· 日志（`log.info` 会被丢）。

## 3. oauth21 → **details §11**（细则/实测数据全在那里）

### 3.1 设备 / 包 / 版式 / 配色

- 🔴 **设备平级** `mobile|standard|mini|tablet`（mini 是**独立设备**非变体子目录；路由层 `view/web/` 不改名）。加设备 = 加 `devices.ts` 一条 + 写容器。
- **版式优先级** `?view=` > 包声明 `views.<page>` > `VITE_<PAGE>_VIEW` > 当前包名；URL 显式非法值**不回退**；新增版式目录要重启 dev server。
- 🔴 **view ≡ pkg**：登记的 view = 包名，`'base'` **不是合法 view 名**（只是别名要归一）；任何地方都不许返回 `'base'`。
- 🔴 **配色注册表键 = 四段**（`包/设备/页面/配色`）；配色**每版式各一份**，漏了静默回落；tokens 扁平无 light/dark 两档。
- **明暗 = 配色系别**：`isDark = 当前配色 tone`；每套配色必填 `tone`；跨设备回落**先按同系别**；`themeId` 不随设备变。
- 🔴 **URL `?theme=`/`?skin=` 设备无关**：能否生效只看该设备 `colors/` 有无该配色，没有则同系别回落且**不写** `data-mauth-theme`；跨包比样式必须 URL 钉 `&theme=`。
- 🔴 **设备维度参数两侧同形**：`?theme.<设备>`/`?skin.<设备>`/`?view.<设备>` 一律「设备专属 → 通用键 → 落盘/包默认」；
  版式侧唯一入口 `theme/views/params.ts` 的 `readDeviceParam`（别直接读 `route.query.view`）。**空串/纯空白 = 未指定**（`'' ?? 通用键` 会吞掉通用键）。
- 🔴 **`data-mauth-view` 值 = 主题包名，且每端每份版式都带**。

### 3.2 样式 / token 硬规则

- **样式单一来源** = `mobile-auth.scss`（`mauth-*`）；基础版式与 `/m/*` 页禁自带 `<style>`；移动端版式刻意不限宽。
- 🔴 **scoped 禁写 `:global(.dark) X` / `:deep(.dark) X`**（编译成裸 `.dark` 命中 html → 夜间背景变红）。正确 **`.dark X`**；桌面卡片根挂 `:class="{ dark: activeTone==='dark' }"`。
- 🔴 **纯黑口径**：black = `#000000`（不借 slate-950），且 `--mauth-bg` + `--mauth-body-bg` **必须同时**设；`--mauth-header-bg` 禁 `transparent`。
- 🔴 **main.scss body 已 token 化**（`var(--mauth-canvas, …)`）：desktop 页 body 也走 token，别再引 Tailwind `bg-background`。
- 浮层已全 token 化；**GraphicCaptcha 输入框类名 `.mauth-captcha-input`**（旧 `.minimal-input-large` 已删）。

### 3.3 行为 / 业务坑

- 🔴 **调试移动端页前先造窄视口并刷新**：判定 `宽(≥1024) ＞ 窄(<768) ＞ UA`；probe 模拟真机横屏必须带移动 UA。
- 🔴 **三个分发器必须都认「mini 来源」**（显式 isMobile ＞ from=mini/路径 ＞ 自动 ＞ 桌面默认）；**URL 不被视口改写**。
- 🔴 **父 origin 白名单单一来源 `utils/parent-origins.ts`**；漏配症状 =「弹窗 loading 慢」非报错；别把 5174/5175 写进白名单。
- 🔴 **`validateField` 不跑 zod object 级 refine** → 两次密码一致须显式比对 + `setFieldError`。
- 🔴 **新 watch 取「旧值」必须显式传**（default 参数在触发时已变 → 整段逻辑静默失效）。
- **路由级 fade + 三层 prefetch**：默认非 out-in；`.route-stage` absolute；dispatcher 内层禁 out-in 包异步组件。

## 4. 手法 / 命令（细则 → details §9）

- 🔴 **禁止在 Bash 里 `git rm` src/ 下任何路径**（会递归清空整个 src/）→ 删 src 一律 `rm <path> && git add -A`。
- **大块改动立刻检查点提交**；毒丸验测试有效性；同一文件多 Edit 同条消息会静默丢失 → 串行并 grep 复核；**块注释禁 `*/` 紧邻**（`packages/*/src/…` 这种写法会提前终止注释）。
- 🔴 **视觉回归先稳定化、再归因**：禁过渡/动画、等 `fonts.ready`，冻结样式 `addStyleTag` 后断言生效。
- ⚠️ **ESLint 9+/flat config 已不支持 `--ext`** → 该参数**静默失效**，实际全量扫描含 `.js`。判 lint 红/绿要按实际扫描范围看。
- ⚠️ **本机 node 同步 spawn（管道 IO）恒抛 EBUSY** → 用 `spawnSync` + 文件型 stdio；`cmd | tail` 后 `$?` 是 tail 的。
- 🔴 **沙箱拦删除**（safe-delete shim，`rm` / `fs.unlinkSync` 都拦、报 state lock timeout）：删文件 → **`mv <path> .tmp-probe/`** 最稳；
  `vite build` 出目录必须 `--outDir <全新目录>`。
- ⚠️ `npm run` 丢命令行环境变量 → 直接 `VITE_XXX=… npx vite --port N` 起第二实例。
- ⚠️ **重命名/移动被 dev server watch 的目录会 Permission denied** → 先 taskkill vite 再 mv。
- 测试：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`。临时脚本放 `.tmp-probe/`。
- 🔴 **起 dev server 必须服务本身当后台命令**（`run_in_background`）；端口：5174=code · 5175=link · 5177=compact · 5197=color-peer · 5184=panel-v3 · 5189=dist 预览（跑前探活）。
- 🔴 **量首屏流量必须用生产构建** + **必须新建 outDir**（`dist-*` 已 gitignore）：`vite build --outDir dist-measure-N` → `vite preview --port 5189` → `measure-load-budget.mjs`。⚠️ **这个口径看不见 SW 流量**。
- ✅ **PWA 已于 2026-09-27 整体移除**（`PWA_GUIDE.md` 本就写「不适用：纯登录页」）：首访 994 KB → 213.5 KB。
  🔴 `oauth21/public/sw.js` 是**自毁迁移脚本**，**旧装机量归零才可删**。
- 🔴 **workspaces 共用根 `node_modules`** → 移走任一 workspace 的依赖前先 `npm ls <包>`。
- ℹ️ **行尾混合但每文件内部一致**（113 LF / 142 CRLF / 0 混用）；`core.autocrlf=true` 让 git 归一化 → **别做批量转换**。
- 🔴 **多实例必须串行启动**（前一个 curl 到 200 再起下一个）：共用 `node_modules/.vite` 同时冷启会互相废掉 optimizeDeps（白屏 + 504）。删依赖后首启还会被沙箱拦在"清 `.vite/deps`" → 先 `mv` 走 `.vite` 再起。
- 🔴 **加设备目录必须 `--force` 重启 dev server**；设备必须有配色目录（否则 tokens 全丢只剩基线）。

## 5. 部署 / CI（细则全在 details §10）

🔴 **lock 已全仓入库**（2026-09-28，删了 `.gitignore` 的无差别 `package-lock.json`）：根 / oauth21 / firewall / posecraft /
admin / poseadmin 六个 lock 都在版本控制里。
- **前端 CI 用 `npm ci`**（`npm ci --prefix oauth21`，**必须从仓库根跑** —— 在 `oauth21/` 内部跑会被父级根 lock 干扰）。
- 🔴 **后端三个 job（lint/test/verify）必须保持 `npm install`，不能改 `npm ci`**：根 lock 把 `wb-logkit` 记为
  `link: packages/log`（gitignore 的嵌套仓），`npm ci` 会建**悬空软链** → `import 'wb-logkit'` 直接 ERR_MODULE_NOT_FOUND。
- 后端 job 也**不能开 `setup-node` 的 `cache: npm`**（收益只在 `npm ci` 路径上；前端 job 可以开，配 `cache-dependency-path`）。

改 `ci.yml` / Dockerfile 前先读 details §10：CI 安装三件套 · Dockerfile tini 按实际路径建软链 · response schema 覆盖信封全字段 ·
生产三 secret ≥32 位 · 复刻树验收 `git archive HEAD | tar -x` 到**仓库外**。

## 6. 待办 / 进度

- ⚠️ **待定夺**：多服务器（Swarm/K8s）仅设计稿 · P2 `session.js` 拆分未开始 · **`firewall` 前端无类型检查（121 错）**（独立 P1）。
- 📊 **oauth21 前端架构评审**：一期 2026-09-27 = 66.5/100 → **二期 2026-09-28 = 80.0/100**
  → `reports/oauth21-frontend-architecture-review-2026-09-28.md`。
  二期待办 = **核心业务七模块零测试**（api/auth · useLoginFlow · useCaptcha · guard · request · sign · stores/auth）
  + 52 处 `any`（集中在 useLoginFlow/useHCaptcha/useTurnstile）+ 22 个 e2e 关卡未全进 CI。
  🔴 已结清 2026-09-28：零 lock · 幽灵依赖 ×2 · alias 三处手抄 · 内核零耦合 · **console 剥离长期失效**（均含关卡）。
  ⚠️ 仍未做：`view/web/login/index.vue` L54 `sign.value = query.rnd`（应为 `query.sign`）· 主 CSS 单体 64 KB。
- ⚠️ 卡关欠账：`verify-theme.mjs` 期望值仍按旧配色名（已 `exit 2` 自检）。
- ⏳ **主题抽包 Stage 2 未做**：`runtime.ts` 注入器 → `ThemeAssets` / `ThemeEnv` / `ThemeHost`（Stage 1 已完成并发 npm `skinsuite@0.1.0`）。
  🔴 发新版：在 theme 仓跑 `npm version <…> && git push --follow-tags`；🔴 包内 `src` 相对 import **必须带 `.js` 后缀**；
  测试 `node --test`（**不能**写 `node --test test/`，Windows 会报 MODULE_NOT_FOUND），且**测 dist 不测 src**。
- ✅ **关卡体系**：统一入口 `verify-all.mjs` + 索引 `VERIFY.md`，**活跃 20 个**（静态 6 / dev 9 / 特殊 3 / 生产 2），3 个静态关卡已进 CI。
  🔴 `verify-no-pwa.mjs` 默认 `--dir dist` 但本机 dist 是旧 PWA 产物 → 统一入口指 `dist-nopwa`，跑前须重 build。
- ✅ **已完成（细节查 git log / details）**：`theme/index.ts` 拆分出 `registry.ts` · vendor 分包（vue/form/net）·
  tablet 落地演练 · 主题改造 B1→B6 + 配色键五段→四段 · 设备三值化 · eslint 存量清零（v2.21.0–v2.23.0）。
  runbook 见 `docs/frontend/multi-theme.md` §七/§八。
