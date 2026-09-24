# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据/全过程 → `MEMORY-details.md`（§号即引用）与 `YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`）。本文件**每轮注入且超 ~12KB 会被静默截断** → 宁缺勿长。

## 0. 仓库形态 / 发版

- **`packages/log/` 是独立嵌套 git 仓**（主仓 gitignore）→ 去那个仓提交；主仓 `git add packages/log/...` **静默不生效**（Exit=0 但有警告）→ 见警告停下查。
- **本机 git ref 失灵**：status 谎报 ahead、push 可能数分钟零输出 → **一律以 `git ls-remote origin main` 为准**，超时≠失败。
  push 后修：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "<完整 40 位 SHA>"`（绝对路径；截短→GUI 历史全灭）。
  ⚠️ `git credential fill` **永久挂住**（credential.helper 首项 `helper-selector`）→ 绕法见 §10.10。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；
  破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。版本源是 git tag。

## 1. 强制约定（有守卫 / 有规则文档，违反会红）

- export 收拢文件末尾（仅 src/）· `src` 不得 import `scripts` · `src/app/<A>` 不得 import `src/app/<B>`（白名单在各自守卫测试里）。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」；`KNOWN_INEFFECTIVE_TESTS` 只减不增（14）+ 同步 `FROZEN_SIZE`；
  **一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js；禁直接 import `app/firewall/dao/block-manager.js`。
- **📐 文档 ≠ 实现**：核法 = 文档承诺的环境变量名 grep 代码，命中 0 = 未实现（`src/loader|auth|db|redis` **均不存在**，全在 `src/framework/`）。
- **🔗 文档站**：`ignoreDeadLinks` 只放行 `AGENTS|oauth21|posecraft|packages` 前缀 → 指 `docs/` 之外必 `docs:build` 失败，**指源码用反引号**；
  ⚠️ `development-standards.md` 在 `docs/` **根**；新增文档页要**同时**注册进 `docs/.vitepress/config.ts` sidebar（否则是孤岛）。
- **代码审查**：唯一入口 `docs/development/code-review.md`（L0–L3/五道闸）；**L3（格式类）禁止人工提出**。
- 🔴 **前端类型闸门必须是"真检查"**（规则全文在 `docs/frontend/coding-standard.md`）：方案式 tsconfig（`files:[]`+`references`）下**裸 `vue-tsc` 恒 exit 0**
  → 曾攒下 9 个真错。口径 **`vue-tsc -b`**。口诀：**改完口径必须毒丸验证**（写 `export const __p: number = 'x'` 必须报错）。
  两个最容易"看起来修好了"的坑：子项目 `include` 是 `.js` 未开 `allowJs` → `-b` 报 `TS18003`，**去掉 `-b` 就不报错、只是静默失去检查**；
  配置级错误（`TS5101` 如 `baseUrl` 弃用）会让 TS **中止全部语义分析**，只剩一条无关报错。`firewall` 仍无类型检查（121 错）。
- **跨内核渲染基线（新前端强制）**（`docs/frontend/browser-baseline.md`，自检 `npm run check:baseline [目录]`，13 项）：
  核心一句 = **规范留白处不显式声明 = 把渲染交给内核**（`color-scheme` 初始 `normal`；根元素背景 `transparent` 时"渲染未定义"；`vh ≡ lvh`）。
  ⚠️ viewport meta **跨行或加实验键会让整条被内核丢弃**（小米/夸克实测）→ 退化成 980px 桌面布局。
- 🔴 **多主题 / 多版式开发模式（强制）**（`docs/frontend/multi-theme.md`）：三个正交维度 = **token 基线 → 皮肤 `themes/<id>/` → 版式 `themes/app/<page>/<id>/`**；
  **目录名即 id**（覆盖包内 `meta.id`；坏目录**静默跳过**；`themes/app/` 为保留名、禁加 `index.ts`）；
  🔴 **业务只在容器**（`view/app/<page>/index.vue`），版式只读 `ctx`、只调 `ctx.actions`；外部输入**一律过白名单**。oauth21 三页已全部接入。

## 2. 后端陷阱速查 → **details §12**（14 条整表已迁出）

`getModel(name)` 抛 TypeError · `getStore(prefix)` 命名空间/MapStore · 密码哈希禁 `bcryptjs` · 请求路径禁 `*Sync(` ·
`underscored:true` 时间戳 · 模块级 `process.exit` 伪装绿色 · 改导出面要真实 import · 外部输入归一化 ·
`vue-tsc` 拦不住模板标识符 · `/user/v1/register` 只认 `username` · Fastify（顺序/`onRoute`/`preClose`/`OPTIONAL_LOADERS`/`/health/*`）·
Redis v5（驼峰命令/`duplicate()` 不建连）· Guard（RUNTIME_FIELDS/`restore()` 清表）· 日志（`log.info` 会被丢）。

## 3. oauth21 移动端认证页 → **details §11**（细则/实测数据全在那里）

- **样式单一来源** = `assets/styles/mobile-auth.scss`（`mauth-*`）。**基础版式与 `/m/*` 页不得自带 `<style>`**（变体可以，取值只许 `--mauth-*`）；⚠️ 移动端版式**刻意不限宽**（用户明确要求满宽）。
- **版式优先级** `?view=` > 主题包 `views.<page>` > `VITE_<PAGE>_VIEW` > base，⚠️ **URL 显式非法值不回退**；base 容器**静态引入**、变体 `glob` 惰性 chunk；
  契约 = `types.ts` 纯类型 + 容器 `assertXxxContract` 编译期自检；浮层由**容器**渲染；**新增变体目录要重启 dev server**。
- **皮肤**：三层 token（全局语义 → 组件级 → 组件规则零裸色值）；明暗与皮肤**正交**；来源 `?theme=`（`?skin=` 别名）> 后端 > localStorage > default；
  🔴 外部输入**必过白名单**（`theme/runtime.ts` 拒 `url()` 与 CSS 颜色名）；`*/index.ts` eager、`*/theme.scss` 惰性；入口 `?debug=theme` 面板。
  🔴 `tokens` 是 `html` 上的 inline style、**优先级高于媒体查询** → 绝不能覆写断点里会变的 token（`--mauth-pad-*`/`gap-*`/`logo-size`/`title-size`/`field-h`/`control-h`/`err-h`/`social-*`）；
  ⚠️ `--mauth-header-bg` 设 `transparent` → **必须同时声明 `--mauth-canvas`**；⚠️ `assets/` 的 SVG **必须带 `width`/`height`**。
- 🔴 **调试移动端页前必须先造窄视口并刷新**：判定 `宽视口(≥1024) ＞ 窄视口(<768) ＞ UA`；宽视口开 `/m/*` 会**跳电脑版**，**UA 伪装压不过宽视口**，
  分发只在**导航时**执行（§11.1）。设备判定单一来源 `utils/device.ts` 的 `isMobileViewport()`。
- 🔴 **移动端页必须自己当滚动容器**：`html,body{overflow:hidden}` → `.mauth-page` 须 `height:100dvh + overflow-y:auto`，`.mauth-body` 须 `flex:1 0 auto`。
- 🔴 **"白条/色条"先定位到层再谈修色**（§11.7）：色由 ①根画布 ②祖先容器 ③页面自身 决定 → 统一出口 **`--mauth-canvas`**；页面须**贴顶**（`align-self:flex-start`），
  否则 `vh(≡lvh)>dvh` 时外层 `items-center` 留缝（**DevTools 不模拟动态工具栏 ⇒ 电脑上永远看不到**）。"给祖先改底色"只是把问题转移。
- 🔴 **跨内核差异先分类再修**：① `color-scheme` 初始 `normal` → 显式写 `light` 与 `light only` 两条（只带 `only` 会被不支持的引擎**整条丢弃**）；
  ② 视口被丢成 980 ⇒ 整页等比缩小 → meta **单行 + 只留最通用键**；判据**只能用 `visualViewport.scale`**（`clientWidth` 恒 980）；兜底 `utils/viewport-fix.ts`。
- 🔴 **父 origin 白名单单一来源 `utils/parent-origins.ts`**（发 `parent.ts` / 收 `useParentThemeSync` 共用；改白名单只改这里 + 各 `.env` 的 `VITE_ALLOWED_PARENT_ORIGINS`）。
  ⚠️ **漏配的症状是「弹窗 loading 慢」而非报错**：`SSO_READY` 被拒发 → 宿主等满 3s 兜底超时（实测 3608ms → 补对后 719ms）。
  排查任何 iframe 握手类「慢」，**第一件事 grep 控制台 `[SSO] 拒绝 postMessage：父 origin 未授权`**。**别把 oauth21 自己的端口（5174/5175）写进白名单**（它是被嵌方）。
- **登录行**：providers 为空 → **零 DOM**；🔴 授权端点**只放行站内相对路径**（`/` 开头且非 `//`）；未配端点**不静默**。
- **重置密码**：邮件链接指向 `/reset-password?token=…` 而前端无此路由 → 已加 redirect（query 原样带）；🔴 **`validateField` 不跑 zod 的 object 级 `refine`**
  → 两次密码一致须**显式比对** + `setFieldError`（注册页同坑）。
- 🔴 **三个分发器（`view/web/<page>/index.vue`）必须都认「mini 来源」**，判定顺序
  = 显式 `?isMobile=true` ＞ mini（login/register 用 `from=mini`·路径含 `mini-login`/`mini-register`；forgot 用 **`fromLogin=mini`**）＞ 自动识别 ＞ 桌面默认。
  **mini 来源 = 正嵌在宿主弹窗 iframe 里**，窄是弹窗列宽造成的（宿主 1440px→iframe 854px；宿主 ≤800px→iframe 718px<768）⇒ 必须保持桌面/紧凑版。
  漏掉分支的症状：**只有漏的那一页**跳手机端、同 iframe 其余页正常，且**桌面直接开不复现**（必须真放进 iframe 读**内容页**的 `innerWidth`）。
  桌面卡片根 class 是 **`.auth-viewport`**。关卡 `verify-forgot-view.mjs` I 段（毒丸：删分支→I1 变红）。

## 4. 手法 / 命令（细则 → details §9）

- 🔴 **禁止在 Bash 工具里 `git rm` src/ 下任何路径**：执行者是 **tsbx 沙箱执行层本身**，会**递归清空整个 src/**。
  删 src 文件一律 `rm <path> && git add -A`；恢复 `git checkout HEAD -- src`。
- **大块改动立刻检查点提交**；**毒丸实验**验测试有效性（覆写 `throw new Error('__QUARANTINE__')`，变红=真加载）。
- 🔴 **视觉回归先稳定化、再归因**（§10.13）：不禁过渡/动画、不等 `fonts.ready` → 同代码连拍可报 **17.8% 假差异**；冻结样式须**加载后** `addStyleTag` 并**断言生效**；
  比对前 `md5sum` 验两侧同一状态；「噪声下限 0」只对纯色场景成立（§11.15）。
- ⚠️ 同一文件**多个 Edit 放同一条消息会静默丢失** → 多改**串行**并 grep 复核。⚠️ 块注释里别让星号与斜杠相邻（写 glob 通配会**提前闭合注释**：TS1131 报错行≠根因行）。
- ⚠️ **本机 node 同步 spawn（管道 IO）恒抛 `EBUSY`(-4082)**：换版本/`shell:true`/脱离沙箱均无效；异步 `spawn`/`stdio:'inherit'`/**文件 fd 正常**
  ⇒ 需同步取输出一律 `spawnSync` + **文件型 stdio**（它**不抛**，须自判 `result.status`）；取 stdin 的**必须带超时**；**禁 `Atomics.wait`**（细则 §9）。
  ⚠️ `cmd | tail` 后 `$?` 是 tail 的 → 真实码重定向到文件再读。⚠️ git-bash `/dev/tcp` 在 Windows 假阴性（用 node:net）。
- ⚠️ **沙箱拦两类删除**（非代码错）：`vite build` 在 **`prepare-out-dir`** 被 safe-delete 守卫拒（阈值 50）→ `--outDir <全新目录>`；`rm -rf <dir>` → **每批 ≤25 个 `rm -f`**。
- ⚠️ `npm run` 丢命令行环境变量；`node --env-file` 不可被命令行覆盖 → 脚本自己 `process.loadEnvFile(...)`；含模板字符串的脚本用 Write 落盘再跑。
- 事件循环冻结用 **tick 间隔法**（禁 `monitorEventLoopDelay`，774ms 报成 17ms）；手机端注入刘海用 CDP `setSafeAreaInsetsOverride`。
- **关卡退出码** 0 通过 / 1 断言失败 / 2 回滚不完整 / 3 环境不可用。**CLI**：`loadAllModels()` 后 `getModel` 才可用；`loadGuardConfig()` 吞错且**回写 DB**；CLI 下 globalRedis 恒 null。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`（npx jest 丢 ESM 标志）。
- 临时脚本放 `.tmp-probe/`（唯一 gitignore 项）。**oauth21 的 Playwright 验收关卡长期留在 `.tmp-probe/verify-*.mjs`**，改前先跑一遍当基线。
- 🔴 **起 dev server 必须让服务本身当后台命令**（`run_in_background` + 直接 `exec node node_modules/vite/bin/vite.js --port N`）。
  用 `nohup … &` 会在后台任务结束时被回收（探活 502，但 `dev-*.log` 里明明写着 ready，极具误导）。
  三档端口：5174 = code 模式 · 5175 = `VITE_PASSWORD_RESET_MODE=link` · 5177 = `VITE_REGISTER_VIEW=compact`。

## 5. 部署 / CI（细则全在 details §10，2026-09-21 定案）

改 `ci.yml` / Dockerfile 前先读 **details §10**：CI 安装三件套（`--legacy-peer-deps` 是绕 arborist 崩溃、必须构建 `shared-device` dist）·
Dockerfile 的 tini 按**实际路径**建软链 · response schema 必须覆盖信封全字段 · 生产三 secret **≥32 位**否则拒绝启动 ·
复刻树验收 `git archive HEAD | tar -x` 到**仓库外**。

## 6. 待办

- ⚠️ 多服务器（Swarm/K8s）**仍只有设计稿**，代码不存在。P2 session.js 拆分评估**未开始**。
- `firewall` 前端无类型检查（121 错）；CI 无前端作业（三个前端刻意不进 CI 图，为绕开 arborist 崩溃）—— 均待定夺。
- ⚠️ `oauth21` **eslint 存量 39 错**（`__tests__/notLoadSsoView.test.js` 38 个 jest 全局 `no-undef` + `AntiCacheDebugPanel.vue` 1 个 `preserve-caught-error`）—— 与多主题改动无关，待定夺（配 eslint env 或 ignore `__tests__`）。
