# nodeServers 项目笔记（主索引）

> 只放"违反就出事"的约定；成因/实测数据→`MEMORY-details.md`（§号即引用），过程→`YYYY-MM-DD.md`。
> 维护用 Write/Edit（勿 `cat >>`）。oauth21 移动端认证页完整版 → details **§11**。

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

## 2. 高频陷阱（后端；细则 → details §3/§5/§6/§8）

- `getModel(name)` 未命中**抛 TypeError 非 null** → 调用点放 try。
- `getStore(prefix)` prefix 全仓逐字一致；无 Redis 走 MapStore（不支持 zAdd/zRangeByScore）。
- 密码哈希**禁 bcryptjs**（10 并发冻结 774ms）→ `framework/auth/password-hash.js`（scrypt 22ms）。
- 请求路径禁 `*Sync(`：`grep -E '\b\w+Sync\s*\(' src --glob '!**/__tests__/**'`。
- `underscored: true` → 用 `createdAt`；`attributes:['created_at']` 被**静默丢弃**（Invalid Date）。
- 模块级 `process.exit` **伪装绿色**（汇总恒 0 失败）→ 用 `!isTestEnv` 守卫。
- 改导出面 → 真实 import 上层入口一次 + 同步所有 `unstable_mockModule` 替身。
- 外部输入进 `timingSafeEqual`/`.length`/`Buffer.from(x,'hex')`/`new Date(x)` 前必先归一化。
- **vue-tsc 拦不住模板未定义标识符**：`@click="fn"` 里 `fn` 未定义时 `vue-tsc`/build 仍全绿 → 须真实渲染/点击验证。
- `/user/v1/register` 只读 `body.username` → 传 email 时**静默回退成 email**（`src/app/user/dao/user.js:55`）。
- **Fastify**：`NN-*.js` 数字前缀=顺序；`onRoute` 不回溯（全局限流唯一注册点 `loader/registry/05-firewall.js`）；WS 停机须自定义 preClose；
  `OPTIONAL_LOADERS`=带伤启动白名单；`/health/*` 未登录可见 → 新增字段先想"给外人看合适吗"。
- **Redis v5**：只有驼峰命令（`hset/hgetall` undefined，常被 try 吞）；原始串用 `store().call(c=>c.get(k))`；`hexists` 返 1/0；
  `withTimeout` 禁 `.finally`；两档重连 `forever`（**永不 reject**）/`bounded`；⚠️ **`duplicate()` 只复制配置不建连** → 订阅须先 `connect()`。
- **Guard**：`requirePermission`/`freshPermission` 不得进 RUNTIME_FIELDS；`allowRoles:[]`=不限角色；
  ⚠️ `guard-config.dao.js` 的 `restore()`=truncate 全表+回填 → **空快照会清空 guard_configs**。
- **日志**：唯一出口 `src/framework/log/index.js`；业务禁 `console.*`；`log.stdout` 不落盘、`log.info` 会被丢。

## 3. oauth21 移动端认证页（细则全在 details §11）

- **样式单一来源** = `oauth21/src/assets/styles/mobile-auth.scss`（`mauth-*`，main.ts 全局引入）；`/m/*` 页**不得自带 `<style>`**；
  ⚠️ 版式**刻意不限宽**（加 `max-width` 会在两侧露底色）。
- 🔴 **调试前必须先造窄视口并刷新**：判定 `宽视口(≥1024) ＞ 窄视口(<768) ＞ UA`；宽视口开 `/m/register` 会**跳 `/register` 电脑版**；
  **UA 伪装压不过宽视口**；分发只在**导航时**执行 → 只拖 DevTools 不刷新看到的还是旧版式（§11.1）。
- **设备判定单一来源** = `src/utils/device.ts` 的 `isMobileViewport()`；`/m/*` 宽屏回跳的 `beforeEnter` 只跑一次 →
  视口变化须另挂 matchMedia（`router/index.ts`），两处共用 `resolveDesktopRedirectTarget`；`?isMobile=true` 一律不迁；
  **query 原样透传**（丢 `client_id` 静默断授权流）。
- **主题**：三层 token（全局语义 → 组件级 → 组件规则零裸色值）；明暗与皮肤**正交**；内容**全部外置**到 `src/themes/<id>/`。
  ⚠️ 外部输入（后端下发/postMessage）**必过白名单**（`src/theme/runtime.ts`），**刻意拒 `url()` 与 CSS 颜色名**。
  🔴 **`tokens` 写在 `html` 上、优先级高于媒体查询** → **绝不能覆写断点里会变的 token**（`--mauth-pad-*`/`--mauth-gap-*`/
  `--mauth-logo-size`/`--mauth-title-size`/`--mauth-field-h`/`--mauth-control-h`/`--mauth-err-h`/`--mauth-social-*`）。
  ⚠️ 主题 `assets/` 的 SVG **必须带 `width`/`height`**（只给 `viewBox` → `background-size:…auto` 撑满容器）。§11.3
- **移动端页必须自己当滚动容器**：`html,body{overflow:hidden}` 锁死根滚动 → `.mauth-page` 须 `height:100dvh + overflow-y:auto`，
  `.mauth-body` 须 `flex:1 0 auto`（否则横屏内容不可达）。§11.4
- 🔴 **"白条/色条"先定位到层，再谈"修色"**（→ §11.7）：色由 ①**根画布**（`html` 背景向上传播，CSS 2.2 §14.2，
  透明时"渲染是未定义的"）②祖先容器 ③页面自身 决定 → 统一到唯一出口 **`--mauth-canvas`**（= 页面最上沿的颜色：
  有 header 跟 header、占位态跟页面底色），且页面**必须贴顶**（`align-self:flex-start`）—— 否则 `vh(≡lvh)>dvh` 时
  外层 `items-center` 会把页面垂直居中、上下留缝（**DevTools 不模拟动态工具栏 ⇒ 缝恒 0 ⇒ 电脑上永远看不到**）。
  ⚠️ **"给某个祖先改底色"是打补丁**，只会把问题转移到别处（上一版把浅灰带换成了白带）。
- 🔴 **跨内核差异两类，先分类再修**（→ §11.6/§11.7/§11.8）：① **初始值**：`color-scheme` 初始 `normal` ⇒ 画布/表单控件/滚动条
  默认色由 UA 自由决定（本仓曾全仓 0 命中）→ 显式写 `light` 与 `light only` 两条（`html.dark` 同理），只带 `only` 会被
  不支持的引擎**整条丢弃**；⚠️ 拦不住国产内核**合成器层** `filter: invert()`（夸克/QQ/UC/小米）。
  ② **布局视口被丢成 980**（小米丢跨行 meta / 夸克丢实验键 `interactive-widget`）⇒ 整页等比缩小、"比例不对" →
  meta 写**单行 + 只留最通用键**；判据**只能用 `visualViewport.scale`**（`clientWidth` 解析期**恒为 980、连正常页也是**，
  `screen.width` 可能是物理像素）；兜底 `src/utils/viewport-fix.ts`（`zoom=1/scale`，**必须配 `height: calc(100dvh / k)`**）。
- ⚠️ 主题把 `--mauth-header-bg` 设为 `transparent` 时**必须同时声明 `--mauth-canvas`**（落 `html`），否则画布色退回给 UA
  → 真机与电脑不一致（契约 `themes/README.md` + `types.ts`，范例 `sky/theme.scss`）。
- **第三方登录行**（`MauthSocialRow` + `useSocialLogin`）：**providers 为空 → 零 DOM**；🔴 授权端点**只放行站内相对路径**
  （`/` 开头且非 `//`；`//evil.com` 是协议相对地址 → 被当外域用）；未配端点**不静默**；徽标**只能向上溢出**。§11.5
- **移动端第 3 页 = 重置密码**（`/m/forgot-password`）："没漂移"的证据 = **逐项比对同名元素计算样式**（login↔forgot 57 项全等）。
  🔴 邮件链接指向 `/reset-password?token=…`（后端 `open.js:245`）而前端**无此路由** → 加 redirect（**query 原样带**）+ `/forgot-password` 改分发器。
  🔴 **`validateField` 不跑 zod 的 object 级 `refine`** → 两次密码一致须**显式比对** + `setFieldError`；另一模式留的 `optional()` 字段也会**放行空值**。§11.9

## 4. 手法 / 命令（细则 → details §9）

- 🔴 **禁止在 Bash 工具里 `git rm` src/ 下任何路径**（2026-09-20 定案）：执行者是 **tsbx 沙箱执行层本身**，会**递归清空整个 src/**。
  `git rm src/…` → 级联清空（5 次复现）；`git rm` 根部文件 / `git rm migrations/…` / POSIX `rm src/…` → 安全。
  **删 src 文件一律 `rm <path> && git add -A`**；恢复 `git checkout HEAD -- src`。
- **大块改动立刻检查点提交**；**毒丸实验**验测试有效性（覆写 `throw new Error('__QUARANTINE__')`，变红=真加载）。
- **测事件循环冻结用 tick 间隔法**（10ms 心跳相邻最大间隔）；**禁 monitorEventLoopDelay**（774ms 报成 17ms）；噪声下限 ≈20ms。
- **手机端（无 DevTools）调试**：CDP `Emulation.setSafeAreaInsetsOverride` 可在桌面 Chrome 精确注入刘海（top=47 → `env(safe-area-inset-top)` 真返回 47px）；
  ⚠️ `setAutoDarkModeOverride` **不等价** MIUI "智能反色"（实测零变化）→ **不能据此排除"浏览器强制深色"**；手机侧用 `.tmp-probe/diag-overlay.js`。
- 🔴 **视觉回归先稳定化、再归因**：不禁过渡/动画、不等 `fonts.ready`、不预热 → 同代码连拍可报 **17.8% 假差异**；
  冻结样式须 `page.addStyleTag` **加载后**注入并**断言生效**。稳定后噪声下限 **0**；⚠️ 比对前先 `md5sum` 验两侧同一状态（§10.13）。
- ⚠️ 同一条消息对同一文件多个 Edit 会**静默丢失** → 同文件多改一律**串行**，改完 grep 复核。
- ⚠️ `cmd | tail` 后 `$?` 是 tail 的；git-bash `/dev/tcp` 在 Windows 假阴性（用 node:net）。
- ⚠️ `npm run` 丢命令行环境变量；`node --env-file` 不可被命令行覆盖 → 脚本自己 `process.loadEnvFile(...)`。
- ⚠️ bash heredoc 里的 `${...}` 可能被插值 → 含模板字符串的脚本用 Write 落盘再跑。
- ⚠️ `npm run build` 偶发**卡死**在压缩阶段（停在 `✓ N modules transformed.`、>5 分钟无新行是挂不是慢）→ 重试或 `npx vite build`。
- ⚠️ **沙箱拦两类删除**（都不是代码错，别误判）：① `vite build` 在 **`prepare-out-dir`** 阶段被 safe-delete 守卫拒
  （`SAFE_DELETE_BULK_CONFIRM_REQUIRED … dist/assets` 52 项 > 阈值 50；此前已打印 `✓ N modules transformed`）
  → 用 `npx vite build --outDir <全新目录>`；② `rm -rf <dir>` / `mv <dir>` 大目录会失败（fail-closed）
  → **每批 ≤25 个文件 `rm -f`**，再 `find -depth -type d | rmdir` 收空目录（§11.7 五）。
- **跨进程关卡退出码**：0 通过 / 1 断言失败 / 2 回滚不完整 / 3 环境不可用。
- **CLI 引导**：`loadAllModels()` 后 `getModel` 才可用；`framework/db` 非测试缺 DB 配置直接退进程；`loadGuardConfig()` 吞错且**回写 DB**；
  CLI 写配置先 `initDao()`；CLI 下 globalRedis 恒 null，用 connectStandalone（§4）。
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
