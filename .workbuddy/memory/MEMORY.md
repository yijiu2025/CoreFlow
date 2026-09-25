# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据/全过程 → `MEMORY-details.md`（§号即引用）与 `YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`）。本文件**每轮注入且超 ~12KB 会被静默截断** → 宁缺勿长。

## 0. 仓库形态 / 发版

- **`packages/log/` 是独立嵌套 git 仓**（主仓 gitignore）→ 去那个仓提交；主仓 `git add packages/log/...` 静默不生效。
- **本机 git ref 失灵**：status 谎报 ahead、push 可能数分钟零输出 → **以 `git ls-remote origin main` 为准**，超时≠失败。
  push 后异常：`node "C:/Users/22701/.workbuddy/tools/fix-packed-refs.mjs" "<完整40位SHA>"`（截短→GUI 历史全灭）。
- ✅ `git credential fill` 挂住/凭据选择器弹窗已根治（2026-09-25）：system gitconfig 的 `helper-selector` 已注释禁用，只剩 GCM 静默认证。
- **发版**：提交推送后**顺手发不必问**：`node scripts/release.mjs` → `--apply`。`feat`→minor；仅 `fix|perf`→patch；
  破坏性（**只认 footer 行首+冒号**）→major；`chore/docs/test/style/ci/refactor` 不发。版本源是 git tag；工作区脏（含子模块）会拒。

## 1. 强制约定（有守卫 / 有规则文档，违反会红）

- export 收拢文件末尾（仅 src/）· `src` 不得 import `scripts` · `src/app/<A>` 不得 import `src/app/<B>`（白名单在各自守卫测试里）。
- **测试有效性**：真实加载被测代码，禁「手写常量自测」「内联复制被测逻辑」；`KNOWN_INEFFECTIVE_TESTS` 只减不增（14）+ 同步 `FROZEN_SIZE`；
  **一个测试文件只能注册一组路由**（`_routeRegistry` 模块级无重置）。
- **firewall 分层（单向）**：interface → config/util → dao → engine → services/cli/data → index.js；禁直接 import `app/firewall/dao/block-manager.js`。
- **📐 文档 ≠ 实现**：核法 = 文档承诺的环境变量名 grep 代码，命中 0 = 未实现（`src/loader|auth|db|redis` **均不存在**，全在 `src/framework/`）。
- **🔗 文档站**：`ignoreDeadLinks` 只放行 `AGENTS|oauth21|posecraft|packages` 前缀 → 指 `docs/` 之外必 `docs:build` 失败，**指源码用反引号**；
  ⚠️ `development-standards.md` 在 `docs/` **根**；新增文档页要**同时**注册进 `docs/.vitepress/config.ts` sidebar（否则是孤岛）。
- **代码审查**：唯一入口 `docs/development/code-review.md`（L0–L3/五道闸）；**L3（格式类）禁止人工提出**。
- 🔴 **前端类型闸门必须是"真检查"**（规则全文 `docs/frontend/coding-standard.md`）：方案式 tsconfig 下**裸 `vue-tsc` 恒 exit 0** → 口径 **`vue-tsc -b`**；
  **改完口径必须毒丸验证**。子项目 `include` 是 `.js` 未开 `allowJs` → 去掉 `-b` 报错消失=静默失去检查；配置级错误（TS5101）会中止全部语义分析。`firewall` 仍无类型检查（121 错）。
- **跨内核渲染基线（新前端强制）**（`docs/frontend/browser-baseline.md`，自检 `npm run check:baseline [目录]`）：
  核心一句 = **规范留白处不显式声明 = 把渲染交给内核**；⚠️ viewport meta 跨行或加实验键会被内核整条丢弃（小米/夸克实测）。
- 🔴 **多主题 / 多版式开发模式（强制）**（`docs/frontend/multi-theme.md`）：三个正交维度 = **token 基线 → 皮肤 `themes/<id>/` → 版式 `themes/app/<page>/<id>/`**；
  **目录名即 id**（坏目录静默跳过；`themes/app/` 为保留名、禁加 `index.ts`）；
  🔴 **业务只在容器**（`view/app/<page>/index.vue`），版式只读 `ctx`、只调 `ctx.actions`；外部输入**一律过白名单**。oauth21 三页已全部接入。

## 2. 后端陷阱速查 → **details §12**（14 条整表在那里）

`getModel(name)` 抛 TypeError · `getStore(prefix)` 命名空间/MapStore · 密码哈希禁 `bcryptjs` · 请求路径禁 `*Sync(` ·
`underscored:true` 时间戳 · 模块级 `process.exit` 伪装绿色 · 改导出面要真实 import · 外部输入归一化 ·
`vue-tsc` 拦不住模板标识符 · `/user/v1/register` 只认 `username` · Fastify（顺序/`onRoute`/`preClose`/`OPTIONAL_LOADERS`/`/health/*`）·
Redis v5（驼峰命令/`duplicate()` 不建连）· Guard（RUNTIME_FIELDS/`restore()` 清表）· 日志（`log.info` 会被丢）。

## 3. oauth21 → **details §11**（细则/实测数据全在那里）

- **样式单一来源** = `assets/styles/mobile-auth.scss`（`mauth-*`）。基础版式与 `/m/*` 页**不得自带 `<style>`**；移动端版式**刻意不限宽**（用户要求满宽）。
- **版式优先级** `?view=` > 主题包 `views.<page>` > `VITE_<PAGE>_VIEW` > base；⚠️ URL 显式非法值**不回退**；变体 `glob` 惰性 chunk；**新增变体目录要重启 dev server**。
  ⚠️ 毒丸验证**永远不要截断输出**（`| head` 让"是否真变红"不可判）。
- **皮肤**：明暗与配色**正交**；来源 `?theme=`（`?skin=` 别名）> 后端 > localStorage > default；外部输入**必过白名单**（拒 `url()` 与 CSS 颜色名）。
  🔴 **tokens 是扁平值 `Record<string,string>` 无 light/dark 两档**；`isDark` 只挂 `html.dark` 类**不参与 token 选档**；要深色品牌色**另加颜色目录**。
  ⚠️ 注册表键 = **五段复合键** `包/设备/页面/版式/配色`；配色**每版式各一份**漏了静默回落；tokens 是 html inline style**优先级高于媒体查询**禁覆写断点 token；
  ⚠️ `--mauth-header-bg` 设 transparent **必须同时声明 `--mauth-canvas`**。
- 🔴 **调试移动端页前先造窄视口并刷新**：判定 `宽(≥1024) ＞ 窄(<768) ＞ UA`；UA 伪装压不过宽视口；单一来源 `utils/device.ts`。
- 🔴 移动端页自己当滚动容器（`.mauth-page` `100dvh+overflow-y:auto`、`.mauth-body` `flex:1 0 auto`）；"白条/色条"先定位到层，统一出口 `--mauth-canvas`，页面贴顶。
- 🔴 **跨内核差异先分类**：① `color-scheme` 显式写 `light` 与 `light only` 两条；② 视口被丢成 980 → meta 单行+最通用键，判据只用 `visualViewport.scale`；兜底 `utils/viewport-fix.ts`。
- 🔴 **父 origin 白名单单一来源 `utils/parent-origins.ts`**。漏配症状=「弹窗 loading 慢」非报错（`SSO_READY` 被拒发→宿主等满 3s）；排查 iframe 握手类「慢」先 grep `拒绝 postMessage`。**别把 oauth21 自己端口（5174/5175）写进白名单**。
- **登录行**：providers 空 → 零 DOM；🔴 授权端点**只放行站内相对路径**；未配端点**不静默**。
- 🔴 **`validateField` 不跑 zod object 级 `refine`** → 两次密码一致须**显式比对** + `setFieldError`（注册页同坑）。
- 🔴 **三个分发器必须都认「mini 来源」**（判定序：显式 `?isMobile=true` ＞ `from=mini`/`fromLogin=mini`/路径 ＞ 自动 ＞ 桌面默认）。
  mini=嵌在宿主弹窗 iframe（宿主 1440→iframe 854px）⇒ 保持桌面版。漏掉的症状：只有漏的那页跳手机端。关卡 `verify-forgot-view.mjs` I 段。
- 🔴 **URL 不被视口改写**：`/m/*` 与 `/<page>` **共用同一套分发器**（`view/web/<page>/index.vue`），URL 永远不变；旧重定向三件套已全删。关卡 `verify-mobile-forgot.mjs` ③ + `verify-color-peer.mjs` F 段。
- 🔴 **明暗 = 配色系别（不是独立维度，2026-09-25 定）**：`isDark = 当前配色的 tone`；`mode`（明/暗/跟随系统）只是「切到哪一系别」的意图。
  每套配色必填 `tone: 'light'|'dark'`（漏写 vue-tsc 报错）。双侧记忆槽 `lightColor`/`darkColor`（默认 white/black）；**点色卡同步 mode、切 mode 联动配色**（永远一致，杜绝撕裂）；
  跟随系统按系统偏好选系别，全新用户首屏也按系统系别对齐（默认 black 字母序 → 系统亮则落 white）。关卡 `verify-tone-unified.mjs`（18，含毒丸）+ `verify-color-peer.mjs` B/C/D 段。
- 🔴 **跨设备系别一致**：`getThemeRecord` 回落先按 `toneOfAnyScope` 取同系别首套（mobile blue 拉宽→web 回落 white）；`themeId` 不随设备变。关卡 F 段。
- 🔴 **主题设备跟随实际渲染的视图**：三个分发器 watch `activeForm`→`setActiveDevice`；`setupThemeDeviceSync` 只给基线。
- 🔴 **桌面卡片局部 `.dark` 上下文**：五个桌面卡片根容器挂 `:class="{ dark: activeTone === 'dark' }"`（Tailwind darkMode:'class' 允许任意祖先）。
  StandardLogin SCSS 用 `:is(html.dark .standard-login-root, .standard-login-root.dark) .std-*`。store 暴露 `activeTone`。
- 🔴 **scoped 样式禁写 `:global(.dark) X`**（2026-09-25 实锤）：会被 @vue/compiler-sfc 编译成**裸 `.dark`**（后续选择器被丢弃），html 挂 dark 类时命中 html
  → 夜间背景变红。正确写法 **`.dark X`**（产物 `.dark .xxx[data-v]`）。全仓 34 处已修（c207187）；红色回归断言并入 `verify-tone-unified.mjs`。

## 4. 手法 / 命令（细则 → details §9）

- 🔴 **禁止在 Bash 工具里 `git rm` src/ 下任何路径**：会**递归清空整个 src/**。删 src 文件一律 `rm <path> && git add -A`。
- **大块改动立刻检查点提交**；**毒丸实验**验测试有效性。⚠️ 同一文件**多个 Edit 同条消息会静默丢失** → 串行并 grep 复核；
  ⚠️ 全量替换后必须 grep 复核形态（本次 `.dark ` 丢空格变成同元素双类，靠二次替换补回）。
  ⚠️ 块注释里别让星号与斜杠相邻（glob 通配提前闭合注释，TS1131 报错行≠根因行）。
- **git 已放行**（提交 c158a9e）：`.codebuddy/settings.local.json` `permissions.allow: ["Bash(git:*)"]`；另有 WorkBuddy 沙箱 `~/.workbuddy/settings.json` 的 `{prefix:["git"],action:"allow"}` 规则（schema 见日志 2026-09-25；**改前必须备份**）。
- 🔴 **视觉回归先稳定化、再归因**（§10.13）：禁过渡/动画、等 `fonts.ready`，冻结样式须加载后 `addStyleTag` 并断言生效。
- ⚠️ **本机 node 同步 spawn（管道 IO）恒抛 `EBUSY`**：同步取输出一律 `spawnSync` + **文件型 stdio**（自判 `result.status`）；取 stdin 必带超时；禁 `Atomics.wait`。
  ⚠️ `cmd | tail` 后 `$?` 是 tail 的 → 真实码重定向到文件再读；git-bash `/dev/tcp` 假阴性（用 node:net）。
- ⚠️ **沙箱拦两类删除**（非代码错）：`vite build` 出目录 → `--outDir <全新目录>`；`rm -rf` → 每批 ≤25 个 `rm -f`。
- ⚠️ `npm run` 丢命令行环境变量；`node --env-file` 不可被命令行覆盖 → 脚本自己 `process.loadEnvFile(...)`。
- 事件循环冻结用 **tick 间隔法**；手机端注入刘海用 CDP `setSafeAreaInsetsOverride`。
- **关卡退出码** 0/1/2/3。**CLI**：`loadAllModels()` 后 `getModel` 才可用；`loadGuardConfig()` 吞错且回写 DB；CLI 下 globalRedis 恒 null。
- 测试命令：`node --experimental-vm-modules ./node_modules/jest/bin/jest.js --testPathPatterns "<p>"`。
- 临时脚本放 `.tmp-probe/`（唯一 gitignore 项）。**oauth21 的 Playwright 关卡长期留在 `.tmp-probe/verify-*.mjs`**，改前先跑当基线。
- 🔴 **起 dev server 必须让服务本身当后台命令**（`run_in_background` + 直接 `node node_modules/vite/bin/vite.js --port N`）；`nohup … &` 会被回收。
  端口：5174=code · 5175=link 模式 · 5177=compact · **5197=color-peer 关卡用 · 5184=panel-v3/colors-in-views 关卡用**（跑前先探活）。

## 5. 部署 / CI（细则全在 details §10）

改 `ci.yml` / Dockerfile 前先读 details §10：CI 安装三件套（`--legacy-peer-deps` 绕 arborist 崩溃、必须构建 `shared-device` dist）·
Dockerfile tini 按**实际路径**建软链 · response schema 覆盖信封全字段 · 生产三 secret **≥32 位** ·
复刻树验收 `git archive HEAD | tar -x` 到**仓库外**。

## 6. 待办

- ⚠️ 多服务器（Swarm/K8s）**仍只有设计稿**。P2 session.js 拆分评估**未开始**。
- `firewall` 前端无类型检查（121 错）；CI 无前端作业——均待定夺。
- ⚠️ `oauth21` eslint 存量 39 错（jest 全局 `no-undef` 38 + `AntiCacheDebugPanel.vue` 1）——待定夺（配 eslint env 或 ignore `__tests__`）。
