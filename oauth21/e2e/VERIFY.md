# 关卡索引（oauth21/e2e/ 权威口径）

> 本目录是**纳入版本控制**的验收关卡（2026-09-28 起从 `.tmp-probe/` 迁入），随仓库走、
> 换机器不丢。这份 VERIFY.md 是「哪些关卡活跃、跑什么环境、哪些已退役、散落文件去哪了」
> 的唯一权威索引。
>
> 统一入口：`node oauth21/e2e/verify-all.mjs`（一键跑全部活跃关卡，含端口预检 + 汇总报告）。

## 一、统一入口

```bash
node oauth21/e2e/verify-all.mjs              # 全量（静态 + dev + 特殊端口 + 生产构建）
node oauth21/e2e/verify-all.mjs --list       # 只打印关卡清单，不跑
node oauth21/e2e/verify-all.mjs --only static  # 只跑静态关卡（无浏览器/服务器）
node oauth21/e2e/verify-all.mjs --skip-prod    # 跳过需要生产构建的关卡
node oauth21/e2e/verify-all.mjs --dev http://127.0.0.1:5174   # 覆盖端口
```

**退出码**：`0` 全绿 / `1` 有断言失败 / `3` 环境未就绪（全跳过）。
**环境预检**：某关卡的端口没起、或产物目录不存在，会标「⏭️ 跳过」而非「❌ 失败」——
避免"没起环境"被误读成"代码红了"。

## 二、端口约定（与 docs/frontend/multi-theme.md §十、MEMORY §9 一致）

| 端口 | 用途 |
| --- | --- |
| `5174` | dev 默认实例（大部分 Playwright 关卡） |
| `5177` | compact 版式实例（`VITE_REGISTER_VIEW=compact`；版式优先级第 4 档 / 首屏预算） |
| `5197` | color-peer 专用实例 |
| `5189` | dist 预览（生产构建，验 SW 迁移 / 宽窄切换） |

⚠️ 起多个实例**必须串行**（前一个 curl 到 200 再起下一个）：几个 Vite 共用
`node_modules/.vite`，同时冷启会互相废掉 optimizeDeps → 白屏 + `504 (Outdated Optimize Dep)`。

## 三、活跃关卡（21 个，分四组）

### ① 静态关卡（无浏览器 / 无服务器）
| 关卡 | 守什么 |
| --- | --- |
| `verify-theme-dirs.mjs` | **核心静态关卡**：四级目录口径 + 无版式层 + 四段键 + `data-mauth-view`=包名 + 三设备静态引入 + 内核包契约（589 项） |
| `verify-glob-device.mjs` | glob 真的扫到设备段、配色 glob 只有一套（26 项） |
| `verify-alias-single-source.mjs` | **别名三处一致**：`config/aliases.ts` ↔ `tsconfig.app.json` paths ↔ vite 实解析（`skinsuite`/`stable-deviceid` 必须解析到 `packages/*/src/index.ts`，不是 node_modules dist）（21 项） |
| `verify-kernel-zero-coupling.mjs` | **内核零框架耦合**：两包 dependencies/peerDependencies 全空、源码只 import 相对路径（禁 vue）⇒ 防"源码直供"下静默产出两份 Vue（18 项） |
| `verify-console-strip.mjs` | **生产构建真的删了 console**（自建一次构建扫产物计数为 0，并对照源码确实有 console 待删）（6 项） |
| `verify-no-any-debt.mjs` | **类型逃逸清零**：`src/` 业务代码无 `any`/`@ts-ignore`/`@ts-expect-error`（剥注释后统计），且外部边界单一入口 `src/types/external.ts` 存在并导出关键收口件（11 项） |
| `verify-no-pwa.mjs` | PWA 已移除：产物无 manifest/SW 注入，`sw.js` 只能是自毁迁移版（`--dir dist-nopwa`） |

### ② dev 实例关卡（默认 5174）
| 关卡 | 守什么 |
| --- | --- |
| `verify-panel-v3.mjs` | 面板 v3 只控制当前页的版式与配色（34 项） |
| `verify-tablet-landing.mjs` | tablet 落地：「加一种设备」端到端零配置可用（7 项） |
| `verify-tone-memory.mjs` | 明暗切换记忆槽语义（会话级、只记切走前） |
| `verify-tone-unified.mjs` | 「明暗 = 色系」新语义：全新用户首屏对齐白系 |
| `verify-login-view.mjs` | 登录页「业务容器 + 可换版式」（36 项） |
| `verify-register-view.mjs` | 注册页「业务容器 + 可换版式」（36 项） |
| `verify-forgot-view.mjs` | 重置密码页「业务容器 + 可换版式」（56 项，含 I 段 iframe 分发） |
| `verify-view-priority.mjs` | 版式优先级五档 + 设备维度键 + 空串/非法值（需 `--env-base 5177` 验第 4 档） |
| `verify-mobile-forgot.mjs` | `/m/*` URL 不被视口改写（保持路由，③ 守） |

### ③ 特殊端口关卡
| 关卡 | 守什么 |
| --- | --- |
| `verify-color-peer.mjs` | 五色完全并列，底色由配色自己决定（5197） |
| `verify-first-paint-budget.mjs` | 首屏零个非内置包 chunk、零个 theme.scss（5177） |
| `verify-colors-in-views.mjs` | 配色挂在作用域下的模型（5174） |

### ④ 生产构建关卡（dist 预览 5189）
| 关卡 | 守什么 |
| --- | --- |
| `verify-responsive-switch.mjs` | 窄→宽→窄：主题跟随形态、附加样式不残留、0 新请求（23 项） |
| `verify-sw-migration.mjs` | PWA 移除后老用户迁移真的生效（8 项，先放假老 SW 复现 P0 再救） |

## 四、毒丸（关卡有效性自证）

| 毒丸 | 打哪个关卡 |
| --- | --- |
| `poison-verify-theme-dirs.mjs` | 建 `<页面>/<版式>/` 目录 / 塞回 6 段 glob / `data-mauth-view` 改 `'base'` / 默认色改 `black` 等 8 枚毒丸，都必须让关卡变红且还原字节级一致 |
| `poison-verify-no-pwa.mjs` | 植 manifest / manifest.webmanifest / lazy-theme/ / workbox sw.js 四类毒 |

> 「毒丸」= 关卡必须自己会红：把实现故意改坏，关卡若仍绿，说明关卡本身失效（长红/恒绿都等于没关卡）。

## 五、测量工具（非关卡，但常配合跑）

| 脚本 | 用途 |
| --- | --- |
| `measure-load-budget.mjs` | 真实首屏流量（生产构建 + 5189 预览；`--block-sw` 参数在 PWA 移除后已无差别） |
| `measure-sw-download.mjs` | 历史脚本：量 SW 预缓存下载量（需带 PWA 的旧产物） |

## 六、退役关卡（`_retired/`，19 个 —— 不再跑，勿当回归）

> 📍 退役关卡与归档目录**仍在仓库根的 `.tmp-probe/`**（本地产物、gitignore），
> 只有**活跃关卡**迁进了 `oauth21/e2e/`（纳入版本控制）。退役关卡是历史参考，
> 不随仓库分发；如需追溯，去 `.tmp-probe/_retired/` 与 `.tmp-probe/_scratch/` 翻。

| 关卡 | 退役原因 |
| --- | --- |
| `verify-theme.mjs` | 头部自检「已过期」，期望值依赖已删除的旧配色（exit 2） |
| `verify-theme-prod.mjs` | 引用已删除的 `ocean` 配色 |
| `verify-sky.mjs` | 「天青主题」专项，sky/ocean 配色已删 |
| `verify-sw-hijack.mjs` | 历史复现脚本，需带 PWA 的旧产物 |
| `verify-panel-v2.mjs` / `verify-panel-click.mjs` / `verify-panel-view-options.mjs` / `verify-theme-panel.mjs` | 面板结构已改为 v3（view≡pkg 收窄前按 `'base'` 断言），被 `verify-panel-v3.mjs` 取代 |
| `verify-mobile-layout.mjs` / `verify-mobile-width.mjs` / `verify-mobile-resize.mjs` | 09-21 早期移动端布局/宽度/切换验收，已被 `verify-responsive-switch.mjs` + `verify-tablet-landing.mjs` 覆盖 |
| `verify-mobile-forgot-link.mjs` / `verify-mobile-forgot-code-flow.mjs` | 重置密码两种模式的业务验收（link/code），特性已稳定 |
| `verify-realdevice.mjs` | 真机问题专项（09-23），特性已落地 |
| `verify-social.mjs` | 第三方登录行业务验收，特性已稳定 |
| `verify-vpfix.mjs` | 视口自救（viewport-fix）专项，特性已稳定 |
| `verify-card-radius.mjs` / `verify-radius-unify.mjs` | 圆角一致性 / 圆角统一的一次性验收 |
| `verify-pkg-version-fingerprint.mjs` | 包版本指纹的一次性验证 |

> 🔴 长红的关卡 = 噪声，会掩护真红。过期关卡**显式退役**（移到这里），不许留在原地。

## 七、归档目录（噪声分流，不参与回归）

| 目录 | 内容 | 说明 |
| --- | --- | --- |
| `_logs/` | 128 个 `.log` 运行产物 | 历史运行日志，可查、可删 |
| `_scratch/` | 187 个临时/诊断/复现脚本 + 散落截图/草稿 | `diag-*` / `probe-*` / `repro-*` / `shot-*` / commit-msg 草稿等 |
| `_scratch/oauth21-tmp-probe/` | 68 个 oauth21 旧探针 | 原 `oauth21/.tmp-probe/` 整体归档（probe/screenshot/verify-* 等 09-25 旧验收） |
| `_shots/` | 57 个截图目录 | 视觉回归对比截图 |
| `src-backup/` `src-backup2/` | 源码备份 | ⚠️ **重要，保留** |
| `wb-db-backup-*/` | WorkBuddy 数据库备份 | ⚠️ **重要，保留** |

> 归档 ≠ 删除：只是移出主目录，避免 416 个文件淹没 28 个真正的关卡。需要追溯历史时再去对应目录翻。
> 保留在主目录的：`migrate-wb-account-sessions.py`（账号会话迁移工具，用户级记忆引用）。

## 八、一次完整回归的最小路径

```bash
# 1. 静态关卡（最快，先跑）
node oauth21/e2e/verify-all.mjs --only static

# 2. 起 dev 实例（串行！）
cd oauth21 && npx vite --port 5174 --strictPort   # 后台
# 等 5174 就绪后再起 compact 实例（如需）
VITE_REGISTER_VIEW=compact npx vite --port 5177 --strictPort  # 后台

# 3. dev + 特殊端口关卡
node oauth21/e2e/verify-all.mjs

# 4. 生产构建关卡（先构建）
cd oauth21 && npx vite build --outDir dist-nopwa
npx vite preview --outDir dist-nopwa --port 5189 --strictPort  # 后台
node oauth21/e2e/verify-all.mjs --only prod
```
